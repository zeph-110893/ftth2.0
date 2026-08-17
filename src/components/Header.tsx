import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Receipt,
  Clock,
  Calendar,
  RefreshCw,
  LogOut,
  KeyRound,
  Database,
  ChevronDown,
  MoreHorizontal,
  DollarSign,
  Wifi,
  ShieldCheck,
} from 'lucide-react';
import { AuthUser } from '../types';

interface HeaderProps {
  onAddSubscriber: () => void;
  onRecordPayment: () => void;
  onAddExpense?: () => void;
  onOpenDatabaseModal?: () => void;
  onOpenSubscriberPortal?: () => void;
  onExportCSV?: () => void;
  onResetData?: () => void;
  onRefresh?: () => void;
  isSyncing?: boolean;
  currentUser?: AuthUser | null;
  onOpenChangePassword?: () => void;
  onLogout?: () => void;
  totalSubsCount: number;
  activeCount: number;
  dueCount?: number;
  overdueCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onAddSubscriber,
  onRecordPayment,
  onAddExpense,
  onOpenDatabaseModal,
  onOpenSubscriberPortal,
  onRefresh,
  isSyncing = false,
  currentUser,
  onOpenChangePassword,
  onLogout,
  totalSubsCount,
  activeCount,
  dueCount = 0,
  overdueCount,
}) => {
  const [time, setTime] = useState<Date>(new Date());
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // Keep live time updated every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setIsToolsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formattedDate = time.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = time.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Left: Brand + Realtime Capsule */}
          <div className="flex items-center justify-between sm:justify-start gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm shadow-cyan-950/50">
                <Wifi className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-black text-white tracking-tight leading-none flex items-center gap-1.5">
                  <span>FTTH Billing</span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                </h1>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Fiber ISP & RouterOS Core
                </span>
              </div>
            </div>

            {/* Unified Live Clock & Sync Capsule */}
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-950/70 border border-slate-800 text-xs text-slate-300 font-mono">
              <div className="flex items-center gap-1.5 font-medium">
                <Calendar className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="hidden sm:inline text-slate-300">{formattedDate}</span>
                <span className="text-slate-600 hidden sm:inline">&bull;</span>
                <Clock className="w-3 h-3 text-teal-400 shrink-0 animate-pulse" />
                <span className="font-bold text-white">{formattedTime}</span>
              </div>

              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isSyncing}
                  title="Sync and refresh live data"
                  className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-all cursor-pointer disabled:opacity-50"
                  aria-label="Refresh data"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* Right: Status metrics + Actions & User Menu */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-wrap">
            
            {/* Compact Quick Metric Chips */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-[11px] text-slate-300 font-medium select-none">
              <span className="font-bold text-white">{totalSubsCount} Subs</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-cyan-400 font-bold">{activeCount} Active</span>
              {dueCount > 0 && (
                <>
                  <span className="text-slate-600">&bull;</span>
                  <span className="text-amber-400 font-bold">{dueCount} Due</span>
                </>
              )}
              {overdueCount > 0 && (
                <>
                  <span className="text-slate-600">&bull;</span>
                  <span className="text-rose-400 font-bold">{overdueCount} Overdue</span>
                </>
              )}
            </div>

            {/* Action Group: Primary Buttons & Tools Menu */}
            <div className="flex items-center gap-2">
              
              {/* Primary Action 1: Record Payment (Nordic Cyan) */}
              <button
                type="button"
                onClick={onRecordPayment}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs hover:shadow-cyan-900/30"
              >
                <Receipt className="w-3.5 h-3.5 shrink-0" />
                <span>Record Payment</span>
              </button>

              {/* Primary Action 2: Add Subscriber (Deep Slate with Cyan border/hover) */}
              <button
                type="button"
                onClick={onAddSubscriber}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-cyan-300 hover:text-white border border-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                <span className="hidden sm:inline">Add Subscriber</span>
                <span className="sm:hidden">Add</span>
              </button>

              {/* Tools / More Menu */}
              <div className="relative" ref={toolsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
                  title="More actions & database tools"
                  className="p-2 sm:px-2.5 sm:py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1 border border-slate-700/80"
                  aria-expanded={isToolsMenuOpen}
                >
                  <MoreHorizontal className="w-4 h-4 text-slate-300" />
                  <span className="hidden md:inline text-[11px] font-semibold text-slate-200">Tools</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 hidden md:inline" />
                </button>

                {isToolsMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-52 bg-slate-900 rounded-2xl shadow-xl border border-slate-800 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Management Tools
                    </div>

                    {onOpenSubscriberPortal && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsMenuOpen(false);
                          onOpenSubscriberPortal();
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-cyan-950/60 hover:text-cyan-300 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Wifi className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">Subscriber Portal</div>
                          <div className="text-[10px] text-slate-400">Preview live subscriber web page</div>
                        </div>
                      </button>
                    )}

                    {onOpenDatabaseModal && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsMenuOpen(false);
                          onOpenDatabaseModal();
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-cyan-950/60 hover:text-cyan-300 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">Database Backup</div>
                          <div className="text-[10px] text-slate-400">Download or restore SQLite</div>
                        </div>
                      </button>
                    )}

                    {onAddExpense && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsMenuOpen(false);
                          onAddExpense();
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-teal-950/60 hover:text-teal-300 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <DollarSign className="w-4 h-4 text-teal-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">Add Expense</div>
                          <div className="text-[10px] text-slate-400">Track network operating costs</div>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* User Profile Dropdown Menu */}
              {currentUser && (
                <div className="relative pl-1 border-l border-slate-800" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer border border-slate-700/80"
                    aria-expanded={isUserMenuOpen}
                  >
                    <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-[10px] font-black shrink-0">
                      {currentUser.username ? currentUser.username[0].toUpperCase() : 'A'}
                    </div>
                    <span className="max-w-[70px] sm:max-w-[90px] truncate text-[11px] font-semibold text-slate-200">
                      {currentUser.username}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-48 bg-slate-900 rounded-2xl shadow-xl border border-slate-800 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 py-1.5 border-b border-slate-800 mb-1">
                        <div className="text-xs font-bold text-white truncate">
                          {currentUser.name || currentUser.username}
                        </div>
                        <div className="text-[10px] text-cyan-400 font-semibold flex items-center gap-1 mt-0.5">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Administrator</span>
                        </div>
                      </div>

                      {onOpenChangePassword && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onOpenChangePassword();
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Change Password</span>
                        </button>
                      )}

                      {onLogout && (
                        <>
                          <div className="my-1 border-t border-slate-800" />
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              onLogout();
                            }}
                            className="w-full px-3 py-2 text-left text-xs font-bold text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Sign Out</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
