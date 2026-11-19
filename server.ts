import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb, seedDatabase, replaceDatabase } from './server/db.js';
import { hashPassword, verifyPassword, isHashed } from './server/password.js';
import {
  getMikrotikConfig,
  saveMikrotikConfig,
  getRouterResources,
  getRouterInterfaces,
  getRouterSecrets,
  getRouterActiveSessions,
  getRouterDhcpLeases,
  doesLeaseMatchSubscriber,
  getRouterIpAddresses,
  getRouterAddressLists,
  getUnpaidFirewallStatus,
  removeAddressListEntryById,
  getSubscriberSuspensionStatus,
  addSubscriberToUnpaidList,
  removeSubscriberFromUnpaidList,
  toggleSubscriberSuspension,
  deleteDhcpLease,
  pingIpAddress,
  pingMultipleIpAddresses,
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
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', true);
  app.use(express.json({ limit: '50mb' }));

  // Initialize SQLite DB
  const db = await getDb();

  // Active user sessions (in-memory cache backed by SQLite auth_sessions table)
  const activeSessions = new Map<
    string,
    { userId: number; username: string; name: string; role: string; permission: 'ADMIN' | 'OPERATOR'; expiresAt: number }
  >();

  // Prune expired sessions and restore active ones from database
  try {
    db.run('DELETE FROM auth_sessions WHERE expiresAt <= ?', [Date.now()]);
    const savedSessions = db.all('SELECT * FROM auth_sessions WHERE expiresAt > ?', [Date.now()]);
    for (const s of savedSessions) {
      activeSessions.set(s.token, {
        userId: s.userId,
        username: s.username,
        name: s.name,
        role: s.role,
        permission: s.permission,
        expiresAt: s.expiresAt,
      });
    }
  } catch (err) {
    console.warn('Could not load auth_sessions:', err);
  }

  function createSession(user: { id: number; username: string; name: string; role: string; permission?: string }) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    const permission: 'ADMIN' | 'OPERATOR' = 
      user.permission === 'ADMIN' || user.role === 'admin' 
        ? 'ADMIN' 
        : 'OPERATOR';
    const role = permission === 'ADMIN' ? 'admin' : 'operator';

    const sessionData = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role,
      permission,
      expiresAt,
    };
    activeSessions.set(token, sessionData);
    try {
      db.run(
        'INSERT OR REPLACE INTO auth_sessions (token, userId, username, name, role, permission, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [token, user.id, user.username, user.name || '', role, permission, expiresAt]
      );
    } catch (e) {
      console.warn('Failed to persist session to db:', e);
    }

    return { 
      token, 
      expiresAt, 
      user: { id: user.id, username: user.username, name: user.name, role, permission } 
    };
  }

  function verifyAuth(req: express.Request): { userId: number; username: string; name: string; role: string; permission: 'ADMIN' | 'OPERATOR' } | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    let session = activeSessions.get(token);
    if (!session) {
      try {
        const dbSession = db.get('SELECT * FROM auth_sessions WHERE token = ? AND expiresAt > ?', [token, Date.now()]);
        if (dbSession) {
          session = {
            userId: dbSession.userId,
            username: dbSession.username,
            name: dbSession.name,
            role: dbSession.role,
            permission: dbSession.permission,
            expiresAt: dbSession.expiresAt,
          };
          activeSessions.set(token, session);
        }
      } catch {}
    }
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      activeSessions.delete(token);
      try {
        db.run('DELETE FROM auth_sessions WHERE token = ?', [token]);
      } catch {}
      return null;
    }
    return session;
  }

  // Helper to extract clean client IP
  function cleanIpStr(ip: any): string {
    if (!ip || typeof ip !== 'string') return '127.0.0.1';
    let trimmed = ip.trim();
    if (trimmed.startsWith('::ffff:')) {
      trimmed = trimmed.substring(7);
    }
    if (trimmed === '::1') {
      return '127.0.0.1';
    }
    // Remove port if present (e.g. 192.168.105.50:51234 or [::1]:80)
    if (trimmed.includes(':') && trimmed.includes('.')) {
      trimmed = trimmed.split(':')[0];
    }
    return trimmed;
  }

  function getClientIp(req: express.Request): string {
    try {
      // Check standard proxy/router headers for audit logging and rate limiting
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && forwarded) {
        const first = forwarded.split(',')[0].trim();
        if (first) return cleanIpStr(first);
      }
      const realIp = req.headers['x-real-ip'];
      if (typeof realIp === 'string' && realIp) {
        return cleanIpStr(realIp);
      }
      const cfConnectingIp = req.headers['cf-connecting-ip'];
      if (typeof cfConnectingIp === 'string' && cfConnectingIp) {
        return cleanIpStr(cfConnectingIp);
      }
      const trueClientIp = req.headers['true-client-ip'];
      if (typeof trueClientIp === 'string' && trueClientIp) {
        return cleanIpStr(trueClientIp);
      }
      const xClientIp = req.headers['x-client-ip'];
      if (typeof xClientIp === 'string' && xClientIp) {
        return cleanIpStr(xClientIp);
      }

      // Socket remote address
      if (req.socket && req.socket.remoteAddress) {
        return cleanIpStr(req.socket.remoteAddress);
      }
      return cleanIpStr(req.ip || '127.0.0.1');
    } catch {
      return '127.0.0.1';
    }
  }

  // Helper to record persistent audit logs for key administrative actions
  async function recordAuditLog(
    dbInstance: any,
    opts: {
      userId?: number | null;
      username: string;
      userRole?: string;
      action: string;
      category: 'subscriber' | 'payment' | 'expense' | 'database' | 'user' | 'mikrotik' | 'security' | 'system';
      description: string;
      details?: any;
      ipAddress?: string | null;
    }
  ) {
    try {
      const id = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = new Date().toISOString();
      const detailsStr = opts.details 
        ? (typeof opts.details === 'string' ? opts.details : JSON.stringify(opts.details)) 
        : null;
      await dbInstance.run(
        `INSERT INTO audit_logs (id, timestamp, userId, username, userRole, action, category, description, details, ipAddress)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          timestamp,
          opts.userId || null,
          opts.username || 'System',
          opts.userRole || 'admin',
          opts.action,
          opts.category || 'system',
          opts.description,
          detailsStr,
          opts.ipAddress || null,
        ]
      );
    } catch (err) {
      console.warn('Failed to record audit log:', err);
    }
  }

  // --- RATE LIMITING MIDDLEWARE (ANTI-SPAM & DOS PROTECTION) ---
  interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    message?: string;
  }

  interface RateLimitRecord {
    count: number;
    resetTime: number;
  }

  const rateLimitStore = new Map<string, RateLimitRecord>();

  // Periodically clean up expired rate limit entries to manage memory
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (record.resetTime <= now) {
        rateLimitStore.delete(key);
      }
    }
  }, 2 * 60 * 1000);

  function createRateLimiter(prefix: string, config: RateLimitConfig) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = getClientIp(req);
      const key = `${prefix}:${ip}`;
      const now = Date.now();

      let record = rateLimitStore.get(key);
      if (!record || record.resetTime <= now) {
        record = {
          count: 1,
          resetTime: now + config.windowMs,
        };
        rateLimitStore.set(key, record);
      } else {
        record.count += 1;
      }

      const remaining = Math.max(0, config.maxRequests - record.count);
      const resetSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

      res.setHeader('RateLimit-Limit', config.maxRequests);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', resetSeconds);

      if (record.count > config.maxRequests) {
        res.setHeader('Retry-After', resetSeconds);
        return res.status(429).json({
          success: false,
          error: config.message || 'Too many requests. Please wait a moment before trying again.',
          rateLimited: true,
          retryAfter: resetSeconds,
        });
      }

      next();
    };
  }

  const authRateLimiter = createRateLimiter('auth', {
    windowMs: 60 * 1000,
    maxRequests: 15,
    message: 'Too many login attempts. Please wait 1 minute before trying again.',
  });

  const portalRateLimiter = createRateLimiter('portal', {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Request limit exceeded for subscriber portal. Please wait a moment before refreshing again.',
  });

  // --- AUTHENTICATION API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Login (Protected with auth rate limiter against brute force attacks)
  app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const user = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username.trim()]);
      if (!user || !verifyPassword(password, user.password)) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      // If user's stored password wasn't hashed yet, upgrade it in DB now
      if (!isHashed(user.password)) {
        try {
          await db.run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(password), user.id]);
        } catch (err) {
          console.warn('Auto upgrade password hash notice:', err);
        }
      }

      const userPerm: 'ADMIN' | 'OPERATOR' = user.permission === 'ADMIN' || user.role === 'admin' ? 'ADMIN' : 'OPERATOR';
      const session = createSession({
        id: user.id,
        username: user.username,
        name: user.name || (userPerm === 'ADMIN' ? 'Administrator' : 'Operator'),
        role: userPerm === 'ADMIN' ? 'admin' : 'operator',
        permission: userPerm,
      });

      // Record successful login in audit log
      recordAuditLog(db, {
        userId: user.id,
        username: user.username,
        userRole: session.user.role,
        action: 'USER_LOGIN',
        category: 'security',
        description: `User "${user.username}" logged in successfully (${session.user.permission})`,
        ipAddress: getClientIp(req),
      }).catch(() => {});

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
        permission: session.permission,
      },
    });
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      activeSessions.delete(token);
      try {
        db.run('DELETE FROM auth_sessions WHERE token = ?', [token]);
      } catch {}
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
      if (!user || !verifyPassword(currentPassword, user.password)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const updatedPassword = newPassword && newPassword.trim() 
        ? hashPassword(newPassword.trim()) 
        : (isHashed(user.password) ? user.password : hashPassword(user.password));
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

      // Record audit log
      recordAuditLog(db, {
        userId: user.id,
        username: updatedUsername,
        userRole: session.role,
        action: 'USER_PASSWORD_CHANGE',
        category: 'user',
        description: `User "${updatedUsername}" updated profile credentials and security password`,
        ipAddress: getClientIp(req),
      }).catch(() => {});

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

  // Apply rate limiter to all subscriber portal routes
  app.use('/api/portal', portalRateLimiter);

  function formatBytesStr(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 MB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }

  // Public Subscriber Portal Subscribers directory endpoint (disabled to protect subscriber privacy)
  app.get('/api/portal/subscribers', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, subscribers: [] });
  });

  // Public Subscriber Portal Info (IPoE: Request IP + live RouterOS DHCP WAN IP matching, with account lookup fallback)
  app.get('/api/portal/subscriber-info', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const requestIp = getClientIp(req);

      let subscribers: any[] = [];
      try {
        subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      } catch (dbErr) {
        console.warn('DB query in subscriber-info failed:', dbErr);
      }

      if (!subscribers || subscribers.length === 0) {
        return res.json({
          success: true,
          matched: false,
          noSubscribers: true,
          detectedVlan: null,
          requestIp,
          onuWanIp: null,
          matchedBy: 'none',
          subscriber: null,
          billing: null,
          bandwidth: null,
          devices: [],
        });
      }

      // Query MikroTik DHCP leases once so we can resolve ONU WAN IP (and optionally match live WAN IPoE leases)
      let routerDhcpResult: any = null;
      try {
        routerDhcpResult = await getRouterDhcpLeases(db, subscribers);
      } catch {
        routerDhcpResult = null;
      }
      const allLeases: any[] = Array.isArray(routerDhcpResult?.leases) ? routerDhcpResult.leases : [];
      const isLiveDhcp = Boolean(routerDhcpResult?.success && routerDhcpResult?.mode === 'live');

      const rawSubId = typeof req.query.subId === 'string'
        ? req.query.subId.trim()
        : (typeof req.query.id === 'string' ? req.query.id.trim() : '');
      const rawVlan = typeof req.query.vlan === 'string' ? req.query.vlan.trim() : '';
      const rawQuery = typeof req.query.query === 'string'
        ? req.query.query.trim()
        : (typeof req.query.q === 'string' ? req.query.q.trim() : '');

      let selectedSub: any = null;
      let matchedBy: 'account_id' | 'vlan' | 'search' | 'wan_ip_lease' | 'none' = 'none';

      if (rawSubId) {
        const parsedId = parseInt(rawSubId.replace(/^#/, ''), 10);
        if (!isNaN(parsedId) && parsedId > 0) {
          selectedSub = subscribers.find((s: any) => Number(s.id) === parsedId) || null;
          if (selectedSub) matchedBy = 'account_id';
        }
        if (!selectedSub) {
          return res.json({
            success: true,
            matched: false,
            requiresLookup: true,
            notFound: true,
            searchQuery: rawSubId,
            detectedVlan: null,
            requestIp,
            onuWanIp: null,
            matchedBy: 'none',
            subscriber: null,
            billing: null,
            bandwidth: null,
            devices: [],
          });
        }
      } else if (rawVlan) {
        const parsedVlan = parseInt(rawVlan, 10);
        if (!isNaN(parsedVlan) && parsedVlan > 0) {
          const vlanMatches = subscribers.filter((s: any) => Number(s.vlan) === parsedVlan);
          if (vlanMatches.length === 1) {
            selectedSub = vlanMatches[0];
            matchedBy = 'vlan';
          } else if (vlanMatches.length > 1) {
            return res.json({
              success: true,
              matched: false,
              requiresLookup: true,
              searchQuery: rawVlan,
              detectedVlan: null,
              requestIp,
              onuWanIp: null,
              matchedBy: 'none',
              multipleMatches: vlanMatches.slice(0, 10).map((s: any) => ({
                id: s.id,
                name: `${capitalizeWords(s.first || '')} ${capitalizeWords(s.last || '')}`.trim() || 'Fiber Subscriber',
                vlan: s.vlan ? Number(s.vlan) : null,
                status: s.status || 'Active',
              })),
              subscriber: null,
              billing: null,
              bandwidth: null,
              devices: [],
            });
          }
        }
        if (!selectedSub) {
          return res.json({
            success: true,
            matched: false,
            requiresLookup: true,
            notFound: true,
            searchQuery: rawVlan,
            detectedVlan: null,
            requestIp,
            onuWanIp: null,
            matchedBy: 'none',
            subscriber: null,
            billing: null,
            bandwidth: null,
            devices: [],
          });
        }
      } else if (rawQuery) {
        const cleanQuery = rawQuery.replace(/^#/, '').trim();
        const lowerQuery = cleanQuery.toLowerCase();
        const digitsQuery = cleanQuery.replace(/\D/g, '');
        const isPureNumber = /^\d+$/.test(cleanQuery);

        let matches: any[] = [];
        if (isPureNumber) {
          const numVal = parseInt(cleanQuery, 10);
          matches = subscribers.filter((s: any) => {
            if (Number(s.id) === numVal || Number(s.vlan) === numVal) return true;
            const subPhoneDigits = String(s.phone || '').replace(/\D/g, '');
            if (digitsQuery.length >= 4 && subPhoneDigits && subPhoneDigits.endsWith(digitsQuery)) return true;
            return false;
          });
        } else {
          // Require at least 2 characters for name/text lookup
          if (lowerQuery.length >= 2) {
            matches = subscribers.filter((s: any) => {
              const first = String(s.first || '').toLowerCase();
              const last = String(s.last || '').toLowerCase();
              const full = `${first} ${last}`.trim();
              const rev = `${last} ${first}`.trim();
              const phoneDigits = String(s.phone || '').replace(/\D/g, '');
              if (full.includes(lowerQuery) || rev.includes(lowerQuery)) return true;
              if (digitsQuery.length >= 7 && phoneDigits && phoneDigits.includes(digitsQuery)) return true;
              return false;
            });
          }
        }

        if (matches.length === 1) {
          selectedSub = matches[0];
          matchedBy = 'search';
        } else if (matches.length > 1) {
          return res.json({
            success: true,
            matched: false,
            requiresLookup: true,
            searchQuery: rawQuery,
            detectedVlan: null,
            requestIp,
            onuWanIp: null,
            matchedBy: 'none',
            multipleMatches: matches.slice(0, 10).map((s: any) => ({
              id: s.id,
              name: `${capitalizeWords(s.first || '')} ${capitalizeWords(s.last || '')}`.trim() || 'Fiber Subscriber',
              vlan: s.vlan ? Number(s.vlan) : null,
              status: s.status || 'Active',
            })),
            subscriber: null,
            billing: null,
            bandwidth: null,
            devices: [],
          });
        } else {
          return res.json({
            success: true,
            matched: false,
            requiresLookup: true,
            notFound: true,
            searchQuery: rawQuery,
            detectedVlan: null,
            requestIp,
            onuWanIp: null,
            matchedBy: 'none',
            subscriber: null,
            billing: null,
            bandwidth: null,
            devices: [],
          });
        }
      } else {
        // Check if incoming requestIp uniquely matches a LIVE MikroTik DHCP lease (works when hosted on ISP local network before masquerade, or per-ONU public IP)
        if (isLiveDhcp && requestIp && requestIp !== '127.0.0.1' && requestIp !== '::1') {
          const leaseForIp = allLeases.find(
            (l: any) => l.address && String(l.address).trim().split('/')[0] === requestIp && !String(l.id || '').startsWith('*sim-')
          );
          if (leaseForIp) {
            const matchedSubs = subscribers.filter((s: any) => doesLeaseMatchSubscriber(leaseForIp, s));

            if (matchedSubs.length === 1) {
              selectedSub = matchedSubs[0];
              matchedBy = 'wan_ip_lease';
            }
          }
        }

        if (!selectedSub) {
          // Behind shared NAT or unmatched requestIp: require account lookup and still expose requestIp
          return res.json({
            success: true,
            matched: false,
            requiresLookup: true,
            detectedVlan: null,
            requestIp,
            onuWanIp: null,
            matchedBy: 'none',
            subscriber: null,
            billing: null,
            bandwidth: null,
            devices: [],
          });
        }
      }

      const targetVlan = selectedSub.vlan ? Number(selectedSub.vlan) : null;

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

      let statusPill: 'active' | 'due' | 'overdue' | 'inactive' | 'exclude' = 'active';
      if (selectedSub.status === 'Exclude') {
        statusPill = 'exclude';
      } else if (selectedSub.status === 'Inactive') {
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

      // Calculate unpaid months list (last 6 months back) - do not count for inactive or excluded subscribers
      const unpaidMonths: string[] = [];
      if (selectedSub.status !== 'Inactive' && selectedSub.status !== 'Exclude') {
        for (let i = 0; i < 6; i++) {
          const checkD = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const mStr = `${monthNames[checkD.getMonth()]} ${checkD.getFullYear()}`;
          if (!monthsPaidSet.has(mStr)) {
            unpaidMonths.push(mStr);
          }
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

      // On MikroTik router interfaces:
      // Router Tx (transmit out to subscriber) = Subscriber Download
      // Router Rx (receive in from subscriber) = Subscriber Upload
      let rxByte = targetIface ? (targetIface.rxByte || 0) : 0;
      let txByte = targetIface ? (targetIface.txByte || 0) : 0;

      // Provide realistic default telemetry if in container/mock environment without live router traffic:
      // Subscriber download (Tx) is higher (~12.5 GB), subscriber upload (Rx) is lower (~2.8 GB)
      if (rxByte === 0 && txByte === 0) {
        const baseSeed = ((selectedSub.id || 1) * 137 + (now.getDate() * 41)) % 100;
        txByte = Math.floor((12.5 + baseSeed * 0.35) * 1024 * 1024 * 1024);
        rxByte = Math.floor((2.8 + baseSeed * 0.08) * 1024 * 1024 * 1024);
      }

      const totalByte = rxByte + txByte;
      const downloadByte = txByte;
      const uploadByte = rxByte;

      const bandwidth = {
        rxByte,
        txByte,
        downloadByte,
        uploadByte,
        rxFormatted: formatBytesStr(rxByte),
        txFormatted: formatBytesStr(txByte),
        downloadFormatted: formatBytesStr(downloadByte),
        uploadFormatted: formatBytesStr(uploadByte),
        totalFormatted: formatBytesStr(totalByte),
        interfaceName: targetIface?.name || `vlan-${targetVlan || 100}`,
        vlanId: targetVlan,
        status: (selectedSub.status === 'Inactive' || targetIface?.disabled) ? ('disabled' as const) : ('active' as const),
        running: targetIface?.running !== false,
      };

      // Filter and sanitize Connected Devices (DHCP Leases) using exact boundary matching
      // STRICT REQUIREMENT: In DHCP list DO NOT show MAC address, ONLY device name + IP
      const matchingLeases: any[] = allLeases.filter((l: any) => doesLeaseMatchSubscriber(l, selectedSub));

      // Resolve the ONU's live IPoE WAN IP from MikroTik DHCP leases (ignoring simulated fallback leases)
      let onuWanIp: string | null = null;
      if (isLiveDhcp && matchingLeases.length > 0) {
        const macLease = selectedSub.macAddress
          ? matchingLeases.find((l: any) => l.macAddress && l.macAddress.toLowerCase() === selectedSub.macAddress.toLowerCase() && l.address)
          : null;
        const reqLease = requestIp
          ? matchingLeases.find((l: any) => l.address && String(l.address).trim().split('/')[0] === requestIp)
          : null;
        const primaryLease = macLease || reqLease || matchingLeases.find((l: any) => Boolean(l.address));
        onuWanIp = primaryLease?.address ? String(primaryLease.address).trim().split('/')[0] : null;
      }

      let devicesList: Array<{ id: string; deviceName: string; ipAddress: string; status: string; isStatic: boolean }> = [];

      if (matchingLeases.length > 0) {
        devicesList = matchingLeases.map((l: any, idx: number) => {
          let devName = l.hostName || l['host-name'] || l.comment || '';
          if (!devName || devName.trim() === '' || devName.toLowerCase() === 'unknown') {
            const sampleNames = ['ONU-IPoE-Gateway', 'Home-Router', 'Customer-ONT', 'IPoE-CPE'];
            devName = sampleNames[idx % sampleNames.length];
          }
          return {
            id: l.id || `dev-${idx + 1}`,
            deviceName: devName.trim(),
            ipAddress: l.address || 'Dynamic IPoE',
            status: l.status || 'bound',
            isStatic: Boolean(l.disabled === false && !l.expiresAfter),
          };
        });
      } else {
        devicesList = [];
      }

      const responsePayload = {
        success: true,
        matched: true,
        detectedVlan: targetVlan,
        requestIp,
        onuWanIp,
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

    // Enforce Admin-only endpoints:
    // Only users with ADMIN permission can access user management, database backup/restore, database reset, audit logs, or MikroTik settings.
    if (
      req.path.startsWith('/users') ||
      req.path.startsWith('/database') ||
      req.path === '/reset' ||
      req.path.startsWith('/audit-logs') ||
      req.path.startsWith('/mikrotik/config') ||
      req.path.startsWith('/mikrotik/sync-time')
    ) {
      if (session.permission !== 'ADMIN' && session.role !== 'admin') {
        return res.status(403).json({
          error: 'Administrator privileges required to perform this action.',
          permissionDenied: true,
        });
      }
    }

    next();
  });

  // --- USER MANAGEMENT API ROUTES (ADMIN ONLY) ---

  // List all users
  app.get('/api/users', async (req, res) => {
    try {
      const users = await db.all(
        'SELECT id, username, name, role, permission, createdAt FROM users ORDER BY id ASC'
      );
      const formatted = users.map((u: any) => ({
        ...u,
        permission: u.permission === 'ADMIN' || u.role === 'admin' ? 'ADMIN' : 'OPERATOR',
      }));
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create new user
  app.post('/api/users', async (req, res) => {
    try {
      const { username, password, name, role, permission } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const cleanUsername = username.trim();
      if (cleanUsername.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters long' });
      }
      if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters long' });
      }

      const existing = await db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [cleanUsername]);
      if (existing) {
        return res.status(400).json({ error: `Username "${cleanUsername}" is already taken` });
      }

      let userPerm: 'ADMIN' | 'OPERATOR' = 'OPERATOR';
      let userRole = 'operator';
      if (permission === 'ADMIN' || role === 'admin') {
        userPerm = 'ADMIN';
        userRole = 'admin';
      } else {
        userPerm = 'OPERATOR';
        userRole = 'operator';
      }

      const maxUser = await db.get('SELECT MAX(id) as maxId FROM users');
      const newId = (maxUser?.maxId || 0) + 1;
      const createdAt = new Date().toISOString();
      const fullName = (name && name.trim()) ? name.trim() : cleanUsername;

      await db.run(
        'INSERT INTO users (id, username, password, name, role, permission, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [newId, cleanUsername, hashPassword(password), fullName, userRole, userPerm, createdAt]
      );

      const createdUser = await db.get(
        'SELECT id, username, name, role, permission, createdAt FROM users WHERE id = ?',
        [newId]
      );

      const currentUser = (req as any).user;
      const permLabel = userPerm === 'ADMIN' ? 'Administrator (Full Access)' : 'Operator (Operational Access)';
      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'USER_CREATE',
        category: 'user',
        description: `Created new user account "${cleanUsername}" with ${permLabel} permission`,
        details: { createdUserId: newId, username: cleanUsername, permission: userPerm },
        ipAddress: getClientIp(req),
      });

      res.json({ success: true, user: createdUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update user
  app.patch('/api/users/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const currentUser = (req as any).user;
      const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [id]);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { name, password, role, permission } = req.body;
      let newPerm: 'ADMIN' | 'OPERATOR' = targetUser.permission === 'ADMIN' || targetUser.role === 'admin' ? 'ADMIN' : 'OPERATOR';
      let newRole = newPerm === 'ADMIN' ? 'admin' : 'operator';

      if (permission || role) {
        const selected = permission || (role === 'admin' ? 'ADMIN' : 'OPERATOR');
        if (selected === 'ADMIN') {
          newPerm = 'ADMIN';
          newRole = 'admin';
        } else {
          newPerm = 'OPERATOR';
          newRole = 'operator';
        }
      }

      // Safeguard: Prevent removing admin role from the last remaining administrator
      if ((targetUser.permission === 'ADMIN' || targetUser.role === 'admin') && newPerm !== 'ADMIN') {
        const adminCount = await db.get(
          "SELECT COUNT(*) as count FROM users WHERE permission = 'ADMIN' OR role = 'admin'"
        );
        if (adminCount && adminCount.count <= 1) {
          return res.status(400).json({ error: 'Cannot demote the only remaining Administrator account' });
        }
      }

      const updatedName = name && name.trim() ? name.trim() : targetUser.name;
      let updatedPassword = targetUser.password;
      if (password && password.trim()) {
        if (password.trim().length < 4) {
          return res.status(400).json({ error: 'Password must be at least 4 characters long' });
        }
        updatedPassword = hashPassword(password.trim());
      }

      await db.run(
        'UPDATE users SET name = ?, role = ?, permission = ?, password = ? WHERE id = ?',
        [updatedName, newRole, newPerm, updatedPassword, id]
      );

      const updatedUser = await db.get(
        'SELECT id, username, name, role, permission, createdAt FROM users WHERE id = ?',
        [id]
      );

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'USER_UPDATE',
        category: 'user',
        description: `Updated user account "${targetUser.username}" (Permission: ${newPerm})`,
        details: { targetUserId: id, username: targetUser.username, permission: newPerm },
        ipAddress: getClientIp(req),
      });

      res.json({ success: true, user: updatedUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete user
  app.delete('/api/users/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const currentUser = (req as any).user;

      if (currentUser && currentUser.userId === id) {
        return res.status(400).json({ error: 'You cannot delete your own active account while logged in' });
      }

      const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [id]);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (targetUser.permission === 'ADMIN' || targetUser.role === 'admin') {
        const adminCount = await db.get(
          "SELECT COUNT(*) as count FROM users WHERE permission = 'ADMIN' OR role = 'admin'"
        );
        if (adminCount && adminCount.count <= 1) {
          return res.status(400).json({ error: 'Cannot delete the only remaining Administrator account' });
        }
      }

      await db.run('DELETE FROM users WHERE id = ?', [id]);

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'USER_DELETE',
        category: 'user',
        description: `Deleted user account "${targetUser.username}" (${targetUser.permission || 'OPERATOR'})`,
        details: { deletedUserId: id, username: targetUser.username },
        ipAddress: getClientIp(req),
      });

      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- AUDIT LOGS API ROUTES ---

  // Get audit logs
  app.get('/api/audit-logs', async (req, res) => {
    try {
      const { category, search, limit } = req.query;
      let query = 'SELECT * FROM audit_logs';
      const params: any[] = [];
      const conditions: string[] = [];

      if (category && category !== 'all') {
        conditions.push('category = ?');
        params.push(category);
      }
      if (search && typeof search === 'string' && search.trim()) {
        conditions.push('(description LIKE ? OR username LIKE ? OR action LIKE ?)');
        const s = `%${search.trim()}%`;
        params.push(s, s, s);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY timestamp DESC';

      const maxLimit = Math.min(parseInt(limit as string, 10) || 300, 1000);
      query += ` LIMIT ${maxLimit}`;

      const logs = await db.all(query, params);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clear audit logs (Admin only)
  app.post('/api/audit-logs/clear', async (req, res) => {
    try {
      const currentUser = (req as any).user;
      await db.run('DELETE FROM audit_logs');
      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'AUDIT_LOG_CLEAR',
        category: 'security',
        description: 'Cleared historical system audit logs archive',
        ipAddress: getClientIp(req),
      });
      res.json({ success: true, message: 'Audit logs cleared successfully' });
    } catch (err: any) {
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

      const currentUser = (req as any).user;
      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: existing ? 'SUBSCRIBER_UPDATE' : 'SUBSCRIBER_CREATE',
        category: 'subscriber',
        description: `${existing ? 'Updated' : 'Added'} subscriber #${sub.id} (${formattedFirst} ${formattedLast}) - Rate: ₱${sub.rate || 600}, VLAN: ${newVlan || 'None'}, Status: ${sub.status || 'Active'}`,
        details: { subscriberId: sub.id, name: `${formattedFirst} ${formattedLast}`, rate: sub.rate, vlan: newVlan },
        ipAddress: getClientIp(req),
      });

      res.json(updatedSub);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/subscribers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const currentUser = (req as any).user;
      const existingSub = await db.get('SELECT * FROM subscribers WHERE id = ?', [id]);
      const delVlan = existingSub && existingSub.vlan ? Number(existingSub.vlan) : null;

      await db.run('DELETE FROM subscribers WHERE id = ?', [id]);

      if (delVlan && delVlan > 0) {
        const remaining = await db.all('SELECT * FROM subscribers WHERE vlan = ?', [delVlan]);
        const remComment = remaining.map(formatSubCommentName).filter(Boolean).join(', ');
        syncVlanInterfaceComment(db, delVlan, remComment).catch(() => {});
      }

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'SUBSCRIBER_DELETE',
        category: 'subscriber',
        description: `Deleted subscriber #${id} (${existingSub ? `${existingSub.first} ${existingSub.last}` : 'Unknown'})`,
        details: { subscriberId: id, name: existingSub ? `${existingSub.first} ${existingSub.last}` : undefined },
        ipAddress: getClientIp(req),
      });

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
      const currentUser = (req as any).user;
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
      const targetSub = await db.get('SELECT first, last FROM subscribers WHERE id = ?', [payment.sub]);
      const subName = targetSub ? ` (${targetSub.first} ${targetSub.last})` : '';

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'PAYMENT_RECORD',
        category: 'payment',
        description: `Recorded payment of ₱${payment.amount} for Subscriber #${payment.sub}${subName} (${payment.month}) via ${payment.method || 'Cash'}${payment.referenceNo ? ` [Ref: ${payment.referenceNo}]` : ''}`,
        details: { paymentId: pId, subId: payment.sub, month: payment.month, amount: payment.amount, method: payment.method },
        ipAddress: getClientIp(req),
      });

      // Auto-unsuspend from UNPAID address list if subscriber is now paid up
      try {
        const allPayments = await db.all('SELECT * FROM payments WHERE sub = ?', [payment.sub]);
        const subRecord = await db.get('SELECT * FROM subscribers WHERE id = ?', [payment.sub]);
        if (subRecord && subRecord.status === 'Active') {
          const now = new Date();
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const currentMonthStr = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
          const monthsPaid = new Set(allPayments.map((p: any) => p.month));
          if (monthsPaid.has(currentMonthStr)) {
            await removeSubscriberFromUnpaidList(db, payment.sub, [subRecord]);
          }
        }
      } catch (err) {
        console.warn('[Payment Auto-Unsuspend Warning]', err);
      }

      res.json(newPayment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/payments/:id', async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const existingPay = await db.get('SELECT * FROM payments WHERE id = ?', [req.params.id]);

      await db.run('DELETE FROM payments WHERE id = ?', [req.params.id]);

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'PAYMENT_DELETE',
        category: 'payment',
        description: `Deleted payment record #${req.params.id}${existingPay ? ` (Subscriber #${existingPay.sub}, ${existingPay.month}, ₱${existingPay.amount})` : ''}`,
        details: { paymentId: req.params.id, payment: existingPay },
        ipAddress: getClientIp(req),
      });

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
      const currentUser = (req as any).user;
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

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: existing ? 'EXPENSE_UPDATE' : 'EXPENSE_CREATE',
        category: 'expense',
        description: `${existing ? 'Updated' : 'Added'} expense item "${exp.itemName}" (Qty: ${exp.quantity}, Total: ₱${exp.totalPrice})`,
        details: { expenseId: id, itemName: exp.itemName, totalPrice: exp.totalPrice },
        ipAddress: getClientIp(req),
      });

      res.json(updatedExp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/expenses/:id', async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const existingExp = await db.get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);

      await db.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'EXPENSE_DELETE',
        category: 'expense',
        description: `Deleted expense record #${req.params.id}${existingExp ? ` ("${existingExp.itemName}", ₱${existingExp.totalPrice})` : ''}`,
        details: { expenseId: req.params.id, expense: existingExp },
        ipAddress: getClientIp(req),
      });

      res.json({ success: true, id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset API
  app.post('/api/reset', async (req, res) => {
    try {
      const currentUser = (req as any).user;
      await seedDatabase(db);
      const subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      const payments = await db.all('SELECT * FROM payments ORDER BY rowid DESC');
      const expenses = await db.all('SELECT * FROM expenses ORDER BY date DESC, rowid DESC');

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'DATABASE_RESET',
        category: 'database',
        description: 'System database was reset to sample demonstration seed',
        ipAddress: getClientIp(req),
      });

      res.json({ success: true, subscribers, payments, expenses });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Database Backup / Download endpoint
  app.get('/api/database/download', async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const buffer = db.exportBuffer();
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `ftth_database_${dateStr}.sqlite`;

      recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'DATABASE_BACKUP_EXPORT',
        category: 'database',
        description: `Exported and downloaded SQLite database backup file (${(buffer.length / 1024).toFixed(1)} KB)`,
        ipAddress: getClientIp(req),
      }).catch(() => {});

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
      const currentUser = (req as any).user;
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

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'DATABASE_RESTORE',
        category: 'database',
        description: `Successfully restored database from SQLite backup file (${formattedSubs.length} subscribers, ${payments.length} payments, ${expenses.length} expenses loaded)`,
        details: { subscribersCount: formattedSubs.length, paymentsCount: payments.length, expensesCount: expenses.length },
        ipAddress: getClientIp(req),
      });

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
      const currentUser = (req as any).user;
      const cfg = saveMikrotikConfig(db, req.body);
      
      // Reschedule automated overdue disconnection timer based on newly saved parameters
      rescheduleOverdueDisconnectionCron();

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'MIKROTIK_CONFIG_UPDATE',
        category: 'mikrotik',
        description: `Updated MikroTik RouterOS connection parameters (Host: ${cfg.host}, User: ${cfg.username}, Overdue Disconnect Time: ${cfg.overdueDisconnectionTime || '04:00'})`,
        ipAddress: getClientIp(req),
      });

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
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterInterfaces(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/ip-addresses', async (req, res) => {
    try {
      const result = await getRouterIpAddresses(db);
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
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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

  app.post('/api/mikrotik/ping', async (req, res) => {
    try {
      const { address, interface: iface, macAddress, vlan, mode, count } = req.body;
      if (!address) {
        return res.status(400).json({ error: 'IP address is required' });
      }
      const pingMode = mode === 'icmp' ? 'icmp' : (mode === 'arp-ping' ? 'arp-ping' : 'arp-ping');
      const result = await pingIpAddress(db, address, {
        interface: iface,
        macAddress,
        vlan,
        mode: pingMode,
        count,
      });
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/ping-leases', async (req, res) => {
    try {
      const { addresses, leases, vlan, interface: defaultIface } = req.body;
      const targets = leases && Array.isArray(leases) && leases.length > 0 ? leases : addresses;
      if (!Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({ error: 'Array of IP addresses or leases is required' });
      }
      const results = await pingMultipleIpAddresses(db, targets, {
        defaultVlan: vlan,
        defaultInterface: defaultIface,
      });
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get all MikroTik firewall address-lists (e.g. UNPAID)
  app.get('/api/mikrotik/address-lists', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterAddressLists(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get live RouterOS UNPAID Address-List status
  app.get('/api/mikrotik/unpaid-firewall', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const result = await getUnpaidFirewallStatus(db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Remove a single UNPAID address-list entry directly
  app.post('/api/mikrotik/address-list/remove', async (req, res) => {
    try {
      const { entryId, address } = req.body || {};
      const currentUser = (req as any).user;
      if (!entryId && !address) {
        return res.status(400).json({ success: false, error: 'entryId or address is required' });
      }
      const result = await removeAddressListEntryById(db, String(entryId || ''), address ? String(address) : undefined);

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'MIKROTIK_SUBSCRIBER_RESTORE',
        category: 'mikrotik',
        description: `Removed address-list 'UNPAID' entry ${address || entryId}`,
        details: { entryId, address, result },
        ipAddress: getClientIp(req),
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get specific subscriber suspension status (checks address-list UNPAID)
  app.get('/api/mikrotik/subscriber-suspension/:subId', async (req, res) => {
    try {
      const subId = Number(req.params.subId);
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getSubscriberSuspensionStatus(db, subId, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Toggle subscriber internet suspension (adds/removes from address-list UNPAID instead of disabling VLAN)
  app.post('/api/mikrotik/toggle-suspension', async (req, res) => {
    try {
      const { subId, suspend, targetIp } = req.body;
      const currentUser = (req as any).user;
      if (!subId) {
        return res.status(400).json({ error: 'subId is required' });
      }
      const subscribers = await db.all('SELECT * FROM subscribers');
      const targetSub = subscribers.find((s) => s.id === Number(subId));
      const result: any = await toggleSubscriberSuspension(db, Number(subId), Boolean(suspend), subscribers, targetIp);

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: suspend ? 'MIKROTIK_SUBSCRIBER_SUSPEND' : 'MIKROTIK_SUBSCRIBER_RESTORE',
        category: 'mikrotik',
        description: `${suspend ? 'Suspended' : 'Restored'} internet for Subscriber #${subId}${targetSub ? ` (${targetSub.first} ${targetSub.last})` : ''} via MikroTik address-list 'UNPAID' (VLAN ${targetSub?.vlan || 'N/A'} kept enabled)`,
        details: { subId, suspend, targetIp, result },
        ipAddress: getClientIp(req),
      });

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

  // toggle-vlan: redirects to address-list UNPAID per user instruction
  app.post('/api/mikrotik/toggle-vlan', async (req, res) => {
    try {
      const { vlan, subId, disable } = req.body;
      const currentUser = (req as any).user;
      const subscribers = await db.all('SELECT * FROM subscribers');
      
      let targetSub = subId ? subscribers.find((s) => s.id === Number(subId)) : null;
      if (!targetSub && (vlan || vlan === 0)) {
        targetSub = subscribers.find((s) => Number(s.vlan) === Number(vlan));
      }

      if (targetSub) {
        const result: any = await toggleSubscriberSuspension(db, targetSub.id, Boolean(disable), subscribers);
        await recordAuditLog(db, {
          userId: currentUser?.userId,
          username: currentUser?.username || 'admin',
          userRole: currentUser?.role || 'admin',
          action: disable ? 'MIKROTIK_SUBSCRIBER_SUSPEND' : 'MIKROTIK_SUBSCRIBER_RESTORE',
          category: 'mikrotik',
          description: `${disable ? 'Suspended' : 'Restored'} internet for Subscriber #${targetSub.id} (${targetSub.first} ${targetSub.last}) via address-list 'UNPAID' (VLAN ${targetSub.vlan} kept active)`,
          details: { vlan: targetSub.vlan, subId: targetSub.id, disable, result },
          ipAddress: getClientIp(req),
        });
        return res.json(result);
      }

      // Never disable raw VLAN interfaces — only allow enabling (disable === false) or return policy error
      if (disable) {
        return res.status(400).json({
          success: false,
          error: `No subscriber matched VLAN ${vlan}. Disabling raw VLAN interfaces is blocked; internet suspension uses address-list 'UNPAID'.`,
        });
      }
      const result: any = await toggleVlanInterface(db, vlan, false, subscribers);
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
        if (sub.status === 'Exclude') return 'exclude';
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

  // Check Overdue Subscribers and automatically add them to address-list UNPAID (instead of disabling VLAN)
  app.post('/api/mikrotik/check-overdue', async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const result = await checkAndDisableOverdueVlans(db);

      await recordAuditLog(db, {
        userId: currentUser?.userId,
        username: currentUser?.username || 'admin',
        userRole: currentUser?.role || 'admin',
        action: 'MIKROTIK_OVERDUE_CHECK',
        category: 'mikrotik',
        description: `Executed overdue check: found ${result.overdueSubscribersCount} overdue subscriber(s), synced with MikroTik address-list 'UNPAID'`,
        details: result,
        ipAddress: getClientIp(req),
      });

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

  // Setup Dynamic Automated Overdue Disconnection Scheduler
  let overdueCronTimeout: NodeJS.Timeout | null = null;

  function rescheduleOverdueDisconnectionCron() {
    if (overdueCronTimeout) {
      clearTimeout(overdueCronTimeout);
      overdueCronTimeout = null;
    }

    try {
      const cfg = getMikrotikConfig(db);
      if (!cfg.autoSyncOverdue) {
        console.log('[Automated Overdue Disconnection] Scheduler disabled in MikroTik configuration.');
        return;
      }

      const scheduleType = cfg.overdueDisconnectionSchedule || 'daily';
      const triggerTime = cfg.overdueDisconnectionTime || '04:00'; // HH:mm

      function calculateMsUntilNextRun(): number {
        const now = new Date();

        if (scheduleType === '1h') return 60 * 60 * 1000;
        if (scheduleType === '6h') return 6 * 60 * 60 * 1000;
        if (scheduleType === '12h') return 12 * 60 * 60 * 1000;
        if (scheduleType === '24h') return 24 * 60 * 60 * 1000;

        // Daily at triggerTime (HH:mm)
        const parts = triggerTime.split(':');
        const targetHour = parseInt(parts[0] || '4', 10);
        const targetMin = parseInt(parts[1] || '0', 10);

        const nextRun = new Date(now);
        nextRun.setHours(targetHour, targetMin, 0, 0);

        if (now.getTime() >= nextRun.getTime()) {
          nextRun.setDate(nextRun.getDate() + 1);
        }

        return Math.max(1000, nextRun.getTime() - now.getTime());
      }

      function runAndScheduleNext() {
        console.log(`[Automated Overdue Disconnection] Running scheduled overdue check (Trigger Time: ${triggerTime}, Schedule: ${scheduleType})...`);
        checkAndDisableOverdueVlans(db)
          .then((res) => {
            console.log('[Automated Overdue Disconnection] Processed overdue VLAN interfaces:', JSON.stringify(res));
          })
          .catch((err) => {
            console.error('[Automated Overdue Disconnection] Error during check:', err);
          })
          .finally(() => {
            const nextMs = calculateMsUntilNextRun();
            console.log(`[Automated Overdue Disconnection] Next check scheduled in ${(nextMs / 3600000).toFixed(2)} hours.`);
            overdueCronTimeout = setTimeout(runAndScheduleNext, nextMs);
          });
      }

      const initialMs = calculateMsUntilNextRun();
      console.log(`[Automated Overdue Disconnection] Scheduler active. Next check scheduled in ${(initialMs / 3600000).toFixed(2)} hours (Trigger: ${triggerTime}, Schedule: ${scheduleType}).`);
      overdueCronTimeout = setTimeout(runAndScheduleNext, initialMs);
    } catch (e) {
      console.error('[Automated Overdue Disconnection] Failed to configure scheduler:', e);
    }
  }

  // Start scheduler on launch
  rescheduleOverdueDisconnectionCron();


  // Ensure unknown /api/* endpoints return JSON 404 instead of SPA HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Global Express error handler (prevents raw stack trace exposure in production)
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message = process.env.NODE_ENV === 'production' && status >= 500
      ? 'Internal server error'
      : (err?.message || 'Internal server error');
    console.error('[Express Error]', err);
    res.status(status).json({ error: message });
  });

  // --- VITE MIDDLEWARE / PRODUCTION STATIC ---
  const distPath = path.join(process.cwd(), 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const isBundledRuntime = path.basename(process.argv[1] || '').endsWith('.cjs');
  const isProduction = process.env.NODE_ENV === 'production' || (isBundledRuntime && fs.existsSync(distIndexPath));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    // When HMR is disabled in middlewareMode, prevent @vite/client from opening a failing WebSocket to port 24678
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const transformed = await vite.transformRequest('/@vite/client');
        if (transformed?.code) {
          const code = transformed.code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR disabled: WebSocket transport connect skipped */'
          );
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.send(code);
          return;
        }
      } catch {
        // Fall through to default vite middleware
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath, {
      maxAge: '7d',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(distIndexPath);
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}, shutting down cleanly...`);
    if (overdueCronTimeout) {
      clearTimeout(overdueCronTimeout);
      overdueCronTimeout = null;
    }
    try {
      db.save();
    } catch (e) {
      console.error('[Server] Error flushing DB during shutdown:', e);
    }
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
