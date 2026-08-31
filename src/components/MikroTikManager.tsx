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
} from 'lucide-react';
import { MikroTikConfig, MikroTikResource, MikroTikInterface, AuthUser } from '../types';
import { authFetch, canWrite } from '../utils/auth';

interface MikroTikManagerProps {
  currentUser?: AuthUser | null;
  onRefreshData?: () => void | Promise<void>;
}

export const MikroTikManager: React.FC<MikroTikManagerProps> = ({ currentUser, onRefreshData }) => {
  const isReadOnly = !canWrite(currentUser);
  const [activeTab, setActiveTab] = useState<'resources' | 'settings'>('resources');
  
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
  
  const [loading, setLoading] = useState(false);
  const [syncingTime, setSyncingTime] = useState(false);
  const [checkingOverdue, setCheckingOverdue] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Load config on mount
  useEffect(() => {
    fetchConfig();
    fetchSystemInfo();
    fetchInterfaces();
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
        const disabledCount = (data.processed || []).filter((p: any) => p.action === 'disabled').length;
        showNotify(
          'success',
          `Overdue Check Completed: Found ${data.overdueSubscribersCount || 0} overdue subscriber(s). ${disabledCount} interface action(s) executed.`
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

      {/* Tab 2: Router Connection Settings */}
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
                    Automatically checks subscriber dues and disables VLAN interfaces / PPP secrets on MikroTik when billing due dates expire.
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
                      <span>{checkingOverdue ? 'Executing Check...' : 'Run Disconnection Check Now'}</span>
                    </button>
                  </div>

                  <div className="flex items-start gap-1.5 text-[10px] text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Safe Exclusions:</strong> Only active subscribers with an expired billing due date and unpaid balance will have their router interface disabled. Inactive accounts and paused subscriptions remain unaffected.
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
