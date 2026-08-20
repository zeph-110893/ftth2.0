import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Zap,
  Plus,
  Trash2,
  Copy,
  Edit2,
  Check,
  Search,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown,
  Shield,
  X,
  Server,
  Radio,
  Cable,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
} from 'lucide-react';
import { FiberBudgetProfile, FiberBudgetItem, FiberComponentCategory, FiberPonPort } from '../types';

interface ConsoleDirectoryTreeProps {
  profile: FiberBudgetProfile;
  calculation: {
    totalLossDb: number;
    txPower: number;
    rxPowerDbm: number;
    powerMarginDb: number;
    status: 'optimal' | 'good' | 'marginal' | 'critical' | 'overload';
    statusLabel: string;
    statusDesc: string;
    statusColor: string;
  };
  onUpdateItem: (itemId: string, updates: Partial<FiberBudgetItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onDuplicateItem: (itemId: string) => void;
  onMoveItem?: (itemId: string, direction: 'up' | 'down') => void;
  onAddItem: (item: Omit<FiberBudgetItem, 'id'>, insertAtIndex?: number) => void;
  onAddChildItem?: (parentId: string, item: Omit<FiberBudgetItem, 'id'>) => void;
  onUpdateTxPower?: (newTxPower: number, targetPonId?: string) => void;
  onAddPonPort?: (name?: string, txPowerDbm?: number) => void;
  onDeletePonPort?: (ponId: string) => void;
  onSelectPonPort?: (ponId: string) => void;
  onRenamePonPort?: (ponId: string, newName: string) => void;
}

// Splitter standards reference table for quick loss pre-population
const STANDARD_SPLITTERS = [
  { label: '1:2 PLC Splitter', ratio: '1:2', loss: 3.70, ports: 2, type: 'plc' },
  { label: '1:4 PLC Splitter', ratio: '1:4', loss: 7.30, ports: 4, type: 'plc' },
  { label: '1:8 PLC Splitter', ratio: '1:8', loss: 10.60, ports: 8, type: 'plc' },
  { label: '1:16 PLC Splitter', ratio: '1:16', loss: 13.90, ports: 16, type: 'plc' },
  { label: '1:32 PLC Splitter', ratio: '1:32', loss: 17.20, ports: 32, type: 'plc' },
  { label: '1:64 PLC Splitter', ratio: '1:64', loss: 20.60, ports: 64, type: 'plc' },
  { label: '90/10 Drop Tap (10% Tap)', ratio: '90/10 Tap', loss: 10.60, ports: 2, type: 'fbt' },
  { label: '90/10 Pass-Through (90% Trunk)', ratio: '90/10 Pass', loss: 0.70, ports: 2, type: 'fbt' },
  { label: '85/15 Drop Tap (15% Tap)', ratio: '85/15 Tap', loss: 8.80, ports: 2, type: 'fbt' },
  { label: '85/15 Pass-Through (85% Trunk)', ratio: '85/15 Pass', loss: 1.00, ports: 2, type: 'fbt' },
  { label: '80/20 Drop Tap (20% Tap)', ratio: '80/20 Tap', loss: 7.60, ports: 2, type: 'fbt' },
  { label: '80/20 Pass-Through (80% Trunk)', ratio: '80/20 Pass', loss: 1.25, ports: 2, type: 'fbt' },
  { label: '70/30 Drop Tap (30% Tap)', ratio: '70/30 Tap', loss: 5.80, ports: 2, type: 'fbt' },
  { label: '70/30 Pass-Through (70% Trunk)', ratio: '70/30 Pass', loss: 1.90, ports: 2, type: 'fbt' },
];

export const ConsoleDirectoryTree: React.FC<ConsoleDirectoryTreeProps> = ({
  profile,
  calculation,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem,
  onMoveItem,
  onAddItem,
  onAddChildItem,
  onUpdateTxPower,
  onAddPonPort,
  onDeletePonPort,
  onSelectPonPort,
  onRenamePonPort,
}) => {
  // Folder expansion state: folder IDs map to boolean
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    root: true,
    'pon-root': true,
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedAscii, setCopiedAscii] = useState<boolean>(false);

  // Modals
  const [isAddSplitterModalOpen, setIsAddSplitterModalOpen] = useState(false);
  const [splitterParentId, setSplitterParentId] = useState<string | null>(null);
  const [splitterRatioSelect, setSplitterRatioSelect] = useState('1:8');
  const [splitterPolish, setSplitterPolish] = useState<'SC/UPC' | 'SC/APC' | 'Bare'>('SC/UPC');
  const [splitterCustomName, setSplitterCustomName] = useState('1:8 PLC Splitter (SC/UPC)');
  const [splitterLoss, setSplitterLoss] = useState(10.60);
  const [splitterQty, setSplitterQty] = useState(1);
  const [splitterNotes, setSplitterNotes] = useState('');

  // Add PON modal
  const [isAddPonModalOpen, setIsAddPonModalOpen] = useState(false);
  const [newPonName, setNewPonName] = useState('');
  const [newPonTxPower, setNewPonTxPower] = useState(5.0);
  const [newPonWavelength, setNewPonWavelength] = useState(1490);

  // Add generic component modal
  const [isAddComponentModalOpen, setIsAddComponentModalOpen] = useState(false);
  const [componentParentId, setComponentParentId] = useState<string | null>(null);
  const [compCategory, setCompCategory] = useState<FiberComponentCategory>('cable');
  const [compTypePreset, setCompTypePreset] = useState<string>('sc_upc_fast');
  const [compName, setCompName] = useState('');
  const [compLoss, setCompLoss] = useState(0.35);
  const [compQty, setCompQty] = useState(1);
  const [compUnit, setCompUnit] = useState('km');
  const [compNotes, setCompNotes] = useState('');

  // Add ONU modal
  const [isAddOnuModalOpen, setIsAddOnuModalOpen] = useState(false);
  const [onuParentId, setOnuParentId] = useState<string | null>(null);
  const [onuParentName, setOnuParentName] = useState<string>('');
  const [onuParentPower, setOnuParentPower] = useState<number | null>(null);
  const [onuPresetId, setOnuPresetId] = useState('epon_1ge');
  const [onuName, setOnuName] = useState('ONU-01: Subscriber Endpoint');
  const [onuSubscriber, setOnuSubscriber] = useState('');
  const [onuModel, setOnuModel] = useState('EPON 1GE SFU (SC/UPC)');
  const [onuSerial, setOnuSerial] = useState('');
  const [onuPolish, setOnuPolish] = useState<'SC/UPC' | 'SC/APC'>('SC/UPC');
  const [onuLoss, setOnuLoss] = useState(0.00);
  const [onuSensitivity, setOnuSensitivity] = useState(-27.0);
  const [onuNotes, setOnuNotes] = useState('');

  // Inline editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editLoss, setEditLoss] = useState<string>('');
  const [editQty, setEditQty] = useState<string>('');

  // PON port list
  const ponPorts: FiberPonPort[] = useMemo(() => {
    if (profile.ponPorts && profile.ponPorts.length > 0) {
      return profile.ponPorts;
    }
    return [
      {
        id: 'pon-1',
        name: 'PON 1',
        portNumber: 1,
        txPowerDbm: profile.txPowerDbm ?? 5.0,
        wavelengthNm: profile.wavelengthNm ?? 1490,
        items: profile.items || [],
      },
    ];
  }, [profile.ponPorts, profile.txPowerDbm, profile.wavelengthNm, profile.items]);

  const activePonId = profile.activePonPortId || ponPorts[0]?.id || 'pon-1';
  const activePon = ponPorts.find((p) => p.id === activePonId) || ponPorts[0];

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: prev[folderId] === undefined ? false : !prev[folderId],
    }));
  };

  const isFolderExpanded = (folderId: string, defaultOpen = true) => {
    return expandedFolders[folderId] !== undefined ? expandedFolders[folderId] : defaultOpen;
  };

  const expandAll = () => {
    const next: Record<string, boolean> = { root: true, 'pon-root': true };
    const markAll = (items: FiberBudgetItem[]) => {
      items.forEach((it) => {
        next[`item-${it.id}`] = true;
        if (it.children && it.children.length > 0) {
          markAll(it.children);
        }
      });
    };
    markAll(profile.items);
    setExpandedFolders(next);
  };

  const collapseAll = () => {
    setExpandedFolders({ root: false, 'pon-root': false });
  };

  // Status badge helper
  const getPowerColorBadge = (dbm: number) => {
    if (dbm > profile.targetRxMaxDbm) {
      return { text: 'text-rose-400', tag: 'OVERLOAD', bg: 'bg-rose-950/60', border: 'border-rose-500/40' };
    }
    if (dbm >= profile.targetOptimalMinDbm && dbm <= profile.targetOptimalMaxDbm) {
      return { text: 'text-emerald-400', tag: 'OPTIMAL', bg: 'bg-emerald-950/60', border: 'border-emerald-500/40' };
    }
    if (dbm >= profile.targetRxMinDbm && dbm < profile.targetOptimalMinDbm) {
      return { text: 'text-amber-400', tag: 'MARGINAL', bg: 'bg-amber-950/60', border: 'border-amber-500/40' };
    }
    if (dbm < profile.targetRxMinDbm) {
      return { text: 'text-rose-400', tag: 'TOO LOW', bg: 'bg-rose-950/60', border: 'border-rose-500/40' };
    }
    return { text: 'text-cyan-400', tag: 'GOOD', bg: 'bg-cyan-950/60', border: 'border-cyan-500/40' };
  };

  // Start inline edit
  const handleStartEdit = (item: FiberBudgetItem) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditLoss(item.lossPerUnit.toString());
    setEditQty(item.quantity.toString());
  };

  const handleSaveEdit = (itemId: string) => {
    const lossNum = parseFloat(editLoss);
    const qtyNum = parseFloat(editQty);
    onUpdateItem(itemId, {
      name: editName.trim() || 'Optical Component',
      lossPerUnit: isNaN(lossNum) ? 0 : lossNum,
      quantity: isNaN(qtyNum) ? 1 : qtyNum,
      totalLoss: (isNaN(lossNum) ? 0 : lossNum) * (isNaN(qtyNum) ? 1 : qtyNum),
    });
    setEditingItemId(null);
  };

  // Open Add Splitter Modal
  const openAddSplitterModal = (parentId?: string) => {
    setSplitterParentId(parentId || null);
    setSplitterRatioSelect('1:8');
    setSplitterPolish('SC/UPC');
    setSplitterCustomName('1:8 PLC Splitter (SC/UPC)');
    setSplitterLoss(10.60);
    setSplitterQty(1);
    setSplitterNotes('');
    setIsAddSplitterModalOpen(true);
  };

  // Handle ratio select change
  const handleSplitterRatioChange = (ratio: string, polishOverride?: 'SC/UPC' | 'SC/APC' | 'Bare') => {
    setSplitterRatioSelect(ratio);
    const polish = polishOverride || splitterPolish;
    const std = STANDARD_SPLITTERS.find((s) => s.ratio === ratio);
    if (std) {
      setSplitterCustomName(`${std.label} (${polish})`);
      setSplitterLoss(std.loss);
    }
  };

  const handleSplitterPolishChange = (polish: 'SC/UPC' | 'SC/APC' | 'Bare') => {
    setSplitterPolish(polish);
    const std = STANDARD_SPLITTERS.find((s) => s.ratio === splitterRatioSelect);
    if (std) {
      setSplitterCustomName(`${std.label} (${polish})`);
    } else {
      setSplitterCustomName((prev) => prev.replace(/\((SC\/UPC|SC\/APC|Bare)\)/, `(${polish})`));
    }
  };

  // Submit Add Splitter
  const handleSaveNewSplitter = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: Omit<FiberBudgetItem, 'id'> = {
      name: splitterCustomName.trim() || `${splitterRatioSelect} Splitter`,
      category: 'splitter',
      quantity: splitterQty || 1,
      unit: 'pcs',
      lossPerUnit: splitterLoss,
      totalLoss: Number((splitterLoss * (splitterQty || 1)).toFixed(4)),
      enabled: true,
      splitterRatio: splitterRatioSelect,
      notes: splitterNotes.trim(),
      children: [],
    };

    if (splitterParentId && onAddChildItem) {
      onAddChildItem(splitterParentId, newItem);
      setExpandedFolders((prev) => ({
        ...prev,
        [`item-${splitterParentId}`]: true,
        root: true,
        'pon-root': true,
      }));
    } else {
      onAddItem(newItem);
    }

    setIsAddSplitterModalOpen(false);
  };

  // Open Add PON Modal
  const openAddPonModal = () => {
    const nextNumber = ponPorts.length + 1;
    setNewPonName(`PON ${nextNumber}`);
    setNewPonTxPower(5.0);
    setNewPonWavelength(1490);
    setIsAddPonModalOpen(true);
  };

  // Submit Add PON
  const handleSaveNewPon = (e: React.FormEvent) => {
    e.preventDefault();
    if (onAddPonPort) {
      onAddPonPort(newPonName.trim() || `PON ${ponPorts.length + 1}`, newPonTxPower);
    }
    setIsAddPonModalOpen(false);
  };

  // Open Generic Add Component Modal
  const openAddComponentModal = (parentId?: string, defaultCat: FiberComponentCategory = 'cable') => {
    setComponentParentId(parentId || null);
    setCompCategory(defaultCat);
    if (defaultCat === 'cable') {
      setCompName('G.652D Feeder / Trunk Fiber');
      setCompLoss(0.35);
      setCompUnit('km');
      setCompQty(1.0);
    } else if (defaultCat === 'connector') {
      setCompName('SC/UPC Fast Connector (Mechanical)');
      setCompLoss(0.50);
      setCompUnit('pcs');
      setCompQty(2);
    } else if (defaultCat === 'splice') {
      setCompName('Fusion Splice (Arc Welded)');
      setCompLoss(0.05);
      setCompUnit('splices');
      setCompQty(2);
    } else {
      setCompName('Optical Component');
      setCompLoss(1.0);
      setCompUnit('pcs');
      setCompQty(1);
    }
    setCompNotes('');
    setIsAddComponentModalOpen(true);
  };

  const handleSaveNewComponent = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: Omit<FiberBudgetItem, 'id'> = {
      name: compName.trim() || 'Optical Element',
      category: compCategory,
      quantity: Number(compQty) || 1,
      unit: compUnit.trim() || 'pcs',
      lossPerUnit: Number(compLoss) || 0,
      totalLoss: Number(((Number(compQty) || 1) * (Number(compLoss) || 0)).toFixed(4)),
      enabled: true,
      notes: compNotes.trim(),
      children: [],
    };

    if (componentParentId && onAddChildItem) {
      onAddChildItem(componentParentId, newItem);
      setExpandedFolders((prev) => ({
        ...prev,
        [`item-${componentParentId}`]: true,
        root: true,
        'pon-root': true,
      }));
    } else {
      onAddItem(newItem);
    }

    setIsAddComponentModalOpen(false);
  };

  // Get flat list of all splitters in current profile for parent selection
  const allSplittersList = useMemo(() => {
    const list: Array<{ id: string; name: string }> = [];
    const traverse = (items: FiberBudgetItem[], prefix = '') => {
      items.forEach((it) => {
        if (it.category === 'splitter') {
          list.push({ id: it.id, name: prefix ? `${prefix} ➔ ${it.name}` : it.name });
        }
        if (it.children && it.children.length > 0) {
          traverse(it.children, prefix ? `${prefix} ➔ ${it.name}` : it.name);
        }
      });
    };
    traverse(profile.items || []);
    return list;
  }, [profile.items]);

  // Open Add ONU Modal
  const openAddOnuModal = (parentId?: string, parentEstimatedPower?: number, parentName?: string) => {
    setOnuParentId(parentId || null);
    setOnuParentName(parentName || (parentId ? 'Selected Splitter Branch' : 'Direct OLT Feeder'));
    setOnuParentPower(parentEstimatedPower !== undefined ? parentEstimatedPower : calculation.rxPowerDbm);
    setOnuPresetId('epon_1ge');
    setOnuName(`ONU-0${Math.floor(Math.random() * 80 + 10)}: Subscriber`);
    setOnuSubscriber('');
    setOnuModel('EPON 1GE SFU (SC/UPC)');
    setOnuSerial(`EPON${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
    setOnuPolish('SC/UPC');
    setOnuLoss(0.00);
    setOnuSensitivity(-27.0);
    setOnuNotes('');
    setIsAddOnuModalOpen(true);
  };

  // Switch ONU Preset
  const handleOnuPresetChange = (presetKey: string) => {
    setOnuPresetId(presetKey);
    switch (presetKey) {
      case 'epon_1ge':
        setOnuName('EPON 1GE Bridge ONU (SC/UPC)');
        setOnuModel('EPON 1GE SFU (SC/UPC)');
        setOnuPolish('SC/UPC');
        setOnuSensitivity(-27.0);
        setOnuLoss(0.00);
        break;
      case 'xpon_ac1200':
        setOnuName('XPON AC1200 Dual-Band WiFi ONT (SC/UPC)');
        setOnuModel('XPON AC1200 4GE+WiFi HGU');
        setOnuPolish('SC/UPC');
        setOnuSensitivity(-28.0);
        setOnuLoss(0.00);
        break;
      case 'huawei_hg8245':
        setOnuName('Huawei HG8245H GPON/EPON ONT');
        setOnuModel('EchoLife HG8245H GPON/EPON');
        setOnuPolish('SC/UPC');
        setOnuSensitivity(-27.0);
        setOnuLoss(0.00);
        break;
      case 'zte_f401':
        setOnuName('ZTE F401 1-Port EPON ONU (SC/UPC)');
        setOnuModel('ZTE F401 EPON SFU');
        setOnuPolish('SC/UPC');
        setOnuSensitivity(-27.0);
        setOnuLoss(0.00);
        break;
      case 'gpon_sc_apc':
        setOnuName('GPON/XPON Gateway ONT (SC/APC Green)');
        setOnuModel('GPON HGU SC/APC');
        setOnuPolish('SC/APC');
        setOnuSensitivity(-28.0);
        setOnuLoss(0.00);
        break;
      case 'custom':
        setOnuName('Custom Subscriber ONU / ONT');
        setOnuModel('Custom ONU Model');
        setOnuSensitivity(-27.0);
        setOnuLoss(0.00);
        break;
    }
  };

  // Submit Add ONU
  const handleSaveNewOnu = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: Omit<FiberBudgetItem, 'id'> = {
      name: onuName.trim() || 'Subscriber ONU / ONT',
      category: 'onu',
      quantity: 1,
      unit: 'pcs',
      lossPerUnit: Number(onuLoss) || 0,
      totalLoss: Number(onuLoss) || 0,
      enabled: true,
      notes: onuNotes.trim(),
      onuModel: onuModel.trim(),
      onuSubscriber: onuSubscriber.trim(),
      onuSerial: onuSerial.trim(),
      onuTargetSensitivity: Number(onuSensitivity) || -27.0,
      children: [],
    };

    if (onuParentId && onAddChildItem) {
      onAddChildItem(onuParentId, newItem);
      setExpandedFolders((prev) => ({
        ...prev,
        [`item-${onuParentId}`]: true,
        root: true,
        'pon-root': true,
      }));
    } else {
      onAddItem(newItem);
    }

    setIsAddOnuModalOpen(false);
  };

  // Generate ASCII Tree
  const generateAsciiTree = () => {
    let out = `ODN FIBER DIRECTORY TREE\n`;
    out += `======================================================\n`;
    out += `OLT Launch Power: +${activePon.txPowerDbm.toFixed(2)} dBm (${activePon.wavelengthNm || 1490}nm SC/UPC)\n`;
    out += `Total Budget Loss: -${calculation.totalLossDb.toFixed(2)} dB | Final Rx: ${calculation.rxPowerDbm.toFixed(2)} dBm (${calculation.statusLabel})\n`;
    out += `======================================================\n\n`;
    out += `/ Central Office OLT (Launch: +${activePon.txPowerDbm.toFixed(2)} dBm)\n`;
    out += `└── 📁 ${activePon.name}\n`;

    let currentP = activePon.txPowerDbm;

    const printNodes = (items: FiberBudgetItem[], indent: string, inP: number): number => {
      let p = inP;
      items.forEach((it, idx) => {
        const isLast = idx === items.length - 1;
        const prefix = isLast ? '└── ' : '├── ';
        const childIndent = indent + (isLast ? '    ' : '│   ');
        const loss = it.enabled ? it.quantity * it.lossPerUnit : 0;
        p -= loss;
        const icon = it.category === 'splitter' ? '📁' : it.category === 'onu' ? '🖥️' : '📄';
        const subTag = it.onuSubscriber ? ` [👤 ${it.onuSubscriber}]` : '';
        out += `${indent}${prefix}${icon} ${it.name}${subTag} [-${loss.toFixed(2)} dB] ➔ ${p.toFixed(2)} dBm\n`;
        if (it.children && it.children.length > 0) {
          printNodes(it.children, childIndent, p);
        }
      });
      return p;
    };

    printNodes(profile.items, '    ', currentP);
    return out;
  };

  const handleCopyAscii = () => {
    navigator.clipboard.writeText(generateAsciiTree());
    setCopiedAscii(true);
    setTimeout(() => setCopiedAscii(false), 2000);
  };

  // Render a Single Tree Node
  const renderTreeNode = (
    item: FiberBudgetItem,
    depth: number,
    incomingPower: number,
    isLastChild: boolean,
    parentPath: string
  ): { nodeElement: React.ReactNode; outgoingPower: number } => {
    const isSplitter = item.category === 'splitter';
    const isOnu = item.category === 'onu';
    const itemLoss = item.enabled ? Number(item.quantity) * Number(item.lossPerUnit) : 0;
    const pin = incomingPower;
    const pout = incomingPower - itemLoss;
    const powerBadge = getPowerColorBadge(pout);

    const itemFolderId = `item-${item.id}`;
    const isExpanded = isFolderExpanded(itemFolderId, true);
    const hasChildren = Boolean(item.children && item.children.length > 0);

    const matchesSearch =
      !searchQuery.trim() ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.onuSubscriber && item.onuSubscriber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.onuModel && item.onuModel.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.splitterRatio && item.splitterRatio.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch && !hasChildren) {
      return { nodeElement: null, outgoingPower: pout };
    }

    // Children rendering
    const childElements: React.ReactNode[] = [];
    if (hasChildren) {
      item.children!.forEach((child, cIdx) => {
        const isLastSub = cIdx === item.children!.length - 1;
        const res = renderTreeNode(child, depth + 1, pout, isLastSub, `${parentPath}/${item.name}`);
        if (res.nodeElement) {
          childElements.push(res.nodeElement);
        }
      });
    }

    const isEditing = editingItemId === item.id;

    // Optical margin for ONU endpoint
    const onuTarget = item.onuTargetSensitivity || -27.0;
    const onuMargin = pout - onuTarget;

    const nodeElement = (
      <div key={item.id} className="relative group/node select-none">
        {/* ROW */}
        <div
          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-all ${
            isSplitter
              ? 'bg-slate-900/90 border-slate-800 hover:border-purple-500/50 hover:bg-slate-850'
              : isOnu
              ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-400/60 hover:bg-emerald-950/35 shadow-xs'
              : 'bg-slate-950/70 border-transparent hover:border-slate-800 hover:bg-slate-900/60'
          } ${!item.enabled ? 'opacity-50' : ''}`}
          style={{ marginLeft: `${depth * 20}px` }}
        >
          {/* Left: Tree line guide + Icon + Name */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Expand / Collapse Icon or Leaf connector */}
            {isSplitter ? (
              <button
                onClick={() => toggleFolder(itemFolderId)}
                className="w-4 h-4 flex items-center justify-center text-purple-400 hover:text-purple-300 cursor-pointer shrink-0"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-4 h-4 flex items-center justify-center text-slate-600 shrink-0 font-mono text-[11px]">
                {isLastChild ? '└' : '├'}
              </span>
            )}

            {/* Component Icon */}
            <div className="shrink-0">
              {isSplitter ? (
                isExpanded ? (
                  <FolderOpen className="w-4 h-4 text-purple-400" />
                ) : (
                  <Folder className="w-4 h-4 text-purple-400" />
                )
              ) : isOnu ? (
                <Server className="w-3.5 h-3.5 text-emerald-400" />
              ) : item.category === 'cable' ? (
                <Cable className="w-3.5 h-3.5 text-cyan-400" />
              ) : item.category === 'connector' ? (
                <Radio className="w-3.5 h-3.5 text-blue-400" />
              ) : item.category === 'splice' ? (
                <Zap className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Shield className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>

            {/* Name / Inline Edit */}
            {isEditing ? (
              <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-slate-950 border border-cyan-500 rounded px-2 py-0.5 text-xs text-white flex-1"
                  autoFocus
                />
                <input
                  type="number"
                  step="any"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                  placeholder="Qty"
                />
                <input
                  type="number"
                  step="0.01"
                  value={editLoss}
                  onChange={(e) => setEditLoss(e.target.value)}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-amber-300 text-center font-mono"
                  placeholder="Loss dB"
                />
                <button
                  onClick={() => handleSaveEdit(item.id)}
                  className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs cursor-pointer"
                  title="Save changes"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingItemId(null)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 truncate flex-wrap">
                <span
                  onDoubleClick={() => handleStartEdit(item)}
                  className={`text-xs font-semibold truncate ${
                    isSplitter
                      ? 'text-slate-100 font-bold'
                      : isOnu
                      ? 'text-emerald-200 font-bold'
                      : 'text-slate-300'
                  }`}
                  title={`${item.name} (Double-click to rename)`}
                >
                  {item.name}
                </span>

                {/* Subscriber Tag */}
                {item.onuSubscriber && (
                  <span className="text-[10px] bg-emerald-900/60 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30 font-medium">
                    👤 {item.onuSubscriber}
                  </span>
                )}

                {/* ONU Model Tag */}
                {item.onuModel && (
                  <span className="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.2 rounded border border-slate-800 font-mono hidden sm:inline">
                    {item.onuModel}
                  </span>
                )}

                {/* ONU Serial */}
                {item.onuSerial && (
                  <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                    SN: {item.onuSerial}
                  </span>
                )}

                {/* Quantity for items */}
                {!isOnu && item.quantity !== 1 && (
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
                    {item.quantity} {item.unit}
                  </span>
                )}

                {item.notes && (
                  <span className="text-[10px] text-slate-500 italic truncate hidden lg:inline">
                    ({item.notes})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: Loss badge + Arriving Power + Quick Actions */}
          {!isEditing && (
            <div className="flex items-center gap-2 shrink-0">
              {/* Component Loss Badge */}
              {!isOnu && (
                <span className="text-[11px] font-mono font-bold text-amber-300/90 bg-amber-950/30 border border-amber-500/20 px-2 py-0.5 rounded">
                  -{itemLoss.toFixed(2)} dB
                </span>
              )}

              {/* Optical Margin if ONU */}
              {isOnu && (
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded hidden sm:inline ${
                    onuMargin >= 3
                      ? 'text-emerald-300 bg-emerald-950/80 border border-emerald-500/30'
                      : onuMargin >= 0
                      ? 'text-amber-300 bg-amber-950/80 border border-amber-500/30'
                      : 'text-rose-300 bg-rose-950/80 border border-rose-500/30'
                  }`}
                  title={`Receiver Sensitivity: ${onuTarget} dBm (Margin: ${onuMargin.toFixed(1)} dB)`}
                >
                  +{onuMargin.toFixed(1)} dB margin
                </span>
              )}

              {/* Optical Light Power Result */}
              <span
                className={`text-[11px] font-mono font-extrabold px-2 py-0.5 rounded border ${powerBadge.bg} ${powerBadge.border} ${powerBadge.text}`}
                title={`Pin: ${pin.toFixed(2)} dBm ➔ Pout: ${pout.toFixed(2)} dBm`}
              >
                {pout >= 0 ? `+${pout.toFixed(2)}` : pout.toFixed(2)} dBm
              </span>

              {/* Hover Actions Bar */}
              <div className="opacity-0 group-hover/node:opacity-100 transition-opacity flex items-center gap-1 bg-slate-950/90 border border-slate-800 p-0.5 rounded-lg shadow-sm">
                {/* + Add ONU inside Splitter */}
                {isSplitter && (
                  <button
                    onClick={() => openAddOnuModal(item.id, pout, item.name)}
                    className="p-1 text-emerald-300 hover:text-white hover:bg-emerald-900/60 rounded cursor-pointer transition-colors"
                    title="Add ONU / Subscriber ONT inside this splitter"
                  >
                    <Server className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* + Nested Child Splitter */}
                {isSplitter && (
                  <button
                    onClick={() => openAddSplitterModal(item.id)}
                    className="p-1 text-purple-300 hover:text-white hover:bg-purple-900/60 rounded cursor-pointer transition-colors"
                    title="Nest a sub-splitter inside this branch"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* + Nested Drop Cable / Component */}
                {isSplitter && (
                  <button
                    onClick={() => openAddComponentModal(item.id, 'cable')}
                    className="p-1 text-cyan-300 hover:text-white hover:bg-cyan-900/60 rounded cursor-pointer transition-colors"
                    title="Add drop cable span or connector"
                  >
                    <Cable className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Edit */}
                <button
                  onClick={() => handleStartEdit(item)}
                  className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded cursor-pointer transition-colors"
                  title="Edit component name or loss"
                >
                  <Edit2 className="w-3 h-3" />
                </button>

                {/* Move Up/Down */}
                {onMoveItem && (
                  <>
                    <button
                      onClick={() => onMoveItem(item.id, 'up')}
                      className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded cursor-pointer transition-colors"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onMoveItem(item.id, 'down')}
                      className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded cursor-pointer transition-colors"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </>
                )}

                {/* Duplicate */}
                <button
                  onClick={() => onDuplicateItem(item.id)}
                  className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded cursor-pointer transition-colors"
                  title="Duplicate component"
                >
                  <Copy className="w-3 h-3" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => onDeleteItem(item.id)}
                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 rounded cursor-pointer transition-colors"
                  title="Delete from tree"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Render Child Tree items if expanded */}
        {isSplitter && isExpanded && (
          <div className="mt-1 space-y-1 relative before:absolute before:left-[18px] before:top-0 before:bottom-2 before:w-px before:bg-slate-800">
            {childElements}

            {/* Splitter quick branch actions toolbar */}
            <div
              className="flex items-center gap-1.5 pl-6 py-1 flex-wrap"
              style={{ marginLeft: `${depth * 20}px` }}
            >
              <button
                onClick={() => openAddOnuModal(item.id, pout, item.name)}
                className="px-2.5 py-1 bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                title={`Add an ONU / subscriber terminal inside ${item.name}`}
              >
                <Server className="w-3 h-3 text-emerald-400" />
                <span>+ Add ONU to {item.name}</span>
              </button>

              <button
                onClick={() => openAddSplitterModal(item.id)}
                className="px-2.5 py-1 bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-500/40 hover:border-purple-400 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                title={`Add a nested sub-splitter inside ${item.name}`}
              >
                <Plus className="w-3 h-3 text-purple-400" />
                <span>+ Sub-Splitter</span>
              </button>

              <button
                onClick={() => openAddComponentModal(item.id, 'cable')}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-all"
                title="Add drop cable span or connector"
              >
                <Cable className="w-3 h-3 text-cyan-400" />
                <span>+ Drop Fiber</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );

    return { nodeElement, outgoingPower: pout };
  };

  // Render tree nodes
  let currentTracePower = activePon.txPowerDbm;
  const renderedTreeNodes: React.ReactNode[] = [];
  const itemsToRender = profile?.items || [];

  itemsToRender.forEach((it, idx) => {
    const isLast = idx === itemsToRender.length - 1;
    const res = renderTreeNode(it, 1, currentTracePower, isLast, activePon.name);
    currentTracePower = res.outgoingPower;
    if (res.nodeElement) {
      renderedTreeNodes.push(res.nodeElement);
    }
  });

  return (
    <div className="space-y-3 font-sans">
      {/* PON PORT SELECTOR & MANAGEMENT TABS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span>PON Ports:</span>
            </span>

            {/* List of PON tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {ponPorts.map((pon) => {
                const isActive = pon.id === activePonId;
                return (
                  <button
                    key={pon.id}
                    onClick={() => onSelectPonPort && onSelectPonPort(pon.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      isActive
                        ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40 border border-cyan-400/50'
                        : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    <span>{pon.name}</span>
                    <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-black/40 text-amber-300">
                      +{pon.txPowerDbm.toFixed(1)} dBm
                    </span>
                  </button>
                );
              })}

              {/* Add New PON button */}
              <button
                onClick={openAddPonModal}
                className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-dashed border-cyan-500/40 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add PON Port</span>
              </button>
            </div>
          </div>

          {/* Delete active PON (if more than 1) */}
          {ponPorts.length > 1 && onDeletePonPort && (
            <button
              onClick={() => {
                if (confirm(`Delete "${activePon.name}" and all its optical elements?`)) {
                  onDeletePonPort(activePon.id);
                }
              }}
              className="text-xs text-slate-500 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove {activePon.name}</span>
            </button>
          )}
        </div>
      </div>

      {/* DIRECTORY TREE TOP TOOLBAR */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Directory Tree Title & Info */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/40 rounded-xl text-purple-300">
            <Folder className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">ODN Directory Tree</h3>
              <span className="text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full">
                EPON 1490nm (SC/UPC)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Active Port: <strong className="text-cyan-300">{activePon.name}</strong> • Optical power trace from OLT laser to subscriber ONU
            </p>
          </div>
        </div>

        {/* Right: Quick Tree Controls & Search */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Search Filter */}
          <div className="relative w-36 sm:w-44">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search tree..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Expand / Collapse All */}
          <button
            onClick={expandAll}
            className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
            title="Expand all tree folders"
          >
            <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Expand All</span>
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
            title="Collapse all tree folders"
          >
            <Minimize2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Collapse All</span>
          </button>

          {/* Copy ASCII Tree */}
          <button
            onClick={handleCopyAscii}
            className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 rounded-xl border border-slate-800 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            title="Copy clean ASCII tree text"
          >
            {copiedAscii ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copiedAscii ? 'Copied!' : 'Copy Tree'}</span>
          </button>
        </div>
      </div>

      {/* DIRECTORY TREE EXPLORER CANVAS */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 p-3 sm:p-5 shadow-inner space-y-2">
        {/* ROOT NODE: Central Office OLT / Active PON Port */}
        <div className="bg-slate-900 border border-cyan-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="p-2 bg-cyan-950 border border-cyan-500/50 rounded-lg text-cyan-400 shrink-0">
              <Server className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-wide">
                  Central Office OLT • {activePon.name}
                </span>
                <span className="text-[10px] text-cyan-300 font-mono font-bold bg-cyan-950 px-1.5 py-0.2 rounded border border-cyan-500/30">
                  Launch Laser
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                TX Laser Power: <strong className="text-cyan-300 font-mono">+{activePon.txPowerDbm.toFixed(2)} dBm</strong> (EPON SC/UPC)
              </p>
            </div>
          </div>

          {/* Action buttons on OLT root */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* Quick TX Power Stepper */}
            {onUpdateTxPower && (
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
                <button
                  onClick={() => onUpdateTxPower(Number((activePon.txPowerDbm - 0.5).toFixed(2)), activePon.id)}
                  className="px-2 py-1 hover:bg-slate-800 text-slate-300 rounded cursor-pointer font-bold"
                  title="-0.5 dBm"
                >
                  -
                </button>
                <span className="px-2 text-cyan-300 font-bold">
                  +{activePon.txPowerDbm.toFixed(2)} dBm
                </span>
                <button
                  onClick={() => onUpdateTxPower(Number((activePon.txPowerDbm + 0.5).toFixed(2)), activePon.id)}
                  className="px-2 py-1 hover:bg-slate-800 text-slate-300 rounded cursor-pointer font-bold"
                  title="+0.5 dBm"
                >
                  +
                </button>
              </div>
            )}

            {/* + Add ONU */}
            <button
              onClick={() => openAddOnuModal()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              title="Add subscriber ONU / ONT terminal"
            >
              <Server className="w-3.5 h-3.5" />
              <span>+ Add ONU</span>
            </button>

            {/* + Add Splitter */}
            <button
              onClick={() => openAddSplitterModal()}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Splitter</span>
            </button>

            {/* + Add Component */}
            <button
              onClick={() => openAddComponentModal()}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Component</span>
            </button>
          </div>
        </div>

        {/* DIRECTORY TREE ITEMS */}
        <div className="space-y-1 pt-1">
          {renderedTreeNodes.length > 0 ? (
            renderedTreeNodes
          ) : (
            <div className="p-8 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-xl space-y-3">
              <p className="text-slate-400 text-xs font-medium">
                No optical components on <strong className="text-slate-200">{activePon.name}</strong> yet. Start building from scratch:
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => openAddSplitterModal()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Splitter (PLC / Tap)</span>
                </button>
                <button
                  onClick={() => openAddComponentModal(undefined, 'cable')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Fiber Cable</span>
                </button>
                <button
                  onClick={() => openAddComponentModal(undefined, 'connector')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer border border-slate-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add SC/UPC Connector</span>
                </button>
              </div>
            </div>
          )}

          {/* LEAF TERMINATION NODE: SUBSCRIBER ONU/ONT */}
          {renderedTreeNodes.length > 0 && (
            <div
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 mt-2 select-none"
              style={{ marginLeft: '20px' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-mono text-xs">└─ 🏁</span>
                <span className="text-xs font-bold text-white">Subscriber Optical Network Unit (ONU / ONT)</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 hidden sm:inline">Final Arriving Light:</span>
                <span
                  className={`text-xs font-mono font-extrabold px-2.5 py-1 rounded-lg border ${
                    calculation.status === 'optimal'
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                      : calculation.status === 'good'
                      ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                      : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                  }`}
                >
                  {calculation.rxPowerDbm.toFixed(2)} dBm [{calculation.statusLabel}]
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ADD SPLITTER MODAL (From Scratch) */}
      {isAddSplitterModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-purple-500/40 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl">
                  <Folder className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    {splitterParentId ? 'Add Sub-Splitter (Nested)' : 'Add Splitter to Link'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Configure PLC equal split or asymmetric FBT drop tap
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddSplitterModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewSplitter} className="space-y-3.5">
              {/* Ratio Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Splitter Type &amp; Ratio *
                </label>
                <select
                  value={splitterRatioSelect}
                  onChange={(e) => handleSplitterRatioChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500 cursor-pointer font-semibold"
                >
                  <optgroup label="── Standard PLC Equal Splitters (SC) ──">
                    <option value="1:2">1:2 PLC Splitter (~3.70 dB loss)</option>
                    <option value="1:4">1:4 PLC Splitter (~7.30 dB loss)</option>
                    <option value="1:8">1:8 PLC Splitter (~10.60 dB loss)</option>
                    <option value="1:16">1:16 PLC Splitter (~13.90 dB loss)</option>
                    <option value="1:32">1:32 PLC Splitter (~17.20 dB loss)</option>
                    <option value="1:64">1:64 PLC Splitter (~20.60 dB loss)</option>
                  </optgroup>
                  <optgroup label="── Asymmetric FBT Drop Taps ──">
                    <option value="90/10 Tap">90/10 Drop Tap Port (10.60 dB loss)</option>
                    <option value="90/10 Pass">90/10 Trunk Through Port (0.70 dB loss)</option>
                    <option value="85/15 Tap">85/15 Drop Tap Port (8.80 dB loss)</option>
                    <option value="85/15 Pass">85/15 Trunk Through Port (1.00 dB loss)</option>
                    <option value="80/20 Tap">80/20 Drop Tap Port (7.60 dB loss)</option>
                    <option value="80/20 Pass">80/20 Trunk Through Port (1.25 dB loss)</option>
                    <option value="70/30 Tap">70/30 Drop Tap Port (5.80 dB loss)</option>
                    <option value="70/30 Pass">70/30 Trunk Through Port (1.90 dB loss)</option>
                  </optgroup>
                  <optgroup label="── Custom ──">
                    <option value="custom">Custom Splitter Specification</option>
                  </optgroup>
                </select>
              </div>

              {/* Connector Polish Type */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Connector Polish Type
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSplitterPolishChange('SC/UPC')}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      splitterPolish === 'SC/UPC'
                        ? 'bg-blue-600 text-white border-blue-400 shadow-xs'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    <span>SC/UPC (Blue)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSplitterPolishChange('SC/APC')}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      splitterPolish === 'SC/APC'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-xs'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>SC/APC (Green)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSplitterPolishChange('Bare')}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      splitterPolish === 'Bare'
                        ? 'bg-amber-600 text-white border-amber-400 shadow-xs'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>Bare Fiber</span>
                  </button>
                </div>
              </div>

              {/* Custom Name */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Splitter Name / Label *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Primary 1:4 Hub, NAP-01 1:8 Splitter, Pole #12 Tap"
                  value={splitterCustomName}
                  onChange={(e) => setSplitterCustomName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Loss and Qty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Insertion Loss <span className="text-amber-400 font-bold">(dB) *</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={splitterLoss}
                    onChange={(e) => setSplitterLoss(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-purple-500/50 text-amber-300 font-mono font-bold text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Quantity (Units)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={splitterQty}
                    onChange={(e) => setSplitterQty(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500 text-center"
                  />
                </div>
              </div>

              {/* Location Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Installation Notes / Location (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. NAP Box Pole #14, Fiber Distribution Terminal (FDT-01)"
                  value={splitterNotes}
                  onChange={(e) => setSplitterNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Total preview */}
              <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 text-xs flex justify-between items-center">
                <span className="text-slate-400">Total Optical Loss Added:</span>
                <span className="text-amber-300 font-mono font-extrabold text-sm">
                  -{(splitterLoss * (splitterQty || 1)).toFixed(2)} dB
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddSplitterModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Insert Splitter</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD PON MODAL (From Scratch) */}
      {isAddPonModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Create New PON Port</h3>
                  <p className="text-xs text-slate-400">
                    Add a fresh EPON port with independent optical budget
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddPonModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewPon} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">PON Port Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PON 2, PON 1 - North Feeder, Sector B"
                  value={newPonName}
                  onChange={(e) => setNewPonName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  EPON SFP Laser TX Output Power (dBm) *
                </label>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setNewPonTxPower(3.5)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
                      newPonTxPower === 3.5 ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    PX20 (+3.5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPonTxPower(5.0)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
                      newPonTxPower === 5.0 ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    PX20+ (+5.0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPonTxPower(7.5)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
                      newPonTxPower === 7.5 ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    PX20++ (+7.5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPonTxPower(9.0)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
                      newPonTxPower === 9.0 ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    PX20+++ (+9)
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newPonTxPower}
                    onChange={(e) => setNewPonTxPower(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-xs text-slate-400 font-bold absolute right-3 top-1/2 -translate-y-1/2">
                    dBm
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Downstream Wavelength</label>
                <select
                  value={newPonWavelength}
                  onChange={(e) => setNewPonWavelength(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value={1490}>1490 nm (EPON Standard Downstream)</option>
                  <option value={1310}>1310 nm (EPON Upstream)</option>
                  <option value={1550}>1550 nm (RF Video Overlay / Long Reach)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddPonModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create PON Port</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD GENERIC OPTICAL COMPONENT MODAL (From Scratch) */}
      {isAddComponentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Add Optical Component</h3>
                  <p className="text-xs text-slate-400">
                    Add fiber cable spans, SC/UPC connectors, fusion splices, or attenuators
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddComponentModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewComponent} className="space-y-3.5">
              {/* Category tabs */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Component Category</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCompCategory('cable');
                      setCompName('G.652D Feeder / Trunk Fiber');
                      setCompLoss(0.35);
                      setCompUnit('km');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                      compCategory === 'cable'
                        ? 'bg-blue-600 text-white border-blue-400'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <Cable className="w-3.5 h-3.5" />
                    <span>Fiber Cable</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCompCategory('connector');
                      setCompTypePreset('sc_upc_fast');
                      setCompName('SC/UPC Fast Connector (Field Mechanical)');
                      setCompLoss(0.50);
                      setCompUnit('pcs');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                      compCategory === 'connector'
                        ? 'bg-blue-600 text-white border-blue-400'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>SC Connector</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCompCategory('splice');
                      setCompTypePreset('fusion_splice');
                      setCompName('Fusion Splice (Arc Welded)');
                      setCompLoss(0.05);
                      setCompUnit('splices');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                      compCategory === 'splice'
                        ? 'bg-amber-600 text-white border-amber-400'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Splice</span>
                  </button>
                </div>
              </div>

              {/* Quick SC Presets if connector selected */}
              {compCategory === 'connector' && (
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    SC Connector Presets
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCompTypePreset('sc_upc_fast');
                        setCompName('SC/UPC Fast Connector (Field Mechanical)');
                        setCompLoss(0.50);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        compTypePreset === 'sc_upc_fast'
                          ? 'bg-blue-950/60 border-blue-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-blue-300">
                          <span className="w-2 h-2 rounded-full bg-blue-400" />
                          SC/UPC Fast
                        </span>
                        <span className="text-amber-400 font-mono">0.50 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Blue • Field tool</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCompTypePreset('sc_apc_fast');
                        setCompName('SC/APC Fast Connector (Field Mechanical)');
                        setCompLoss(0.50);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        compTypePreset === 'sc_apc_fast'
                          ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          SC/APC Fast
                        </span>
                        <span className="text-amber-400 font-mono">0.50 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Green • 8° Angled</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCompTypePreset('sc_upc_soc');
                        setCompName('SC/UPC Factory Pigtail (SOC)');
                        setCompLoss(0.15);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        compTypePreset === 'sc_upc_soc'
                          ? 'bg-blue-950/60 border-blue-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-blue-300">
                          <span className="w-2 h-2 rounded-full bg-blue-400" />
                          SC/UPC Pigtail
                        </span>
                        <span className="text-emerald-400 font-mono">0.15 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Factory ferrule</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCompTypePreset('sc_adapter');
                        setCompName('SC/UPC Mating Adapter / Coupler Flange');
                        setCompLoss(0.20);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        compTypePreset === 'sc_adapter'
                          ? 'bg-blue-950/60 border-blue-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-cyan-300">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          SC Coupler / Adapter
                        </span>
                        <span className="text-emerald-400 font-mono">0.20 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">ODF / NAP bulkhead</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Component Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. G.652D Feeder Span, SC/UPC Drop Connector, Fusion Splice #3"
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Loss, Qty, Unit */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Loss per Unit <span className="text-amber-400 font-bold">(dB) *</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={compLoss}
                    onChange={(e) => setCompLoss(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-cyan-500/50 text-amber-300 font-mono font-bold text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-400 text-right"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Quantity *</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={compQty}
                    onChange={(e) => setCompQty(parseFloat(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 text-center"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Unit</label>
                  <input
                    type="text"
                    value={compUnit}
                    onChange={(e) => setCompUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Location / Tag (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pole #12 to NAP-01, Drop line to ONT"
                  value={compNotes}
                  onChange={(e) => setCompNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 text-xs flex justify-between items-center">
                <span className="text-slate-400">Total Loss:</span>
                <span className="text-amber-300 font-mono font-extrabold text-sm">
                  -{(compLoss * (compQty || 1)).toFixed(2)} dB
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddComponentModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Component</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ONU / ONT SUBSCRIBER MODAL */}
      {isAddOnuModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-950 border border-emerald-500/50 text-emerald-400 rounded-xl">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Add ONU / ONT Subscriber Terminal</h3>
                  <p className="text-xs text-slate-400">
                    Connect an Optical Network Unit to a nested splitter or feeder
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddOnuModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewOnu} className="space-y-3.5">
              {/* Branch / Splitter Attachment Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Attach to ODN Branch / Splitter *
                </label>
                <select
                  value={onuParentId || ''}
                  onChange={(e) => setOnuParentId(e.target.value || null)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Direct OLT Root / Feeder Line</option>
                  {allSplittersList.map((spl) => (
                    <option key={spl.id} value={spl.id}>
                      📁 Splitter: {spl.name}
                    </option>
                  ))}
                </select>
                {onuParentName && (
                  <p className="text-[11px] text-emerald-400/90 mt-1 flex items-center gap-1">
                    <span>Target parent:</span>
                    <strong className="font-semibold text-emerald-300">{onuParentName}</strong>
                  </p>
                )}
              </div>

              {/* ONU Quick Hardware Presets */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Popular ONU / ONT Hardware Presets
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOnuPresetChange('epon_1ge')}
                    className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                      onuPresetId === 'epon_1ge'
                        ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        EPON 1GE SFU
                      </span>
                      <span className="text-cyan-300 font-mono text-[11px]">-27 dBm</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">SC/UPC • Bridge Mode</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOnuPresetChange('xpon_ac1200')}
                    className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                      onuPresetId === 'xpon_ac1200'
                        ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        XPON AC1200 WiFi
                      </span>
                      <span className="text-cyan-300 font-mono text-[11px]">-28 dBm</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">SC/UPC • Dual-Band HGU</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOnuPresetChange('huawei_hg8245')}
                    className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                      onuPresetId === 'huawei_hg8245'
                        ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        Huawei HG8245H
                      </span>
                      <span className="text-cyan-300 font-mono text-[11px]">-27 dBm</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">GPON/EPON 4GE+POTS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOnuPresetChange('gpon_sc_apc')}
                    className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                      onuPresetId === 'gpon_sc_apc'
                        ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        GPON SC/APC ONT
                      </span>
                      <span className="text-cyan-300 font-mono text-[11px]">-28 dBm</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Green 8° Polish</span>
                  </button>
                </div>
              </div>

              {/* ONU Label */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  ONU Tree Label *
                </label>
                <input
                  type="text"
                  required
                  value={onuName}
                  onChange={(e) => setOnuName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. ONU-01: Subscriber John"
                />
              </div>

              {/* Subscriber Name & Hardware Model */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Subscriber / Customer Name
                  </label>
                  <input
                    type="text"
                    value={onuSubscriber}
                    onChange={(e) => setOnuSubscriber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. John Doe (Unit 4B)"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Hardware Model
                  </label>
                  <input
                    type="text"
                    value={onuModel}
                    onChange={(e) => setOnuModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. EPON 1GE SFU"
                  />
                </div>
              </div>

              {/* Serial Number & Polish */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Serial Number / GPON SN
                  </label>
                  <input
                    type="text"
                    value={onuSerial}
                    onChange={(e) => setOnuSerial(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. EPON89A4F1"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Optical Port Polish
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOnuPolish('SC/UPC')}
                      className={`py-2 px-1 text-center rounded-xl border text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                        onuPolish === 'SC/UPC'
                          ? 'bg-blue-600 text-white border-blue-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      <span>SC/UPC</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnuPolish('SC/APC')}
                      className={`py-2 px-1 text-center rounded-xl border text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                        onuPolish === 'SC/APC'
                          ? 'bg-emerald-600 text-white border-emerald-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>SC/APC</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Sensitivity & Loss */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    RX Sensitivity Floor <span className="text-cyan-400 font-bold">(dBm)</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={onuSensitivity}
                    onChange={(e) => setOnuSensitivity(parseFloat(e.target.value) || -27.0)}
                    className="w-full bg-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 text-center"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Final Loss Offset <span className="text-amber-400 font-bold">(dB)</span>
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={onuLoss}
                    onChange={(e) => setOnuLoss(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 text-amber-300 font-mono font-bold text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 text-center"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Live Arriving Power Preview */}
              {onuParentPower !== null && (
                <div className="bg-slate-950/90 rounded-xl p-3 border border-emerald-500/30 text-xs flex justify-between items-center">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 block">Estimated Arriving Optical Power:</span>
                    <span className="text-[11px] text-emerald-400 font-medium">
                      Target Sensitivity: {onuSensitivity} dBm
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-300 font-mono font-extrabold text-sm block">
                      {(onuParentPower - onuLoss).toFixed(2)} dBm
                    </span>
                    <span className="text-[10px] text-cyan-300 font-mono">
                      +{((onuParentPower - onuLoss) - onuSensitivity).toFixed(1)} dB margin
                    </span>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Location / Installation Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Living room wall mount, NAP port #4, 15m drop cable"
                  value={onuNotes}
                  onChange={(e) => setOnuNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddOnuModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Server className="w-4 h-4" />
                  <span>Add ONU to Tree</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
