import React, { useState } from 'react';
import { Lock, User, ShieldCheck, Wifi, ArrowRight, AlertCircle, Server, Activity } from 'lucide-react';
import { AuthUser } from '../types';
import { saveAuthSession } from '../utils/auth';

interface LoginPageProps {
  onLoginSuccess: (user: AuthUser, token: string) => void;
  onOpenSubscriberPortal?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onOpenSubscriberPortal }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid credentials. Please try again.');
      }

      // Save token and user in localStorage
      saveAuthSession(data.token, data.user);
      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col justify-between items-center px-4 py-6 sm:py-10 md:py-16 selection:bg-cyan-500 selection:text-white relative overflow-x-hidden">
      {/* Dynamic Background subtle Nordic Cyan glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-35 select-none" aria-hidden="true">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[350px] sm:w-[600px] md:w-[800px] h-[350px] sm:h-[600px] bg-gradient-to-br from-cyan-600/30 via-teal-700/15 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-24 right-1/4 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-slate-900/60 rounded-full blur-3xl" />
      </div>

      {/* Top spacer on larger screens */}
      <div className="hidden sm:block" />

      {/* Main Container - Responsive 2-column on desktop (lg+), clean compact card on mobile */}
      <div className="w-full max-w-md lg:max-w-4xl relative z-10 my-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 rounded-3xl bg-slate-900/90 border border-slate-800/90 shadow-2xl shadow-slate-950/80 backdrop-blur-xl overflow-hidden">
          
          {/* Desktop Left Side Branding Banner (Visible on lg+, hidden on mobile for compactness) */}
          <div className="hidden lg:flex lg:col-span-5 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/40 p-8 flex-col justify-between border-r border-slate-800/80 relative">
            <div className="space-y-6 relative z-10">
              <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>FTTH Management Core</span>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-black tracking-tight text-white leading-tight">
                  FTTH Billing & RouterOS Control
                </h1>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enterprise-grade subscriber accounting, automated overdue tracking, and MikroTik RB5009 VLAN management.
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-800/80 text-xs text-slate-300">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Server className="w-3.5 h-3.5" />
                  </div>
                  <span>MikroTik REST API & Live DHCP Leases</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <span>Multi-Month Payment Matrices & Expenses</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span>Persistent SQLite Database Engine</span>
                </div>
              </div>
            </div>

            <div className="pt-6 text-[11px] text-slate-500 border-t border-slate-800/80 flex items-center justify-between">
              <span>RB5009 Core Node</span>
              <span className="font-mono text-cyan-400 font-semibold">v2.4 Online</span>
            </div>
          </div>

          {/* Right Side / Mobile Main Form */}
          <div className="lg:col-span-7 p-6 sm:p-8 md:p-10 flex flex-col justify-center">
            
            {/* Mobile Header Branding */}
            <div className="text-center lg:text-left mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-3 shadow-lg shadow-cyan-950/40 lg:hidden">
                <Wifi className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Sign In to Dashboard
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Enter your credentials to access subscriber management
              </p>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span className="font-medium leading-relaxed">{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="username-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    autoComplete="username"
                    required
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 sm:py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm sm:text-base lg:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                    className="w-full pl-10 pr-4 py-3 sm:py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm sm:text-base lg:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-medium font-mono"
                  />
                </div>
              </div>

              <button
                id="login-submit-button"
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 sm:py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-sm sm:text-base lg:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/60 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer min-h-[48px]"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </div>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Return to Subscriber Portal (Main Page) */}
            {onOpenSubscriberPortal && (
              <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
                <button
                  type="button"
                  onClick={onOpenSubscriberPortal}
                  className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-slate-700/80 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:border-cyan-500/40"
                >
                  <Wifi className="w-4 h-4 text-cyan-400" />
                  <span>← Return to Subscriber Portal (Main Page)</span>
                </button>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Looking for your fiber bill, due date or live bandwidth? No login required.
                </p>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* Footer / System Status */}
      <footer className="relative z-10 mt-6 text-center text-xs text-slate-500 select-none">
        <p className="flex items-center justify-center gap-1.5 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span>Nordic Fiber ISP Network Security • RouterOS 7.x RB5009 Core</span>
        </p>
      </footer>
    </div>
  );
};
