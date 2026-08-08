import React, { useState, useEffect } from 'react';
import {
  Router,
  Zap,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Cpu,
  HardDrive,
  Clock,
  Settings,
  ShieldCheck,
  Radio,
  Check,
  Activity,
  Layers,
  Network,
  Server,
  Lock,
  Unlock,
  Shield,
  Globe,
  UserPlus,
  X,
  User,
  Tag,
} from 'lucide-react';
import { Subscriber, PaymentRecord, MikroTikConfig, MikroTikResource, MikroTikInterface, MikroTikDhcpLease } from '../types';
import { getSubscriberBillingStatus, displayName } from '../utils/billingUtils';

interface MikroTikManagerProps {
  subscribers: Subscriber[];
  payments: PaymentRecord[];
  onRefreshData?: () => void | Promise<void>;
}

export const MikroTikManager: React.FC<MikroTikManagerProps> = ({ subscribers, payments, onRefreshData }) => {
  const [activeTab, setActiveTab] = useState<'interfaces' | 'resources' | 'dhcp' | 'settings'>('interfaces');
  
  const [config, setConfig] = useState<MikroTikConfig>({
    host: '192.168.88.1',
    port: 443,
    useSsl: true,
    username: 'admin',
    password: '',
    autoSyncOverdue: true,
    syncMethod: 'ppp_secret',
    syncTime: '15m',
  });

  const [resource, setResource] = useState<MikroTikResource | null>(null);
  const [interfaces, setInterfaces] = useState<MikroTikInterface[]>([]);
  const [leases, setLeases] = useState<MikroTikDhcpLease[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [syncingTime, setSyncingTime] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [assigningVlan, setAssigningVlan] = useState<number | null>(null);

  const handleAssignSubscriberToVlan = async (sub: Subscriber, targetVlan: number) => {
    try {
      // Enforce 1 subscriber per VLAN: unassign any other subscriber currently on this targetVlan
      const existingSubsOnVlan = subscribers.filter(
        (s) => s.id !== sub.id && s.vlan !== null && s.vlan !== undefined && Number(s.vlan) === Number(targetVlan)
      );

      for (const existingSub of existingSubsOnVlan) {
        await fetch('/api/subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...existingSub, vlan: null }),
        });
      }

      const updatedSub = { ...sub, vlan: targetVlan };
      const res = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSub),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to assign subscriber to VLAN');
      }

      showNotify('success', `Assigned subscriber ${displayName(sub)} (#${sub.id}) to VLAN ${targetVlan}`);
      setAssigningVlan(null);
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err: any) {
      showNotify('error', err.message || 'Error assigning subscriber to VLAN');
    }
  };

  const handleUnassignSubscriberFromVlan = async (sub: Subscriber) => {
    try {
      const updatedSub = { ...sub, vlan: 0 };
      const res = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSub),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to unassign subscriber');
      }

      showNotify('info', `Unassigned subscriber ${displayName(sub)} (#${sub.id}) from VLAN`);
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err: any) {
      showNotify('error', err.message || 'Error unassigning subscriber');
    }
  };

  // Load config on mount
  useEffect(() => {
    fetchConfig();
    fetchSystemInfo();
    fetchTabDetails('interfaces');
  }, []);

  const showNotify = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/mikrotik/config');
      if (res.ok) {
        const data = await res.json();
        setConfig({
          ...data,
          useSsl: Boolean(data.useSsl),
          autoSyncOverdue: Boolean(data.autoSyncOverdue),
          syncTime: data.syncTime || '15m',
        });
      }
    } catch (err) {
      console.error('Failed to load MikroTik config:', err);
    }
  };

  const handleSyncRouterClock = async () => {
    setSyncingTime(true);
    try {
      const res = await fetch('/api/mikrotik/sync-time', { method: 'POST' });
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

  const fetchSystemInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mikrotik/resources');
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

  const fetchTabDetails = async (tab: string) => {
    if (tab === 'interfaces') {
      try {
        const res = await fetch('/api/mikrotik/interfaces');
        const data = await res.json();
        if (data.success) setInterfaces(data.interfaces || []);
      } catch (err) {
        console.error(err);
      }
    } else if (tab === 'dhcp') {
      try {
        const res = await fetch('/api/mikrotik/leases');
        const data = await res.json();
        if (data.success) setLeases(data.leases || []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  useEffect(() => {
    fetchTabDetails(activeTab);
  }, [activeTab]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/mikrotik/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        showNotify('success', 'MikroTik connection settings saved!');
        fetchSystemInfo();
        fetchTabDetails(activeTab);
      } else {
        showNotify('error', data.error || 'Failed to save settings.');
      }
    } catch (err: any) {
      showNotify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
                fetchTabDetails(activeTab);
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
          onClick={() => setActiveTab('interfaces')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'interfaces' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>VLAN</span>
        </button>

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
          onClick={() => setActiveTab('dhcp')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'dhcp' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>DHCP Leases</span>
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

      {/* Tab 1: Bridge & VLAN Interfaces (e.g. vlan-101) */}
      {activeTab === 'interfaces' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">VLAN Interfaces & Subscribers</h2>
              <p className="text-xs text-slate-500">
                MikroTik VLAN interfaces, bandwidth traffic statistics, and subscriber VLAN assignments.
              </p>
            </div>
            <button
              onClick={() => fetchTabDetails('interfaces')}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Interfaces</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="py-3 px-4">Interface Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">VLAN ID</th>
                  <th className="py-3 px-4">Subscribers Assigned</th>
                  <th className="py-3 px-4 text-right">Rx / Tx Traffic</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {(() => {
                  const vlanInterfaces = interfaces.filter((iface) => {
                    const name = (iface.name || '').toLowerCase();
                    const type = (iface.type || '').toLowerCase();
                    const comment = (iface.comment || '').toLowerCase();
                    return name.includes('vlan') || type.includes('vlan') || comment.includes('vlan') || iface.vlanId !== undefined;
                  });

                  if (vlanInterfaces.length === 0) {
                    return (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                          No interfaces containing the word "vlan" found on MikroTik router.
                        </td>
                      </tr>
                    );
                  }

                  return vlanInterfaces.map((iface, idx) => {
                    let effectiveVlan = iface.vlanId;
                    if (!effectiveVlan && iface.name) {
                      const match = iface.name.match(/vlan[-_\.\s]*(\d+)/i) || iface.name.match(/(\d+)/);
                      if (match) {
                        effectiveVlan = parseInt(match[1], 10);
                      }
                    }

                    const assignedSubs = subscribers.filter((s) => {
                      if (s.vlan === null || s.vlan === undefined || s.vlan === '' || Number.isNaN(Number(s.vlan))) return false;
                      if (effectiveVlan !== undefined && Number(s.vlan) === Number(effectiveVlan)) return true;
                      const sVlanStr = String(s.vlan).trim();
                      if (!sVlanStr) return false;
                      const nameLower = (iface.name || '').toLowerCase();
                      const commentLower = (iface.comment || '').toLowerCase();
                      return (
                        nameLower.includes(`vlan-${sVlanStr}`) ||
                        nameLower.includes(`vlan_${sVlanStr}`) ||
                        nameLower.includes(`vlan${sVlanStr}`) ||
                        commentLower.includes(`vlan ${sVlanStr}`) ||
                        commentLower.includes(`vlan-${sVlanStr}`)
                      );
                    });

                    return (
                      <tr key={iface.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-950 flex items-center gap-2">
                          <Network className="w-4 h-4 text-indigo-500" />
                          <span>{iface.name}</span>
                        </td>
                        <td className="py-3 px-4 uppercase text-[11px] font-bold text-slate-600">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                            {iface.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {effectiveVlan ? (
                            <span className="px-2.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                              VLAN {effectiveVlan}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1.5">
                            {assignedSubs.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {assignedSubs.map((s) => (
                                  <span
                                    key={s.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-semibold"
                                  >
                                    <span>{displayName(s)}</span>
                                    <span className="text-[9px] text-emerald-600 font-mono">(ID #{s.id})</span>
                                    <button
                                      onClick={() => handleUnassignSubscriberFromVlan(s)}
                                      title="Unassign subscriber from VLAN"
                                      className="ml-0.5 text-emerald-600 hover:text-rose-600 hover:bg-emerald-100 rounded-full p-0.5 cursor-pointer transition-colors"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">No subscriber assigned</span>
                            )}

                            {effectiveVlan && assignedSubs.length === 0 ? (
                              <div className="relative inline-block text-left pt-0.5">
                                {assigningVlan === effectiveVlan ? (
                                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded p-1 shadow-xs">
                                    <select
                                      className="text-[11px] p-1 bg-white border border-slate-200 rounded font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      onChange={(e) => {
                                        const subId = parseInt(e.target.value, 10);
                                        const found = subscribers.find((sub) => sub.id === subId);
                                        if (found && effectiveVlan) {
                                          handleAssignSubscriberToVlan(found, effectiveVlan);
                                        }
                                      }}
                                      defaultValue=""
                                    >
                                      <option value="" disabled>Select Subscriber to Assign...</option>
                                      {subscribers.map((sub) => (
                                        <option key={sub.id} value={sub.id}>
                                          #{sub.id} - {displayName(sub)} {sub.vlan ? `(Current VLAN: ${sub.vlan})` : '(No VLAN assigned)'}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => setAssigningVlan(null)}
                                      className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                                      title="Cancel"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setAssigningVlan(effectiveVlan!)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer transition-colors"
                                  >
                                    <UserPlus className="w-3 h-3" />
                                    <span>+ Assign Subscriber</span>
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[11px]">
                          <span className="text-emerald-600 font-bold">↓ {formatBytes(iface.rxByte)}</span>
                          <span className="text-slate-300 mx-1.5">|</span>
                          <span className="text-indigo-600 font-bold">↑ {formatBytes(iface.txByte)}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {iface.disabled ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              DISABLED
                            </span>
                          ) : iface.running ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> RUNNING
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              LINK DOWN
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: System Hardware Specs */}
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

      {/* Tab 3: DHCP Leases */}
      {activeTab === 'dhcp' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">DHCP Server Leases</h2>
              <p className="text-xs text-slate-500">IP address reservations and bound clients on RouterOS.</p>
            </div>
            <button
              onClick={() => fetchTabDetails('dhcp')}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Leases</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">IP Address</th>
                  <th className="py-2.5 px-3">Host Name</th>
                  <th className="py-2.5 px-3">DHCP Server</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leases.map((l, idx) => (
                  <tr key={l.id || idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{l.address}</td>
                    <td className="py-2.5 px-3 text-slate-800 font-semibold">{l.hostName || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-500">{l.server}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Router Connection Settings */}
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
                placeholder="192.168.88.1 or router.domain.com"
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
                    disabled={syncingTime}
                    className="w-full text-xs py-2.5 px-3 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
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

            {/* Auto-Sync Overdue Toggle */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <p className="text-xs font-bold text-slate-800">Automatic Overdue Disconnection Sync</p>
                <p className="text-[11px] text-slate-500">
                  Automatically disable interface / PPP secret when subscriber billing due date passes.
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.autoSyncOverdue}
                onChange={(e) => setConfig({ ...config, autoSyncOverdue: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Save Router Settings</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
