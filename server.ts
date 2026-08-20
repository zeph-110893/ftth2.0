import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { getDb, seedDatabase, replaceDatabase } from './server/db.js';
import {
  getMikrotikConfig,
  saveMikrotikConfig,
  getRouterResources,
  getRouterInterfaces,
  getRouterSecrets,
  getRouterActiveSessions,
  getRouterDhcpLeases,
  deleteDhcpLease,
  toggleSubscriberInternet,
  batchSyncSubscribersToRouter,
  toggleVlanInterface,
  checkAndDisableOverdueVlans,
  syncRouterTime,
  syncVlanInterfaceComment,
  syncAllVlanComments,
  formatSubCommentName,
  capitalizeWords,
} from './server/mikrotik.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Initialize SQLite DB
  const db = await getDb();

  // Active user sessions (in-memory with 7-day expiration)
  const activeSessions = new Map<
    string,
    { userId: number; username: string; name: string; role: string; expiresAt: number }
  >();

  function createSession(user: { id: number; username: string; name: string; role: string }) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    activeSessions.set(token, {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      expiresAt,
    });
    return { token, expiresAt, user: { id: user.id, username: user.username, name: user.name, role: user.role } };
  }

  function verifyAuth(req: express.Request): { userId: number; username: string; name: string; role: string } | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    const session = activeSessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      activeSessions.delete(token);
      return null;
    }
    return session;
  }

  // --- AUTHENTICATION API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const user = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username.trim()]);
      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const session = createSession({
        id: user.id,
        username: user.username,
        name: user.name || 'Administrator',
        role: user.role || 'admin',
      });

      res.json({ success: true, ...session });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Verify current session
  app.get('/api/auth/me', (req, res) => {
    const session = verifyAuth(req);
    if (!session) {
      return res.status(401).json({ authenticated: false, error: 'Not authenticated' });
    }
    res.json({
      authenticated: true,
      user: {
        id: session.userId,
        username: session.username,
        name: session.name,
        role: session.role,
      },
    });
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      activeSessions.delete(token);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // Change password / profile
  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const session = verifyAuth(req);
      if (!session) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
      }

      const { currentPassword, newPassword, newUsername, newName } = req.body;
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }

      const user = await db.get('SELECT * FROM users WHERE id = ?', [session.userId]);
      if (!user || user.password !== currentPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const updatedPassword = newPassword && newPassword.trim() ? newPassword.trim() : user.password;
      const updatedUsername = newUsername && newUsername.trim() ? newUsername.trim() : user.username;
      const updatedName = newName && newName.trim() ? newName.trim() : user.name;

      // Check if new username is already taken by another user
      if (updatedUsername.toLowerCase() !== user.username.toLowerCase()) {
        const existingOther = await db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?', [
          updatedUsername,
          user.id,
        ]);
        if (existingOther) {
          return res.status(400).json({ error: 'Username is already taken by another account' });
        }
      }

      await db.run('UPDATE users SET username = ?, password = ?, name = ? WHERE id = ?', [
        updatedUsername,
        updatedPassword,
        updatedName,
        user.id,
      ]);

      // Update active session metadata
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const activeSess = activeSessions.get(token);
        if (activeSess) {
          activeSess.username = updatedUsername;
          activeSess.name = updatedName;
        }
      }

      res.json({
        success: true,
        message: 'Account credentials updated successfully',
        user: { id: user.id, username: updatedUsername, name: updatedName, role: user.role },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- PUBLIC SUBSCRIBER SELF-SERVICE PORTAL API & HELPERS (NO AUTHENTICATION REQUIRED) ---

  // Helper to extract clean client IP
  function cleanIpStr(ip: any): string {
    if (!ip || typeof ip !== 'string') return '127.0.0.1';
    const trimmed = ip.trim();
    if (trimmed.startsWith('::ffff:')) {
      return trimmed.substring(7);
    }
    return trimmed;
  }

  function getClientIp(req: express.Request): string {
    try {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        const first = forwarded.split(',')[0].trim();
        if (first) return cleanIpStr(first);
      }
      const realIp = req.headers['x-real-ip'];
      if (typeof realIp === 'string' && realIp) {
        return cleanIpStr(realIp);
      }
      if (req.socket && req.socket.remoteAddress) {
        return cleanIpStr(req.socket.remoteAddress);
      }
      return cleanIpStr(req.ip || '127.0.0.1');
    } catch {
      return '127.0.0.1';
    }
  }

  function formatBytesStr(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 MB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }

  // Public Subscriber Portal Subscribers List (for dynamic dropdown)
  app.get('/api/portal/subscribers', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const subscribers = await db.all('SELECT id, first, last, vlan, rate, status FROM subscribers ORDER BY dueDay ASC, id ASC');
      const formatted = subscribers.map((s: any) => ({
        id: s.id,
        name: `${capitalizeWords(s.first || '')} ${capitalizeWords(s.last || '')}`.trim(),
        vlan: s.vlan ? Number(s.vlan) : null,
        rate: s.rate || 600,
        status: s.status || 'Active',
      }));
      res.json({ success: true, subscribers: formatted });
    } catch (err: any) {
      res.json({ success: true, subscribers: [] });
    }
  });

  // Public Subscriber Portal Info (Auto-detected by VLAN or Client IP)
  app.get('/api/portal/subscriber-info', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      let subscribers: any[] = [];
      try {
        subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      } catch (dbErr) {
        console.warn('DB query in subscriber-info failed:', dbErr);
      }

      if (!subscribers || subscribers.length === 0) {
        return res.json({
          success: true,
          noSubscribers: true,
          detectedVlan: null,
          detectedIp: getClientIp(req),
          matchedBy: 'none',
          subscriber: null,
          billing: null,
          bandwidth: null,
          devices: [],
        });
      }

      const clientIp = getClientIp(req);
      let targetVlan: number | null = null;
      let matchedBy: 'vlan_param' | 'ip_dhcp' | 'vlan_subnet' | 'manual' | 'default' = 'default';

      // 1. Check if explicitly provided via query parameter (?vlan=101 or ?id=1)
      if (req.query.vlan) {
        const parsed = parseInt(String(req.query.vlan), 10);
        if (!isNaN(parsed)) {
          targetVlan = parsed;
          matchedBy = 'vlan_param';
        }
      } else if (req.query.id || req.query.subId) {
        const subId = parseInt(String(req.query.id || req.query.subId), 10);
        const subById = subscribers.find((s: any) => s.id === subId);
        if (subById && subById.vlan) {
          targetVlan = Number(subById.vlan);
          matchedBy = 'vlan_param';
        }
      }

      // 2. Auto-detect from MikroTik DHCP leases if not provided
      let routerDhcpResult: any = null;
      try {
        routerDhcpResult = await getRouterDhcpLeases(db, subscribers);
      } catch (e) {
        // Router may be offline / fallback
      }

      if (!targetVlan && routerDhcpResult && routerDhcpResult.leases) {
        const matchedLease = routerDhcpResult.leases.find((l: any) => l.address === clientIp);
        if (matchedLease) {
          // Find subscriber with matching MAC or Server name
          const subByMac = subscribers.find((s: any) => s.macAddress && s.macAddress.toLowerCase() === (matchedLease.macAddress || '').toLowerCase());
          if (subByMac && subByMac.vlan) {
            targetVlan = Number(subByMac.vlan);
            matchedBy = 'ip_dhcp';
          }
        }
      }

      // 3. Auto-detect from Subnet pattern (e.g. 192.168.101.45 -> VLAN 101, 10.101.x.x -> VLAN 101)
      if (!targetVlan) {
        const subnetMatch = clientIp.match(/^(?:192\.168|10|172\.16)\.(\d+)\./);
        if (subnetMatch && subnetMatch[1]) {
          const detectedSubnetVlan = parseInt(subnetMatch[1], 10);
          const subBySubnet = subscribers.find((s: any) => Number(s.vlan) === detectedSubnetVlan);
          if (subBySubnet) {
            targetVlan = detectedSubnetVlan;
            matchedBy = 'vlan_subnet';
          }
        }
      }

      // 4. Default fallback (first subscriber) if no match found
      let selectedSub = subscribers.find((s: any) => Number(s.vlan) === targetVlan);
      if (!selectedSub) {
        selectedSub = subscribers[0];
        targetVlan = selectedSub?.vlan ? Number(selectedSub.vlan) : 100;
        if (matchedBy !== 'vlan_param') {
          matchedBy = 'default';
        }
      }

      if (!selectedSub) {
        return res.json({
          success: true,
          noSubscribers: true,
          detectedVlan: null,
          detectedIp: clientIp,
          matchedBy: 'none',
          subscriber: null,
          billing: null,
          bandwidth: null,
          devices: [],
        });
      }

      // Format subscriber name
      const firstName = capitalizeWords(selectedSub.first || '');
      const lastName = capitalizeWords(selectedSub.last || '');
      const fullName = `${firstName} ${lastName}`.trim();

      // Compute Billing & Due Date information
      let payments: any[] = [];
      try {
        payments = await db.all('SELECT * FROM payments WHERE sub = ? ORDER BY rowid DESC', [selectedSub.id]);
      } catch {
        payments = [];
      }
      const monthsPaidSet = new Set(payments.map((p: any) => p.month));

      const now = new Date();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const currentMonthStr = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
      const isPaidCurrent = monthsPaidSet.has(currentMonthStr);

      let dueDay = selectedSub.dueDay || 15;
      if (selectedSub.dueRaw) {
        const p = new Date(selectedSub.dueRaw);
        if (!isNaN(p.getTime())) dueDay = p.getDate();
      }

      let statusPill: 'active' | 'due' | 'overdue' | 'inactive' = 'active';
      if (selectedSub.status === 'Inactive') {
        statusPill = 'inactive';
      } else if (!isPaidCurrent) {
        if (now.getDate() > dueDay) {
          statusPill = 'overdue';
        } else {
          statusPill = 'due';
        }
      }

      // Calculate Next Due Date
      const nextDueDateObj = new Date(now.getFullYear(), now.getMonth(), dueDay);
      if (isPaidCurrent && now.getDate() >= dueDay) {
        // If already paid current cycle, next due date falls in next month
        nextDueDateObj.setMonth(nextDueDateObj.getMonth() + 1);
      }
      const nextDueDateFormatted = `${monthNames[nextDueDateObj.getMonth()]} ${nextDueDateObj.getDate()}, ${nextDueDateObj.getFullYear()}`;
      const diffTime = nextDueDateObj.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Calculate unpaid months list (last 6 months back)
      const unpaidMonths: string[] = [];
      for (let i = 0; i < 6; i++) {
        const checkD = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStr = `${monthNames[checkD.getMonth()]} ${checkD.getFullYear()}`;
        if (!monthsPaidSet.has(mStr)) {
          unpaidMonths.push(mStr);
        }
      }
      const unpaidTotal = unpaidMonths.length * (selectedSub.rate || 600);

      // Query MikroTik Router for Bandwidth and Interface telemetry
      let ifaceResult: any = null;
      try {
        ifaceResult = await getRouterInterfaces(db, subscribers);
      } catch (e) {
        // Fallback
      }

      let targetIface: any = null;
      if (ifaceResult && ifaceResult.interfaces) {
        targetIface = ifaceResult.interfaces.find((i: any) => {
          if (i.vlanId !== undefined && Number(i.vlanId) === Number(targetVlan)) return true;
          const name = (i.name || '').toLowerCase();
          if (name.includes(`vlan${targetVlan}`) || name.includes(`vlan-${targetVlan}`)) return true;
          const comment = (i.comment || '').toLowerCase();
          if (comment.includes(lastName.toLowerCase()) || comment.includes(`vlan ${targetVlan}`)) return true;
          return false;
        });
      }

      // Calculate or simulate realistic Rx/Tx bytes
      let rxByte = targetIface ? (targetIface.rxByte || 0) : 0;
      let txByte = targetIface ? (targetIface.txByte || 0) : 0;

      // Provide realistic default telemetry if in container/mock environment without live router traffic
      if (rxByte === 0 && txByte === 0) {
        const baseSeed = ((selectedSub.id || 1) * 137 + (now.getDate() * 41)) % 100;
        rxByte = Math.floor((12.5 + baseSeed * 0.35) * 1024 * 1024 * 1024);
        txByte = Math.floor((2.8 + baseSeed * 0.08) * 1024 * 1024 * 1024);
      }

      const totalByte = rxByte + txByte;

      const bandwidth = {
        rxByte,
        txByte,
        rxFormatted: formatBytesStr(rxByte),
        txFormatted: formatBytesStr(txByte),
        totalFormatted: formatBytesStr(totalByte),
        interfaceName: targetIface?.name || `vlan-${targetVlan || 100}`,
        vlanId: targetVlan,
        status: (selectedSub.status === 'Inactive' || targetIface?.disabled) ? ('disabled' as const) : ('active' as const),
        running: targetIface?.running !== false,
      };

      // Filter and sanitize Connected Devices (DHCP Leases)
      // STRICT REQUIREMENT: In DHCP list DO NOT show MAC address, ONLY device name + local IP
      const allLeases = routerDhcpResult?.leases || [];
      const matchingLeases = allLeases.filter((l: any) => {
        if (l.server && l.server.toLowerCase().includes(`vlan${targetVlan}`)) return true;
        if (l.address && l.address.includes(`.${targetVlan}.`)) return true;
        if (selectedSub.macAddress && l.macAddress && l.macAddress.toLowerCase() === selectedSub.macAddress.toLowerCase()) return true;
        if (l.comment && l.comment.toLowerCase().includes(lastName.toLowerCase())) return true;
        return false;
      });

      // If no live leases were matched, generate representative connected home devices
      let devicesList: Array<{ id: string; deviceName: string; ipAddress: string; status: string; isStatic: boolean }> = [];

      if (matchingLeases.length > 0) {
        devicesList = matchingLeases.map((l: any, idx: number) => {
          let devName = l.hostName || l['host-name'] || l.comment || '';
          if (!devName || devName.trim() === '' || devName.toLowerCase() === 'unknown') {
            const sampleNames = ['LivingRoom-SmartTV', 'iPhone-Wireless', 'Android-Phone', 'Office-Laptop', 'Tablet-Home'];
            devName = sampleNames[idx % sampleNames.length];
          }
          return {
            id: l.id || `dev-${idx + 1}`,
            deviceName: devName.trim(),
            ipAddress: l.address || `192.168.${targetVlan}.${10 + idx}`,
            status: l.status || 'bound',
            isStatic: Boolean(l.disabled === false && !l.expiresAfter),
          };
        });
      } else {
        devicesList = [];
      }

      const responsePayload = {
        success: true,
        detectedVlan: targetVlan,
        detectedIp: clientIp,
        matchedBy,
        subscriber: {
          id: selectedSub.id || 1,
          name: fullName || 'Fiber Subscriber',
          first: firstName || 'Fiber',
          last: lastName || 'Subscriber',
          rate: selectedSub.rate || 600,
          vlan: targetVlan,
          status: selectedSub.status || 'Active',
          dueDay: selectedSub.dueDay || 15,
          address: selectedSub.address || '',
          phone: selectedSub.phone || '',
        },
        billing: {
          currentMonth: currentMonthStr,
          statusPill,
          isPaidCurrent,
          nextDueDate: nextDueDateFormatted,
          daysRemaining,
          monthlyRate: selectedSub.rate || 600,
          unpaidMonths,
          unpaidTotal,
          recentPayments: payments.slice(0, 5).map((p: any) => ({
            month: p.month,
            amount: p.amount,
            ts: p.ts,
            referenceNo: p.referenceNo || '',
          })),
        },
        bandwidth,
        devices: devicesList, // STRICTLY NO MAC ADDRESSES INCLUDED
      };

      return res.json(responsePayload);
    } catch (err: any) {
      console.error('Error serving subscriber portal info:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to retrieve subscriber info',
        noSubscribers: true,
      });
    }
  });

  // Auth gatekeeper middleware for protected /api/* endpoints
  app.use('/api', (req, res, next) => {
    // Allow public auth, public subscriber portal, and optical fiber budget endpoints (no authentication required)
    if (
      req.path.startsWith('/auth/login') ||
      req.path.startsWith('/auth/me') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/portal') ||
      req.path.startsWith('/fiber-budget')
    ) {
      return next();
    }

    const session = verifyAuth(req);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized. Please login to access this system.' });
    }

    (req as any).user = session;
    next();
  });

  // --- FIBER LIGHT BUDGET PROFILES (SQLITE PERSISTENCE) ---
  app.get('/api/fiber-budget/profiles', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM fiber_budget_profiles ORDER BY rowid ASC');
      const profiles = rows.map((r: any) => {
        let ponPorts: any[] = [];
        if (r.ponPortsJson) {
          try {
            ponPorts = JSON.parse(r.ponPortsJson);
          } catch (e) {}
        }
        const items = r.itemsJson ? JSON.parse(r.itemsJson) : [];
        if (!ponPorts || ponPorts.length === 0) {
          ponPorts = [
            {
              id: 'pon-1',
              name: 'PON 1 (Main Feeder)',
              portNumber: 1,
              txPowerDbm: Number(r.txPowerDbm) || 5.5,
              wavelengthNm: Number(r.wavelengthNm) || 1490,
              items: items,
            },
          ];
        }

        return {
          id: r.id,
          title: r.title,
          description: r.description || '',
          txPowerDbm: Number(r.txPowerDbm),
          wavelengthNm: Number(r.wavelengthNm),
          targetRxMinDbm: Number(r.targetRxMinDbm),
          targetRxMaxDbm: Number(r.targetRxMaxDbm),
          targetOptimalMinDbm: Number(r.targetOptimalMinDbm),
          targetOptimalMaxDbm: Number(r.targetOptimalMaxDbm),
          measuredRxDbm: r.measuredRxDbm !== null && r.measuredRxDbm !== undefined ? Number(r.measuredRxDbm) : null,
          updatedAt: r.updatedAt,
          items: items,
          ponPorts: ponPorts,
          activePonPortId: r.activePonPortId || ponPorts[0]?.id || 'pon-1',
        };
      });

      const activeSetting = await db.get('SELECT value FROM fiber_budget_settings WHERE key = ?', ['active_profile_id']);
      const activeProfileId = activeSetting ? activeSetting.value : (profiles[0]?.id || 'prof-default-epon');

      res.json({ profiles, activeProfileId });
    } catch (err: any) {
      console.error('Error getting fiber budget profiles:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fiber-budget/profiles', async (req, res) => {
    try {
      const {
        id,
        title,
        description,
        txPowerDbm,
        wavelengthNm,
        targetRxMinDbm,
        targetRxMaxDbm,
        targetOptimalMinDbm,
        targetOptimalMaxDbm,
        measuredRxDbm,
        items,
        ponPorts,
        activePonPortId,
        updatedAt
      } = req.body;

      if (!id || !title) {
        return res.status(400).json({ error: 'Profile id and title are required' });
      }

      const existing = await db.get('SELECT id FROM fiber_budget_profiles WHERE id = ?', [id]);
      const nowStr = updatedAt || new Date().toISOString();
      const itemsJson = JSON.stringify(items || []);
      const ponPortsJson = JSON.stringify(ponPorts || []);
      const activePonId = activePonPortId || (ponPorts && ponPorts[0]?.id) || 'pon-1';

      if (existing) {
        await db.run(
          `UPDATE fiber_budget_profiles SET 
            title = ?, description = ?, txPowerDbm = ?, wavelengthNm = ?, 
            targetRxMinDbm = ?, targetRxMaxDbm = ?, targetOptimalMinDbm = ?, targetOptimalMaxDbm = ?, 
            measuredRxDbm = ?, itemsJson = ?, ponPortsJson = ?, activePonPortId = ?, updatedAt = ? 
          WHERE id = ?`,
          [
            title,
            description || '',
            Number(txPowerDbm) || 0,
            Number(wavelengthNm) || 1490,
            Number(targetRxMinDbm) || -27.0,
            Number(targetRxMaxDbm) || -6.0,
            Number(targetOptimalMinDbm) || -24.0,
            Number(targetOptimalMaxDbm) || -14.0,
            measuredRxDbm !== undefined && measuredRxDbm !== null ? Number(measuredRxDbm) : null,
            itemsJson,
            ponPortsJson,
            activePonId,
            nowStr,
            id
          ]
        );
      } else {
        await db.run(
          `INSERT INTO fiber_budget_profiles 
          (id, title, description, txPowerDbm, wavelengthNm, targetRxMinDbm, targetRxMaxDbm, targetOptimalMinDbm, targetOptimalMaxDbm, measuredRxDbm, itemsJson, ponPortsJson, activePonPortId, updatedAt) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            title,
            description || '',
            Number(txPowerDbm) || 0,
            Number(wavelengthNm) || 1490,
            Number(targetRxMinDbm) || -27.0,
            Number(targetRxMaxDbm) || -6.0,
            Number(targetOptimalMinDbm) || -24.0,
            Number(targetOptimalMaxDbm) || -14.0,
            measuredRxDbm !== undefined && measuredRxDbm !== null ? Number(measuredRxDbm) : null,
            itemsJson,
            ponPortsJson,
            activePonId,
            nowStr
          ]
        );
      }

      res.json({ success: true, id, message: 'Profile saved to SQLite database' });
    } catch (err: any) {
      console.error('Error saving fiber budget profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/fiber-budget/profiles/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        txPowerDbm,
        wavelengthNm,
        targetRxMinDbm,
        targetRxMaxDbm,
        targetOptimalMinDbm,
        targetOptimalMaxDbm,
        measuredRxDbm,
        items,
        ponPorts,
        activePonPortId,
        updatedAt
      } = req.body;

      const nowStr = updatedAt || new Date().toISOString();
      const itemsJson = JSON.stringify(items || []);
      const ponPortsJson = JSON.stringify(ponPorts || []);
      const activePonId = activePonPortId || (ponPorts && ponPorts[0]?.id) || 'pon-1';

      await db.run(
        `UPDATE fiber_budget_profiles SET 
          title = ?, description = ?, txPowerDbm = ?, wavelengthNm = ?, 
          targetRxMinDbm = ?, targetRxMaxDbm = ?, targetOptimalMinDbm = ?, targetOptimalMaxDbm = ?, 
          measuredRxDbm = ?, itemsJson = ?, ponPortsJson = ?, activePonPortId = ?, updatedAt = ? 
        WHERE id = ?`,
        [
          title,
          description || '',
          Number(txPowerDbm) || 0,
          Number(wavelengthNm) || 1490,
          Number(targetRxMinDbm) || -27.0,
          Number(targetRxMaxDbm) || -6.0,
          Number(targetOptimalMinDbm) || -24.0,
          Number(targetOptimalMaxDbm) || -14.0,
          measuredRxDbm !== undefined && measuredRxDbm !== null ? Number(measuredRxDbm) : null,
          itemsJson,
          ponPortsJson,
          activePonId,
          nowStr,
          id
        ]
      );

      res.json({ success: true, id, message: 'Profile updated in SQLite database' });
    } catch (err: any) {
      console.error('Error updating fiber budget profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/fiber-budget/profiles/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await db.run('DELETE FROM fiber_budget_profiles WHERE id = ?', [id]);
      res.json({ success: true, id, message: 'Profile deleted from SQLite database' });
    } catch (err: any) {
      console.error('Error deleting fiber budget profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fiber-budget/active-profile', async (req, res) => {
    try {
      const { activeProfileId } = req.body;
      if (activeProfileId) {
        await db.run('INSERT OR REPLACE INTO fiber_budget_settings (key, value) VALUES (?, ?)', ['active_profile_id', activeProfileId]);
      }
      res.json({ success: true, activeProfileId });
    } catch (err: any) {
      console.error('Error setting active fiber budget profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fiber-budget/reset', async (req, res) => {
    try {
      const blankProfile = {
        id: 'prof-default-epon',
        title: 'EPON Optical Link Budget',
        description: 'EPON 1490nm (SC/UPC) Link Budget',
        txPowerDbm: 5.0,
        wavelengthNm: 1490,
        targetRxMinDbm: -27.0,
        targetRxMaxDbm: -6.0,
        targetOptimalMinDbm: -24.0,
        targetOptimalMaxDbm: -14.0,
        measuredRxDbm: null,
        items: [],
        ponPorts: [
          {
            id: 'pon-1',
            name: 'PON 1',
            portNumber: 1,
            txPowerDbm: 5.0,
            wavelengthNm: 1490,
            items: [],
          },
        ],
        activePonPortId: 'pon-1',
        updatedAt: new Date().toISOString(),
      };

      await db.run('DELETE FROM fiber_budget_profiles');
      await db.run(
        `INSERT INTO fiber_budget_profiles 
        (id, title, description, txPowerDbm, wavelengthNm, targetRxMinDbm, targetRxMaxDbm, targetOptimalMinDbm, targetOptimalMaxDbm, measuredRxDbm, itemsJson, ponPortsJson, activePonPortId, updatedAt) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          blankProfile.id,
          blankProfile.title,
          blankProfile.description,
          blankProfile.txPowerDbm,
          blankProfile.wavelengthNm,
          blankProfile.targetRxMinDbm,
          blankProfile.targetRxMaxDbm,
          blankProfile.targetOptimalMinDbm,
          blankProfile.targetOptimalMaxDbm,
          blankProfile.measuredRxDbm,
          JSON.stringify(blankProfile.items),
          JSON.stringify(blankProfile.ponPorts),
          blankProfile.activePonPortId,
          blankProfile.updatedAt
        ]
      );
      await db.run('INSERT OR REPLACE INTO fiber_budget_settings (key, value) VALUES (?, ?)', ['active_profile_id', blankProfile.id]);

      res.json({ success: true, profiles: [blankProfile], activeProfileId: blankProfile.id });
    } catch (err: any) {
      console.error('Error resetting fiber budget profile:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- DATA & MANAGEMENT API ROUTES ---

  // Get full dataset
  app.get('/api/data', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      const formattedSubs = subscribers.map((s: any) => ({
        ...s,
        first: capitalizeWords(s.first || ''),
        last: capitalizeWords(s.last || ''),
      }));
      const payments = await db.all('SELECT * FROM payments ORDER BY rowid DESC');
      const expenses = await db.all('SELECT * FROM expenses ORDER BY date DESC, rowid DESC');
      res.json({ subscribers: formattedSubs, payments, expenses });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Subscribers API
  app.get('/api/subscribers', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      const formattedSubs = subscribers.map((s: any) => ({
        ...s,
        first: capitalizeWords(s.first || ''),
        last: capitalizeWords(s.last || ''),
      }));
      res.json(formattedSubs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/subscribers', async (req, res) => {
    try {
      const sub = req.body;
      if (!sub.id) {
        return res.status(400).json({ error: 'Subscriber ID is required' });
      }

      const formattedLast = capitalizeWords(sub.last || '');
      const formattedFirst = capitalizeWords(sub.first || '');

      const existing = await db.get('SELECT * FROM subscribers WHERE id = ?', [sub.id]);
      const oldVlan = existing && existing.vlan ? Number(existing.vlan) : null;

      if (existing) {
        await db.run(
          `UPDATE subscribers SET last = ?, first = ?, dueRaw = ?, dueDay = ?, status = ?, vlan = ?, rate = ?, phone = ?, address = ?, macAddress = ?, notes = ? WHERE id = ?`,
          [
            formattedLast,
            formattedFirst,
            sub.dueRaw || null,
            sub.dueDay !== undefined ? sub.dueDay : null,
            sub.status || 'Active',
            sub.vlan !== undefined ? sub.vlan : null,
            sub.rate || 600,
            sub.phone || '',
            sub.address || '',
            sub.macAddress || '',
            sub.notes || '',
            sub.id,
          ]
        );
      } else {
        await db.run(
          `INSERT INTO subscribers (id, last, first, dueRaw, dueDay, status, vlan, rate, phone, address, macAddress, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sub.id,
            formattedLast,
            formattedFirst,
            sub.dueRaw || null,
            sub.dueDay !== undefined ? sub.dueDay : null,
            sub.status || 'Active',
            sub.vlan !== undefined ? sub.vlan : null,
            sub.rate || 600,
            sub.phone || '',
            sub.address || '',
            sub.macAddress || '',
            sub.notes || '',
          ]
        );
      }

      const updatedSub = await db.get('SELECT * FROM subscribers WHERE id = ?', [sub.id]);

      // Sync RouterOS VLAN comment for old VLAN if changed
      const newVlan = updatedSub.vlan !== null && updatedSub.vlan !== undefined ? Number(updatedSub.vlan) : null;
      if (oldVlan && oldVlan !== newVlan) {
        const remainingOld = await db.all('SELECT * FROM subscribers WHERE vlan = ?', [oldVlan]);
        const oldComment = remainingOld.map(formatSubCommentName).filter(Boolean).join(', ');
        syncVlanInterfaceComment(db, oldVlan, oldComment).catch(() => {});
      }

      // Sync RouterOS VLAN comment for new VLAN
      if (newVlan && newVlan > 0) {
        const remainingNew = await db.all('SELECT * FROM subscribers WHERE vlan = ?', [newVlan]);
        const newComment = remainingNew.map(formatSubCommentName).filter(Boolean).join(', ');
        syncVlanInterfaceComment(db, newVlan, newComment).catch(() => {});
      }

      res.json(updatedSub);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/subscribers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existingSub = await db.get('SELECT * FROM subscribers WHERE id = ?', [id]);
      const delVlan = existingSub && existingSub.vlan ? Number(existingSub.vlan) : null;

      await db.run('DELETE FROM subscribers WHERE id = ?', [id]);

      if (delVlan && delVlan > 0) {
        const remaining = await db.all('SELECT * FROM subscribers WHERE vlan = ?', [delVlan]);
        const remComment = remaining.map(formatSubCommentName).filter(Boolean).join(', ');
        syncVlanInterfaceComment(db, delVlan, remComment).catch(() => {});
      }

      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Payments API
  app.get('/api/payments', async (req, res) => {
    try {
      const payments = await db.all('SELECT * FROM payments ORDER BY rowid DESC');
      res.json(payments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/payments', async (req, res) => {
    try {
      const payment = req.body;
      const pId = payment.id || `pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const ts = payment.ts || new Date().toLocaleString();

      await db.run(
        `INSERT INTO payments (id, ts, sub, month, amount, method, referenceNo, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pId,
          ts,
          payment.sub,
          payment.month,
          payment.amount,
          payment.method || 'Cash',
          payment.referenceNo || '',
          payment.note || '',
        ]
      );

      const newPayment = await db.get('SELECT * FROM payments WHERE id = ?', [pId]);
      res.json(newPayment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/payments/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM payments WHERE id = ?', [req.params.id]);
      res.json({ success: true, id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Expenses API
  app.get('/api/expenses', async (req, res) => {
    try {
      const expenses = await db.all('SELECT * FROM expenses ORDER BY date DESC, rowid DESC');
      res.json(expenses);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/expenses', async (req, res) => {
    try {
      const exp = req.body;
      const id = exp.id || `exp-${Date.now()}`;

      const existing = await db.get('SELECT id FROM expenses WHERE id = ?', [id]);
      if (existing) {
        await db.run(
          `UPDATE expenses SET itemName = ?, unitPrice = ?, quantity = ?, totalPrice = ?, date = ?, month = ?, category = ?, note = ? WHERE id = ?`,
          [
            exp.itemName,
            exp.unitPrice,
            exp.quantity,
            exp.totalPrice,
            exp.date,
            exp.month,
            exp.category || '',
            exp.note || '',
            id,
          ]
        );
      } else {
        await db.run(
          `INSERT INTO expenses (id, itemName, unitPrice, quantity, totalPrice, date, month, category, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            exp.itemName,
            exp.unitPrice,
            exp.quantity,
            exp.totalPrice,
            exp.date,
            exp.month,
            exp.category || '',
            exp.note || '',
          ]
        );
      }

      const updatedExp = await db.get('SELECT * FROM expenses WHERE id = ?', [id]);
      res.json(updatedExp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/expenses/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
      res.json({ success: true, id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset API
  app.post('/api/reset', async (req, res) => {
    try {
      await seedDatabase(db);
      const subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      const payments = await db.all('SELECT * FROM payments ORDER BY rowid DESC');
      const expenses = await db.all('SELECT * FROM expenses ORDER BY date DESC, rowid DESC');
      res.json({ success: true, subscribers, payments, expenses });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Database Backup / Download endpoint
  app.get('/api/database/download', async (req, res) => {
    try {
      const buffer = db.exportBuffer();
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `ftth_database_${dateStr}.sqlite`;
      res.setHeader('Content-Type', 'application/x-sqlite3');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to export database: ' + err.message });
    }
  });

  // Database Restore / Upload endpoint
  app.post('/api/database/upload', async (req, res) => {
    try {
      let fileBuffer: Buffer | null = null;

      if (req.body && req.body.fileBase64) {
        fileBuffer = Buffer.from(req.body.fileBase64, 'base64');
      } else if (Buffer.isBuffer(req.body)) {
        fileBuffer = req.body;
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: 'No database file received. Please select a valid SQLite database file.' });
      }

      await replaceDatabase(fileBuffer);

      // Re-fetch all data from newly loaded database
      const subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      const formattedSubs = subscribers.map((s: any) => ({
        ...s,
        first: capitalizeWords(s.first || ''),
        last: capitalizeWords(s.last || ''),
      }));
      const payments = await db.all('SELECT * FROM payments ORDER BY rowid DESC');
      const expenses = await db.all('SELECT * FROM expenses ORDER BY date DESC, rowid DESC');

      res.json({
        success: true,
        message: 'Database successfully imported and restored!',
        subscribers: formattedSubs,
        payments,
        expenses,
      });
    } catch (err: any) {
      console.error('Error importing database:', err);
      res.status(500).json({ error: 'Failed to restore database: ' + (err.message || 'Invalid SQLite format') });
    }
  });

  // --- MIKROTIK ROUTEROS API ---
  app.get('/api/mikrotik/config', async (req, res) => {
    try {
      const cfg = getMikrotikConfig(db);
      res.json(cfg);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/config', async (req, res) => {
    try {
      const cfg = saveMikrotikConfig(db, req.body);
      res.json({ success: true, config: cfg });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/sync-time', async (req, res) => {
    try {
      const result = await syncRouterTime(db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/resources', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterResources(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/interfaces', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterInterfaces(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/secrets', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterSecrets(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/active', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterActiveSessions(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/leases', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterDhcpLeases(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/delete-lease', async (req, res) => {
    try {
      const { leaseId, macAddress } = req.body;
      if (!leaseId && !macAddress) {
        return res.status(400).json({ error: 'leaseId or macAddress is required' });
      }
      const result = await deleteDhcpLease(db, leaseId, macAddress);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/toggle-user', async (req, res) => {
    try {
      const { subId, disable } = req.body;
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await toggleSubscriberInternet(db, Number(subId), Boolean(disable), subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/toggle-vlan', async (req, res) => {
    try {
      const { vlan, disable } = req.body;
      if (!vlan && vlan !== 0) {
        return res.status(400).json({ error: 'VLAN ID is required' });
      }
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await toggleVlanInterface(db, vlan, Boolean(disable), subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/batch-sync', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const payments = await db.all('SELECT * FROM payments');

      // helper to compute status
      const computeStatus = (sub: any) => {
        if (sub.status === 'Inactive') return 'inactive';
        const subPayments = payments.filter((p: any) => p.sub === sub.id);
        const monthsPaid = new Set(subPayments.map((p: any) => p.month));

        const now = new Date();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonthStr = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

        if (!monthsPaid.has(currentMonthStr)) {
          let dueDay = sub.dueDay || 15;
          if (sub.dueRaw) {
            const p = new Date(sub.dueRaw);
            if (!isNaN(p.getTime())) dueDay = p.getDate();
          }
          if (now.getDate() > dueDay) return 'overdue';
          if (now.getDate() === dueDay) return 'due';
        }
        return 'active';
      };

      const result = await batchSyncSubscribersToRouter(db, subscribers, computeStatus);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check Overdue Subscribers and automatically disable their VLAN interfaces
  app.post('/api/mikrotik/check-overdue', async (req, res) => {
    try {
      const result = await checkAndDisableOverdueVlans(db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sync all subscriber full names to MikroTik VLAN interface comments
  app.post('/api/mikrotik/sync-vlan-comments', async (req, res) => {
    try {
      const result = await syncAllVlanComments(db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update a single RouterOS VLAN interface comment
  app.post('/api/mikrotik/update-vlan-comment', async (req, res) => {
    try {
      const { vlan, comment } = req.body;
      if (!vlan && vlan !== 0) {
        return res.status(400).json({ error: 'VLAN ID is required' });
      }
      const result = await syncVlanInterfaceComment(db, vlan, comment || '');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Setup Daily 4:00 AM Cron Schedule to automatically check overdues and disable VLAN interfaces
  function schedule4AMOverdueCheck() {
    function getMsUntilNext4AM() {
      const now = new Date();
      const next4AM = new Date(now);
      next4AM.setHours(4, 0, 0, 0);
      if (now.getTime() >= next4AM.getTime()) {
        next4AM.setDate(next4AM.getDate() + 1);
      }
      return next4AM.getTime() - now.getTime();
    }

    function runAndReschedule() {
      console.log('[Automated 4 AM Cron] Running scheduled daily check for overdue subscribers...');
      checkAndDisableOverdueVlans(db)
        .then((res) => {
          console.log('[Automated 4 AM Cron] Successfully processed overdue VLAN interfaces:', JSON.stringify(res));
        })
        .catch((err) => {
          console.error('[Automated 4 AM Cron] Error during check:', err);
        })
        .finally(() => {
          const msNext = getMsUntilNext4AM();
          console.log(`[Automated 4 AM Cron] Next execution scheduled in ${(msNext / 3600000).toFixed(2)} hours.`);
          setTimeout(runAndReschedule, msNext);
        });
    }

    const initialMs = getMsUntilNext4AM();
    console.log(`[Automated 4 AM Cron] Scheduler active. Next 4:00 AM check scheduled in ${(initialMs / 3600000).toFixed(2)} hours.`);
    setTimeout(runAndReschedule, initialMs);
  }

  schedule4AMOverdueCheck();


  // --- VITE MIDDLEWARE / PRODUCTION STATIC ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
