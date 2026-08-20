export interface SeedFiberBudgetItem {
  id: string;
  name: string;
  category: 'splitter' | 'cable' | 'splice' | 'connector' | 'attenuator' | 'margin' | 'other';
  quantity: number;
  unit: string;
  lossPerUnit: number;
  totalLoss: number;
  enabled: boolean;
  notes?: string;
  splitterRatio?: string;
  portCount?: number;
  children?: SeedFiberBudgetItem[];
  ports?: Array<{
    id: string;
    portNumber: number;
    label: string;
    status: 'active' | 'spare' | 'reserved' | 'damaged';
    isActiveTrace?: boolean;
    subItems?: SeedFiberBudgetItem[];
  }>;
}

export interface SeedFiberBudgetProfile {
  id: string;
  title: string;
  description?: string;
  txPowerDbm: number;
  wavelengthNm: number;
  targetRxMinDbm: number;
  targetRxMaxDbm: number;
  targetOptimalMinDbm: number;
  targetOptimalMaxDbm: number;
  measuredRxDbm?: number | null;
  items: SeedFiberBudgetItem[];
  updatedAt: string;
}

export const SEED_FIBER_PROFILES: SeedFiberBudgetProfile[] = [
  {
    id: 'prof-default-epon',
    title: 'Default EPON Optical Link Budget',
    description: 'Standard EPON 1490nm (SC/UPC) Link Budget Profile',
    txPowerDbm: 5.0,
    wavelengthNm: 1490,
    targetRxMinDbm: -27.0,
    targetRxMaxDbm: -6.0,
    targetOptimalMinDbm: -24.0,
    targetOptimalMaxDbm: -14.0,
    measuredRxDbm: null,
    updatedAt: new Date().toISOString(),
    items: [],
  },
];
