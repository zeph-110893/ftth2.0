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
  macAddress?: string; // ONU / Router MAC Address e.g. "48:8F:5A:12:34:56"
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

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
}

export type ViewTab = 'subscribers' | 'analytics' | 'expenses' | 'overdue' | 'mikrotik' | 'light_budget';

export type FiberComponentCategory = 'splitter' | 'cable' | 'splice' | 'connector' | 'attenuator' | 'margin' | 'onu' | 'other';

export interface FiberSplitterPort {
  id: string;
  portNumber: number;
  label: string; // e.g. "Port 1 - Main Trunk (NAP-01)"
  lossOffsetDb?: number; // Custom loss or unequal tap drop/thru delta
  subItems?: FiberBudgetItem[]; // Nested secondary components under this specific port (e.g. secondary 1:8 NAP, drop line)
  status?: 'active' | 'spare' | 'reserved' | 'fault';
  isActiveTrace?: boolean; // Whether this branch is active in the primary receiver trace
  notes?: string;
}

export interface FiberBudgetItem {
  id: string;
  name: string;
  category: FiberComponentCategory;
  quantity: number;
  unit: string;
  lossPerUnit: number; // in dB
  totalLoss: number;   // quantity * lossPerUnit (in dB)
  enabled: boolean;
  notes?: string;
  // Multi-Port & Nested Splitter Branching:
  splitterRatio?: string; // '1:2' | '1:4' | '1:8' | '1:16' | '1:32' | '1:64' | '90/10' | '80/20' | '70/30' | 'custom'
  portCount?: number;
  activePortId?: string;
  ports?: FiberSplitterPort[];
  children?: FiberBudgetItem[]; // Hierarchical nested child splitters & downstream items
  // ONU Specific Metadata
  onuModel?: string;            // e.g. 'EPON 1GE ONU', 'XPON Dual-Band AC1200', 'Huawei HG8245H'
  onuSubscriber?: string;       // e.g. 'Juan Dela Cruz (Account #1042)'
  onuSerial?: string;           // e.g. 'EPON0012FA3B'
  onuTargetSensitivity?: number;// e.g. -27.0 dBm
}

export interface FiberPonPort {
  id: string;
  name: string; // e.g. "PON 1 (Main Feeder)", "PON 2 (North Loop)"
  portNumber: number; // 1, 2, 3, 4...
  txPowerDbm: number; // Manual dBm per PON port (e.g. +5.5, +7.0, +4.0)
  wavelengthNm?: number; // default 1490
  items: FiberBudgetItem[];
  notes?: string;
}

export interface FiberBudgetProfile {
  id: string;
  title: string;
  description?: string;
  txPowerDbm: number;        // Transmit power from OLT SFP (e.g. +3.0, +5.0, +7.0 dBm)
  wavelengthNm: number;      // e.g. 1490 for GPON downstream, 1310, 1550, 1577
  targetRxMinDbm: number;    // Receiver sensitivity floor (e.g. -27.0 dBm)
  targetRxMaxDbm: number;    // Receiver overload ceiling (e.g. -8.0 dBm)
  targetOptimalMinDbm: number; // e.g. -24.0 dBm
  targetOptimalMaxDbm: number; // e.g. -15.0 dBm
  measuredRxDbm?: number | null; // Optional live field measurement from optical power meter (OPM)
  items: FiberBudgetItem[];
  ponPorts?: FiberPonPort[]; // Multiple PON ports under OLT
  activePonPortId?: string;  // Currently focused PON port
  updatedAt: string;
}

export interface SubscriberPortalDevice {
  id: string;
  deviceName: string;
  ipAddress: string;
  status: string;
  isStatic?: boolean;
}

export interface SubscriberPortalBandwidth {
  rxByte: number;
  txByte: number;
  rxFormatted: string;
  txFormatted: string;
  totalFormatted: string;
  interfaceName: string;
  vlanId: number | null;
  status: 'active' | 'disabled' | 'offline';
  running: boolean;
}

export interface SubscriberPortalData {
  success?: boolean;
  detectedVlan: number | null;
  detectedIp: string;
  matchedBy: 'ip_dhcp' | 'vlan_param' | 'vlan_subnet' | 'manual' | 'default';
  subscriber: {
    id: number;
    name: string;
    first: string;
    last: string;
    rate: number;
    vlan: number | null;
    status: AccountStatus;
    dueDay: number | null;
    address?: string;
    phone?: string;
  };
  billing: {
    currentMonth: string;
    statusPill: 'active' | 'due' | 'overdue' | 'inactive';
    isPaidCurrent: boolean;
    nextDueDate: string;
    daysRemaining: number;
    monthlyRate: number;
    unpaidMonths: string[];
    unpaidTotal: number;
    recentPayments: Array<{
      month: string;
      amount: number;
      ts: string;
      referenceNo?: string;
    }>;
  };
  bandwidth: SubscriberPortalBandwidth;
  devices: SubscriberPortalDevice[];
}
