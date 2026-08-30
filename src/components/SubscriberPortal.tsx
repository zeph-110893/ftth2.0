import React, { useState, useEffect, useCallback } from 'react';
import {
  Wifi,
  Activity,
  Calendar,
  DollarSign,
  Smartphone,
  Tv,
  Laptop,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Globe,
  Lock,
  ArrowDownCircle,
  ArrowUpCircle,
  HelpCircle,
  UserPlus,
} from 'lucide-react';
import { SubscriberPortalData } from '../types';

interface SubscriberPortalProps {
  onOpenAdminLogin?: () => void;
}

export const SubscriberPortal: React.FC<SubscriberPortalProps> = ({
  onOpenAdminLogin,
}) => {
  const [data, setData] = useState<SubscriberPortalData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);

  // Cooldown timer effect
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setTimeout(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownRemaining]);

  // Fetch subscriber portal info strictly via automatic IP detection (3rd octet VLAN)
  const fetchPortalData = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);

      const res = await fetch('/api/portal/subscriber-info', {
        headers: {
          Accept: 'application/json',
        },
      });

      if (res.status === 429) {
        const rateLimitJson = await res.json().catch(() => null);
        const retrySecs = rateLimitJson?.retryAfter || 10;
        setRateLimitNotice(`Rate limit active: request quota reached to prevent spam. Please wait ${retrySecs}s.`);
        setCooldownRemaining(retrySecs);
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const json = await res.json();
      if (json && json.success) {
        setData(json);
        setRateLimitNotice(null);
        setLastRefreshed(new Date());
      } else {
        setError(json?.error || 'No subscriber data found.');
      }
    } catch (err: any) {
      console.warn('Portal data fetch notice:', err?.message || err);
      setError(err?.message || 'Unable to connect to server');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPortalData();
  }, [fetchPortalData]);

  // Periodic bandwidth telemetry refresh (every 30 seconds) ONLY when page is active/visible and subscriber is matched
  useEffect(() => {
    if (!data?.subscriber) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchPortalData(true);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [Boolean(data?.subscriber), fetchPortalData]);

  const handleManualRefresh = () => {
    if (cooldownRemaining > 0 || isRefreshing) return;
    setCooldownRemaining(3); // 3-second anti-spam client cooldown
    fetchPortalData(true);
  };

  // Helper to pick device icon based on device name
  const getDeviceIcon = (deviceName: string) => {
    const name = deviceName.toLowerCase();
    if (name.includes('tv') || name.includes('roku') || name.includes('cast') || name.includes('box')) {
      return <Tv className="w-4 h-4 text-purple-500" />;
    }
    if (name.includes('phone') || name.includes('iphone') || name.includes('android') || name.includes('mobile')) {
      return <Smartphone className="w-4 h-4 text-cyan-500" />;
    }
    if (name.includes('laptop') || name.includes('pc') || name.includes('mac') || name.includes('desktop') || name.includes('workstation')) {
      return <Laptop className="w-4 h-4 text-blue-500" />;
    }
    return <HardDrive className="w-4 h-4 text-emerald-500" />;
  };

  const getStatusBadge = (statusPill: string) => {
    switch (statusPill) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-bold rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Active & Up-to-Date
          </span>
        );
      case 'due':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-600 border border-amber-500/20 text-xs font-bold rounded-full">
            <Clock className="w-3.5 h-3.5" />
            Payment Due Soon
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 text-rose-600 border border-rose-500/20 text-xs font-bold rounded-full">
            <AlertTriangle className="w-3.5 h-3.5" />
            Account Overdue
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-500/10 text-slate-600 border border-slate-500/20 text-xs font-bold rounded-full">
            Account Inactive
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans antialiased selection:bg-cyan-500 selection:text-white">
      {/* Top ISP Brand Bar */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Wifi className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-white">FTTH Fiber Subscriber Portal</h1>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-md border border-cyan-500/30">
                  Self-Service
                </span>
              </div>
              <p className="text-xs text-slate-400">Live Connection Telemetry & Billing Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            {/* Detected IP Display */}
            {data?.detectedIp && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/90 rounded-lg border border-slate-700 text-xs text-slate-300 font-mono shadow-xs">
                <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="text-[11px] text-slate-400">Client IP:</span>
                <span className="text-cyan-300 font-bold">{data.detectedIp}</span>
              </div>
            )}

            {/* Refresh Button with Anti-Spam Cooldown */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || cooldownRemaining > 0}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                cooldownRemaining > 0
                  ? 'bg-slate-800/60 text-slate-500 border-slate-700/50 cursor-not-allowed'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
              }`}
              title={cooldownRemaining > 0 ? `Rate protection: Wait ${cooldownRemaining}s` : 'Refresh Live Telemetry'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
              {cooldownRemaining > 0 ? (
                <span className="font-mono text-[11px] text-slate-400">{cooldownRemaining}s</span>
              ) : (
                <span className="hidden sm:inline text-[11px]">Refresh</span>
              )}
            </button>

            {/* Admin Login Link */}
            {onOpenAdminLogin && (
              <button
                onClick={onOpenAdminLogin}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white rounded-lg text-xs font-semibold border border-cyan-500/40 transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Admin Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Anti-Spam Rate Limit Warning Banner */}
        {rateLimitNotice && (
          <div className="flex items-center gap-2.5 p-3.5 bg-amber-500/10 border border-amber-500/30 text-amber-800 rounded-xl text-xs font-medium shadow-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="flex-1">
              <span className="font-bold">Rate Limit Protection:</span> {rateLimitNotice}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-28 text-slate-500 gap-3">
            <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold text-slate-600 font-mono">
              Auto-detecting subscriber VLAN by IP & querying router...
            </span>
            <p className="text-xs text-slate-400">Strict IP Auto-Detection — no manual selection required</p>
          </div>
        ) : !data || !data.subscriber ? (
          data?.noSubscribers ? (
            <div className="bg-white rounded-2xl p-10 border border-slate-200 text-center space-y-4 max-w-lg mx-auto shadow-sm my-8">
              <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mx-auto border border-cyan-100">
                <Wifi className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">No Subscriber Accounts Found</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  The database has no active subscriber records registered yet.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Log in to the Admin Panel to register subscribers, assign VLANs, and record payments.
                </p>
              </div>
              {onOpenAdminLogin && (
                <div className="pt-3">
                  <button
                    onClick={onOpenAdminLogin}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
                  >
                    <Lock className="w-4 h-4 text-cyan-400" />
                    <span>Log In to Admin Panel</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 sm:p-10 border border-slate-200/90 text-center space-y-5 max-w-lg mx-auto shadow-sm my-8">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200/60 shadow-xs">
                <Globe className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold mb-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Unrecognized Network Connection</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  Subscriber Not Found for Current IP
                </h3>
                <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-700">
                  Detected IP: <strong className="text-cyan-700">{data?.detectedIp || 'Unknown'}</strong>
                </div>
                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  The Subscriber Portal strictly auto-detects your account based on your device's connection IP address. No subscriber VLAN matches this address.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Please connect directly to your home FTTH fiber WiFi router / assigned VLAN, or contact your ISP administrator to verify your IP assignment.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing || cooldownRemaining > 0}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Re-Detect IP Connection</span>
                </button>
                {onOpenAdminLogin && (
                  <button
                    onClick={onOpenAdminLogin}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer border border-slate-200"
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Admin Login</span>
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          <>
            {/* Detection Info Bar */}
            <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-600 flex-wrap">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Connected as <strong className="text-slate-900">{data.subscriber.name}</strong> (Subscriber #{data.subscriber.id})
                </span>
                <span className="px-2 py-0.5 bg-cyan-50 text-cyan-700 font-mono font-bold rounded text-[11px] border border-cyan-200/60">
                  VLAN #{data.detectedVlan || data.subscriber.vlan || '100'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  (Auto-Detected from IP {data.detectedIp})
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>
                  Last synced: <strong className="text-slate-600">{lastRefreshed.toLocaleTimeString()}</strong>
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>

            {/* TOP SECTION: DUE DATE & BILLING HIGHLIGHT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Due Date & Status Hero Card */}
              <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white rounded-2xl p-6 sm:p-7 shadow-lg border border-slate-800 relative overflow-hidden flex flex-col justify-between">
                {/* Ambient background glow */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-cyan-400" />
                      <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                        Billing & Due Date
                      </span>
                    </div>
                    {getStatusBadge(data.billing.statusPill)}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-slate-800">
                    <div>
                      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                        Next Due Date
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">
                        {data.billing.nextDueDate}
                      </div>
                      <div className="text-xs text-cyan-400 font-medium mt-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {data.billing.isPaidCurrent
                          ? 'Current cycle is paid — next cycle due date shown'
                          : data.billing.daysRemaining < 0
                          ? `${Math.abs(data.billing.daysRemaining)} days past due`
                          : data.billing.daysRemaining === 0
                          ? 'Due today!'
                          : `Due in ${data.billing.daysRemaining} days`}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                        Monthly Plan Rate
                      </div>
                      <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 mt-1">
                        ₱{data.billing.monthlyRate.toLocaleString()}
                        <span className="text-xs font-normal text-slate-400 ml-1">/ month</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Due day: <strong className="text-white">Day {data.subscriber.dueDay || 15}</strong> of each month
                      </div>
                    </div>
                  </div>
                </div>

                {/* Overdue Alert or Up-to-date Notice */}
                <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {data.billing.unpaidMonths.length > 0 ? (
                    <div className="text-xs text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        Unpaid Cycle(s): <strong className="text-white">{data.billing.unpaidMonths.join(', ')}</strong> (Total: ₱{data.billing.unpaidTotal})
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>All billing cycles are up-to-date. Thank you for your payment!</span>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400">
                    Pay via GCash / Maya / Cash Counter
                  </div>
                </div>
              </div>

              {/* Subscriber Plan Details Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm pb-3 border-b border-slate-100">
                    <DollarSign className="w-4 h-4 text-cyan-600" />
                    <span>Subscriber Account Info</span>
                  </div>

                  <div className="divide-y divide-slate-100 text-xs mt-2">
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-500">Account ID</span>
                      <span className="font-mono font-bold text-slate-900">#{data.subscriber.id}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-500">Subscriber Name</span>
                      <span className="font-bold text-slate-900">{data.subscriber.name}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-500">Assigned VLAN</span>
                      <span className="font-mono font-bold text-cyan-600">VLAN-{data.detectedVlan || data.subscriber.vlan || '100'}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-500">Service Status</span>
                      <span className={`font-bold ${data.subscriber.status === 'Active' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {data.subscriber.status}
                      </span>
                    </div>
                    {data.subscriber.address && (
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-500">Service Address</span>
                        <span className="font-medium text-slate-800 text-right truncate max-w-[160px]">
                          {data.subscriber.address}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                  For service assistance, technical support, or billing queries, contact your fiber network administrator.
                </div>
              </div>
            </div>

            {/* MIDDLE SECTION: BANDWIDTH USAGE */}
            {data.bandwidth && (
              <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-100">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Bandwidth Usage & Traffic</h2>
                      <p className="text-xs text-slate-500">Live data consumption on interface {data.bandwidth.interfaceName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 bg-slate-100 rounded-lg font-mono text-slate-600">
                      MTU: 1500
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg font-semibold ${data.bandwidth.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700'}`}>
                      {data.bandwidth.status === 'active' ? '● Interface Running' : '● Disabled'}
                    </span>
                  </div>
                </div>

                {/* Bandwidth Usage Stat Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* Total Download */}
                  <div className="bg-gradient-to-br from-cyan-50/70 to-cyan-100/30 p-5 rounded-2xl border border-cyan-200/80">
                    <div className="flex items-center justify-between text-xs font-bold text-cyan-900 mb-1">
                      <span className="uppercase tracking-wider">Total Downloaded (Rx)</span>
                      <ArrowDownCircle className="w-4 h-4 text-cyan-600" />
                    </div>
                    <div className="text-3xl font-black font-mono text-slate-900 mt-2">
                      {data.bandwidth.rxFormatted}
                    </div>
                    <p className="text-[11px] text-cyan-700 mt-1 font-medium">Inbound traffic consumed</p>
                  </div>

                  {/* Total Upload */}
                  <div className="bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 p-5 rounded-2xl border border-emerald-200/80">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-900 mb-1">
                      <span className="uppercase tracking-wider">Total Uploaded (Tx)</span>
                      <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-3xl font-black font-mono text-slate-900 mt-2">
                      {data.bandwidth.txFormatted}
                    </div>
                    <p className="text-[11px] text-emerald-700 mt-1 font-medium">Outbound traffic transmitted</p>
                  </div>

                  {/* Total Combined */}
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-5 rounded-2xl border border-slate-200">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                      <span className="uppercase tracking-wider">Total Data Transferred</span>
                      <Globe className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="text-3xl font-black font-mono text-slate-900 mt-2">
                      {data.bandwidth.totalFormatted}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">Combined monthly transfer</p>
                  </div>
                </div>
              </div>
            )}

            {/* BOTTOM SECTION: CONNECTED HOME DEVICES (DHCP LIST) */}
            <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Connected Home Devices (DHCP List)</h2>
                    <p className="text-xs text-slate-500">
                      Devices currently assigned a local IP on your home VLAN network
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full font-mono">
                  {data.devices?.length || 0} {(data.devices?.length || 0) === 1 ? 'Device' : 'Devices'} Connected
                </span>
              </div>

              {!data.devices || data.devices.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No active DHCP leases currently reported for your home VLAN.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  {data.devices.map((device, idx) => (
                    <div
                      key={device.id || idx}
                      className="p-4 rounded-xl border border-slate-200 hover:border-cyan-300 bg-slate-50/50 hover:bg-cyan-50/20 transition-all flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                          {getDeviceIcon(device.deviceName)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate" title={device.deviceName}>
                            {device.deviceName}
                          </div>
                          <div className="text-[11px] font-mono text-cyan-600 font-semibold mt-0.5">
                            {device.ipAddress}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-block px-2 py-0.5 bg-emerald-100/70 text-emerald-700 text-[10px] font-semibold rounded-md border border-emerald-200">
                          {device.status || 'Active'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[11px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-cyan-500 shrink-0" />
                <span>
                  Tip: Connected devices are assigned dynamically by your home fiber router. Device names correspond to their WiFi broadcast hostname.
                </span>
              </div>
            </div>

            {/* Payment History Mini-Table */}
            {data.billing.recentPayments && data.billing.recentPayments.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span>Recent Payment History</span>
                  <span className="text-slate-400 font-normal">{data.billing.recentPayments.length} recorded payments</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100">
                        <th className="py-2 font-semibold">Billing Month</th>
                        <th className="py-2 font-semibold">Amount Paid</th>
                        <th className="py-2 font-semibold">Date & Time</th>
                        <th className="py-2 font-semibold text-right">Reference No.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.billing.recentPayments.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="py-2.5 font-bold text-slate-800">{p.month}</td>
                          <td className="py-2.5 font-mono font-bold text-emerald-600">₱{p.amount.toLocaleString()}</td>
                          <td className="py-2.5 text-slate-500">{p.ts}</td>
                          <td className="py-2.5 text-right font-mono text-slate-600">{p.referenceNo || 'Counter Receipt'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} FTTH High-Speed Fiber Network. All rights reserved.</span>
          <span className="text-[11px] text-slate-400">Subscriber Self-Service Portal &bull; Zero Authentication Required</span>
        </div>
      </footer>
    </div>
  );
};

