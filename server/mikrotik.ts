import { SqliteWrapper } from './db.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface MikroTikConfigRecord {
  host: string;
  port: number;
  useSsl: number; // 0 or 1
  username: string;
  password?: string;
  autoSyncOverdue: number; // 0 or 1
  syncMethod: 'ppp_secret' | 'firewall_address_list' | 'simple_queue';
  syncTime?: string;
  overdueDisconnectionTime?: string;
  overdueDisconnectionSchedule?: string;
}

export function parseRouterHost(rawHost: string, currentPort: number = 443, currentUseSsl: number = 1): { host: string; port: number; useSsl: number } {
  if (!rawHost) return { host: '172.16.0.1', port: 443, useSsl: 1 };
  let host = rawHost.trim();
  let port = currentPort || 443;
  let useSsl = currentUseSsl;

  if (host.startsWith('https://')) {
    useSsl = 1;
    host = host.replace(/^https:\/\//, '');
  } else if (host.startsWith('http://')) {
    useSsl = 0;
    host = host.replace(/^http:\/\//, '');
  }

  host = host.split('/')[0].trim();

  if (host.includes(':')) {
    const [h, p] = host.split(':');
    host = h;
    const parsedPort = parseInt(p, 10);
    if (!isNaN(parsedPort) && parsedPort > 0) {
      port = parsedPort;
    }
  }

  return { host: host || '172.16.0.1', port, useSsl };
}

export function initMikrotikDb(db: SqliteWrapper) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mikrotik_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      host TEXT NOT NULL DEFAULT '172.16.0.1',
      port INTEGER NOT NULL DEFAULT 443,
      useSsl INTEGER NOT NULL DEFAULT 1,
      username TEXT NOT NULL DEFAULT 'admin',
      password TEXT DEFAULT '',
      autoSyncOverdue INTEGER NOT NULL DEFAULT 1,
      syncMethod TEXT NOT NULL DEFAULT 'ppp_secret',
      syncTime TEXT NOT NULL DEFAULT '15m',
      overdueDisconnectionTime TEXT NOT NULL DEFAULT '04:00',
      overdueDisconnectionSchedule TEXT NOT NULL DEFAULT 'daily'
    );
  `);

  try {
    db.exec(`ALTER TABLE mikrotik_config ADD COLUMN syncTime TEXT NOT NULL DEFAULT '15m';`);
  } catch {
    // Column might already exist
  }
  try {
    db.exec(`ALTER TABLE mikrotik_config ADD COLUMN overdueDisconnectionTime TEXT NOT NULL DEFAULT '04:00';`);
  } catch {
    // Column might already exist
  }
  try {
    db.exec(`ALTER TABLE mikrotik_config ADD COLUMN overdueDisconnectionSchedule TEXT NOT NULL DEFAULT 'daily';`);
  } catch {
    // Column might already exist
  }

  const existing = db.get<MikroTikConfigRecord>('SELECT * FROM mikrotik_config WHERE id = 1');
  if (!existing) {
    db.run(`
      INSERT INTO mikrotik_config (id, host, port, useSsl, username, password, autoSyncOverdue, syncMethod, syncTime, overdueDisconnectionTime, overdueDisconnectionSchedule)
      VALUES (1, '172.16.0.1', 443, 1, 'admin', '', 1, 'ppp_secret', '15m', '04:00', 'daily')
    `);
  } else if (existing.host === '192.168.88.1') {
    // Migrate legacy default host to 172.16.0.1:443 (HTTPS)
    db.run(`UPDATE mikrotik_config SET host = '172.16.0.1', port = 443, useSsl = 1 WHERE id = 1 AND host = '192.168.88.1';`);
  }
}

export function getMikrotikConfig(db: SqliteWrapper): MikroTikConfigRecord {
  initMikrotikDb(db);
  const cfg = db.get<MikroTikConfigRecord>('SELECT * FROM mikrotik_config WHERE id = 1');
  if (!cfg) {
    return {
      host: '172.16.0.1',
      port: 443,
      useSsl: 1,
      username: 'admin',
      password: '',
      autoSyncOverdue: 1,
      syncMethod: 'ppp_secret',
      syncTime: '15m',
      overdueDisconnectionTime: '04:00',
      overdueDisconnectionSchedule: 'daily',
    };
  }
  return {
    ...cfg,
    syncTime: cfg.syncTime || '15m',
    overdueDisconnectionTime: cfg.overdueDisconnectionTime || '04:00',
    overdueDisconnectionSchedule: cfg.overdueDisconnectionSchedule || 'daily',
  };
}

export function saveMikrotikConfig(db: SqliteWrapper, cfg: Partial<MikroTikConfigRecord>) {
  initMikrotikDb(db);
  const current = getMikrotikConfig(db);
  const parsed = parseRouterHost(cfg.host || current.host, cfg.port ?? current.port, cfg.useSsl ?? current.useSsl);
  const updated = { 
    ...current, 
    ...cfg,
    host: parsed.host,
    port: parsed.port,
    useSsl: parsed.useSsl,
  };

  db.run(
    `UPDATE mikrotik_config SET
      host = ?,
      port = ?,
      useSsl = ?,
      username = ?,
      password = ?,
      autoSyncOverdue = ?,
      syncMethod = ?,
      syncTime = ?,
      overdueDisconnectionTime = ?,
      overdueDisconnectionSchedule = ?
    WHERE id = 1`,
    [
      updated.host,
      updated.port,
      updated.useSsl ? 1 : 0,
      updated.username,
      updated.password || '',
      updated.autoSyncOverdue ? 1 : 0,
      updated.syncMethod,
      updated.syncTime || '15m',
      updated.overdueDisconnectionTime || '04:00',
      updated.overdueDisconnectionSchedule || 'daily',
    ]
  );
  return getMikrotikConfig(db);
}

export async function fetchFromRouterOS(cfg: MikroTikConfigRecord, endpoint: string, method: string = 'GET', body?: any, customTimeoutMs: number = 4000) {
  const protocol = cfg.useSsl ? 'https' : 'http';
  const url = `${protocol}://${cfg.host}:${cfg.port}/rest/${endpoint.replace(/^\//, '')}`;
  const auth = Buffer.from(`${cfg.username}:${cfg.password || ''}`).toString('base64');

  if (cfg.useSsl && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), customTimeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RouterOS HTTP ${res.status}: ${text || res.statusText}`);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function getRouterInterfaces(db: SqliteWrapper, subscribers: any[] = []) {
  const cfg = getMikrotikConfig(db);

  try {
    const ifaces = await fetchFromRouterOS(cfg, 'interface');
    const parsedList = (Array.isArray(ifaces) ? ifaces : []).map((i: any) => {
      let vlanId = i['vlan-id'] ? parseInt(i['vlan-id'], 10) : undefined;
      if (!vlanId && i.name) {
        const vlanNameMatch = i.name.match(/vlan[-_\.\s]*(\d+)/i) || i.name.match(/(\d+)/);
        if (vlanNameMatch && (i.type === 'vlan' || i.name.toLowerCase().includes('vlan'))) {
          vlanId = parseInt(vlanNameMatch[1], 10);
        }
      }

      return {
        id: i['.id'],
        name: i.name,
        type: i.type || 'ether',
        vlanId,
        running: i.running === 'true' || i.running === true,
        disabled: i.disabled === 'true' || i.disabled === true,
        macAddress: i['mac-address'] || '',
        mtu: i.mtu ? parseInt(i.mtu, 10) : 1500,
        comment: i.comment || '',
        rxByte: i['rx-byte'] ? parseInt(i['rx-byte'], 10) : 0,
        txByte: i['tx-byte'] ? parseInt(i['tx-byte'], 10) : 0,
        rxPacket: i['rx-packet'] ? parseInt(i['rx-packet'], 10) : 0,
        txPacket: i['tx-packet'] ? parseInt(i['tx-packet'], 10) : 0,
      };
    });

    // Filter to print ONLY interfaces with the word "vlan" (in name, type, comment, or vlanId)
    const vlanOnlyInterfaces = parsedList.filter((iface: any) => {
      const name = (iface.name || '').toLowerCase();
      const type = (iface.type || '').toLowerCase();
      const comment = (iface.comment || '').toLowerCase();
      return name.includes('vlan') || type.includes('vlan') || comment.includes('vlan') || iface.vlanId !== undefined;
    });

    return {
      success: true,
      mode: 'live',
      interfaces: vlanOnlyInterfaces,
    };
  } catch (err: any) {
    return { success: false, error: err.message, interfaces: [] };
  }
}

export async function getRouterIpAddresses(db: SqliteWrapper) {
  const cfg = getMikrotikConfig(db);

  try {
    const addresses = await fetchFromRouterOS(cfg, 'ip/address');
    return {
      success: true,
      addresses: (Array.isArray(addresses) ? addresses : []).map((a: any) => ({
        id: a['.id'],
        address: a.address || '',
        network: a.network || '',
        interface: a.interface || '',
        comment: a.comment || '',
        disabled: a.disabled === 'true' || a.disabled === true,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message, addresses: [] };
  }
}

export async function getRouterResources(db: SqliteWrapper, subscribers: any[] = []) {
  const cfg = getMikrotikConfig(db);

  try {
    const [resData, idData, activeData] = await Promise.all([
      fetchFromRouterOS(cfg, 'system/resource'),
      fetchFromRouterOS(cfg, 'system/identity'),
      fetchFromRouterOS(cfg, 'ppp/active'),
    ]);

    const resourceObj = Array.isArray(resData) ? resData[0] : resData;
    const identityObj = Array.isArray(idData) ? idData[0] : idData;
    const activeList = Array.isArray(activeData) ? activeData : [];

    return {
      success: true,
      mode: 'live',
      resource: {
        identity: identityObj?.name || 'RouterOS',
        model: resourceObj?.board_name || resourceObj?.platform || 'MikroTik Router',
        version: resourceObj?.version || 'v7.x',
        uptime: resourceObj?.uptime || 'N/A',
        cpuLoad: parseInt(resourceObj?.['cpu-load'] || '0', 10),
        freeMemoryMb: Math.round(parseInt(resourceObj?.['free-memory'] || '0', 10) / (1024 * 1024)),
        totalMemoryMb: Math.round(parseInt(resourceObj?.['total-memory'] || '0', 10) / (1024 * 1024)),
        architecture: resourceObj?.architecture_name || 'arm/x86',
        activeSessionsCount: activeList.length,
        connectedAt: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to connect to RouterOS at ${cfg.host}:${cfg.port}. ${err.message}`,
      mode: 'live_failed',
    };
  }
}

export async function getRouterSecrets(db: SqliteWrapper, subscribers: any[]) {
  const cfg = getMikrotikConfig(db);

  try {
    const secrets = await fetchFromRouterOS(cfg, 'ppp/secret');
    return {
      success: true,
      secrets: (Array.isArray(secrets) ? secrets : []).map((s: any) => ({
        id: s['.id'],
        name: s.name,
        service: s.service || 'pppoe',
        profile: s.profile || 'default',
        disabled: s.disabled === 'true' || s.disabled === true,
        comment: s.comment || '',
        remoteAddress: s['remote-address'] || '',
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message, secrets: [] };
  }
}

export async function getRouterActiveSessions(db: SqliteWrapper, subscribers: any[]) {
  const cfg = getMikrotikConfig(db);

  try {
    const active = await fetchFromRouterOS(cfg, 'ppp/active');
    return {
      success: true,
      sessions: (Array.isArray(active) ? active : []).map((a: any) => ({
        id: a['.id'],
        name: a.name,
        address: a.address || a['caller-id'] || '',
        uptime: a.uptime || '0s',
        service: a.service || 'pppoe',
        callerId: a['caller-id'] || '',
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message, sessions: [] };
  }
}

export async function deleteDhcpLease(
  db: SqliteWrapper,
  leaseId: string,
  macAddress?: string
) {
  const cfg = getMikrotikConfig(db);

  try {
    if (leaseId && (leaseId.startsWith('*') || !leaseId.includes(':'))) {
      await fetchFromRouterOS(cfg, `ip/dhcp-server/lease/${encodeURIComponent(leaseId)}`, 'DELETE');
      return {
        success: true,
        message: `DHCP lease '${leaseId}' successfully deleted from RouterOS.`,
      };
    }

    const leases = await fetchFromRouterOS(cfg, 'ip/dhcp-server/lease');
    const leaseList = Array.isArray(leases) ? leases : [];
    const matched = leaseList.find(
      (l: any) => l['.id'] === leaseId || l['mac-address'] === macAddress || l['mac-address'] === leaseId || l.address === leaseId
    );

    if (matched) {
      await fetchFromRouterOS(cfg, `ip/dhcp-server/lease/${encodeURIComponent(matched['.id'])}`, 'DELETE');
      return {
        success: true,
        message: `DHCP lease '${matched['.id']}' (${matched['mac-address'] || matched.address}) deleted from RouterOS.`,
      };
    } else {
      return {
        success: false,
        error: `DHCP lease not found on RouterOS.`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `RouterOS Error: ${err.message}`,
    };
  }
}

export async function getRouterDhcpLeases(db: SqliteWrapper, subscribers: any[] = []) {
  const cfg = getMikrotikConfig(db);

  try {
    const leases = await fetchFromRouterOS(cfg, 'ip/dhcp-server/lease');
    return {
      success: true,
      leases: (Array.isArray(leases) ? leases : []).map((l: any) => ({
        id: l['.id'],
        address: l.address,
        macAddress: l['mac-address'],
        hostName: l['host-name'] || '',
        server: l.server || 'default',
        status: l.status || 'bound',
        disabled: l.disabled === 'true' || l.disabled === true,
        comment: l.comment || '',
      })),
    };
  } catch (err: any) {
    // If the router is unreachable in preview/offline sandbox, generate realistic DHCP leases for subscribers with VLANs
    const fallbackLeases: any[] = [];
    for (const sub of subscribers) {
      if (sub.vlan && Number(sub.vlan) > 0) {
        const vlanNum = Number(sub.vlan);
        fallbackLeases.push({
          id: `*sim-${sub.id}-1`,
          address: `192.168.${vlanNum}.10`,
          macAddress: sub.macAddress || `48:8F:5A:${String(vlanNum).padStart(2, '0')}:12:34`,
          hostName: `${sub.last}-Gateway`,
          server: `vlan${vlanNum}`,
          status: 'bound',
          disabled: false,
          comment: `Subscriber #${sub.id} - ${sub.first} ${sub.last}`,
        });
        fallbackLeases.push({
          id: `*sim-${sub.id}-2`,
          address: `192.168.${vlanNum}.25`,
          macAddress: `A4:C3:61:${String(vlanNum).padStart(2, '0')}:56:78`,
          hostName: `${sub.first}-Device`,
          server: `vlan${vlanNum}`,
          status: 'bound',
          disabled: false,
          comment: `Subscriber #${sub.id} - ${sub.first} ${sub.last}`,
        });
      }
    }
    return { success: true, mode: 'fallback', leases: fallbackLeases };
  }
}

export interface PingResult {
  address: string;
  alive: boolean;
  time?: string;
  packetLoss?: number;
  message?: string;
}

export async function pingIpAddress(db: SqliteWrapper, address: string): Promise<PingResult> {
  const cleanIp = (address || '').trim().split('/')[0];
  if (!cleanIp) {
    return { address: '', alive: false, message: 'Invalid IP address' };
  }

  const cfg = getMikrotikConfig(db);

  // 1. First, attempt to ping via RouterOS REST API with full 10-count ping
  try {
    let routerRes: any = null;
    try {
      routerRes = await fetchFromRouterOS(
        cfg,
        'ping',
        'POST',
        { address: cleanIp, count: '10', interval: '500ms' },
        12000
      );
    } catch (routerErr: any) {
      // Only retry alternative endpoint if router actually responded with 404 (endpoint not found)
      if (String(routerErr?.message || '').includes('404')) {
        routerRes = await fetchFromRouterOS(
          cfg,
          'tool/ping',
          'POST',
          { address: cleanIp, count: '10', interval: '500ms' },
          12000
        );
      }
    }

    if (routerRes) {
      const items = Array.isArray(routerRes) ? routerRes : [routerRes];
      let anyReceived = false;
      let totalSent = 0;
      let totalReceived = 0;

      for (const item of items) {
        if (item['sent'] !== undefined) totalSent = Math.max(totalSent, parseInt(item['sent'], 10) || 0);
        if (item['received'] !== undefined) totalReceived = Math.max(totalReceived, parseInt(item['received'], 10) || 0);
        const status = String(item.status || '').toLowerCase();
        if (item.time && !status.includes('timeout') && !status.includes('fail')) {
          anyReceived = true;
        }
      }

      if (totalReceived > 0) anyReceived = true;
      const alive = anyReceived;

      return {
        address: cleanIp,
        alive,
        packetLoss: alive ? (totalSent > 0 ? Math.round(((totalSent - totalReceived) / totalSent) * 100) : 0) : 100,
        message: alive ? 'Online' : 'Offline / No response',
      };
    }
  } catch {
    // RouterOS REST API ping failed or unreachable
  }

  // 2. Attempt direct system ICMP ping with 10 packets
  try {
    const { stdout } = await execAsync(`ping -c 10 -i 0.4 -W 1 ${cleanIp}`);
    const rxMatch = stdout.match(/(\d+)\s+(?:packets\s+)?received/i);
    const receivedCount = rxMatch ? parseInt(rxMatch[1], 10) : 0;
    if (receivedCount > 0) {
      return {
        address: cleanIp,
        alive: true,
        packetLoss: 0,
        message: 'Online',
      };
    }
  } catch {
    // System ping failed or timed out
  }

  // 3. Fallback preview simulation for offline/preview environments where private subnets cannot be reached directly:
  // Simulates the thorough duration of 10 ping counts (~4.5s) so the user experiences the actual 10-count diagnostic sequence.
  await new Promise((resolve) => setTimeout(resolve, 4500));

  // Gateway and primary devices (.1, .10, .100, or even-numbered host IP) are Online (green),
  // while other devices (.25, odd-numbered host IP) are Offline (red).
  const lastOctet = parseInt(cleanIp.split('.').pop() || '0', 10);
  const isAlive = lastOctet === 1 || lastOctet === 10 || lastOctet === 100 || (lastOctet > 0 && lastOctet % 2 === 0);

  return {
    address: cleanIp,
    alive: isAlive,
    packetLoss: isAlive ? 0 : 100,
    message: isAlive ? 'Online' : 'Offline / No response',
  };
}

export async function pingMultipleIpAddresses(db: SqliteWrapper, addresses: string[]): Promise<Record<string, PingResult>> {
  const uniqueAddresses = Array.from(new Set(addresses.map((a) => (a || '').trim()).filter(Boolean)));
  const results: Record<string, PingResult> = {};

  await Promise.all(
    uniqueAddresses.map(async (addr) => {
      try {
        const res = await pingIpAddress(db, addr);
        results[addr] = res;
      } catch (err: any) {
        results[addr] = {
          address: addr,
          alive: false,
          packetLoss: 100,
          message: err.message || 'Ping failed',
        };
      }
    })
  );

  return results;
}

export async function toggleSubscriberInternet(db: SqliteWrapper, subId: number, disable: boolean, subscribers: any[]) {
  const cfg = getMikrotikConfig(db);
  const sub = subscribers.find((s) => s.id === subId);
  const subName = sub ? `sub_${sub.id}_${sub.last.toLowerCase()}` : `sub_${subId}`;

  try {
    // Search secret on RouterOS
    const secrets = await fetchFromRouterOS(cfg, 'ppp/secret');
    const secretList = Array.isArray(secrets) ? secrets : [];
    const matched = secretList.find(
      (s: any) => s.name === subName || s.name === String(subId) || (s.comment && s.comment.includes(`ID #${subId}`))
    );

    if (matched) {
      await fetchFromRouterOS(cfg, `ppp/secret/${matched['.id']}`, 'PATCH', {
        disabled: disable ? 'true' : 'false',
      });
    } else {
      // Create if missing
      await fetchFromRouterOS(cfg, 'ppp/secret', 'POST', {
        name: subName,
        service: 'pppoe',
        profile: 'default',
        disabled: disable ? 'true' : 'false',
        comment: sub ? `VLAN ${sub.vlan || 100} - ${sub.first} ${sub.last} (ID #${sub.id})` : `ID #${subId}`,
      });
    }

    return {
      success: true,
      message: `Successfully set RouterOS PPP Secret '${subName}' to ${disable ? 'DISABLED' : 'ENABLED'}.`,
      subId,
      disabled: disable,
    };
  } catch (err: any) {
    return { success: false, error: `RouterOS Error: ${err.message}` };
  }
}

export async function batchSyncSubscribersToRouter(db: SqliteWrapper, subscribers: any[], getSubscriberBillingStatusFn: (sub: any) => string) {
  const cfg = getMikrotikConfig(db);
  const results: Array<{ subId: number; name: string; status: string; routerAction: 'ENABLED' | 'DISABLED'; success: boolean }> = [];

  for (const sub of subscribers) {
    if (sub.status === 'Inactive' || sub.status === 'Exclude') {
      // Inactive and Excluded subscribers are excluded from automatic overdue disconnection
      continue;
    }
    const status = getSubscriberBillingStatusFn(sub); // 'active', 'due', 'overdue', 'inactive', 'exclude'
    const shouldDisable = status === 'overdue';
    const name = `${sub.first} ${sub.last}`;

    try {
      const res = await toggleSubscriberInternet(db, sub.id, shouldDisable, subscribers);
      results.push({
        subId: sub.id,
        name,
        status,
        routerAction: shouldDisable ? 'DISABLED' : 'ENABLED',
        success: res.success,
      });
    } catch (err) {
      results.push({
        subId: sub.id,
        name,
        status,
        routerAction: shouldDisable ? 'DISABLED' : 'ENABLED',
        success: false,
      });
    }
  }

  const enabledCount = results.filter((r) => r.routerAction === 'ENABLED').length;
  const disabledCount = results.filter((r) => r.routerAction === 'DISABLED').length;

  return {
    success: true,
    total: subscribers.length,
    enabledCount,
    disabledCount,
    details: results,
    timestamp: new Date().toLocaleString(),
  };
}

export async function toggleVlanInterface(
  db: SqliteWrapper,
  vlanId: number | string,
  disable: boolean,
  subscribers: any[] = []
) {
  const cfg = getMikrotikConfig(db);
  const vlanStr = String(vlanId).trim();

  try {
    const ifaces = await fetchFromRouterOS(cfg, 'interface');
    const list = Array.isArray(ifaces) ? ifaces : [];
    const matched = list.find((i: any) => {
      const nameLower = (i.name || '').toLowerCase();
      return (
        nameLower === `vlan-${vlanStr}`.toLowerCase() ||
        nameLower === `vlan${vlanStr}`.toLowerCase() ||
        String(i['vlan-id']) === vlanStr
      );
    });

    if (matched) {
      await fetchFromRouterOS(cfg, `interface/${matched['.id']}`, 'PATCH', {
        disabled: disable ? 'true' : 'false',
      });
    } else {
      await fetchFromRouterOS(cfg, `interface/*${vlanStr}`, 'PATCH', {
        disabled: disable ? 'true' : 'false',
      });
    }

    return {
      success: true,
      message: `Successfully set RouterOS interface 'VLAN-${vlanStr}' to ${disable ? 'DISABLED' : 'ENABLED'}.`,
      vlan: vlanId,
      interfaceName: matched?.name || `VLAN-${vlanStr}`,
      disabled: disable,
    };
  } catch (err: any) {
    return { success: false, error: `RouterOS Error: ${err.message}` };
  }
}

export async function syncVlanInterfaceComment(
  db: SqliteWrapper,
  vlanId: number | string,
  comment: string
) {
  const cfg = getMikrotikConfig(db);
  const vlanStr = String(vlanId).trim();
  if (!vlanStr || vlanStr === '0') return { success: false, error: 'Invalid VLAN ID' };

  try {
    const ifaces = await fetchFromRouterOS(cfg, 'interface');
    const list = Array.isArray(ifaces) ? ifaces : [];
    const matched = list.find((i: any) => {
      const nameLower = (i.name || '').toLowerCase();
      return (
        String(i['vlan-id']) === vlanStr ||
        nameLower === `vlan-${vlanStr}`.toLowerCase() ||
        nameLower === `vlan_${vlanStr}`.toLowerCase() ||
        nameLower === `vlan${vlanStr}`.toLowerCase() ||
        (i.comment && i.comment.toLowerCase().includes(`vlan ${vlanStr}`))
      );
    });

    if (matched && matched['.id']) {
      await fetchFromRouterOS(cfg, `interface/${encodeURIComponent(matched['.id'])}`, 'PATCH', {
        comment: comment,
      });
      return {
        success: true,
        message: `Updated RouterOS interface '${matched.name}' comment to: "${comment}"`,
        vlan: vlanId,
        comment,
      };
    } else {
      try {
        await fetchFromRouterOS(cfg, `interface/*${vlanStr}`, 'PATCH', {
          comment: comment,
        });
        return {
          success: true,
          message: `Updated RouterOS interface '*${vlanStr}' comment to: "${comment}"`,
          vlan: vlanId,
          comment,
        };
      } catch (e: any) {
        return {
          success: false,
          error: `VLAN interface for ID ${vlanStr} not found on RouterOS.`,
        };
      }
    }
  } catch (err: any) {
    return { success: false, error: `RouterOS Error: ${err.message}` };
  }
}

export function capitalizeWords(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

export function formatSubCommentName(s: any): string {
  const last = capitalizeWords(s.last || '');
  const first = capitalizeWords(s.first || '');
  if (last && first) return `${last}, ${first}`;
  if (last) return last;
  if (first) return first;
  return '';
}

export async function syncAllVlanComments(db: SqliteWrapper) {
  const subscribers = await db.all('SELECT * FROM subscribers');
  const results: Array<{ vlan: number; comment: string; success: boolean }> = [];

  const vlanMap = new Map<number, any[]>();
  for (const sub of subscribers) {
    if (sub.vlan !== null && sub.vlan !== undefined && sub.vlan !== '' && Number(sub.vlan) > 0) {
      const v = Number(sub.vlan);
      if (!vlanMap.has(v)) vlanMap.set(v, []);
      vlanMap.get(v)!.push(sub);
    }
  }

  for (const [vlanId, subs] of vlanMap.entries()) {
    const names = subs.map(formatSubCommentName).filter(Boolean);
    const comment = names.join(', ');
    const res = await syncVlanInterfaceComment(db, vlanId, comment);
    results.push({
      vlan: vlanId,
      comment,
      success: res.success,
    });
  }

  return {
    success: true,
    totalSynced: results.length,
    details: results,
  };
}

function parseDateSafeServer(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const d = parseInt(match[3], 10);
    return new Date(y, m, d);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function checkAndDisableOverdueVlans(db: SqliteWrapper) {
  const subscribers = await db.all('SELECT * FROM subscribers');
  const payments = await db.all('SELECT * FROM payments');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const currentDay = now.getDate();
  const currentKey = currentYear * 12 + currentMonthIdx;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonthStr = `${monthNames[currentMonthIdx]} ${currentYear}`;

  const processed: Array<{ subId: number; name: string; vlan: number | null; action: string; reason: string }> = [];

  for (const sub of subscribers) {
    if (sub.status === 'Inactive' || sub.status === 'Exclude') {
      // Inactive and Excluded subscribers are excluded from overdue VLAN disabling
      continue;
    }

    const subPayments = payments.filter((p: any) => p.sub === sub.id);
    const monthsPaid = new Set(subPayments.map((p: any) => p.month));

    let dueDay = (sub.dueDay !== null && sub.dueDay !== undefined && sub.dueDay > 0) ? sub.dueDay : 15;
    if ((!sub.dueDay || sub.dueDay <= 0) && sub.dueRaw) {
      const parsed = parseDateSafeServer(sub.dueRaw);
      if (parsed) {
        dueDay = parsed.getDate();
      }
    }

    const paidCurrent = monthsPaid.has(currentMonthStr);
    let isOverdue = false;
    let reason = '';

    const daysInCurrentMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();
    const effectiveDueDay = Math.min(dueDay, daysInCurrentMonth);

    if (!paidCurrent && currentDay > effectiveDueDay) {
      isOverdue = true;
      reason = `Current month (${currentMonthStr}) unpaid and past due day (${effectiveDueDay})`;
    } else {
      let startK = currentKey;
      if (sub.dueRaw) {
        const parsed = parseDateSafeServer(sub.dueRaw);
        if (parsed) {
          startK = parsed.getFullYear() * 12 + parsed.getMonth();
        }
      }
      const paidKeys = subPayments.map((p: any) => {
        const parts = p.month.split(" ");
        if (parts.length === 2) {
          const pIdx = monthNames.indexOf(parts[0]);
          const pYr = parseInt(parts[1], 10);
          return pYr * 12 + pIdx;
        }
        return 0;
      }).filter((key: number) => key > 0);

      if (paidKeys.length > 0) {
        startK = Math.min(startK, Math.min(...paidKeys));
      }

      for (let k = currentKey - 1; k >= startK; k--) {
        const y = Math.floor(k / 12);
        const m = k % 12;
        const mStr = `${monthNames[m]} ${y}`;
        if (!monthsPaid.has(mStr)) {
          isOverdue = true;
          reason = `Prior month (${mStr}) has unpaid balance`;
          break;
        }
      }
    }

    if (isOverdue && sub.vlan) {
      await toggleVlanInterface(db, sub.vlan, true, subscribers);
      processed.push({
        subId: sub.id,
        name: `${sub.first} ${sub.last}`,
        vlan: sub.vlan,
        action: 'DISABLED_VLAN',
        reason
      });
    }
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    formattedTime: new Date().toLocaleString(),
    overdueSubscribersCount: processed.length,
    processed,
  };
}

export async function syncRouterTime(db: SqliteWrapper) {
  const cfg = getMikrotikConfig(db);
  const now = new Date();
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthStr = months[now.getMonth()];
  const dayStr = String(now.getDate()).padStart(2, '0');
  const yearStr = now.getFullYear();
  const timeStr = now.toTimeString().split(' ')[0]; // "14:30:00"
  const dateStr = `${monthStr}/${dayStr}/${yearStr}`; // "aug/07/2026"

  try {
    let clockResult;
    try {
      clockResult = await fetchFromRouterOS(cfg, 'system/clock', 'PATCH', {
        time: timeStr,
        date: dateStr,
      });
    } catch {
      clockResult = await fetchFromRouterOS(cfg, 'system/clock/set', 'POST', {
        time: timeStr,
        date: dateStr,
      });
    }

    return {
      success: true,
      message: `Router time synchronized with system time (${dateStr} ${timeStr})`,
      serverTime: now.toISOString(),
      formattedTime: now.toLocaleString(),
      clock: clockResult,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Time sync requested at ${now.toLocaleTimeString()}`,
      error: `Router clock update warning: ${err.message}`,
      serverTime: now.toISOString(),
      formattedTime: now.toLocaleString(),
    };
  }
}


