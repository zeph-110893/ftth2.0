import { FiberBudgetProfile, FiberBudgetItem } from '../types';

export const COMPONENT_PRESETS = [
  // SC/UPC (Blue) Connectors & Fast Terminations
  { name: 'SC/UPC Connector Pair (Blue Mated)', category: 'connector', unit: 'pairs', lossPerUnit: 0.35, notes: 'Blue Ultra Physical Contact mated pair (0.30 - 0.40 dB)' },
  { name: 'SC/UPC Field Fast Connector (Mechanical)', category: 'connector', unit: 'pcs', lossPerUnit: 0.50, notes: 'Field assembly SC/UPC blue connector at subscriber ONT' },
  { name: 'SC/UPC ODF Bulkhead Adapter (Blue)', category: 'connector', unit: 'pcs', lossPerUnit: 0.30, notes: 'Central office / ODF blue simplex/duplex adapter' },
  { name: 'SC/UPC Pigtail / Patch Cord (0.5m - 3m)', category: 'connector', unit: 'pcs', lossPerUnit: 0.35, notes: 'Factory polished SC/UPC blue patch jumper' },
  { name: 'SC/APC Connector Pair (Green Mated)', category: 'connector', unit: 'pairs', lossPerUnit: 0.30, notes: 'Green Angled Physical Contact (0.25 - 0.30 dB)' },

  // Splitters (SC/UPC Standard)
  { name: '1:2 PLC Splitter (SC/UPC)', category: 'splitter', unit: 'pcs', lossPerUnit: 3.70, notes: 'Equal 50/50 split with SC/UPC blue terminations (~3.7 dB loss)' },
  { name: '1:4 PLC Splitter (SC/UPC)', category: 'splitter', unit: 'pcs', lossPerUnit: 7.30, notes: '1:4 split with SC/UPC blue terminations (~7.3 dB loss)' },
  { name: '1:8 PLC Splitter (SC/UPC)', category: 'splitter', unit: 'pcs', lossPerUnit: 10.60, notes: 'Standard EPON NAP / Distribution Box (~10.6 dB loss)' },
  { name: '1:16 PLC Splitter (SC/UPC)', category: 'splitter', unit: 'pcs', lossPerUnit: 13.90, notes: 'Primary hub or centralized split (~13.9 dB loss)' },
  { name: '1:32 PLC Splitter (SC/UPC)', category: 'splitter', unit: 'pcs', lossPerUnit: 17.20, notes: 'EPON maximum recommended single-stage split (~17.2 dB loss)' },
  { name: '1:64 PLC Splitter (SC/UPC)', category: 'splitter', unit: 'pcs', lossPerUnit: 20.60, notes: 'High density split (~20.6 dB loss)' },
  { name: 'Unequal Splitter 90/10 (SC/UPC Drop Tap)', category: 'splitter', unit: 'pcs', lossPerUnit: 10.60, notes: '10% Tap Port with SC/UPC (10.6 dB loss)' },
  { name: 'Unequal Splitter 90/10 (Pass-Through)', category: 'splitter', unit: 'pcs', lossPerUnit: 0.70, notes: '90% Trunk Through Port (0.70 dB loss)' },
  { name: 'Unequal Splitter 80/20 (SC/UPC Drop Tap)', category: 'splitter', unit: 'pcs', lossPerUnit: 7.60, notes: '20% Tap Port with SC/UPC (7.6 dB loss)' },
  { name: 'Unequal Splitter 80/20 (Pass-Through)', category: 'splitter', unit: 'pcs', lossPerUnit: 1.25, notes: '80% Trunk Through Port (1.25 dB loss)' },

  // Fiber Cable Spans
  { name: 'G.652D Feeder / Trunk Fiber (1490nm)', category: 'cable', unit: 'km', lossPerUnit: 0.35, notes: 'Single-mode aerial/underground trunk cable (0.35 dB/km @ 1490nm)' },
  { name: 'G.657A Bend-Insensitive Drop Cable', category: 'cable', unit: 'km', lossPerUnit: 0.40, notes: '1-core / 2-core outdoor self-supporting flat drop (0.40 dB/km)' },
  { name: 'Upstream Attenuation (1310nm)', category: 'cable', unit: 'km', lossPerUnit: 0.38, notes: 'EPON upstream transmission loss (0.38 dB/km @ 1310nm)' },
  { name: 'Long Distance Span (1550nm)', category: 'cable', unit: 'km', lossPerUnit: 0.22, notes: 'Lowest attenuation window (0.22 dB/km @ 1550nm)' },

  // Splices
  { name: 'Fusion Splice (Arc Welded)', category: 'splice', unit: 'splices', lossPerUnit: 0.05, notes: 'Core-aligned fusion splice (0.02 - 0.08 dB, avg 0.05 dB)' },
  { name: 'Mechanical Splice', category: 'splice', unit: 'splices', lossPerUnit: 0.25, notes: 'Quick field mechanical splice unit' },

  // Margins & Attenuators
  { name: 'Optical Safety / Aging Margin', category: 'margin', unit: 'dB', lossPerUnit: 1.50, notes: 'EPON engineering buffer for aging & future repair splices' },
  { name: 'SC/UPC Fixed Attenuator 2 dB', category: 'attenuator', unit: 'pcs', lossPerUnit: 2.00, notes: 'SC/UPC Blue Male-Female 2dB inline pad' },
  { name: 'SC/UPC Fixed Attenuator 5 dB', category: 'attenuator', unit: 'pcs', lossPerUnit: 5.00, notes: 'SC/UPC Blue Male-Female 5dB inline pad' },
  { name: 'SC/UPC Fixed Attenuator 10 dB', category: 'attenuator', unit: 'pcs', lossPerUnit: 10.00, notes: 'SC/UPC Blue Male-Female 10dB inline pad' },

  // Subscriber ONU / ONT Endpoints
  { name: 'Standard EPON 1GE Bridge ONU (SC/UPC)', category: 'onu', unit: 'pcs', lossPerUnit: 0.00, notes: '1GE Gigabit Ethernet EPON SFU Terminal (Sensitivity: -27 dBm)' },
  { name: 'Dual-Band AC1200 WiFi EPON/XPON ONT (SC/UPC)', category: 'onu', unit: 'pcs', lossPerUnit: 0.00, notes: '4GE + 2.4G/5G WiFi Routing Gateway ONT (Sensitivity: -28 dBm)' },
  { name: 'Huawei HG8245H GPON/EPON ONT (SC/UPC)', category: 'onu', unit: 'pcs', lossPerUnit: 0.00, notes: '4GE + 2POTS + USB + WiFi Gateway ONT' },
  { name: 'ZTE F401 / F601 1GE EPON ONU (SC/UPC)', category: 'onu', unit: 'pcs', lossPerUnit: 0.00, notes: 'Compact 1-Port Gigabit EPON optical network unit' },
  { name: 'GPON/XPON Gateway ONT (SC/APC Green)', category: 'onu', unit: 'pcs', lossPerUnit: 0.00, notes: '8° Angled physical contact connector for GPON/CATV' },
] as const;

export const DEFAULT_PROFILES: FiberBudgetProfile[] = [
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

