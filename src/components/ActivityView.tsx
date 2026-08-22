import React, { useState, useEffect } from 'react';
import {
  Activity,
  Search,
  Filter,
  RefreshCw,
  Trash2,
  Download,
  Shield,
  User,
  Users,
  CreditCard,
  Receipt,
  Database,
  Router,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { AuditLog, AuthUser } from '../types';
import { authFetch } from '../utils/auth';

interface ActivityViewProps {
  currentUser?: AuthUser | null;
  onRefreshStats?: () => void;
}

export const ActivityView: React.FC<ActivityViewProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      params.append('limit', '400');

      const res = await authFetch(`/api/audit-logs?${params.toString()}`);

      if (!res.ok) {
        throw new Error('Failed to fetch activity audit logs');
      }

      const data = await res.json();
      setLogs(data);
    } catch (err: any) {
      console.error('Error loading audit logs:', err);
      setError(err?.message || 'Could not load activity log data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const handleClearLogs = async () => {
    setIsClearing(true);
    try {
      const res = await authFetch('/api/audit-logs/clear', {
        method: 'POST',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to clear audit logs');
      }

      setConfirmClearOpen(false);
      fetchLogs();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  const exportLogsAsCSV = () => {
    if (logs.length === 0) return;
    const headers = ['Timestamp', 'Action', 'Category', 'User', 'Role', 'IP Address', 'Description', 'Details'];
    const rows = logs.map((log) => [
      `"${log.timestamp}"`,
      `"${log.action}"`,
      `"${log.category}"`,
      `"${log.username}"`,
      `"${log.userRole || ''}"`,
      `"${log.ipAddress || ''}"`,
      `"${(log.description || '').replace(/"/g, '""')}"`,
      `"${(log.details || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ftth_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryMeta = (category: string) => {
    switch (category) {
      case 'subscriber':
        return {
          label: 'Subscriber',
          icon: Users,
          color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
          dotColor: 'bg-cyan-400',
        };
      case 'payment':
        return {
          label: 'Payment',
          icon: CreditCard,
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          dotColor: 'bg-emerald-400',
        };
      case 'expense':
        return {
          label: 'Expense',
          icon: Receipt,
          color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          dotColor: 'bg-amber-400',
        };
      case 'database':
        return {
          label: 'Database',
          icon: Database,
          color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          dotColor: 'bg-purple-400',
        };
      case 'user':
        return {
          label: 'User Account',
          icon: User,
          color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          dotColor: 'bg-indigo-400',
        };
      case 'mikrotik':
        return {
          label: 'MikroTik',
          icon: Router,
          color: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
          dotColor: 'bg-sky-400',
        };
      case 'security':
        return {
          label: 'Security',
          icon: Shield,
          color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          dotColor: 'bg-rose-400',
        };
      default:
        return {
          label: 'System',
          icon: Activity,
          color: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          dotColor: 'bg-slate-400',
        };
    }
  };

  const formatLogDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const categories = [
    { id: 'all', label: 'All Activities' },
    { id: 'subscriber', label: 'Subscribers' },
    { id: 'payment', label: 'Payments' },
    { id: 'expense', label: 'Expenses' },
    { id: 'mikrotik', label: 'MikroTik' },
    { id: 'database', label: 'Database' },
    { id: 'user', label: 'Users' },
    { id: 'security', label: 'Security' },
  ];

  const isAdmin = currentUser?.permission === 'ADMIN' || currentUser?.role === 'admin';

  return (
    <div className="space-y-4">
      {/* Top Banner / Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-sm">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>System Audit & Activity Log</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  {logs.length} events
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Immutable trace of subscriber modifications, billing receipts, MikroTik syncs, and database events.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fetchLogs(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={exportLogsAsCSV}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                disabled={logs.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold rounded-xl border border-rose-800/40 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Clear Logs</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative min-w-[240px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search actions, users, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </form>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300">Loading audit log events...</p>
            <p className="text-xs text-slate-500 mt-1">Retrieving persistent ledger entries</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-rose-400 px-4">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-bold text-rose-300">Unable to load audit logs</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">{error}</p>
            <button
              type="button"
              onClick={() => fetchLogs()}
              className="mt-4 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer"
            >
              Try Again
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <FileText className="w-9 h-9 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">No activity logs found</p>
            <p className="text-xs text-slate-500 mt-1">
              {searchQuery || selectedCategory !== 'all'
                ? 'Try broadening your search criteria or selecting a different category filter.'
                : 'System actions and operations will be recorded here automatically.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Action & Description</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {logs.map((log) => {
                  const meta = getCategoryMeta(log.category);
                  const Icon = meta.icon;
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{formatLogDate(log.timestamp)}</span>
                        </div>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${meta.color}`}
                        >
                          <Icon className="w-3 h-3 shrink-0" />
                          <span>{meta.label}</span>
                        </span>
                      </td>

                      {/* User */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-cyan-300">
                            {log.username ? log.username[0].toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200">{log.username}</div>
                            {log.ipAddress && (
                              <div className="text-[10px] text-slate-500 font-mono">{log.ipAddress}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Description & Action */}
                      <td className="py-3 px-4">
                        <div>
                          <span className="font-mono text-[10px] font-bold text-slate-400 mr-2 bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">
                            {log.action}
                          </span>
                          <span className="text-slate-200 font-medium">{log.description}</span>
                        </div>
                      </td>

                      {/* Details button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {log.details ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 text-[11px] font-semibold rounded-lg border border-slate-700 transition-colors"
                          >
                            View Data
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Log Event Breakdown</h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedLog.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">Recorded At</span>
                  <span className="text-slate-200 font-mono">{formatLogDate(selectedLog.timestamp)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">Action Type</span>
                  <span className="text-cyan-400 font-mono font-bold">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">Actor Username</span>
                  <span className="text-slate-200 font-semibold">{selectedLog.username}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase">Client IP</span>
                  <span className="text-slate-200 font-mono">{selectedLog.ipAddress || '127.0.0.1'}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block mb-1">Description</span>
                <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 text-slate-200 font-medium leading-relaxed">
                  {selectedLog.description}
                </div>
              </div>

              {selectedLog.details && (
                <div>
                  <span className="text-slate-400 font-semibold block mb-1">Payload Details (JSON)</span>
                  <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-cyan-300 font-mono text-[11px] overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {(() => {
                      try {
                        const parsed = JSON.parse(selectedLog.details);
                        return JSON.stringify(parsed, null, 2);
                      } catch {
                        return selectedLog.details;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Logs Confirmation Modal */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/40 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/60 border border-rose-800/50 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Clear Audit Log Archive?</h3>
                <p className="text-xs text-slate-400">This action permanently purges recorded events.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed my-4 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              Are you sure you want to permanently clear the audit ledger? A new entry noting the ledger purge will be
              recorded automatically.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                disabled={isClearing}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={isClearing}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isClearing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Confirm Purge</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
