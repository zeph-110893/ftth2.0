import React, { useState, useEffect } from 'react';
import { X, Trash2, History, CheckCircle2, Edit2, Wifi, Server, Network, Power, Loader2, AlertTriangle, Shield, Eye, ChevronDown, Check } from 'lucide-react';
import { Subscriber, PaymentRecord, AccountStatus, MikroTikDhcpLease, MikroTikInterface, AuthUser } from '../types';
import {
  calculateSubMetrics,
  displayName,
  formatCurrency,
  getUnpaidMonths,
  TODAY,
  formatDueDate,
  getLeasesForSubscriber,
  parseDateSafe,
  getSubscriberDueDay,
  getUnassignedVlans,
  getInterfaceForSubscriber,
} from '../utils/billingUtils';
import { authFetch, canWrite } from '../utils/auth';

interface SubscriberDetailModalProps {
  subscriber: Subscriber | null;
  subscribers?: Subscriber[];
  payments: PaymentRecord[];
  dhcpLeases?: MikroTikDhcpLease[];
  mikrotikInterfaces?: MikroTikInterface[];
  currentUser?: AuthUser | null;
  onClose: () => void;
  onUpdateSubscriber: (updated: Subscriber) => void;
  onDeleteSubscriber: (subId: number) => void;
  onDeleteDhcpLease?: (leaseId: string, macAddress?: string) => Promise<boolean>;
  onAddPayment: (payment: PaymentRecord) => void;
  onDeletePayment: (ts: string, subId: number, month: string) => void;
  onOpenEditModal: (sub: Subscriber) => void;
}

export const SubscriberDetailModal: React.FC<SubscriberDetailModalProps> = ({
  subscriber,
  subscribers = [],
  payments,
  dhcpLeases = [],
  mikrotikInterfaces = [],
  currentUser,
  onClose,
  onUpdateSubscriber,
  onDeleteSubscriber,
  onDeleteDhcpLease,
  onAddPayment,
  onDeletePayment,
  onOpenEditModal,
}) => {
  const isReadOnly = !canWrite(currentUser);

  const [selectedUnpaid, setSelectedUnpaid] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // State for VLAN Assignment & inline editing
  const [isEditingVlan, setIsEditingVlan] = useState(false);
  const [vlanSelectValue, setVlanSelectValue] = useState<string>('');
  const [customVlanInput, setCustomVlanInput] = useState<string>('');
  const [isCustomVlan, setIsCustomVlan] = useState<boolean>(false);
  const [isSavingVlan, setIsSavingVlan] = useState(false);
  const [vlanAssignMsg, setVlanAssignMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);

  // State for VLAN Interface Toggle
  const [isVlanEnabled, setIsVlanEnabled] = useState<boolean>(true);
  const [isTogglingVlan, setIsTogglingVlan] = useState<boolean>(false);
  const [vlanToggleMsg, setVlanToggleMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState<boolean>(false);

  // State for DHCP lease deletion
  const [leaseToDelete, setLeaseToDelete] = useState<MikroTikDhcpLease | null>(null);
  const [isDeletingLease, setIsDeletingLease] = useState<boolean>(false);
  const [leaseDeleteMsg, setLeaseDeleteMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // State for inline editing RATE
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('600');

  // State for inline editing MAC Address
  const [isEditingMac, setIsEditingMac] = useState(false);
  const [macInput, setMacInput] = useState('');

  // State for inline editing NAME
  const [isEditingName, setIsEditingName] = useState(false);
  const [lastInput, setLastInput] = useState('');
  const [firstInput, setFirstInput] = useState('');

  // State for inline editing DUE DATE (Full Month Date picker & Day of Month)
  const [isEditingDue, setIsEditingDue] = useState(false);
  const [dueDayInput, setDueDayInput] = useState('');
  const [dueRawInput, setDueRawInput] = useState('');

  // Synchronize inputs whenever subscriber changes
  useEffect(() => {
    if (!subscriber) return;
    setIsVlanEnabled(subscriber.status !== 'Inactive');
    setRateInput(String(subscriber.rate || 600));
    setMacInput(subscriber.macAddress || '');
    setLastInput(subscriber.last || '');
    setFirstInput(subscriber.first || '');
    setDueDayInput(subscriber.dueDay ? String(subscriber.dueDay) : '');
    setDueRawInput('');
    setVlanSelectValue(subscriber.vlan !== null && subscriber.vlan !== undefined ? String(subscriber.vlan) : '');
    setCustomVlanInput('');
    setIsCustomVlan(false);
    setIsEditingVlan(false);
    setShowUnassignConfirm(false);
    setVlanAssignMsg(null);
    setIsEditingRate(false);
    setIsEditingMac(false);
    setIsEditingName(false);
    setIsEditingDue(false);
    setSelectedUnpaid([]);
    setVlanToggleMsg(null);
    setLeaseDeleteMsg(null);
  }, [subscriber?.id, subscriber?.vlan, subscriber?.rate, subscriber?.status, subscriber?.macAddress]);

  const handleDeleteLeaseConfirm = async () => {
    if (!leaseToDelete || isReadOnly) return;
    setIsDeletingLease(true);
    setLeaseDeleteMsg(null);

    const targetId = leaseToDelete.id || '';
    const targetMac = leaseToDelete.macAddress || '';

    let success = false;
    if (onDeleteDhcpLease) {
      success = await onDeleteDhcpLease(targetId, targetMac);
    } else {
      try {
        const res = await fetch('/api/mikrotik/delete-lease', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leaseId: targetId, macAddress: targetMac }),
        });
        const data = await res.json();
        success = data.success;
      } catch (err) {
        success = false;
      }
    }

    setIsDeletingLease(false);
    if (success) {
      setLeaseDeleteMsg({
        text: `DHCP lease ${leaseToDelete.hostName ? `'${leaseToDelete.hostName}' ` : ''}(${leaseToDelete.address}) deleted successfully.`,
      });
      setLeaseToDelete(null);
    } else {
      setLeaseDeleteMsg({
        text: `Failed to delete lease ${leaseToDelete.address}. Check router connection.`,
        isError: true,
      });
      setLeaseToDelete(null);
    }
  };

  // Fetch live interface status from RouterOS when modal opens or subscriber.vlan changes
  useEffect(() => {
    let isMounted = true;
    if (subscriber && subscriber.vlan !== null && subscriber.vlan !== undefined) {
      authFetch('/api/mikrotik/interfaces')
        .then((res) => res.json())
        .then((data) => {
          if (isMounted && data.success && Array.isArray(data.interfaces)) {
            const vlanStr = String(subscriber.vlan);
            const found = data.interfaces.find((i: any) => {
              const nameLower = (i.name || '').toLowerCase();
              return (
                nameLower === `vlan-${vlanStr}`.toLowerCase() ||
                nameLower === `vlan${vlanStr}`.toLowerCase() ||
                String(i.vlanId) === vlanStr
              );
            });
            if (found) {
              setIsVlanEnabled(!found.disabled);
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [subscriber?.vlan, subscriber?.id]);

  const handleToggleVlanInterface = async (enable: boolean) => {
    if (isReadOnly) return;
    if (!subscriber || subscriber.vlan === null || subscriber.vlan === undefined) {
      alert('Subscriber does not have a VLAN ID assigned. Please set a VLAN ID first.');
      return;
    }
    setIsTogglingVlan(true);
    setVlanToggleMsg(null);
    try {
      const res = await authFetch('/api/mikrotik/toggle-vlan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlan: subscriber.vlan, disable: !enable }),
      });
      const data = await res.json();
      if (data.success) {
        setIsVlanEnabled(enable);
        setVlanToggleMsg({
          text: data.message || `Interface VLAN-${subscriber.vlan} is now ${enable ? 'ENABLED' : 'DISABLED'} on RouterOS`,
          isError: false,
        });
      } else {
        setVlanToggleMsg({
          text: data.error || `Failed to toggle interface VLAN-${subscriber.vlan}`,
          isError: true,
        });
      }
    } catch (err: any) {
      setVlanToggleMsg({
        text: 'Error connecting to RouterOS server: ' + err.message,
        isError: true,
      });
    } finally {
      setIsTogglingVlan(false);
    }
  };

  const handleSaveVlanAssignment = async (targetVlanNum: number | null) => {
    if (isReadOnly || !subscriber) return;
    setIsSavingVlan(true);
    setVlanAssignMsg(null);

    try {
      // 1. Enforce 1 subscriber per VLAN: unassign any other subscriber currently on this targetVlan
      if (targetVlanNum !== null && targetVlanNum > 0 && Array.isArray(subscribers)) {
        const existingSubsOnVlan = subscribers.filter(
          (s) => s.id !== subscriber.id && s.vlan !== null && s.vlan !== undefined && Number(s.vlan) === Number(targetVlanNum)
        );
        for (const existingSub of existingSubsOnVlan) {
          await authFetch('/api/subscribers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...existingSub, vlan: null }),
          });
        }
      }

      // 2. Save subscriber with new VLAN assignment
      const updatedSub: Subscriber = {
        ...subscriber,
        vlan: targetVlanNum !== null && targetVlanNum > 0 ? targetVlanNum : null,
      };

      onUpdateSubscriber(updatedSub);
      setIsEditingVlan(false);
      setShowUnassignConfirm(false);
      setVlanAssignMsg({
        text: targetVlanNum !== null && targetVlanNum > 0
          ? `Assigned VLAN ${targetVlanNum} to ${displayName(subscriber)} and synced with MikroTik RouterOS.`
          : `Unassigned VLAN from ${displayName(subscriber)}.`,
        isError: false,
      });
    } catch (err: any) {
      setVlanAssignMsg({
        text: err.message || 'Failed to save VLAN assignment.',
        isError: true,
      });
    } finally {
      setIsSavingVlan(false);
    }
  };

  if (!subscriber) return null;

  const metrics = calculateSubMetrics(subscriber, payments);
  const unpaidMonths = getUnpaidMonths(subscriber, payments);
  const nameStr = displayName(subscriber);
  const subLeases = getLeasesForSubscriber(subscriber, dhcpLeases);
  const unassignedVlans = getUnassignedVlans(subscribers, mikrotikInterfaces, subscriber.vlan);
  const matchedIface = getInterfaceForSubscriber(subscriber, mikrotikInterfaces);

  const getInitialDueDateForSub = (sub: Subscriber): string => {
    if (sub.dueRaw) {
      const d = parseDateSafe(sub.dueRaw);
      if (d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
    const day = getSubscriberDueDay(sub);
    const y = TODAY.year;
    const m = String(TODAY.monthIdx + 1).padStart(2, '0');
    const d = String(Math.min(day, 31)).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Calculate total amount paid by subscriber
  const totalPaidAmount = payments
    .filter((p) => p.sub === subscriber.id)
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  // Helper to format "July 2026" -> "Jul 2026"
  const formatMonthShort = (mStr: string) => {
    const parts = mStr.split(' ');
    if (parts.length < 2) return mStr;
    return `${parts[0].slice(0, 3)} ${parts[1]}`;
  };

  const handleToggleSelectAll = () => {
    if (selectedUnpaid.length === unpaidMonths.length) {
      setSelectedUnpaid([]);
    } else {
      setSelectedUnpaid([...unpaidMonths]);
    }
  };

  const handleToggleMonth = (mStr: string) => {
    if (selectedUnpaid.includes(mStr)) {
      setSelectedUnpaid(selectedUnpaid.filter((m) => m !== mStr));
    } else {
      setSelectedUnpaid([...selectedUnpaid, mStr]);
    }
  };

  const handleMarkPaid = () => {
    if (selectedUnpaid.length === 0) return;

    selectedUnpaid.forEach((mStr) => {
      const newRecord: PaymentRecord = {
        sub: subscriber.id,
        month: mStr,
        amount: subscriber.rate || 600,
        ts: new Date().toLocaleString(),
      };
      onAddPayment(newRecord);
    });

    setSelectedUnpaid([]);
  };

  const handleSingleMonthPay = (mStr: string) => {
    if (isReadOnly) return;
    const newRecord: PaymentRecord = {
      sub: subscriber.id,
      month: mStr,
      amount: subscriber.rate || 600,
      ts: new Date().toLocaleString(),
    };
    onAddPayment(newRecord);
    setSelectedUnpaid((prev) => prev.filter((m) => m !== mStr));
  };

  const handleSaveRate = () => {
    const parsed = parseFloat(rateInput.trim());
    if (!isNaN(parsed) && parsed >= 0) {
      onUpdateSubscriber({ ...subscriber, rate: parsed });
    }
    setIsEditingRate(false);
  };

  const handleSaveMac = () => {
    const mTrim = macInput.trim().toUpperCase();
    onUpdateSubscriber({
      ...subscriber,
      macAddress: mTrim || undefined,
    });
    setIsEditingMac(false);
  };

  const handleSaveName = () => {
    const lTrim = lastInput.trim();
    const fTrim = firstInput.trim();
    if (lTrim || fTrim) {
      onUpdateSubscriber({
        ...subscriber,
        last: lTrim,
        first: fTrim,
      });
    }
    setIsEditingName(false);
  };

  const handleSaveDue = () => {
    let finalDueRaw = dueRawInput.trim();
    let finalDueDay: number | null = null;

    if (finalDueRaw) {
      const parsed = parseDateSafe(finalDueRaw);
      if (parsed) {
        finalDueDay = parsed.getDate();
      }
    } else if (dueDayInput) {
      const dayNum = parseInt(dueDayInput.trim(), 10);
      if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
        finalDueDay = dayNum;
        const y = TODAY.year;
        const m = String(TODAY.monthIdx + 1).padStart(2, '0');
        const d = String(dayNum).padStart(2, '0');
        finalDueRaw = `${y}-${m}-${d}`;
      }
    }

    onUpdateSubscriber({
      ...subscriber,
      dueRaw: finalDueRaw || undefined,
      dueDay: finalDueDay ?? subscriber.dueDay,
    });
    setIsEditingDue(false);
  };

  const handleStatusChange = (newStatus: AccountStatus) => {
    onUpdateSubscriber({ ...subscriber, status: newStatus });
  };

  const dueDateDisplay = formatDueDate(subscriber);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with Updatable Status */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-white">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">{nameStr}</h2>
            
            {/* Updatable Status Select */}
            <div className="flex flex-wrap items-center gap-3 mt-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status:</span>
                {isReadOnly ? (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      subscriber.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {subscriber.status || 'Active'}
                  </span>
                ) : (
                  <select
                    value={subscriber.status || 'Active'}
                    onChange={(e) => handleStatusChange(e.target.value as AccountStatus)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border cursor-pointer focus:outline-none transition-colors ${
                      subscriber.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">VLAN:</span>
                {subscriber.vlan ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                    VLAN-{subscriber.vlan}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                    Unassigned
                  </span>
                )}

                {subscriber.vlan && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1.5 ${
                      isVlanEnabled
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                    title={`Interface VLAN-${subscriber.vlan} is currently ${isVlanEnabled ? 'ENABLED' : 'DISABLED'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isVlanEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                    <span>{isVlanEnabled ? 'ENABLED' : 'DISABLED'}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Read-Only Notice Banner if user has R permission */}
          {isReadOnly && (
            <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-slate-600 flex items-center gap-2.5 text-xs">
              <Eye className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                <span className="font-bold text-slate-800">Read-Only Mode:</span>{' '}
                <span>You have viewing access. Adding payments, editing profile, and network controls are restricted.</span>
              </div>
            </div>
          )}

          {/* Info Cards Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Card 1: NAME (Editable) */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NAME</span>
                {!isReadOnly && !isEditingName && (
                  <button
                    onClick={() => {
                      setLastInput(subscriber.last || '');
                      setFirstInput(subscriber.first || '');
                      setIsEditingName(true);
                    }}
                    className="text-[10px] font-semibold text-cyan-600 hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {!isReadOnly && isEditingName ? (
                <div className="space-y-1.5">
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      value={lastInput}
                      onChange={(e) => setLastInput(e.target.value)}
                      placeholder="Last Name"
                      className="w-full text-xs font-bold text-slate-900 bg-white border border-cyan-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={firstInput}
                      onChange={(e) => setFirstInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') setIsEditingName(false);
                      }}
                      placeholder="First Name"
                      className="w-full text-xs font-bold text-slate-900 bg-white border border-cyan-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setIsEditingName(false)}
                      className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded hover:bg-slate-300 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveName}
                      className="px-2 py-0.5 bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] font-bold rounded transition-colors cursor-pointer shrink-0"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => {
                    if (isReadOnly) return;
                    setLastInput(subscriber.last || '');
                    setFirstInput(subscriber.first || '');
                    setIsEditingName(true);
                  }}
                  className={`text-xs font-bold text-slate-900 truncate ${isReadOnly ? '' : 'cursor-pointer hover:text-cyan-600'} transition-colors`}
                  title={isReadOnly ? undefined : 'Click to edit name'}
                >
                  {nameStr}
                </div>
              )}
            </div>

            {/* Card 2: MONTHLY RATE (Editable) */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">MONTHLY RATE</span>
                {!isReadOnly && !isEditingRate && (
                  <button
                    onClick={() => {
                      setRateInput(String(subscriber.rate || 600));
                      setIsEditingRate(true);
                    }}
                    className="text-[10px] font-semibold text-cyan-600 hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {!isReadOnly && isEditingRate ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRate();
                      if (e.key === 'Escape') setIsEditingRate(false);
                    }}
                    placeholder="600"
                    className="w-full text-xs font-bold text-slate-900 bg-white border border-cyan-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveRate}
                    className="px-2 py-0.5 bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] font-bold rounded transition-colors cursor-pointer shrink-0"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => {
                    if (isReadOnly) return;
                    setRateInput(String(subscriber.rate || 600));
                    setIsEditingRate(true);
                  }}
                  className={`text-xs font-bold text-slate-900 font-mono ${isReadOnly ? '' : 'cursor-pointer hover:text-cyan-600'} transition-colors`}
                  title={isReadOnly ? undefined : 'Click to edit Monthly Rate'}
                >
                  {formatCurrency(subscriber.rate)}
                </div>
              )}
            </div>

            {/* Card 3: DUE DATE (Editable - Full Month Date / Day Picker) */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DUE DATE</span>
                {!isReadOnly && !isEditingDue && (
                  <button
                    onClick={() => {
                      setDueDayInput(String(getSubscriberDueDay(subscriber)));
                      setDueRawInput(getInitialDueDateForSub(subscriber));
                      setIsEditingDue(true);
                    }}
                    className="text-[10px] font-semibold text-cyan-600 hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {!isReadOnly && isEditingDue ? (
                <div className="space-y-2 mt-1">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Due Date:</label>
                    <input
                      type="date"
                      value={dueRawInput}
                      onChange={(e) => {
                        setDueRawInput(e.target.value);
                        const d = parseDateSafe(e.target.value);
                        if (d) setDueDayInput(String(d.getDate()));
                      }}
                      className="w-full text-xs font-bold text-slate-900 bg-white border border-cyan-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>

                  <div className="flex justify-end gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingDue(false)}
                      className="px-2 py-1 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-md hover:bg-slate-300 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDue}
                      className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] font-bold rounded-md transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => {
                    if (isReadOnly) return;
                    setDueDayInput(String(getSubscriberDueDay(subscriber)));
                    setDueRawInput(getInitialDueDateForSub(subscriber));
                    setIsEditingDue(true);
                  }}
                  className={`text-xs font-bold text-slate-900 font-mono ${isReadOnly ? '' : 'cursor-pointer hover:text-cyan-600'} transition-colors`}
                  title={isReadOnly ? undefined : 'Click to edit Due Date'}
                >
                  {dueDateDisplay}
                </div>
              )}
            </div>

            {/* Card 4: ACCOUNT STATUS / CREATED DATE */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ACCOUNT STATUS</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                    subscriber.status === 'Active'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {subscriber.status || 'Active'}
                </span>
                <span className="text-[10px] text-slate-400">
                  ID #{subscriber.id}
                </span>
              </div>
            </div>

            {/* Card 5: ONU / ROUTER MAC ADDRESS (Editable) */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 col-span-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Wifi className="w-3 h-3 text-cyan-600" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ONU / ROUTER MAC ADDRESS</span>
                </div>
                {!isReadOnly && !isEditingMac && (
                  <button
                    onClick={() => {
                      setMacInput(subscriber.macAddress || '');
                      setIsEditingMac(true);
                    }}
                    className="text-[10px] font-semibold text-cyan-600 hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                    <span>{subscriber.macAddress ? 'Edit MAC' : 'Add MAC'}</span>
                  </button>
                )}
              </div>

              {!isReadOnly && isEditingMac ? (
                <div className="space-y-1.5 mt-1">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={macInput}
                      onChange={(e) => setMacInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveMac();
                        if (e.key === 'Escape') setIsEditingMac(false);
                      }}
                      placeholder="e.g. 48:8F:5A:12:34:56"
                      className="w-full text-xs font-mono font-bold text-slate-900 bg-white border border-cyan-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 uppercase tracking-wider"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveMac}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditingMac(false)}
                      className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    Enter the ONU's MAC address in standard colon-separated format (e.g., 48:8F:5A:XX:XX:XX).
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-0.5">
                  {subscriber.macAddress ? (
                    <div
                      onClick={() => {
                        if (isReadOnly) return;
                        setMacInput(subscriber.macAddress || '');
                        setIsEditingMac(true);
                      }}
                      className={`text-xs font-mono font-bold text-cyan-800 bg-cyan-50 border border-cyan-200/80 px-2 py-0.5 rounded ${isReadOnly ? '' : 'cursor-pointer hover:bg-cyan-100'} transition-colors tracking-wider inline-flex items-center gap-1.5`}
                      title={isReadOnly ? undefined : 'Click to edit ONU MAC Address'}
                    >
                      <span>{subscriber.macAddress}</span>
                    </div>
                  ) : (
                    !isReadOnly ? (
                      <button
                        onClick={() => {
                          setMacInput('');
                          setIsEditingMac(true);
                        }}
                        className="text-xs text-slate-400 italic hover:text-cyan-600 cursor-pointer text-left"
                      >
                        + No ONU MAC address specified (Click to add)
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No ONU MAC address specified</span>
                    )
                  )}
                  {subscriber.macAddress && (
                    <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Configured
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Card 6: TOTAL AMOUNT PAID */}
            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3 col-span-2">
              <div className="text-[10px] font-bold text-emerald-700/80 uppercase tracking-wider mb-1">TOTAL AMOUNT PAID</div>
              <div className="text-sm font-extrabold text-emerald-700 font-mono">{formatCurrency(totalPaidAmount)}</div>
            </div>
          </div>

          {/* Section: VLAN ASSIGNMENT & ROUTEROS INTERFACE CONTROL */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800 space-y-3.5">
            {/* Header with Title & Edit / Assign VLAN button */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  <Network className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      VLAN Assignment
                    </span>
                    {subscriber.vlan !== null && subscriber.vlan !== undefined && Number(subscriber.vlan) > 0 ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                        VLAN-{subscriber.vlan}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        Unassigned
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {subscriber.vlan !== null && subscriber.vlan !== undefined && Number(subscriber.vlan) > 0
                      ? `Subnet: 172.16.${subscriber.vlan}.0/24 ${matchedIface?.name ? `• Interface: ${matchedIface.name}` : ''}`
                      : 'No RouterOS VLAN mapped to this subscriber.'}
                  </div>
                </div>
              </div>

              {!isReadOnly && !isEditingVlan && (
                <button
                  type="button"
                  onClick={() => {
                    setVlanSelectValue(subscriber.vlan ? String(subscriber.vlan) : '');
                    setCustomVlanInput('');
                    setIsCustomVlan(false);
                    setIsEditingVlan(true);
                    setShowUnassignConfirm(false);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    subscriber.vlan
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs'
                  }`}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{subscriber.vlan ? 'Change VLAN' : 'Assign VLAN'}</span>
                </button>
              )}
            </div>

            {/* Inline VLAN Assignment Form (when isEditingVlan is true) */}
            {!isReadOnly && isEditingVlan && (
              <div className="bg-slate-950/80 rounded-xl p-3.5 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    {subscriber.vlan ? `Reassign VLAN for ${displayName(subscriber)}` : `Assign VLAN to ${displayName(subscriber)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingVlan(false);
                      setShowUnassignConfirm(false);
                    }}
                    className="text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {!showUnassignConfirm ? (
                  <div className="space-y-2.5">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-400">
                        Select Available Unassigned VLAN:
                      </label>
                      <div className="relative">
                        <select
                          value={isCustomVlan ? 'custom' : vlanSelectValue}
                          onChange={(e) => {
                            if (e.target.value === 'custom') {
                              setIsCustomVlan(true);
                            } else {
                              setIsCustomVlan(false);
                              setVlanSelectValue(e.target.value);
                            }
                          }}
                          className="w-full text-xs font-semibold py-2 pl-3 pr-8 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 appearance-none cursor-pointer"
                        >
                          <option value="" disabled>-- Select an available VLAN --</option>
                          {unassignedVlans.map((opt) => (
                            <option key={opt.vlanId} value={String(opt.vlanId)}>
                              VLAN {opt.vlanId} {opt.interfaceName ? `(${opt.interfaceName})` : ''} {opt.isCurrent ? '— (Currently Assigned)' : '— (Free)'}
                            </option>
                          ))}
                          <option value="custom">✏️ Enter Custom VLAN ID manually...</option>
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    {isCustomVlan && (
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-400">
                          Custom VLAN ID (1 - 4094):
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="4094"
                          value={customVlanInput}
                          onChange={(e) => setCustomVlanInput(e.target.value)}
                          placeholder="e.g. 105"
                          className="w-full text-xs font-mono font-bold py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          autoFocus
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {subscriber.vlan ? (
                        <button
                          type="button"
                          onClick={() => setShowUnassignConfirm(true)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-colors cursor-pointer"
                        >
                          Unassign VLAN
                        </button>
                      ) : <div />}

                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingVlan(false);
                            setShowUnassignConfirm(false);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isSavingVlan || (!isCustomVlan && !vlanSelectValue) || (isCustomVlan && !customVlanInput)}
                          onClick={() => {
                            const target = isCustomVlan ? parseInt(customVlanInput.trim(), 10) : parseInt(vlanSelectValue, 10);
                            if (!isNaN(target) && target > 0) {
                              handleSaveVlanAssignment(target);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                        >
                          {isSavingVlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Save Assignment</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-rose-200">
                        <p className="font-bold">Confirm Unassigning VLAN {subscriber.vlan}?</p>
                        <p className="text-[11px] text-rose-300/80 mt-0.5">
                          This will disconnect the subscriber from VLAN {subscriber.vlan} on MikroTik RouterOS and remove interface comment synchronization.
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowUnassignConfirm(false)}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                      >
                        Keep VLAN
                      </button>
                      <button
                        type="button"
                        disabled={isSavingVlan}
                        onClick={() => handleSaveVlanAssignment(null)}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded cursor-pointer disabled:opacity-50"
                      >
                        {isSavingVlan ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        <span>Confirm Unassign</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VLAN Assignment Feedback Notification */}
            {vlanAssignMsg && (
              <div
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-all ${
                  vlanAssignMsg.isError
                    ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                }`}
              >
                <span>{vlanAssignMsg.text}</span>
                <button
                  onClick={() => setVlanAssignMsg(null)}
                  className="text-slate-400 hover:text-white cursor-pointer ml-2 text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            {/* RouterOS Interface Power Switch Toggle (When VLAN is assigned) */}
            {subscriber.vlan !== null && subscriber.vlan !== undefined && Number(subscriber.vlan) > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    RouterOS Port State:
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
                      isVlanEnabled
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isVlanEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                    {isVlanEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>

                {/* Toggle Switch Button */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">
                    {isVlanEnabled ? 'Disable VLAN' : 'Enable VLAN'}
                  </span>
                  <button
                    type="button"
                    disabled={isTogglingVlan || isReadOnly}
                    onClick={() => {
                      if (isReadOnly) return;
                      if (isVlanEnabled) {
                        setShowDisableConfirm(true);
                      } else {
                        handleToggleVlanInterface(true);
                      }
                    }}
                    className={`relative inline-flex h-7 w-14 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      isVlanEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                    } ${isTogglingVlan || isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    title={isReadOnly ? 'Read-only account permission' : `Click to ${isVlanEnabled ? 'Disable' : 'Enable'} VLAN-${subscriber.vlan} interface on RouterOS`}
                  >
                    <span className="sr-only">Toggle VLAN Interface</span>
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                        isVlanEnabled ? 'translate-x-7' : 'translate-x-0'
                      }`}
                    >
                      {isTogglingVlan ? (
                        <Loader2 className="w-3.5 h-3.5 text-slate-700 animate-spin" />
                      ) : isVlanEnabled ? (
                        <Power className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Power className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Toggle status message */}
            {vlanToggleMsg && (
              <div
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-all ${
                  vlanToggleMsg.isError
                    ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                }`}
              >
                <span>{vlanToggleMsg.text}</span>
                <button
                  onClick={() => setVlanToggleMsg(null)}
                  className="text-slate-400 hover:text-white cursor-pointer ml-2 text-xs"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Section: CONNECTED DHCP LEASES ON VLAN */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-cyan-600" />
                  DHCP LEASES (VLAN {subscriber.vlan || 'N/A'})
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  subLeases.length > 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {subLeases.length} {subLeases.length === 1 ? 'device' : 'devices'}
              </span>
            </div>

            {/* Lease Delete Banner Message */}
            {leaseDeleteMsg && (
              <div
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-all ${
                  leaseDeleteMsg.isError
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                <span>{leaseDeleteMsg.text}</span>
                <button
                  onClick={() => setLeaseDeleteMsg(null)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer ml-2 text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              {/* Mobile Card List View (visible on small screens) */}
              <div className="block sm:hidden divide-y divide-slate-100">
                {subLeases.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 bg-slate-50/20">
                    <p className="font-semibold text-slate-600 text-xs">No active DHCP leases detected</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {subscriber.vlan
                        ? `No active leases found on VLAN ${subscriber.vlan}.`
                        : 'Assign a VLAN ID to discover connected leases.'}
                    </p>
                  </div>
                ) : (
                  subLeases.map((lease, idx) => (
                    <div key={lease.id || lease.macAddress ? `mob-${lease.id || lease.macAddress}` : `mob-lease-${idx}`} className="p-3 space-y-1.5 hover:bg-slate-50/80 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-indigo-700 text-xs">{lease.address}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                              lease.status === 'bound'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${lease.status === 'bound' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {lease.status || 'bound'}
                          </span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => setLeaseToDelete(lease)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title={`Delete DHCP lease device (${lease.hostName || lease.address})`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-800 font-semibold truncate">{lease.hostName || '—'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop / Tablet Table View (hidden on mobile, visible on sm and above) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                      <th className="py-2 px-3">IP ADDRESS</th>
                      <th className="py-2 px-3">HOST / DEVICE NAME</th>
                      <th className="py-2 px-3 text-center">STATUS</th>
                      {!isReadOnly && <th className="py-2 px-3 text-right">ACTION</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium">
                    {subLeases.length === 0 ? (
                      <tr>
                        <td colSpan={isReadOnly ? 3 : 4} className="py-5 text-center text-slate-400 bg-slate-50/20">
                          <p className="font-semibold text-slate-600 text-xs">No active DHCP leases detected</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {subscriber.vlan
                              ? `No active leases found on VLAN ${subscriber.vlan}.`
                              : 'Assign a VLAN ID to discover connected leases.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      subLeases.map((lease, idx) => (
                        <tr key={lease.id || lease.macAddress ? `dt-${lease.id || lease.macAddress}` : `dt-lease-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-3 font-mono font-bold text-cyan-700 whitespace-nowrap">{lease.address}</td>
                          <td className="py-2 px-3 text-slate-800 font-semibold">{lease.hostName || '—'}</td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                lease.status === 'bound'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${lease.status === 'bound' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              {lease.status || 'bound'}
                            </span>
                          </td>
                          {!isReadOnly && (
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setLeaseToDelete(lease)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold"
                                title={`Delete DHCP lease device (${lease.hostName || lease.address})`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="sr-only sm:not-sr-only text-[10px]">Delete</span>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section: UNPAID MONTHS */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                UNPAID MONTHS
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                {unpaidMonths.length} total
              </span>
            </div>

            {/* Unpaid Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2 px-3.5 w-10">
                      <input
                        type="checkbox"
                        checked={unpaidMonths.length > 0 && selectedUnpaid.length === unpaidMonths.length}
                        onChange={handleToggleSelectAll}
                        disabled={unpaidMonths.length === 0 || isReadOnly}
                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </th>
                    <th className="py-2 px-3 text-center sm:text-left">MONTH</th>
                    <th className="py-2 px-3.5 text-right">ACTION / STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {unpaidMonths.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-400 bg-slate-50/30">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                        <span className="font-semibold text-slate-700">All months are fully paid!</span>
                      </td>
                    </tr>
                  ) : (
                    unpaidMonths.map((mStr) => {
                      const isChecked = selectedUnpaid.includes(mStr);
                      return (
                        <tr
                          key={mStr}
                          onClick={() => {
                            if (!isReadOnly) handleToggleMonth(mStr);
                          }}
                          className={`${isReadOnly ? '' : 'hover:bg-slate-50/80 cursor-pointer'} transition-colors`}
                        >
                          <td className="py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isReadOnly}
                              onChange={() => handleToggleMonth(mStr)}
                              className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 text-center sm:text-left">
                            <div className="flex items-center gap-2">
                              <span>{formatMonthShort(mStr)}</span>
                              <span className="text-[11px] text-slate-400 font-normal">
                                ({formatCurrency(subscriber.rate || 600)})
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                UNPAID
                              </span>

                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => handleSingleMonthPay(mStr)}
                                  className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-[11px] rounded-md transition-colors cursor-pointer shadow-2xs"
                                  title={`Record payment for ${mStr}`}
                                >
                                  Pay
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Toggle for Payment History */}
          <div className="pt-1 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="inline-flex items-center gap-1 font-medium hover:text-slate-800 transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>{showHistory ? 'Hide' : 'View'} Paid History ({metrics.entries.length})</span>
            </button>

            {!isReadOnly && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenEditModal(subscriber);
                  }}
                  className="hover:text-slate-800 font-medium transition-colors cursor-pointer"
                >
                  Edit All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete subscriber ${nameStr}?`)) {
                      onDeleteSubscriber(subscriber.id);
                      onClose();
                    }
                  }}
                  className="text-rose-500 hover:text-rose-700 font-medium transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Payment History */}
          {showHistory && (
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-200">
                    <th className="py-2 px-3">Paid Month</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    {!isReadOnly && <th className="py-2 px-3 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.entries.length === 0 ? (
                    <tr>
                      <td colSpan={isReadOnly ? 2 : 3} className="py-4 text-center text-slate-400">
                        No recorded payments
                      </td>
                    </tr>
                  ) : (
                    metrics.entries.map((entry, idx) => (
                      <tr key={entry.ts || `${entry.month}-${idx}`} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-800">{entry.month}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                          {formatCurrency(entry.amount)}
                        </td>
                        {!isReadOnly && (
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => onDeletePayment(entry.ts, subscriber.id, entry.month)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Delete record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="bg-slate-50/80 px-5 py-3.5 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            {isReadOnly
              ? 'Read-only account permission'
              : selectedUnpaid.length > 0
              ? `${selectedUnpaid.length} month(s) selected (${formatCurrency(selectedUnpaid.length * (subscriber.rate || 600))})`
              : 'Select months or use 1-click Pay above'}
          </span>

          <button
            onClick={handleMarkPaid}
            disabled={selectedUnpaid.length === 0 || isReadOnly}
            title={isReadOnly ? 'Read-only account permission: cannot record payments' : undefined}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              isReadOnly
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : selectedUnpaid.length > 0
                ? 'bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white shadow-xs cursor-pointer'
                : 'bg-cyan-300/60 text-white cursor-not-allowed'
            }`}
          >
            {selectedUnpaid.length > 0
              ? `Mark Paid (${formatCurrency(selectedUnpaid.length * (subscriber.rate || 600))})`
              : 'Mark Paid'}
          </button>
        </div>
        {/* Disable Confirmation Modal */}
        {showDisableConfirm && (
          <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in duration-150">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-2.5 rounded-full bg-rose-100 border border-rose-200">
                  <AlertTriangle className="w-6 h-6 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Disable VLAN-{subscriber.vlan} Interface?</h3>
                  <p className="text-xs text-slate-500 mt-0.5">RouterOS Interface Control</p>
                </div>
              </div>

              <p className="text-xs font-medium text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
                Disabling <strong className="text-slate-900">VLAN-{subscriber.vlan}</strong> will immediately suspend internet access and local network connectivity for <strong className="text-slate-900">{nameStr}</strong> (Subnet 172.16.{subscriber.vlan}.0/24).
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDisableConfirm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isTogglingVlan}
                  onClick={async () => {
                    setShowDisableConfirm(false);
                    await handleToggleVlanInterface(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isTogglingVlan ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Power className="w-3.5 h-3.5" />
                  )}
                  <span>Confirm Disable</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete DHCP Lease Confirmation Modal */}
        {leaseToDelete && (
          <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in duration-150">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-2.5 rounded-full bg-rose-100 border border-rose-200">
                  <Trash2 className="w-6 h-6 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delete DHCP Lease Device?</h3>
                  <p className="text-xs text-slate-500 mt-0.5">RouterOS DHCP Server Control</p>
                </div>
              </div>

              <div className="text-xs font-medium text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <p>
                  Are you sure you want to delete the DHCP lease binding for{' '}
                  <strong className="text-slate-900">{leaseToDelete.hostName || 'Unknown Device'}</strong>?
                </p>
                <div className="font-mono text-[11px] text-slate-700 bg-white p-2 rounded border border-slate-200 space-y-0.5">
                  <div><strong>IP:</strong> {leaseToDelete.address}</div>
                  <div><strong>MAC:</strong> {leaseToDelete.macAddress}</div>
                  {leaseToDelete.server && <div><strong>Server:</strong> {leaseToDelete.server}</div>}
                </div>
                <p className="text-[11px] text-slate-500">
                  Deleting this lease will remove the address allocation on RouterOS.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLeaseToDelete(null)}
                  disabled={isDeletingLease}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingLease}
                  onClick={handleDeleteLeaseConfirm}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isDeletingLease ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Delete Lease</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

