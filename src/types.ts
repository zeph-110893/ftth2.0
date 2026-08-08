export type AccountStatus = 'Active' | 'Overdue' | 'Inactive';

export type PaymentMethod = 'Cash' | 'GCash' | 'Bank Transfer' | 'Maya' | 'Other';

export interface Subscriber {
  id: number;
  last: string;
  first: string;
  dueRaw?: string;
  dueDay: number | null; // 1-31 or null
  status: AccountStatus;
  vlan: number | null;
  rate: number; // e.g. 600 or 300
  phone?: string;
  address?: string;
  notes?: string;
}

export interface PaymentRecord {
  id?: string;
  ts: string; // ISO string or format "7/29/2026, 11:46:10 AM"
  sub: number; // subscriber ID
  month: string; // e.g., "July 2026"
  amount: number;
  method?: PaymentMethod;
  referenceNo?: string;
  note?: string;
}

export interface SubCalculatedData {
  id: number;
  subscriber: Subscriber;
  entries: PaymentRecord[];
  monthsPaid: string[];
  rate: number;
  dueDay: number | null;
  accountStatus: AccountStatus;
  statusPill: 'active' | 'due' | 'overdue' | 'inactive';
  paidCurrent: boolean;
  missed: number; // missed months count on record
  totalPaid: number;
  gap: number; // months gap from last paid month to current month
}

export interface Expense {
  id: string;
  itemName: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  date: string;
  month: string;
  category?: string;
  note?: string;
}

export interface MikroTikConfig {
  host: string;
  port: number;
  useSsl: boolean;
  username: string;
  password?: string;
  autoSyncOverdue: boolean;
  syncMethod: 'ppp_secret' | 'firewall_address_list' | 'simple_queue';
  syncTime?: string;
}

export interface MikroTikResource {
  identity: string;
  model: string;
  version: string;
  uptime: string;
  cpuLoad: number;
  freeMemoryMb: number;
  totalMemoryMb: number;
  architecture: string;
  activeSessionsCount: number;
  connectedAt?: string;
}

export interface MikroTikSecret {
  id?: string;
  name: string;
  service: string;
  profile: string;
  disabled: boolean;
  comment?: string;
  remoteAddress?: string;
}

export interface MikroTikActiveSession {
  id?: string;
  name: string;
  address: string;
  uptime: string;
  service: string;
  callerId?: string;
}

export interface MikroTikDhcpLease {
  id?: string;
  address: string;
  macAddress: string;
  hostName?: string;
  server: string;
  status: string;
  disabled: boolean;
  comment?: string;
}

export interface MikroTikInterface {
  id?: string;
  name: string;
  type: string;
  vlanId?: number;
  running: boolean;
  disabled: boolean;
  macAddress?: string;
  mtu?: number;
  comment?: string;
  rxByte?: number;
  txByte?: number;
  rxPacket?: number;
  txPacket?: number;
}

export type ViewTab = 'subscribers' | 'analytics' | 'expenses' | 'overdue' | 'mikrotik';
