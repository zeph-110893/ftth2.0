import React, { useState } from 'react';
import { Search, Plus, UserCheck, ArrowUpDown, ArrowUp, ArrowDown, Wifi } from 'lucide-react';
import { Subscriber, PaymentRecord, SubCalculatedData, MikroTikDhcpLease, MikroTikInterface } from '../types';
import { calculateSubMetrics, displayName, formatCurrency, CURRENT_MONTH, abbrMonth, TODAY, getUnpaidMonths, getSubscriberBillingStatus, getSubscriberDueDay, getLeasesForSubscriber, getInterfaceForSubscriber, formatBytes } from '../utils/billingUtils';

interface SubscribersListProps {
  subscribers: Subscriber[];
  payments: PaymentRecord[];
  dhcpLeases?: MikroTikDhcpLease[];
  mikrotikInterfaces?: MikroTikInterface[];
  onSelectSubscriber: (sub: Subscriber) => void;
  onRecordPaymentForSub: (sub: Subscriber) => void;
  onAddSubscriber: () => void;
}

export const SubscribersList: React.FC<SubscribersListProps> = ({
  subscribers,
  payments,
  dhcpLeases = [],
  mikrotikInterfaces = [],
  onSelectSubscriber,
  onRecordPaymentForSub,
  onAddSubscriber,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'due' | 'overdue' | 'inactive' | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [sortField, setSortField] = useState<'dueDay' | 'id' | 'name' | 'rate'>('dueDay');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'dueDay' | 'id' | 'name' | 'rate') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
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

    if (paymentFilter === 'paid' && unpaidCount > 0) return false;
    if (paymentFilter === 'unpaid' && unpaidCount === 0) return false;

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
    return 0;
  });

  const renderSortIcon = (field: 'dueDay' | 'id' | 'name' | 'rate') => {
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

        {/* Dropdown Filters */}
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
        </div>
      </div>

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
                <th className="py-3.5 px-3">DHCP Leases</th>
                <th className="py-3.5 px-3">Bandwidth Usage</th>
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
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserCheck className="w-8 h-8 text-slate-300" />
                      <p className="font-medium text-slate-600 text-sm">No subscribers found</p>
                      <p className="text-xs text-slate-400">Try adjusting your search query or filter parameters.</p>
                      <button
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

                      {/* Status Pill (Active / Due / Overdue / Inactive) */}
                      <td className="py-3 px-3">
                        {billingStatus === 'inactive' ? (
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
                        {m.paidCurrent ? (
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
    </div>
  );
};
