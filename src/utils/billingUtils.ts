import { Subscriber, PaymentRecord, SubCalculatedData, AccountStatus, MikroTikDhcpLease, MikroTikInterface } from '../types';

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const now = new Date();
export const TODAY = { year: now.getFullYear(), monthIdx: now.getMonth(), day: now.getDate() }; // Dynamic system date
export const CURRENT_MONTH = `${MONTH_NAMES[TODAY.monthIdx]} ${TODAY.year}`;
export const CURRENT_KEY = TODAY.year * 12 + TODAY.monthIdx;
export const LAST_COMPLETE_MONTH_KEY = CURRENT_KEY - 1;

export function parseDateSafe(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const d = parseInt(match[3], 10);
    return new Date(y, m, d);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function getSubscriberDueDay(sub: Subscriber): number {
  if (sub && sub.dueDay !== null && sub.dueDay !== undefined && sub.dueDay > 0) {
    return sub.dueDay;
  }
  if (sub && sub.dueRaw) {
    const parsed = parseDateSafe(sub.dueRaw);
    if (parsed) {
      return parsed.getDate();
    }
  }
  return 15;
}

export function formatDueDate(sub: Subscriber): string {
  if (!sub) return 'N/A';
  if (sub.dueRaw) {
    const parsed = parseDateSafe(sub.dueRaw);
    if (parsed) {
      const m = MONTH_NAMES_SHORT[parsed.getMonth()];
      const d = parsed.getDate();
      const y = parsed.getFullYear();
      return `${m} ${d}, ${y}`;
    }
    return sub.dueRaw;
  }
  if (sub.dueDay !== null && sub.dueDay !== undefined && sub.dueDay > 0) {
    const m = MONTH_NAMES_SHORT[TODAY.monthIdx];
    return `${m} ${sub.dueDay}, ${TODAY.year}`;
  }
  return 'N/A';
}

export function mkey(m: string): number {
  if (!m) return 0;
  const parts = m.trim().split(" ");
  if (parts.length < 2) return 0;
  const name = parts[0];
  const year = parseInt(parts[1], 10);
  const idx = MONTH_NAMES.indexOf(name);
  if (idx === -1 || isNaN(year)) return 0;
  return year * 12 + idx;
}

export function abbrMonth(m: string): string {
  if (!m) return "";
  const [n, y] = m.split(" ");
  if (!n || !y) return m;
  return `${n.slice(0, 3)} '${y.slice(2)}`;
}

export function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function displayName(sub: Subscriber): string {
  if (!sub) return 'Unknown Subscriber';
  return `${sub.last}, ${sub.first}`;
}

export function calculateSubMetrics(
  sub: Subscriber,
  allPayments: PaymentRecord[],
  currentMonthStr: string = CURRENT_MONTH,
  todayDay: number = TODAY.day
): SubCalculatedData {
  const currentKey = mkey(currentMonthStr);
  const lastCompleteKey = currentKey - 1;

  const entries = allPayments.filter(p => p.sub === sub.id);
  const monthsPaid = Array.from(new Set(entries.map(p => p.month))).sort((a, b) => mkey(a) - mkey(b));

  const rate = sub.rate || 600;
  const dueDay = sub.dueDay ?? null;
  const accountStatus = sub.status || 'Active';

  const paidCurrent = monthsPaid.includes(currentMonthStr);

  let gap = 0;
  if (monthsPaid.length > 0) {
    const lastMonthKey = mkey(monthsPaid[monthsPaid.length - 1]);
    gap = currentKey - lastMonthKey;
  } else {
    gap = 99; // no payments recorded yet
  }

  const unpaidMonths = getUnpaidMonths(sub, allPayments);
  const missed = unpaidMonths.length;

  const statusPill = getSubscriberBillingStatus(sub, allPayments);

  const totalPaid = entries.reduce((acc, curr) => acc + curr.amount, 0);

  return {
    id: sub.id,
    subscriber: sub,
    entries,
    monthsPaid,
    rate,
    dueDay,
    accountStatus,
    statusPill,
    paidCurrent,
    missed,
    totalPaid,
    gap
  };
}

export function getUnpaidMonths(sub: Subscriber, allPayments: PaymentRecord[]): string[] {
  if (!sub) return [];
  const entries = allPayments.filter(p => p.sub === sub.id);
  const monthsPaid = new Set(entries.map(p => p.month));

  const currentKey = CURRENT_KEY;
  let startKey = currentKey;
  const dueDay = getSubscriberDueDay(sub);

  if (sub.dueRaw) {
    const parsed = parseDateSafe(sub.dueRaw);
    if (parsed) {
      const y = parsed.getFullYear();
      const mIdx = parsed.getMonth();
      startKey = y * 12 + mIdx;
    }
  }

  // If subscriber has recorded payments older than startKey, adjust startKey to include those
  if (entries.length > 0) {
    const paidKeys = entries.map(p => mkey(p.month)).filter(k => k > 0);
    if (paidKeys.length > 0) {
      const minPaidKey = Math.min(...paidKeys);
      startKey = Math.min(startKey, minPaidKey);
    }
  }

  // Determine max key that is due as of TODAY
  // Cap dueDay to total days in the current month (e.g., 30 for 30-day months, 28/29 for Feb)
  const currentYear = Math.floor(currentKey / 12);
  const currentMonthIdx = currentKey % 12;
  const daysInCurrentMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();
  const effectiveDueDay = Math.min(dueDay, daysInCurrentMonth);

  const maxDueKey = TODAY.day >= effectiveDueDay ? currentKey : currentKey - 1;

  const unpaid: string[] = [];
  for (let k = maxDueKey; k >= startKey; k--) {
    const year = Math.floor(k / 12);
    const monthIdx = k % 12;
    const monthStr = `${MONTH_NAMES[monthIdx]} ${year}`;
    if (!monthsPaid.has(monthStr)) {
      unpaid.push(monthStr);
    }
  }

  return unpaid;
}

export function getSubscriberBillingStatus(sub: Subscriber, allPayments: PaymentRecord[]): 'active' | 'due' | 'overdue' | 'inactive' {
  if (sub.status === 'Inactive') return 'inactive';
  const unpaidMonths = getUnpaidMonths(sub, allPayments);
  if (unpaidMonths.length === 0) return 'active';

  const currentMonthStr = `${MONTH_NAMES[TODAY.monthIdx]} ${TODAY.year}`;
  const hasPastUnpaid = unpaidMonths.some(m => m !== currentMonthStr);
  if (hasPastUnpaid) {
    return 'overdue';
  }

  // Only current month is unpaid
  const dueDay = getSubscriberDueDay(sub);

  const daysInCurrentMonth = new Date(TODAY.year, TODAY.monthIdx + 1, 0).getDate();
  const effectiveDueDay = Math.min(dueDay, daysInCurrentMonth);

  if (TODAY.day === effectiveDueDay) {
    return 'due';
  } else if (TODAY.day > effectiveDueDay) {
    return 'overdue';
  }

  return 'active';
}

export function exportToCSV(subs: Subscriber[], payments: PaymentRecord[]) {
  const headers = ['Subscriber ID', 'Last Name', 'First Name', 'Status', 'Due Day', 'VLAN', 'Monthly Rate', 'Month Paid', 'Amount', 'Date Recorded'];
  const rows: string[] = [headers.join(',')];

  payments.forEach(p => {
    const s = subs.find(sub => sub.id === p.sub);
    const row = [
      p.sub,
      `"${s?.last || ''}"`,
      `"${s?.first || ''}"`,
      s?.status || 'Active',
      s?.dueDay ?? '',
      s?.vlan ?? '',
      s?.rate || 600,
      `"${p.month}"`,
      p.amount,
      `"${p.ts || ''}"`
    ];
    rows.push(row.join(','));
  });

  const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `FTTH_Subscribers_Payments_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function getLeasesForSubscriber(sub: Subscriber, leases: MikroTikDhcpLease[] = []): MikroTikDhcpLease[] {
  if (!sub || !Array.isArray(leases) || leases.length === 0) return [];
  const vlan = sub.vlan;
  const vlanStr = vlan !== null && vlan !== undefined ? String(vlan) : null;
  const vlanPrefix1 = vlanStr ? `172.16.${vlanStr}.` : null;
  const vlanPrefix2 = vlanStr ? `192.168.${vlanStr}.` : null;
  const subIdStr = `Subscriber #${sub.id}`;
  const idStr = `ID #${sub.id}`;
  const subName = `${sub.first} ${sub.last}`.toLowerCase();

  return leases.filter((lease) => {
    if (vlanPrefix1 && lease.address && lease.address.startsWith(vlanPrefix1)) return true;
    if (vlanPrefix2 && lease.address && lease.address.startsWith(vlanPrefix2)) return true;
    if (vlanStr && lease.server && (lease.server.includes(`vlan${vlanStr}`) || lease.server.includes(`vlan-${vlanStr}`))) return true;
    if (vlanStr && lease.address && lease.address.includes(`.${vlanStr}.`)) return true;
    if (lease.comment) {
      if (lease.comment.includes(subIdStr) || lease.comment.includes(idStr)) return true;
      if (vlanStr && lease.comment.includes(`VLAN ${vlanStr}`)) return true;
    }
    if (lease.hostName && lease.hostName.toLowerCase().includes(sub.first.toLowerCase())) return true;
    return false;
  });
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getInterfaceForSubscriber(sub: Subscriber, interfaces: MikroTikInterface[] = []): MikroTikInterface | undefined {
  if (!sub || !Array.isArray(interfaces) || interfaces.length === 0) return undefined;
  if (sub.vlan === null || sub.vlan === undefined || Number.isNaN(Number(sub.vlan)) || Number(sub.vlan) <= 0) {
    return undefined;
  }
  const subVlan = Number(sub.vlan);
  return interfaces.find((iface) => {
    let effectiveVlan = iface.vlanId;
    if (!effectiveVlan && iface.name) {
      const match = iface.name.match(/vlan[-_\.\s]*(\d+)/i) || iface.name.match(/(\d+)/);
      if (match) {
        effectiveVlan = parseInt(match[1], 10);
      }
    }
    if (effectiveVlan !== undefined && Number(effectiveVlan) === subVlan) {
      return true;
    }
    const nameLower = (iface.name || '').toLowerCase();
    const commentLower = (iface.comment || '').toLowerCase();
    const sVlanStr = String(subVlan);
    return (
      nameLower.includes(`vlan-${sVlanStr}`) ||
      nameLower.includes(`vlan_${sVlanStr}`) ||
      nameLower.includes(`vlan${sVlanStr}`) ||
      commentLower.includes(`vlan ${sVlanStr}`) ||
      commentLower.includes(`vlan-${sVlanStr}`)
    );
  });
}
