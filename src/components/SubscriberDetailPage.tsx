import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Trash2,
  History,
  CheckCircle2,
  Edit2,
  Wifi,
  Server,
  Network,
  Power,
  Loader2,
  AlertTriangle,
  Eye,
  ChevronDown,
  Check,
  Radio,
  Copy,
  Calendar,
  DollarSign,
  CreditCard,
  ChevronRight,
  User,
  Shield,
  Clock,
  RefreshCw,
} from 'lucide-react';
import {
  Subscriber,
  PaymentRecord,
  AccountStatus,
  MikroTikDhcpLease,
  MikroTikInterface,
  AuthUser,
} from '../types';
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

interface SubscriberDetailPageProps {
  subscriber: Subscriber | null;
  subscribers?: Subscriber[];
  payments: PaymentRecord[];
  dhcpLeases?: MikroTikDhcpLease[];
  mikrotikInterfaces?: MikroTikInterface[];
  currentUser?: AuthUser | null;
  previousTabName?: string;
  onBack: () => void;
  onUpdateSubscriber: (updated: Subscriber) => void;
  onDeleteSubscriber: (subId: number) => void;
  onDeleteDhcpLease?: (leaseId: string, macAddress?: string) => Promise<boolean>;
  onAddPayment: (payment: PaymentRecord) => void;
  onDeletePayment: (ts: string, subId: number, month: string) => void;
  onOpenEditModal: (sub: Subscriber) => void;
}

export const SubscriberDetailPage: React.FC<SubscriberDetailPageProps> = ({
  subscriber,
  subscribers = [],
  payments,
  dhcpLeases = [],
  mikrotikInterfaces = [],
  currentUser,
  previousTabName = 'subscribers',
  onBack,
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
  const [copiedMac, setCopiedMac] = useState(false);

  // State for inline editing NAME
  const [isEditingName, setIsEditingName] = useState(false);
  const [lastInput, setLastInput] = useState('');
  const [firstInput, setFirstInput] = useState('');

  // State for inline editing DUE DATE (Full Month Date picker & Day of Month)
  const [isEditingDue, setIsEditingDue] = useState(false);
  const [dueDayInput, setDueDayInput] = useState('');
  const [dueRawInput, setDueRawInput] = useState('');

  // Delete Subscriber confirmation modal
  const [showDeleteSubConfirm, setShowDeleteSubConfirm] = useState(false);

  // State for DHCP lease pinging (ARP-Ping)
  const [pingResults, setPingResults] = useState<
    Record<string, {
      alive: boolean;
      time?: string;
      avgRtt?: string;
      packetLoss?: number;
      message?: string;
      method?: 'arp-ping' | 'arp-cache' | 'icmp';
      macAddress?: string;
      checkedAt: Date;
    }>
  >({});
  const [isPingingAll, setIsPingingAll] = useState<boolean>(false);
  const [pingingSingleIp, setPingingSingleIp] = useState<string | null>(null);
  const [pingSummary, setPingSummary] = useState<{
    total: number;
    alive: number;
    dead: number;
    timestamp: string;
  } | null>(null);

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
    setPingResults({});
    setPingSummary(null);
    setIsPingingAll(false);
    setPingingSingleIp(null);
    setShowDeleteSubConfirm(false);
  }, [subscriber?.id, subscriber?.vlan, subscriber?.rate, subscriber?.status, subscriber?.macAddress]);

  // Fetch live interface status from RouterOS when subscriber.vlan changes
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

  if (!subscriber) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-xs">
        <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800 mb-1">Subscriber Not Found</h3>
        <p className="text-sm text-slate-500 mb-6">The requested subscriber record could not be loaded or has been deleted.</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Subscribers List</span>
        </button>
      </div>
    );
  }

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

  const totalPaidAmount = payments
    .filter((p) => p.sub === subscriber.id)
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

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
    if (selectedUnpaid.length === 0 || isReadOnly) return;
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

  const handleCopyMac = (mac: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(mac);
      setCopiedMac(true);
      setTimeout(() => setCopiedMac(false), 2000);
    }
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

  // Ping All Leases with ARP-Ping (Layer 2)
  const handlePingAllLeases = async () => {
    if (subLeases.length === 0 || isPingingAll) return;
    const targets = subLeases.map((l) => ({
      address: l.address,
      macAddress: l.macAddress,
      interface: l.server || (subscriber.vlan ? `vlan${subscriber.vlan}` : undefined),
      vlan: subscriber.vlan,
    }));
    const ips = targets.map((t) => t.address).filter(Boolean);
    if (ips.length === 0) return;

    setIsPingingAll(true);
    try {
      const res = await authFetch('/api/mikrotik/ping-leases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leases: targets,
          addresses: ips,
          vlan: subscriber.vlan,
          interface: subscriber.vlan ? `vlan${subscriber.vlan}` : undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.results) {
        const newResults: Record<string, {
          alive: boolean;
          time?: string;
          avgRtt?: string;
          packetLoss?: number;
          message?: string;
          method?: 'arp-ping' | 'arp-cache' | 'icmp';
          macAddress?: string;
          checkedAt: Date;
        }> = {
          ...pingResults,
        };
        let aliveCount = 0;
        let deadCount = 0;
        for (const [ip, resObj] of Object.entries<any>(data.results)) {
          const isAlive = Boolean(resObj.alive);
          newResults[ip] = {
            alive: isAlive,
            time: resObj.time,
            avgRtt: resObj.avgRtt || resObj.time,
            packetLoss: resObj.packetLoss,
            message: resObj.message,
            method: resObj.method || 'arp-ping',
            macAddress: resObj.macAddress,
            checkedAt: new Date(),
          };
          if (isAlive) aliveCount++;
          else deadCount++;
        }
        setPingResults(newResults);
        setPingSummary({
          total: ips.length,
          alive: aliveCount,
          dead: deadCount,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        });
      } else {
        const newResults = { ...pingResults };
        ips.forEach((ip) => {
          newResults[ip] = {
            alive: false,
            message: data.error || 'ARP-Ping test failed',
            checkedAt: new Date(),
          };
        });
        setPingResults(newResults);
        setPingSummary({
          total: ips.length,
          alive: 0,
          dead: ips.length,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        });
      }
    } catch (err) {
      console.error('Failed to ARP-ping leases:', err);
      const newResults = { ...pingResults };
      ips.forEach((ip) => {
        newResults[ip] = {
          alive: false,
          message: 'Connection error',
          checkedAt: new Date(),
        };
      });
      setPingResults(newResults);
      setPingSummary({
        total: ips.length,
        alive: 0,
        dead: ips.length,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
    } finally {
      setIsPingingAll(false);
    }
  };

  // Ping Single IP with ARP-Ping (Layer 2)
  const handlePingSingleLease = async (lease: MikroTikDhcpLease) => {
    const ip = lease.address;
    if (!ip || pingingSingleIp === ip || isPingingAll) return;
    setPingingSingleIp(ip);
    try {
      const res = await authFetch('/api/mikrotik/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: ip,
          macAddress: lease.macAddress,
          interface: lease.server || (subscriber.vlan ? `vlan${subscriber.vlan}` : undefined),
          vlan: subscriber.vlan,
        }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        const isAlive = Boolean(data.result.alive);
        setPingResults((prev) => ({
          ...prev,
          [ip]: {
            alive: isAlive,
            time: data.result.time,
            avgRtt: data.result.avgRtt || data.result.time,
            packetLoss: data.result.packetLoss,
            message: data.result.message,
            method: data.result.method || 'arp-ping',
            macAddress: data.result.macAddress || lease.macAddress,
            checkedAt: new Date(),
          },
        }));
      } else {
        setPingResults((prev) => ({
          ...prev,
          [ip]: {
            alive: false,
            message: data.error || 'Offline / No ARP response',
            checkedAt: new Date(),
          },
        }));
      }
    } catch (err) {
      console.error('Failed to ARP-ping IP:', err);
      setPingResults((prev) => ({
        ...prev,
        [ip]: {
          alive: false,
          message: 'Connection failed',
          checkedAt: new Date(),
        },
      }));
    } finally {
      setPingingSingleIp(null);
    }
  };

  // Delete DHCP Lease
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
        const res = await authFetch('/api/mikrotik/delete-lease', {
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

  // Toggle RouterOS VLAN Interface
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

  // Save VLAN Assignment
  const handleSaveVlanAssignment = async (targetVlanNum: number | null) => {
    if (isReadOnly || !subscriber) return;
    setIsSavingVlan(true);
    setVlanAssignMsg(null);
    try {
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

  const dueDateDisplay = formatDueDate(subscriber);

  // Helper to render IP with ARP-Ping response styling
  const renderIpCell = (leaseOrIp: MikroTikDhcpLease | string) => {
    const ipAddress = typeof leaseOrIp === 'string' ? leaseOrIp : leaseOrIp.address;
    const macAddress = typeof leaseOrIp === 'string' ? undefined : leaseOrIp.macAddress;
    const pingStatus = pingResults[ipAddress];
    const isPingingThis = isPingingAll || pingingSingleIp === ipAddress;

    if (pingStatus) {
      if (pingStatus.alive) {
        return (
          <div className="flex flex-col gap-0.5">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs transition-all w-fit"
              title={`Layer-2 ARP-Ping: Device responded at Layer 2 (MAC: ${pingStatus.macAddress || macAddress || 'Resolved'}) (checked at ${pingStatus.checkedAt.toLocaleTimeString()})`}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              <span className="font-bold text-emerald-800">{ipAddress}</span>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-200/80 px-1.5 py-0.5 rounded leading-none uppercase tracking-wide">
                Online (ARP)
              </span>
            </div>
            {(pingStatus.avgRtt || pingStatus.time) && (
              <span className="text-[10px] text-emerald-600 font-mono font-semibold pl-1">
                ⚡ {pingStatus.avgRtt || pingStatus.time} · 0% loss
              </span>
            )}
          </div>
        );
      } else {
        return (
          <div className="flex flex-col gap-0.5">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs transition-all w-fit"
              title={`Layer-2 ARP-Ping: No ARP response (checked at ${pingStatus.checkedAt.toLocaleTimeString()})`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
              <span className="font-bold text-rose-800">{ipAddress}</span>
              <span className="text-[10px] font-bold text-rose-800 bg-rose-200/80 px-1.5 py-0.5 rounded leading-none uppercase tracking-wide">
                No ARP Reply
              </span>
            </div>
            <span className="text-[10px] text-rose-500 font-mono font-semibold pl-1">
              100% loss (Unreachable)
            </span>
          </div>
        );
      }
    }

    if (isPingingThis) {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300 transition-all w-fit">
          <Loader2 className="w-3 h-3 animate-spin text-amber-600 shrink-0" />
          <span className="font-bold text-amber-800">{ipAddress}</span>
          <span className="text-[10px] text-amber-700 leading-none">ARP-Pinging...</span>
        </div>
      );
    }

    return (
      <span className="font-mono font-bold text-slate-800 whitespace-nowrap text-xs">
        {ipAddress}
      </span>
    );
  };

  const backLabel = previousTabName === 'overdue' ? 'Back to Overdue' : 'Back to Subscribers';

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Navigation & Breadcrumb Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 shadow-2xs transition-all cursor-pointer group"
            title="Return to list"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
            <span>{backLabel}</span>
          </button>

          {/* Breadcrumb */}
          <nav className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <span className="hover:text-slate-600 cursor-pointer" onClick={onBack}>
              Subscribers
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-slate-900 font-bold font-mono">#{subscriber.id}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-slate-800 font-semibold">{nameStr}</span>
          </nav>
        </div>

        {/* Right side page actions: Open in separate window/tab & Quick Edit */}
        <div className="flex items-center gap-2 ml-auto">
          <a
            href={`?sub=${subscriber.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors"
            title="Open subscriber in a separate browser tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Open in New Tab</span>
          </a>

          {!isReadOnly && (
            <button
              onClick={() => onOpenEditModal(subscriber)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-cyan-600" />
              <span>Edit Profile</span>
            </button>
          )}

          {!isReadOnly && (
            <button
              onClick={() => setShowDeleteSubConfirm(true)}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
              title="Delete subscriber account"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Read-Only Notice Banner if user has R permission */}
      {isReadOnly && (
        <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200 text-amber-800 flex items-center gap-3 text-xs shadow-2xs">
          <Eye className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <span className="font-bold">Read-Only Operator Mode:</span> You have viewing permissions.
            Modifications to subscriber profiles, payment recording, and router interfaces are restricted to authorized administrators.
          </div>
        </div>
      )}

      {/* Page Hero Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-cyan-600 to-sky-700 text-white flex items-center justify-center font-bold text-xl shadow-md shrink-0">
              {subscriber.first?.[0] || subscriber.last?.[0] || 'S'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">{nameStr}</h1>
                <span className="text-xs font-bold font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                  ID #{subscriber.id}
                </span>

                {/* Status Dropdown */}
                {isReadOnly ? (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      subscriber.status === 'Exclude'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : subscriber.status === 'Active'
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
                    className={`px-3 py-1 rounded-full text-xs font-bold border cursor-pointer focus:outline-none transition-colors shadow-2xs ${
                      subscriber.status === 'Exclude'
                        ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100'
                        : subscriber.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    <option value="Active">● Active</option>
                    <option value="Inactive">○ Inactive</option>
                    <option value="Exclude">◈ Exclude</option>
                  </select>
                )}
              </div>

              {/* Subtitle with VLAN and Due Date info */}
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px]">VLAN:</span>
                  {subscriber.vlan ? (
                    <span className="px-2 py-0.5 rounded text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                      VLAN-{subscriber.vlan}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
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
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isVlanEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      <span>{isVlanEnabled ? 'ONLINE / ENABLED' : 'DISABLED'}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Billing:</span>
                  <span className="font-mono font-bold text-slate-800">{dueDateDisplay}</span>
                </div>

                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Plan:</span>
                  <span className="font-mono font-bold text-emerald-700">{formatCurrency(subscriber.rate)} / mo</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Financial Summary Badges */}
          <div className="flex items-center gap-3 self-start lg:self-center">
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-center min-w-[120px]">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Paid</span>
              <span className="text-sm font-black font-mono text-emerald-600">{formatCurrency(totalPaidAmount)}</span>
            </div>
            <div className={`rounded-xl px-4 py-2.5 text-center min-w-[120px] border ${
              unpaidMonths.length > 0
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                {unpaidMonths.length > 0 ? 'Unpaid Balance' : 'Account Balance'}
              </span>
              <span className="text-sm font-black font-mono">
                {unpaidMonths.length > 0
                  ? formatCurrency(unpaidMonths.length * (subscriber.rate || 600))
                  : 'Fully Paid'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Profile, Contract & RouterOS VLAN Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Subscriber Profile & Billing Config */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-cyan-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Profile & Contract Details</h2>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Field: Full Name */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">FULL NAME</span>
                  {!isReadOnly && !isEditingName && (
                    <button
                      onClick={() => {
                        setLastInput(subscriber.last || '');
                        setFirstInput(subscriber.first || '');
                        setIsEditingName(true);
                      }}
                      className="text-[11px] font-semibold text-cyan-600 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>

                {!isReadOnly && isEditingName ? (
                  <div className="space-y-2 mt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Last Name</label>
                        <input
                          type="text"
                          value={lastInput}
                          onChange={(e) => setLastInput(e.target.value)}
                          placeholder="Last Name"
                          className="w-full text-xs font-bold text-slate-900 bg-white border border-cyan-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">First Name</label>
                        <input
                          type="text"
                          value={firstInput}
                          onChange={(e) => setFirstInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveName();
                            if (e.key === 'Escape') setIsEditingName(false);
                          }}
                          placeholder="First Name"
                          className="w-full text-xs font-bold text-slate-900 bg-white border border-cyan-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        onClick={() => setIsEditingName(false)}
                        className="px-2.5 py-1 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveName}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        Save Name
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
                    className={`text-sm font-bold text-slate-900 ${isReadOnly ? '' : 'cursor-pointer hover:text-cyan-600'} transition-colors`}
                    title={isReadOnly ? undefined : 'Click to edit name'}
                  >
                    {nameStr}
                  </div>
                )}
              </div>

              {/* Grid: Plan Rate & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Monthly Rate */}
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">MONTHLY RATE</span>
                    {!isReadOnly && !isEditingRate && (
                      <button
                        onClick={() => {
                          setRateInput(String(subscriber.rate || 600));
                          setIsEditingRate(true);
                        }}
                        className="text-[11px] font-semibold text-cyan-600 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>

                  {!isReadOnly && isEditingRate ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        value={rateInput}
                        onChange={(e) => setRateInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRate();
                          if (e.key === 'Escape') setIsEditingRate(false);
                        }}
                        placeholder="600"
                        className="w-full text-xs font-bold text-slate-900 bg-white border border-cyan-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveRate}
                        className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
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
                      className={`text-sm font-bold text-slate-900 font-mono ${isReadOnly ? '' : 'cursor-pointer hover:text-cyan-600'} transition-colors`}
                      title={isReadOnly ? undefined : 'Click to edit rate'}
                    >
                      {formatCurrency(subscriber.rate)}
                    </div>
                  )}
                </div>

                {/* Due Date */}
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DUE DATE</span>
                    {!isReadOnly && !isEditingDue && (
                      <button
                        onClick={() => {
                          setDueDayInput(String(getSubscriberDueDay(subscriber)));
                          setDueRawInput(getInitialDueDateForSub(subscriber));
                          setIsEditingDue(true);
                        }}
                        className="text-[11px] font-semibold text-cyan-600 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>

                  {!isReadOnly && isEditingDue ? (
                    <div className="space-y-2 mt-1">
                      <input
                        type="date"
                        value={dueRawInput}
                        onChange={(e) => {
                          setDueRawInput(e.target.value);
                          const d = parseDateSafe(e.target.value);
                          if (d) setDueDayInput(String(d.getDate()));
                        }}
                        className="w-full text-xs font-bold text-slate-900 bg-white border border-cyan-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setIsEditingDue(false)}
                          className="px-2 py-1 bg-slate-200 text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-300 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveDue}
                          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
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
                      className={`text-sm font-bold text-slate-900 font-mono ${isReadOnly ? '' : 'cursor-pointer hover:text-cyan-600'} transition-colors`}
                      title={isReadOnly ? undefined : 'Click to edit Due Date'}
                    >
                      {dueDateDisplay}
                    </div>
                  )}
                </div>
              </div>

              {/* ONU / MAC Address */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-cyan-600" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ONU / ROUTER MAC ADDRESS</span>
                  </div>
                  {!isReadOnly && !isEditingMac && (
                    <button
                      onClick={() => {
                        setMacInput(subscriber.macAddress || '');
                        setIsEditingMac(true);
                      }}
                      className="text-[11px] font-semibold text-cyan-600 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>{subscriber.macAddress ? 'Edit MAC' : 'Add MAC'}</span>
                    </button>
                  )}
                </div>

                {!isReadOnly && isEditingMac ? (
                  <div className="space-y-2 mt-1">
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
                    <span className="text-[11px] text-slate-400 block">
                      Enter the ONU's MAC address in standard colon-separated format (e.g., 48:8F:5A:XX:XX:XX).
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between mt-1">
                    {subscriber.macAddress ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-cyan-900 bg-cyan-50 border border-cyan-200 px-2.5 py-1 rounded-lg tracking-wider">
                          {subscriber.macAddress}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyMac(subscriber.macAddress!)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                          title="Copy MAC Address"
                        >
                          {copiedMac ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No MAC address recorded</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card: MikroTik RouterOS & VLAN Controls */}
          <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 shadow-md p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Network className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">VLAN Interface Mapping</h3>
                    {subscriber.vlan ? (
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
                    {subscriber.vlan
                      ? `Subnet: 172.16.${subscriber.vlan}.0/24 ${matchedIface?.name ? `• ${matchedIface.name}` : ''}`
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
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
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

            {/* Inline VLAN Assignment Form */}
            {!isReadOnly && isEditingVlan && (
              <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    {subscriber.vlan ? `Reassign VLAN for ${nameStr}` : `Assign VLAN to ${nameStr}`}
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
                  <div className="space-y-3">
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
                          className="w-full text-xs font-mono font-bold py-2 px-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          autoFocus
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {subscriber.vlan ? (
                        <button
                          type="button"
                          onClick={() => setShowUnassignConfirm(true)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-colors cursor-pointer"
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
                  <div className="p-3 bg-rose-950/40 rounded-lg border border-rose-800/60 space-y-2">
                    <div className="flex items-start gap-2 text-rose-400">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold">Confirm Unassigning VLAN {subscriber.vlan}?</p>
                        <p className="text-[11px] text-rose-300/80 mt-0.5">
                          This will disconnect the subscriber from VLAN {subscriber.vlan} on MikroTik RouterOS.
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

            {/* Notification messages */}
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

            {/* RouterOS Interface Power Switch Toggle */}
            {subscriber.vlan !== null && subscriber.vlan !== undefined && Number(subscriber.vlan) > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
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
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-medium">
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
        </div>

        {/* Right Column: DHCP Leases (with ARP-Ping) & Billing Payment History */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card: DHCP Leases & Real-time Connectivity Diagnostics */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-cyan-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Connected DHCP Leases (VLAN {subscriber.vlan || 'N/A'})
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                    subLeases.length > 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {subLeases.length} {subLeases.length === 1 ? 'device' : 'devices'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-full">
                  ARP-Ping
                </span>
              </div>

              {subLeases.length > 0 && (
                <button
                  type="button"
                  onClick={handlePingAllLeases}
                  disabled={isPingingAll}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  title="Send Layer-2 ARP-Ping packets (bypasses client firewall ICMP blocks)"
                >
                  {isPingingAll ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>ARP-Pinging...</span>
                    </>
                  ) : (
                    <>
                      <Radio className="w-3.5 h-3.5" />
                      <span>Verify ARP-Ping</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Diagnostic Summary Bar */}
            {pingSummary && (
              <div className="px-5 py-2.5 bg-slate-900 text-slate-200 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-300">ARP-Ping Summary:</span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    {pingSummary.alive} Online (Responded)
                  </span>
                  <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    {pingSummary.dead} Offline (No ARP Reply)
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                    Layer-2 · Bypasses ICMP firewall
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  Checked at {pingSummary.timestamp}
                </span>
              </div>
            )}

            {/* Delete Lease Feedback */}
            {leaseDeleteMsg && (
              <div
                className={`mx-5 my-3 px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
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

            {/* Leases Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-4">IP ADDRESS</th>
                    <th className="py-2.5 px-4">HOST / DEVICE NAME</th>
                    <th className="py-2.5 px-4 text-center">STATUS</th>
                    <th className="py-2.5 px-4 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {subLeases.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 bg-slate-50/20">
                        <Wifi className="w-8 h-8 text-slate-300 mx-auto mb-2 opacity-60" />
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
                        <td className="py-3 px-4 whitespace-nowrap">
                          {renderIpCell(lease)}
                        </td>
                        <td className="py-3 px-4 text-slate-800 font-semibold">
                          <div>{lease.hostName || '—'}</div>
                          {lease.macAddress && (
                            <div className="text-[11px] font-mono text-slate-400 font-normal">{lease.macAddress}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              lease.status === 'bound'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${lease.status === 'bound' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {lease.status || 'bound'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePingSingleLease(lease)}
                              disabled={isPingingAll || pingingSingleIp === lease.address}
                              className="px-2.5 py-1 rounded-lg text-slate-600 hover:text-cyan-700 hover:bg-cyan-50 border border-transparent hover:border-cyan-200 transition-colors cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold disabled:opacity-40"
                              title={`Send Layer-2 ARP-Ping packets to ${lease.address} (bypasses ICMP blocks)`}
                            >
                              {pingingSingleIp === lease.address ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-600" />
                              ) : (
                                <Radio className="w-3.5 h-3.5" />
                              )}
                              <span>ARP-Ping</span>
                            </button>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => setLeaseToDelete(lease)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title={`Delete DHCP lease device (${lease.hostName || lease.address})`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card: Billing & Payment History */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-cyan-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Billing & Payment Records</h2>
                <span className="text-xs text-slate-400 font-medium">
                  ({unpaidMonths.length} unpaid, {metrics.entries.length} paid)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>{showHistory ? 'View Due Months' : 'View Payment History'}</span>
                </button>
              </div>
            </div>

            {/* Unpaid Months View */}
            {!showHistory && (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Unpaid Months</span>
                  {unpaidMonths.length > 0 && !isReadOnly && (
                    <button
                      onClick={handleToggleSelectAll}
                      className="text-xs font-semibold text-cyan-600 hover:underline cursor-pointer"
                    >
                      {selectedUnpaid.length === unpaidMonths.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {unpaidMonths.length === 0 ? (
                  <div className="p-8 text-center bg-emerald-50/50 rounded-xl border border-emerald-100">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-emerald-800">All bills up to date!</p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">No outstanding payments for this subscriber.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {unpaidMonths.map((mStr) => {
                      const isSelected = selectedUnpaid.includes(mStr);
                      return (
                        <div
                          key={mStr}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-cyan-50/70 border-cyan-300 text-cyan-900 shadow-2xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {!isReadOnly && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleMonth(mStr)}
                                className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-300 cursor-pointer"
                              />
                            )}
                            <div>
                              <span className="text-xs font-bold">{mStr}</span>
                              <span className="text-[11px] text-slate-400 ml-2">
                                Due: {formatMonthShort(mStr)} {getSubscriberDueDay(subscriber)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {formatCurrency(subscriber.rate)}
                            </span>

                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleSingleMonthPay(mStr)}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer shadow-2xs"
                              >
                                Pay
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Bulk Action Footer */}
                    {!isReadOnly && (
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">
                          {selectedUnpaid.length > 0
                            ? `${selectedUnpaid.length} month(s) selected (${formatCurrency(selectedUnpaid.length * (subscriber.rate || 600))})`
                            : 'Select multiple months to mark as paid together'}
                        </span>
                        <button
                          onClick={handleMarkPaid}
                          disabled={selectedUnpaid.length === 0}
                          className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${
                            selectedUnpaid.length > 0
                              ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs cursor-pointer'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {selectedUnpaid.length > 0
                            ? `Mark Selected Paid (${formatCurrency(selectedUnpaid.length * (subscriber.rate || 600))})`
                            : 'Mark Paid'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Payment History View */}
            {showHistory && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-4">MONTH PAID</th>
                      <th className="py-2.5 px-4">RECORDED DATE & TIME</th>
                      <th className="py-2.5 px-4 text-right">AMOUNT</th>
                      {!isReadOnly && <th className="py-2.5 px-4 text-center">ACTION</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {metrics.entries.length === 0 ? (
                      <tr>
                        <td colSpan={isReadOnly ? 3 : 4} className="py-8 text-center text-slate-400">
                          <History className="w-8 h-8 text-slate-300 mx-auto mb-2 opacity-60" />
                          <p className="font-semibold text-slate-600 text-xs">No payment records found</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">When payments are recorded, they will be listed here.</p>
                        </td>
                      </tr>
                    ) : (
                      metrics.entries.map((entry, idx) => (
                        <tr key={entry.ts || `${entry.month}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800">{entry.month}</td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{entry.ts || '—'}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                            {formatCurrency(entry.amount)}
                          </td>
                          {!isReadOnly && (
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => onDeletePayment(entry.ts, subscriber.id, entry.month)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete payment record"
                              >
                                <Trash2 className="w-4 h-4" />
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
        </div>
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
            <p className="text-xs font-medium text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
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
            <div className="text-xs font-medium text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
              <p>
                Are you sure you want to delete the DHCP lease binding for{' '}
                <strong className="text-slate-900">{leaseToDelete.hostName || 'Unknown Device'}</strong>?
              </p>
              <div className="font-mono text-[11px] text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 space-y-0.5">
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

      {/* Delete Subscriber Confirmation Modal */}
      {showDeleteSubConfirm && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-100 border border-rose-200">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Subscriber Account?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Permanent Deletion Warning</p>
              </div>
            </div>
            <div className="text-xs font-medium text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
              <p>
                Are you sure you want to permanently delete <strong className="text-slate-900">{nameStr}</strong> (ID #{subscriber.id})?
              </p>
              <p className="text-rose-600 font-semibold text-[11px]">
                This will delete the subscriber record and all associated payment history. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteSubConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteSubConfirm(false);
                  onDeleteSubscriber(subscriber.id);
                  onBack();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete Subscriber</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
