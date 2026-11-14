import React, { useState, useEffect } from 'react';
import {
  Router,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  HardDrive,
  Clock,
  Settings,
  ShieldCheck,
  Check,
  Layers,
  Server,
  Lock,
  Unlock,
  Timer,
  Play,
  AlertCircle,
  Zap,
  Calendar,
  Radio,
  Activity,
  Globe,
  Trash2,
  Loader2,
  User,
} from 'lucide-react';
import {
  MikroTikConfig,
  MikroTikResource,
  MikroTikInterface,
  MikroTikIpAddress,
  MikroTikPingResult,
  Subscriber,
  AuthUser,
} from '../types';
import { authFetch, canWrite } from '../utils/auth';

interface PingHistoryEntry extends MikroTikPingResult {
  id: string;
  timestamp: string;
  subscriberLabel?: string;
}

interface MikroTikManagerProps {
  currentUser?: AuthUser | null;
  subscribers?: Subscriber[];
  onRefreshData?: () => void | Promise<void>;
}

export const MikroTikManager: React.FC<MikroTikManagerProps> = ({
  currentUser,
  subscribers = [],
  onRefreshData,
}) => {
  const isReadOnly = !canWrite(currentUser);
  const [activeTab, setActiveTab] = useState<'resources' | 'diagnostics' | 'settings'>('resources');
  
  const [config, setConfig] = useState<MikroTikConfig>({
    host: '172.16.0.1',
    port: 443,
    useSsl: true,
    username: 'admin',
    password: '',
    autoSyncOverdue: true,
    syncMethod: 'ppp_secret',
    syncTime: '15m',
    overdueDisconnectionTime: '04:00',
    overdueDisconnectionSchedule: 'daily',
  });

  const [resource, setResource] = useState<MikroTikResource | null>(null);
  const [interfaces, setInterfaces] = useState<MikroTikInterface[]>([]);
  const [routerIpAddresses, setRouterIpAddresses] = useState<MikroTikIpAddress[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [syncingTime, setSyncingTime] = useState(false);
  const [checkingOverdue, setCheckingOverdue] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // IPoE Ping Diagnostic tool state
  const [diagSubId, setDiagSubId] = useState<string>('');
  const [diagIp, setDiagIp] = useState<string>('');
  const [diagMode, setDiagMode] = useState<'icmp' | 'arp-ping'>('icmp');
  const [diagInterface, setDiagInterface] = useState<string>('');
  const [diagCount, setDiagCount] = useState<number>(4);
  const [isPingingDiag, setIsPingingDiag] = useState<boolean>(false);
  const [diagLatestResult, setDiagLatestResult] = useState<PingHistoryEntry | null>(null);
  const [diagHistory, setDiagHistory] = useState<PingHistoryEntry[]>([]);

  // Load config on mount
  useEffect(() => {
    fetchConfig();
    fetchSystemInfo();
    fetchInterfaces();
    fetchRouterIpAddresses();
  }, []);

  const showNotify = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchConfig = async () => {
    try {
      const res = await authFetch('/api/mikrotik/config');
      if (res.ok) {
        const data = await res.json();
        setConfig({
          ...data,
          useSsl: Boolean(data.useSsl),
          autoSyncOverdue: Boolean(data.autoSyncOverdue),
          syncTime: data.syncTime || '15m',
          overdueDisconnectionTime: data.overdueDisconnectionTime || '04:00',
          overdueDisconnectionSchedule: data.overdueDisconnectionSchedule || 'daily',
        });
      }
    } catch (err) {
      console.error('Failed to load MikroTik config:', err);
    }
  };

  const fetchInterfaces = async () => {
    try {
      const resIfaces = await authFetch('/api/mikrotik/interfaces');
      const dataIfaces = await resIfaces.json();
      if (dataIfaces.success) setInterfaces(dataIfaces.interfaces || []);
    } catch (err) {
      console.error('Failed to fetch MikroTik interfaces:', err);
    }
  };

  const fetchRouterIpAddresses = async () => {
    try {
      const res = await authFetch('/api/mikrotik/ip-addresses');
      const data = await res.json();
      if (data.success && Array.isArray(data.addresses)) {
        setRouterIpAddresses(data.addresses);
      }
    } catch (err) {
      console.error('Failed to fetch MikroTik IP addresses:', err);
    }
  };

  const selectedDiagSubscriber = subscribers.find((s) => String(s.id) === diagSubId) || null;

  // Derive candidate gateway/internal IPs for the selected subscriber without relying on DHCP leases
  const getSubscriberIpCandidates = (sub: Subscriber | null): Array<{ ip: string; label: string }> => {
    if (!sub) return [];
    const candidates: Array<{ ip: string; label: string }> = [];
    const seen = new Set<string>();
    const pushCandidate = (ip: string, label: string) => {
      const clean = ip.trim().split('/')[0];
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        candidates.push({ ip: clean, label });
      }
    };

    // 1. Any IPv4 addresses explicitly written in subscriber notes
    if (sub.notes) {
      const noteIps = sub.notes.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
      noteIps.forEach((ip) => pushCandidate(ip, 'From Notes'));
    }

    // 2. Any RouterOS /ip/address configured on subscriber's VLAN interface
    if (sub.vlan) {
      const vlanStr = String(sub.vlan);
      routerIpAddresses.forEach((addr) => {
        const ifaceLower = (addr.interface || '').toLowerCase();
        const commentLower = (addr.comment || '').toLowerCase();
        if (
          ifaceLower.includes(`vlan${vlanStr}`) ||
          ifaceLower.includes(`vlan-${vlanStr}`) ||
          commentLower.includes(`vlan ${vlanStr}`) ||
          commentLower.includes(`#${sub.id}`)
        ) {
          pushCandidate(addr.address, `RouterOS (${addr.interface})`);
        }
      });

      // 3. Common IPoE / VLAN gateway presets (172.16.x.x primary)
      pushCandidate(`172.16.${vlanStr}.1`, `VLAN ${vlanStr} IPoE GW`);
      pushCandidate(`10.0.${vlanStr}.1`, `Internal ${vlanStr} GW`);
      pushCandidate(`192.168.${vlanStr}.1`, `VLAN ${vlanStr} Local GW`);
    }

    return candidates;
  };

  const handleSelectDiagSubscriber = (newSubId: string) => {
    setDiagSubId(newSubId);
    if (!newSubId) return;
    const sub = subscribers.find((s) => String(s.id) === newSubId) || null;
    if (sub) {
      const candidates = getSubscriberIpCandidates(sub);
      if (candidates.length > 0 && !diagIp.trim()) {
        setDiagIp(candidates[0].ip);
      } else if (candidates.length > 0) {
        // Update target IP to top suggestion when switching subscriber
        setDiagIp(candidates[0].ip);
      }
    }
  };

  const executePingDiagnostic = async (
    targetAddress: string,
    overrideMode?: 'icmp' | 'arp-ping',
    overrideInterface?: string,
    overrideLabel?: string
  ) => {
    const cleanIp = targetAddress.trim().split('/')[0];
    if (!cleanIp) {
      showNotify('error', 'Enter a valid IPv4 gateway or internal IP address to ping.');
      return;
    }

    const modeToUse = overrideMode || diagMode;
    const ifaceToUse = overrideInterface !== undefined ? overrideInterface : diagInterface;
    const subLabel =
      overrideLabel ||
      (selectedDiagSubscriber
        ? `#${selectedDiagSubscriber.id} ${selectedDiagSubscriber.first} ${selectedDiagSubscriber.last}`.trim()
        : undefined);

    setIsPingingDiag(true);
    try {
      const res = await authFetch('/api/mikrotik/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: cleanIp,
          mode: modeToUse,
          count: diagCount,
          interface: ifaceToUse || undefined,
          vlan: selectedDiagSubscriber?.vlan || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotify('error', data.error || 'Ping diagnostic failed.');
        return;
      }

      const entry: PingHistoryEntry = {
        ...data.result,
        id: `ping-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        subscriberLabel: subLabel,
      };
      setDiagLatestResult(entry);
      setDiagHistory((prev) => [entry, ...prev].slice(0, 20));
    } catch (err: any) {
      showNotify('error', err?.message || 'Error executing RouterOS ping diagnostic.');
    } finally {
      setIsPingingDiag(false);
    }
  };

  const handleRunPingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executePingDiagnostic(diagIp);
  };

  const handleSyncRouterClock = async () => {
    setSyncingTime(true);
    try {
      const res = await authFetch('/api/mikrotik/sync-time', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showNotify('success', data.message || 'Router system clock synchronized successfully!');
      } else {
        showNotify('error', data.error || 'Failed to sync router time.');
      }
    } catch (err: any) {
      showNotify('error', err.message || 'Error syncing router time.');
    } finally {
      setSyncingTime(false);
    }
  };

  const handleRunOverdueCheckNow = async () => {
    setCheckingOverdue(true);
    try {
      const res = await authFetch('/api/mikrotik/check-overdue', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const suspendedCount = (data.processed || []).filter((p: any) => p.action === 'SUSPENDED_UNPAID' || p.action === 'disabled' || p.action === 'DISABLED_VLAN').length;
        showNotify(
          'success',
          `Overdue Check Completed: Found ${data.overdueSubscribersCount || 0} overdue subscriber(s). ${suspendedCount} added to MikroTik address-list 'UNPAID'.`
        );
        if (onRefreshData) {
          await onRefreshData();
        }
      } else {
        showNotify('error', data.error || 'Failed to execute overdue check.');
      }
    } catch (err: any) {
      showNotify('error', err.message || 'Error running overdue disconnection check.');
    } finally {
      setCheckingOverdue(false);
    }
  };

  const getNextTriggerDisplay = () => {
    if (!config.autoSyncOverdue) return 'Disabled';
    const schedule = config.overdueDisconnectionSchedule || 'daily';
    const time = config.overdueDisconnectionTime || '04:00';

    if (schedule !== 'daily') {
      const map: Record<string, string> = {
        '1h': 'Every 1 Hour',
        '6h': 'Every 6 Hours',
        '12h': 'Every 12 Hours',
        '24h': 'Every 24 Hours',
      };
      return map[schedule] || schedule;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hours || 0, minutes || 0, 0, 0);

    const isTomorrow = now.getTime() >= target.getTime();
    if (isTomorrow) {
      target.setDate(target.getDate() + 1);
    }

    const diffMs = target.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    const timeFormatted = target.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${isTomorrow ? 'Tomorrow' : 'Today'} at ${timeFormatted} (in ${diffHours}h ${diffMins}m)`;
  };

  const fetchSystemInfo = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/mikrotik/resources');
      const data = await res.json();
      if (data.success && data.resource) {
        setResource(data.resource);
      } else if (data.error) {
        showNotify('error', data.error);
      }
    } catch (err: any) {
      showNotify('error', 'Failed to reach backend MikroTik service.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authFetch('/api/mikrotik/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        showNotify('success', 'MikroTik connection settings saved!');
        fetchSystemInfo();
        fetchInterfaces();
        fetchRouterIpAddresses();
        if (onRefreshData) {
          await onRefreshData();
        }
      } else {
        showNotify('error', data.error || 'Failed to save settings.');
      }
    } catch (err: any) {
      showNotify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top System Resources Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 opacity-10 pointer-events-none">
          <Router size={320} />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase flex items-center gap-1 border ${
                  config.useSsl
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                }`}
              >
                {config.useSsl ? (
                  <>
                    <Lock className="w-3 h-3 text-emerald-400" />
                    <span>API-SSL (Secure HTTPS)</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 text-amber-400" />
                    <span>API (Unsecure HTTP)</span>
                  </>
                )}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium ml-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Connected
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <Router className="text-indigo-400 w-7 h-7" />
              <span>{resource?.identity || 'MikroTik RouterOS'}</span>
              <span className="text-xs font-normal text-slate-400 bg-white/10 px-2.5 py-1 rounded-md">
                {resource?.model || 'RouterOS Device'}
              </span>
            </h1>

            <p className="text-xs text-slate-300 flex flex-wrap items-center gap-4">
              <span>Host: <strong className="text-white font-mono">{config.useSsl ? 'https://' : 'http://'}{config.host}:{config.port}</strong></span>
              <span>OS: <strong className="text-white">{resource?.version || 'v7.x'}</strong></span>
              <span>Uptime: <strong className="text-white">{resource?.uptime || 'N/A'}</strong></span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                fetchSystemInfo();
                fetchInterfaces();
                fetchRouterIpAddresses();
              }}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Resources</span>
            </button>
          </div>
        </div>

        {/* Hardware Status Gauges */}
        {resource && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
            <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="flex items-center gap-1.5"><Cpu size={14} className="text-indigo-400" /> CPU Load</span>
                <span className="font-mono font-bold text-white">{resource.cpuLoad}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    resource.cpuLoad > 80 ? 'bg-rose-500' : resource.cpuLoad > 50 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, resource.cpuLoad)}%` }}
                />
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="flex items-center gap-1.5"><HardDrive size={14} className="text-indigo-400" /> Free Memory</span>
                <span className="font-mono font-bold text-white">{resource.freeMemoryMb} MB</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-400 rounded-full"
                  style={{ width: `${Math.round((resource.freeMemoryMb / (resource.totalMemoryMb || 1)) * 100)}%` }}
                />
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="flex items-center gap-1.5"><Layers size={14} className="text-indigo-400" /> Configured VLANs</span>
                <span className="font-mono font-bold text-indigo-300">
                  {interfaces.filter((i) => i.type === 'vlan' || i.vlanId || (i.name && i.name.toLowerCase().includes('vlan'))).length}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">RouterOS VLAN interfaces</p>
            </div>

            <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-indigo-400" /> Architecture</span>
                <span className="font-mono font-bold text-white">{resource.architecture}</span>
              </div>
              <p className="text-[10px] text-slate-400">RouterOS Kernel Platform</p>
            </div>
          </div>
        )}
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold shadow-sm border ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : notification.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 font-bold">
            ×
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 flex flex-wrap gap-1 shadow-sm">
        <button
          onClick={() => setActiveTab('resources')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'resources' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>System Hardware Specs</span>
        </button>

        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'diagnostics' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>IPoE Ping Diagnostics</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Router Settings</span>
        </button>
      </div>

      {/* Tab 1: System Hardware Specs */}
      {activeTab === 'resources' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">MikroTik Hardware & System Info</h2>
            <p className="text-xs text-slate-500">RouterOS hardware architecture, kernel version, and memory usage.</p>
          </div>

          {resource ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Device Model</p>
                <p className="text-sm font-bold text-slate-900 font-mono">{resource.model}</p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">RouterOS Version</p>
                <p className="text-sm font-bold text-slate-900 font-mono">{resource.version}</p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">System Uptime</p>
                <p className="text-sm font-bold text-slate-900 font-mono">{resource.uptime}</p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Architecture</p>
                <p className="text-sm font-bold text-slate-900 font-mono">{resource.architecture}</p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Free Memory / Total Memory</p>
                <p className="text-sm font-bold text-slate-900 font-mono">
                  {resource.freeMemoryMb} MB / {resource.totalMemoryMb} MB
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CPU Utilization</p>
                <p className="text-sm font-bold text-slate-900 font-mono">{resource.cpuLoad}%</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Loading system resources...</p>
          )}
        </div>
      )}

      {/* Tab 2: IPoE Gateway & Internal IP Ping Diagnostics */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
            <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-indigo-600" />
                  <span>IPoE Gateway &amp; Internal IP Ping Diagnostic</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ping a subscriber&apos;s assigned IPoE gateway, ONU WAN IP, or internal IP directly from MikroTik RouterOS without relying on DHCP leases.
                </p>
              </div>
              <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                Lease-Free Probe
              </span>
            </div>

            <form onSubmit={handleRunPingSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Subscriber Picker (Optional) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Subscriber (Optional Quick-Fill)
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      value={diagSubId}
                      onChange={(e) => handleSelectDiagSubscriber(e.target.value)}
                      className="w-full text-xs pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium text-slate-800"
                    >
                      <option value="">-- Custom / Direct IP Entry (Any Subscriber) --</option>
                      {[...subscribers]
                        .sort((a, b) => a.id - b.id)
                        .map((sub) => (
                          <option key={sub.id} value={String(sub.id)}>
                            #{sub.id} {sub.first} {sub.last}
                            {sub.vlan ? ` (VLAN ${sub.vlan})` : ''}
                            {sub.status !== 'Active' ? ` [${sub.status}]` : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Target IP Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Target IPoE Gateway / Internal IP *
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={diagIp}
                      onChange={(e) => setDiagIp(e.target.value)}
                      placeholder="e.g. 172.16.105.1, 172.16.105.10, or 10.0.105.2"
                      className="w-full text-xs pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Quick-fill IP suggestions for selected subscriber */}
              {selectedDiagSubscriber && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span className="font-semibold">
                      Suggested IPs for <strong className="text-slate-900">#{selectedDiagSubscriber.id} {selectedDiagSubscriber.first} {selectedDiagSubscriber.last}</strong>:
                    </span>
                    {selectedDiagSubscriber.macAddress && (
                      <span className="font-mono text-[10px] text-slate-400">ONU MAC: {selectedDiagSubscriber.macAddress}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {getSubscriberIpCandidates(selectedDiagSubscriber).length > 0 ? (
                      getSubscriberIpCandidates(selectedDiagSubscriber).map((cand) => (
                        <button
                          key={cand.ip}
                          type="button"
                          onClick={() => setDiagIp(cand.ip)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer flex items-center gap-1.5 ${
                            diagIp.trim() === cand.ip
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                          }`}
                        >
                          <span className="font-bold">{cand.ip}</span>
                          <span className={`text-[10px] font-sans ${diagIp.trim() === cand.ip ? 'text-indigo-100' : 'text-slate-400'}`}>
                            {cand.label}
                          </span>
                        </button>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        No VLAN or note IP set for this subscriber — enter their IPoE gateway or internal IP manually above.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Probe Options Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Ping Mode */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Probe Method
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setDiagMode('icmp')}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        diagMode === 'icmp'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ICMP (Layer 3)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiagMode('arp-ping')}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        diagMode === 'arp-ping'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ARP-Ping (L2)
                    </button>
                  </div>
                </div>

                {/* Outgoing Interface (Optional) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Router Interface (Optional)
                  </label>
                  <select
                    value={diagInterface}
                    onChange={(e) => setDiagInterface(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-mono"
                  >
                    <option value="">Auto (RouterOS Routing Table)</option>
                    {Array.from(
                      new Set([
                        ...interfaces.map((i) => i.name).filter(Boolean),
                        ...routerIpAddresses.map((a) => a.interface).filter(Boolean),
                      ])
                    ).map((ifaceName) => (
                      <option key={ifaceName} value={ifaceName}>
                        {ifaceName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Packet Count */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Ping Count
                  </label>
                  <select
                    value={diagCount}
                    onChange={(e) => setDiagCount(Number(e.target.value) || 4)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-semibold"
                  >
                    <option value={3}>3 Packets (Fast)</option>
                    <option value={4}>4 Packets (Standard)</option>
                    <option value={5}>5 Packets</option>
                    <option value={10}>10 Packets (Stability Check)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  {diagMode === 'icmp'
                    ? 'ICMP (Layer 3) tests IP reachability across routed IPoE gateways and internal subnets without requiring DHCP leases.'
                    : 'ARP-Ping (Layer 2) verifies direct MAC-level reachability on the selected local router interface.'}
                </p>
                <button
                  type="submit"
                  disabled={isPingingDiag || !diagIp.trim()}
                  className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isPingingDiag ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Pinging {diagIp.trim().split('/')[0]}...</span>
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />
                      <span>Run Ping Test</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Latest Ping Result Card */}
            {diagLatestResult && (
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  diagLatestResult.alive
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-rose-50/70 border-rose-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        diagLatestResult.alive
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      {diagLatestResult.alive ? 'Reachable / Online' : 'Unreachable / Timed Out'}
                    </span>
                    <span className="font-mono font-black text-sm text-slate-900">
                      {diagLatestResult.address}
                    </span>
                    {diagLatestResult.subscriberLabel && (
                      <span className="text-xs font-semibold text-slate-600 bg-white/80 px-2 py-0.5 rounded-md border border-slate-200">
                        {diagLatestResult.subscriberLabel}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    {diagLatestResult.timestamp}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Method</div>
                    <div className="font-mono font-bold text-slate-800 mt-0.5">
                      {diagLatestResult.method === 'icmp' ? 'ICMP (L3)' : diagLatestResult.method?.toUpperCase() || 'ICMP'}
                    </div>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Avg Latency</div>
                    <div className="font-mono font-bold text-slate-800 mt-0.5">
                      {diagLatestResult.avgRtt || diagLatestResult.time || '—'}
                    </div>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Packet Loss</div>
                    <div
                      className={`font-mono font-bold mt-0.5 ${
                        (diagLatestResult.packetLoss ?? 0) === 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {diagLatestResult.packetLoss ?? (diagLatestResult.alive ? 0 : 100)}%
                      {diagLatestResult.sent ? ` (${diagLatestResult.received ?? 0}/${diagLatestResult.sent})` : ''}
                    </div>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Interface</div>
                    <div className="font-mono font-bold text-slate-800 mt-0.5 truncate">
                      {diagLatestResult.interface || 'routing-table'}
                    </div>
                  </div>
                </div>

                {diagLatestResult.message && (
                  <p className="text-xs font-medium text-slate-700">
                    {diagLatestResult.message}
                  </p>
                )}
              </div>
            )}

            {/* RouterOS Configured Gateways Quick-Pick */}
            {routerIpAddresses.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    RouterOS Configured Interface Gateways (/ip/address)
                  </span>
                  <button
                    type="button"
                    onClick={fetchRouterIpAddresses}
                    className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {routerIpAddresses.slice(0, 12).map((item, idx) => {
                    const cleanGw = item.address.split('/')[0];
                    return (
                      <button
                        key={item.id || `${cleanGw}-${idx}`}
                        type="button"
                        onClick={() => {
                          setDiagIp(cleanGw);
                          executePingDiagnostic(cleanGw, diagMode, '', `Gateway (${item.interface})`);
                        }}
                        disabled={isPingingDiag}
                        className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg text-[11px] font-mono text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                        title={`Ping ${cleanGw} on ${item.interface}`}
                      >
                        <Zap className="w-3 h-3 text-indigo-500" />
                        <span className="font-bold">{cleanGw}</span>
                        <span className="text-[10px] font-sans text-slate-400">{item.interface}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Diagnostic History */}
          {diagHistory.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Recent Ping Diagnostics ({diagHistory.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDiagHistory([]);
                    setDiagLatestResult(null);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>

              {/* Mobile cards */}
              <div className="block sm:hidden divide-y divide-slate-100">
                {diagHistory.map((item) => (
                  <div key={item.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-xs text-slate-900">{item.address}</div>
                        {item.subscriberLabel && (
                          <div className="text-[11px] text-slate-500 truncate">{item.subscriberLabel}</div>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.alive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {item.alive ? 'Online' : 'Timed Out'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>
                        {item.method?.toUpperCase()} &bull; {item.avgRtt || '—'} &bull; {item.packetLoss ?? 0}% loss
                      </span>
                      <button
                        type="button"
                        disabled={isPingingDiag}
                        onClick={() => {
                          setDiagIp(item.address);
                          executePingDiagnostic(
                            item.address,
                            item.method === 'arp-ping' ? 'arp-ping' : 'icmp',
                            item.interface === 'routing-table' ? '' : item.interface,
                            item.subscriberLabel
                          );
                        }}
                        className="text-indigo-600 font-sans font-bold cursor-pointer disabled:opacity-40"
                      >
                        Re-Ping
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-4">Time</th>
                      <th className="py-2.5 px-4">Target IP</th>
                      <th className="py-2.5 px-4">Subscriber</th>
                      <th className="py-2.5 px-4">Method</th>
                      <th className="py-2.5 px-4">Latency</th>
                      <th className="py-2.5 px-4">Loss</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {diagHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">{item.timestamp}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">{item.address}</td>
                        <td className="py-2.5 px-4 text-slate-600">{item.subscriberLabel || '—'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 uppercase">{item.method || 'icmp'}</td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-800">{item.avgRtt || item.time || '—'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{item.packetLoss ?? (item.alive ? 0 : 100)}%</td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.alive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${item.alive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {item.alive ? 'Online' : 'Timed Out'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={isPingingDiag}
                            onClick={() => {
                              setDiagIp(item.address);
                              executePingDiagnostic(
                                item.address,
                                item.method === 'arp-ping' ? 'arp-ping' : 'icmp',
                                item.interface === 'routing-table' ? '' : item.interface,
                                item.subscriberLabel
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-40"
                          >
                            Re-Ping
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Router Connection Settings */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveConfig} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">MikroTik RouterOS Connection Settings</h2>
            <p className="text-xs text-slate-500">
              Configure connection protocol (Secure API-SSL vs Unsecure API) and host credentials to manage your MikroTik RouterOS device.
            </p>
          </div>

          {/* Connection Protocol Selection (API vs API-SSL) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              API Security Protocol *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: API-SSL (Secure) */}
              <button
                type="button"
                onClick={() => {
                  const newPort = config.port === 80 || config.port === 8728 ? 443 : config.port;
                  setConfig({ ...config, useSsl: true, port: newPort });
                }}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative flex items-start gap-3 ${
                  config.useSsl
                    ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    config.useSsl ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Lock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">API-SSL (Secure)</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase">
                      HTTPS / SSL
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Encrypted TLS traffic. Recommended for remote router management, WAN access, or production deployments (Default Port 443 or 8729).
                  </p>
                </div>
              </button>

              {/* Option 2: API (Unsecure) */}
              <button
                type="button"
                onClick={() => {
                  const newPort = config.port === 443 || config.port === 8729 ? 80 : config.port;
                  setConfig({ ...config, useSsl: false, port: newPort });
                }}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative flex items-start gap-3 ${
                  !config.useSsl
                    ? 'bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    !config.useSsl ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Unlock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">API (Unsecure)</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 uppercase">
                      HTTP / Plain
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Unencrypted cleartext traffic. Suitable for isolated local LAN switches or testing environments (Default Port 80 or 8728).
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Router Host / IP Address *
              </label>
              <input
                type="text"
                required
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="172.16.0.1 or https://172.16.0.1:443"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Port * ({config.useSsl ? 'HTTPS/SSL' : 'HTTP/Plain'})
                </label>
                <span className="text-[10px] text-slate-400">Presets:</span>
              </div>
              <input
                type="number"
                required
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value, 10) || (config.useSsl ? 443 : 80) })}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              {/* Quick Port Presets */}
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, port: 443, useSsl: true })}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                    config.port === 443 && config.useSsl ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  443 (REST HTTPS)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, port: 80, useSsl: false })}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                    config.port === 80 && !config.useSsl ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  80 (REST HTTP)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, port: 8729, useSsl: true })}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                    config.port === 8729 && config.useSsl ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  8729 (API-SSL)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, port: 8728, useSsl: false })}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                    config.port === 8728 && !config.useSsl ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  8728 (API Plain)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Username *
              </label>
              <input
                type="text"
                required
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Password
              </label>
              <input
                type="password"
                value={config.password || ''}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="RouterOS password"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* MikroTik Sync Time & Schedule Settings */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>MikroTik Sync Time & System Clock Settings</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure auto-sync interval frequency and synchronize the router system clock with the billing server.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Sync Time Frequency Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  MikroTik Sync Time / Schedule *
                </label>
                <select
                  value={config.syncTime || '15m'}
                  onChange={(e) => setConfig({ ...config, syncTime: e.target.value })}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold bg-white"
                >
                  <option value="5m">Every 5 Minutes (Real-Time)</option>
                  <option value="15m">Every 15 Minutes (Recommended)</option>
                  <option value="30m">Every 30 Minutes</option>
                  <option value="1h">Every 1 Hour</option>
                  <option value="6h">Every 6 Hours</option>
                  <option value="12h">Every 12 Hours</option>
                  <option value="00:00">Daily at Midnight (00:00)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Interval for checking subscriber status, active leases, and enforcing overdue suspensions.
                </p>
              </div>

              {/* Instant Time Sync Action */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Router System Clock Sync
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSyncRouterClock}
                    disabled={syncingTime || isReadOnly}
                    className="w-full text-xs py-2.5 px-3 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingTime ? 'animate-spin' : ''}`} />
                    <span>{syncingTime ? 'Synchronizing Clock...' : 'Sync System Time Now'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Pushes current server system time ({new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) to MikroTik RouterOS clock.
                </p>
              </div>
            </div>

            {/* Automatic Overdue Disconnection Time Trigger & Automation Engine */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Timer className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Automatic Overdue Disconnection Time Trigger
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        config.autoSyncOverdue
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {config.autoSyncOverdue ? 'Active / Automated' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Automatically checks subscriber dues and adds overdue subscribers to the MikroTik firewall address list UNPAID when billing due dates expire.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={config.autoSyncOverdue}
                    onChange={(e) => setConfig({ ...config, autoSyncOverdue: e.target.checked })}
                    className="sr-only peer disabled:cursor-not-allowed"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {config.autoSyncOverdue && (
                <div className="pt-3 border-t border-slate-200 space-y-3.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Trigger Schedule Mode */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Disconnection Trigger Schedule
                      </label>
                      <select
                        value={config.overdueDisconnectionSchedule || 'daily'}
                        onChange={(e) => setConfig({ ...config, overdueDisconnectionSchedule: e.target.value })}
                        disabled={isReadOnly}
                        className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold bg-white cursor-pointer"
                      >
                        <option value="daily">Daily at Specific Time (Recommended)</option>
                        <option value="1h">Every 1 Hour (Continuous Monitoring)</option>
                        <option value="6h">Every 6 Hours</option>
                        <option value="12h">Every 12 Hours</option>
                        <option value="24h">Every 24 Hours</option>
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        How frequently the background worker inspects subscriber balances and due dates.
                      </p>
                    </div>

                    {/* Specific Trigger Time */}
                    {config.overdueDisconnectionSchedule === 'daily' || !config.overdueDisconnectionSchedule ? (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                          Daily Disconnection Trigger Time
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={config.overdueDisconnectionTime || '04:00'}
                            onChange={(e) => setConfig({ ...config, overdueDisconnectionTime: e.target.value })}
                            disabled={isReadOnly}
                            className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold bg-white"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {['00:00', '02:00', '04:00', '06:00', '12:00'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => setConfig({ ...config, overdueDisconnectionTime: preset })}
                              className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-semibold transition-colors cursor-pointer ${
                                config.overdueDisconnectionTime === preset
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {preset === '04:00' ? '04:00 AM (Default)' : preset === '00:00' ? 'Midnight (00:00)' : preset}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center">
                        <span className="text-[11px] font-bold text-slate-700 uppercase mb-1">Interval Mode Active</span>
                        <p className="text-xs text-slate-600 bg-white p-2 border border-slate-200 rounded-lg">
                          Checks will execute automatically every <strong className="text-indigo-600">{config.overdueDisconnectionSchedule}</strong>.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Status Banner & Manual Immediate Trigger */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div className="text-[11px] text-slate-700">
                        <span className="font-bold text-indigo-900">Next Scheduled Trigger:</span>{' '}
                        <span className="font-semibold text-slate-800">{getNextTriggerDisplay()}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRunOverdueCheckNow}
                      disabled={checkingOverdue || isReadOnly}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      <Play className={`w-3 h-3 ${checkingOverdue ? 'animate-spin' : ''}`} />
                      <span>{checkingOverdue ? 'Executing Check...' : 'Run Overdue Check Now'}</span>
                    </button>
                  </div>

                  <div className="flex items-start gap-1.5 text-[10px] text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Safe Exclusions:</strong> Only active subscribers with an expired billing due date and unpaid balance will be added to the UNPAID address list. Inactive accounts and paused subscriptions remain unaffected.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            {isReadOnly ? (
              <p className="text-xs text-amber-600 font-semibold">Router configuration is read-only for your account permission (R).</p>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Save Router Settings</span>
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
