import React, { useState } from 'react';
import { Search, Plus, UserCheck, ArrowUpDown, ArrowUp, ArrowDown, Wifi, ShieldAlert, AlertTriangle, CheckCircle2, X, Ban, Network, RefreshCw, ExternalLink } from 'lucide-react';
import { Subscriber, PaymentRecord, SubCalculatedData, MikroTikDhcpLease, MikroTikInterface, AuthUser } from '../types';
import { calculateSubMetrics, displayName, formatCurrency, CURRENT_MONTH, abbrMonth, TODAY, getUnpaidMonths, getSubscriberBillingStatus, getSubscriberDueDay, getLeasesForSubscriber, getInterfaceForSubscriber, formatBytes } from '../utils/billingUtils';
import { authFetch, canWrite } from '../utils/auth';

interface SubscribersListProps {
  subscribers: Subscriber[];
  payments: PaymentRecord[];
  dhcpLeases?: MikroTikDhcpLease[];
  mikrotikInterfaces?: MikroTikInterface[];
  currentUser?: AuthUser | null;
  onSelectSubscriber: (sub: Subscriber) => void;
  onAddSubscriber: () => void;
  onRefreshData?: () => Promise<void> | void;
}

export const SubscribersList: React.FC<SubscribersListProps> = ({
  subscribers,
  payments,
  dhcpLeases = [],
  mikrotikInterfaces = [],
  currentUser,
  onSelectSubscriber,
  onAddSubscriber,
  onRefreshData,
}) => {
  const isReadOnly = !canWrite(currentUser);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'due' | 'overdue' | 'inactive' | 'exclude' | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [vlanFilter, setVlanFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [sortField, setSortField] = useState<'dueDay' | 'id' | 'name' | 'rate' | 'vlan' | 'bandwidth'>('dueDay');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Disable Overdue VLANs State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDisablingOverdue, setIsDisablingOverdue] = useState(false);
  const [actionNotification, setActionNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: Array<{ subId: number; name: string; vlan: number | null; reason: string }>;
  } | null>(null);

  const handleSort = (field: 'dueDay' | 'id' | 'name' | 'rate' | 'vlan' | 'bandwidth') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // For bandwidth, default to 'desc' (highest usage first) on first click for better UX
      setSortOrder(field === 'bandwidth' ? 'desc' : 'asc');
    }
  };

  // Compute metrics for each subscriber
  const subMetricsMap: Record<number, SubCalculatedData> = {};
  subscribers.forEach((sub) => {
    subMetricsMap[sub.id] = calculateSubMetrics(sub, payments, CURRENT_MONTH);
  });

  const activeSubsCount = subscribers.filter((s) => getSubscriberBillingStatus(s, payments) === 'active').length;
  const dueSubsCount = subscribers.filter((s) => getSubscriberBillingStatus(s, payments) === 'due').length;
  const overdueSubsCount = subscribers.filter((s) => getSubscriberBillingStatus(s, payments) === 'overdue').length;
  const inactiveSubsCount = subscribers.filter((s) => getSubscriberBillingStatus(s, payments) === 'inactive').length;
  const excludedSubsCount = subscribers.filter((s) => getSubscriberBillingStatus(s, payments) === 'exclude').length;

  const assignedVlanSubsCount = subscribers.filter((s) => s.vlan && Number(s.vlan) > 0).length;
  const unassignedVlanSubsCount = subscribers.length - assignedVlanSubsCount;

  // Filter subscribers who are overdue and have an assigned VLAN (excluding Inactive and Excluded subscribers)
  const overdueVlanSubs = subscribers.filter((sub) => {
    if (sub.status === 'Inactive' || sub.status === 'Exclude') return false;
    const status = getSubscriberBillingStatus(sub, payments);
    return status === 'overdue' && sub.vlan && sub.vlan > 0;
  });

  const handleDisableAllOverdueVlans = async () => {
    setIsDisablingOverdue(true);
    setActionNotification(null);
    try {
      const res = await authFetch('/api/mikrotik/check-overdue', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        const count = data.overdueSubscribersCount || 0;
        setActionNotification({
          type: 'success',
          message: count > 0 
            ? `Successfully disabled VLAN interfaces for ${count} overdue subscriber${count > 1 ? 's' : ''} on MikroTik RouterOS.`
            : 'No overdue subscribers with active VLAN interfaces needed disabling.',
          details: data.processed || [],
        });
        if (onRefreshData) {
          await onRefreshData();
        }
        setIsConfirmModalOpen(false);
      } else {
        setActionNotification({
          type: 'error',
          message: data.error || 'Failed to disable overdue VLANs on MikroTik RouterOS.',
        });
      }
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: err.message || 'Error communicating with MikroTik RouterOS backend.',
      });
    } finally {
      setIsDisablingOverdue(false);
    }
  };

  // Filter subscribers
  const filteredSubs = subscribers.filter((sub) => {
    const unpaidMonths = getUnpaidMonths(sub, payments);
    const unpaidCount = unpaidMonths.length;
    const billingStatus = getSubscriberBillingStatus(sub, payments);

    const fullName = `${sub.first} ${sub.last} ${sub.last}, ${sub.first}`.toLowerCase();
    const searchClean = searchTerm.toLowerCase().replace(/[:-]/g, '');
    const subMacClean = (sub.macAddress || '').toLowerCase().replace(/[:-]/g, '');
    const matchesSearch =
      fullName.includes(searchTerm.toLowerCase()) ||
      sub.id.toString().includes(searchTerm) ||
      (sub.vlan && sub.vlan.toString().includes(searchTerm)) ||
      (sub.address && sub.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (sub.macAddress && sub.macAddress.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (subMacClean && subMacClean.includes(searchClean));

    if (!matchesSearch) return false;

    if (statusFilter === 'active' && billingStatus !== 'active') return false;
    if (statusFilter === 'due' && billingStatus !== 'due') return false;
    if (statusFilter === 'overdue' && billingStatus !== 'overdue') return false;
    if (statusFilter === 'inactive' && billingStatus !== 'inactive') return false;
    if (statusFilter === 'exclude' && billingStatus !== 'exclude') return false;

    if (paymentFilter === 'paid' && (unpaidCount > 0 || sub.status === 'Inactive' || sub.status === 'Exclude')) return false;
    if (paymentFilter === 'unpaid' && (unpaidCount === 0 || sub.status === 'Inactive' || sub.status === 'Exclude')) return false;

    if (vlanFilter === 'assigned' && (!sub.vlan || sub.vlan <= 0)) return false;
    if (vlanFilter === 'unassigned' && sub.vlan && sub.vlan > 0) return false;

    return true;
  });

  // Sort subscribers
  const sortedSubs = [...filteredSubs].sort((a, b) => {
    if (sortField === 'dueDay') {
      const dayA = a.dueDay || 0;
      const dayB = b.dueDay || 0;
      return sortOrder === 'asc' ? dayA - dayB : dayB - dayA;
    }
    if (sortField === 'id') {
      return sortOrder === 'asc' ? a.id - b.id : b.id - a.id;
    }
    if (sortField === 'name') {
      const nameA = `${a.last} ${a.first}`.toLowerCase();
      const nameB = `${b.last} ${b.first}`.toLowerCase();
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    if (sortField === 'rate') {
      return sortOrder === 'asc' ? a.rate - b.rate : b.rate - a.rate;
    }
    if (sortField === 'vlan') {
      const vlanA = a.vlan && Number(a.vlan) > 0 ? Number(a.vlan) : 999999;
      const vlanB = b.vlan && Number(b.vlan) > 0 ? Number(b.vlan) : 999999;
      return sortOrder === 'asc' ? vlanA - vlanB : vlanB - vlanA;
    }
    if (sortField === 'bandwidth') {
      const ifaceA = getInterfaceForSubscriber(a, mikrotikInterfaces);
      const ifaceB = getInterfaceForSubscriber(b, mikrotikInterfaces);
      const totalA = (ifaceA?.rxByte || 0) + (ifaceA?.txByte || 0);
      const totalB = (ifaceB?.rxByte || 0) + (ifaceB?.txByte || 0);
      return sortOrder === 'asc' ? totalA - totalB : totalB - totalA;
    }
    return 0;
  });

  const renderSortIcon = (field: 'dueDay' | 'id' | 'name' | 'rate' | 'vlan' | 'bandwidth') => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-cyan-600 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-cyan-600 font-bold" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters Bar */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search subscriber name, ID, VLAN, MAC address..."
            className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 bg-slate-50/50"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Dropdown Filters & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
            >
              <option value="all">All Status ({subscribers.length})</option>
              <option value="active">Active ({activeSubsCount})</option>
              <option value="due">Due ({dueSubsCount})</option>
              <option value="overdue">Overdue ({overdueSubsCount})</option>
              <option value="inactive">Inactive ({inactiveSubsCount})</option>
              <option value="exclude">Exclude ({excludedSubsCount})</option>
            </select>
          </div>

          {/* VLAN Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium text-slate-500">VLAN:</span>
            <select
              value={vlanFilter}
              onChange={(e) => setVlanFilter(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
            >
              <option value="all">All VLANs ({subscribers.length})</option>
              <option value="assigned">Assigned ({assignedVlanSubsCount})</option>
              <option value="unassigned">Unassigned ({unassignedVlanSubsCount})</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium text-slate-500">{abbrMonth(CURRENT_MONTH)}:</span>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
            >
              <option value="all">All Payments</option>
              <option value="paid">Paid Only</option>
              <option value="unpaid">Unpaid Only</option>
            </select>
          </div>

          {/* Disable All Overdue VLANs Button */}
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={isDisablingOverdue}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200/90 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title="Disable all overdue subscriber VLAN interfaces in MikroTik RouterOS"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Disable Overdue VLANs</span>
              {overdueVlanSubs.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-rose-600 text-white text-[10px] font-bold rounded-full">
                  {overdueVlanSubs.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotification && (
        <div
          className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs shadow-xs animate-in fade-in slide-in-from-top-2 duration-200 ${
            actionNotification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : actionNotification.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200'
              : 'bg-cyan-50 text-cyan-900 border-cyan-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {actionNotification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
            {actionNotification.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
            {actionNotification.type === 'info' && <ShieldAlert className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />}
            <div>
              <p className="font-semibold">{actionNotification.message}</p>
              {actionNotification.details && actionNotification.details.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {actionNotification.details.map((d, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/80 rounded border border-emerald-300/60 font-mono text-[10px] text-emerald-800">
                      <span>{d.name}</span>
                      {d.vlan && <span className="font-bold">(VLAN {d.vlan})</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActionNotification(null)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th
                  onClick={() => handleSort('name')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Subscriber</span>
                    {renderSortIcon('name')}
                  </div>
                </th>
                <th className="py-3.5 px-3">Status</th>
                <th
                  onClick={() => handleSort('vlan')}
                  className="py-3.5 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors group select-none bg-indigo-50/40 text-indigo-950"
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <Network className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Assigned VLAN</span>
                    {renderSortIcon('vlan')}
                  </div>
                </th>
                <th className="py-3.5 px-3">DHCP Leases</th>
                <th
                  onClick={() => handleSort('bandwidth')}
                  className="py-3.5 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors group select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Bandwidth Usage</span>
                    {renderSortIcon('bandwidth')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dueDay')}
                  className="py-3.5 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors group select-none bg-cyan-50/50 text-cyan-950"
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <span>Due Day</span>
                    {renderSortIcon('dueDay')}
                  </div>
                </th>
                <th className="py-3.5 px-3">{abbrMonth(CURRENT_MONTH)} Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {sortedSubs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserCheck className="w-8 h-8 text-slate-300" />
                      <p className="font-medium text-slate-600 text-sm">No subscribers found</p>
                      <p className="text-xs text-slate-400">Try adjusting your search query or filter parameters.</p>
                      <button
                        type="button"
                        onClick={onAddSubscriber}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 text-white font-medium text-xs rounded-lg shadow-xs hover:bg-cyan-500 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add New Subscriber
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedSubs.map((sub) => {
                  const m = subMetricsMap[sub.id];
                  const nameStr = displayName(sub);
                  const unpaidMonths = getUnpaidMonths(sub, payments);
                  const unpaidCount = unpaidMonths.length;
                  const billingStatus = getSubscriberBillingStatus(sub, payments);
                  const subLeases = getLeasesForSubscriber(sub, dhcpLeases);

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => onSelectSubscriber(sub)}
                    >
                      {/* Name & Unpaid Badge */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <div className={`flex items-center gap-2 font-semibold transition-colors ${
                            billingStatus === 'overdue'
                              ? 'text-rose-600 group-hover:text-rose-700'
                              : billingStatus === 'due'
                              ? 'text-amber-700 group-hover:text-amber-800'
                              : 'text-slate-900 group-hover:text-cyan-600'
                          }`}>
                            <span>{nameStr}</span>
                            <a
                              href={`?sub=${sub.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded transition-all"
                              title="Open in separate tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            {unpaidCount > 0 && (
                              <span
                                className={`inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-bold border rounded-full shrink-0 ${
                                  billingStatus === 'overdue'
                                    ? 'bg-rose-100 text-rose-700 border-rose-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                                }`}
                                title={`${unpaidCount} unpaid month(s): ${unpaidMonths.join(', ')}`}
                              >
                                {unpaidCount}
                              </span>
                            )}
                          </div>
                          {sub.macAddress && (
                            <span className="text-[10px] font-mono text-cyan-700/80 bg-cyan-50/70 border border-cyan-200/50 px-1.5 py-0.5 rounded w-fit group-hover:bg-cyan-100/70 transition-colors mt-0.5 tracking-wider">
                              MAC: {sub.macAddress}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Pill (Active / Due / Overdue / Inactive / Exclude) */}
                      <td className="py-3 px-3">
                        {billingStatus === 'exclude' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wider" title="Excluded from subscriber counts, auto-disconnections, and gross revenue metrics">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                            Exclude
                          </span>
                        ) : billingStatus === 'inactive' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Inactive
                          </span>
                        ) : billingStatus === 'due' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Due
                          </span>
                        ) : billingStatus === 'overdue' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                            Active
                          </span>
                        )}
                      </td>

                      {/* VLAN Assignment Column: Clean, safe display badge (assignment managed inside Subscriber Modal) */}
                      <td className="py-3 px-3">
                        {(() => {
                          const iface = getInterfaceForSubscriber(sub, mikrotikInterfaces);
                          const isAssigned = sub.vlan !== null && sub.vlan !== undefined && Number(sub.vlan) > 0;

                          if (isAssigned) {
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono font-bold text-xs border ${
                                  iface?.disabled
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                }`}>
                                  <Network className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>VLAN {sub.vlan}</span>
                                </span>
                                {iface?.disabled ? (
                                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 uppercase">
                                    Disabled
                                  </span>
                                ) : iface?.running ? (
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Interface Active / Running" />
                                ) : null}
                              </div>
                            );
                          }

                          return (
                            <span className="text-slate-400 text-xs italic">
                              Unassigned
                            </span>
                          );
                        })()}
                      </td>

                      {/* DHCP Lease Count Only */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                            subLeases.length > 0
                              ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                              : 'bg-slate-50 text-slate-500 border border-slate-200'
                          }`}
                          title={`${subLeases.length} active lease(s)`}
                        >
                          <Wifi className="w-3 h-3 text-cyan-600" />
                          <span>{subLeases.length} {subLeases.length === 1 ? 'lease' : 'leases'}</span>
                        </span>
                      </td>

                      {/* Bandwidth Usage */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {(() => {
                          const iface = getInterfaceForSubscriber(sub, mikrotikInterfaces);
                          if (!iface || (!iface.rxByte && !iface.txByte)) {
                            return <span className="text-slate-400 font-sans">—</span>;
                          }
                          return (
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="text-teal-600 font-bold" title="Rx (Download)">
                                ↓ {formatBytes(iface.rxByte)}
                              </span>
                              <span className="text-slate-300">|</span>
                              <span className="text-cyan-600 font-bold" title="Tx (Upload)">
                                ↑ {formatBytes(iface.txByte)}
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Due Day */}
                      <td className="py-3 px-3 font-mono text-slate-700 font-semibold whitespace-nowrap">
                        {(() => {
                          const day = getSubscriberDueDay(sub);
                          return `Day ${day}`;
                        })()}
                      </td>

                      {/* Current Month Paid Status */}
                      <td className="py-3 px-3">
                        {sub.status === 'Inactive' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-500 text-xs">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">✕</span>
                            <span>Inactive</span>
                          </span>
                        ) : sub.status === 'Exclude' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-400 text-xs">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-bold">—</span>
                            <span>Excluded</span>
                          </span>
                        ) : m.paidCurrent ? (
                          <span className="inline-flex items-center gap-1 font-bold text-teal-600 text-xs">
                            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs">✓</span>
                            <span>Paid</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-rose-600 text-xs">
                            <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-bold">—</span>
                            <span>Unpaid</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>


        {/* Footer info bar */}
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            Showing <span className="font-semibold text-slate-700">{filteredSubs.length}</span> of{' '}
            <span className="font-semibold text-slate-700">{subscribers.length}</span> subscribers
          </div>
          <div className="text-[11px] text-slate-400">
            Payment column reflects <span className="font-semibold text-slate-600">{CURRENT_MONTH}</span> billing cycle • Red badge indicates missed months on record
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Disabling Overdue Subscriber VLANs */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 bg-rose-50/80 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-500 text-white rounded-xl shadow-xs shrink-0">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Disable All Overdue VLANs
                  </h3>
                  <p className="text-xs text-rose-700 mt-0.5">
                    RouterOS Automated VLAN Isolation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDisablingOverdue && setIsConfirmModalOpen(false)}
                disabled={isDisablingOverdue}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-white/60 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Confirm RouterOS Action</p>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    This action will connect to the MikroTik router and automatically disable the VLAN interface for all active subscribers who have overdue unpaid balances (inactive subscribers are excluded).
                  </p>
                </div>
              </div>

              {/* Overdue Subscriber Preview List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-600 font-semibold text-xs px-1">
                  <span>Target Overdue Subscribers ({overdueVlanSubs.length})</span>
                  <span className="text-[11px] text-slate-400 font-normal">Assigned VLANs</span>
                </div>

                {overdueVlanSubs.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                    <p className="font-semibold text-xs text-slate-700">No Overdue VLAN Subscribers</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      All subscribers with assigned VLANs are currently up to date or already settled.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-52 overflow-y-auto bg-slate-50/40">
                    {overdueVlanSubs.map((sub) => {
                      const m = subMetricsMap[sub.id];
                      return (
                        <div key={sub.id} className="p-2.5 flex items-center justify-between gap-3 text-xs hover:bg-white transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-slate-400">#{sub.id}</span>
                            <span className="font-bold text-slate-800">{displayName(sub)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {m && m.missed > 0 && (
                              <span className="text-[10px] text-rose-600 font-semibold">
                                {m.missed} mo. late
                              </span>
                            )}
                            <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 font-mono font-bold text-[10px] rounded border border-cyan-200">
                              VLAN {sub.vlan}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isDisablingOverdue}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/80 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisableAllOverdueVlans}
                disabled={isDisablingOverdue}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDisablingOverdue ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Disabling VLANs on RouterOS...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Confirm & Disable All ({overdueVlanSubs.length})</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
