import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Copy,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
  HelpCircle,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  Activity,
  Edit2,
  Radio,
  Sliders,
  Maximize2,
  Smartphone,
  Monitor,
  LayoutGrid,
  List,
  FolderTree,
  Database,
  Folder,
  Cable,
} from 'lucide-react';
import { FiberBudgetProfile, FiberBudgetItem, FiberComponentCategory, FiberPonPort } from '../types';
import { DEFAULT_PROFILES } from '../data/opticalPresets';
import { FiberDirectoryTree } from './FiberDirectoryTree';

const STORAGE_KEY = 'epon_upc_fiber_budget_profiles_v3';
const ACTIVE_PROFILE_KEY = 'epon_upc_active_budget_profile_id_v3';

// Standard splitters reference data
const STANDARD_SPLITTER_OPTIONS = [
  { label: '1:2 PLC Splitter', ratio: '1:2', loss: 3.70, type: 'plc' },
  { label: '1:4 PLC Splitter', ratio: '1:4', loss: 7.30, type: 'plc' },
  { label: '1:8 PLC Splitter', ratio: '1:8', loss: 10.60, type: 'plc' },
  { label: '1:16 PLC Splitter', ratio: '1:16', loss: 13.90, type: 'plc' },
  { label: '1:32 PLC Splitter', ratio: '1:32', loss: 17.20, type: 'plc' },
  { label: '1:64 PLC Splitter', ratio: '1:64', loss: 20.60, type: 'plc' },
  { label: '90/10 Drop Tap (10% Tap)', ratio: '90/10 Tap', loss: 10.60, type: 'fbt' },
  { label: '90/10 Pass-Through (90% Trunk)', ratio: '90/10 Pass', loss: 0.70, type: 'fbt' },
  { label: '85/15 Drop Tap (15% Tap)', ratio: '85/15 Tap', loss: 8.80, type: 'fbt' },
  { label: '85/15 Pass-Through (85% Trunk)', ratio: '85/15 Pass', loss: 1.00, type: 'fbt' },
  { label: '80/20 Drop Tap (20% Tap)', ratio: '80/20 Tap', loss: 7.60, type: 'fbt' },
  { label: '80/20 Pass-Through (80% Trunk)', ratio: '80/20 Pass', loss: 1.25, type: 'fbt' },
  { label: '70/30 Drop Tap (30% Tap)', ratio: '70/30 Tap', loss: 5.80, type: 'fbt' },
  { label: '70/30 Pass-Through (70% Trunk)', ratio: '70/30 Pass', loss: 1.90, type: 'fbt' },
];

export const FiberLightBudget: React.FC = () => {
  // Sync status with SQLite database
  const [sqliteSyncStatus, setSqliteSyncStatus] = useState<'synced' | 'saving' | 'error'>('synced');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved profiles from localStorage or initialize with blank profile
  const [profiles, setProfiles] = useState<FiberBudgetProfile[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.error('Error loading fiber budget profiles:', e);
      }
    }
    return DEFAULT_PROFILES;
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem(ACTIVE_PROFILE_KEY);
      if (savedId && profiles.some((p) => p.id === savedId)) {
        return savedId;
      }
    }
    return profiles[0]?.id || DEFAULT_PROFILES[0].id;
  });

  // Mobile vs Desktop vs Directory Tree view mode for components list
  const [viewMode, setViewMode] = useState<'tree' | 'auto' | 'cards' | 'table'>('tree');

  // Modals for building from scratch
  const [isAddSplitterModalOpen, setIsAddSplitterModalOpen] = useState(false);
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

  // Add Cable modal
  const [isAddCableModalOpen, setIsAddCableModalOpen] = useState(false);
  const [cableName, setCableName] = useState('G.652D Trunk Fiber Cable');
  const [cableLength, setCableLength] = useState<number>(1.0);
  const [cableLossPerKm, setCableLossPerKm] = useState<number>(0.35);
  const [cableNotes, setCableNotes] = useState('');

  // Add Connector / Splice modal
  const [isAddConnModalOpen, setIsAddConnModalOpen] = useState(false);
  const [connCategory, setConnCategory] = useState<'connector' | 'splice'>('connector');
  const [connTypePreset, setConnTypePreset] = useState<string>('sc_upc_fast');
  const [connName, setConnName] = useState('SC/UPC Fast Connector (Field Mechanical)');
  const [connLoss, setConnLoss] = useState<number>(0.50);
  const [connQty, setConnQty] = useState<number>(2);
  const [connNotes, setConnNotes] = useState('');

  // Add Custom Item modal
  const [isAddCustomModalOpen, setIsAddCustomModalOpen] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemCategory, setCustomItemCategory] = useState<FiberComponentCategory>('splitter');
  const [customItemQty, setCustomItemQty] = useState<number>(1);
  const [customItemUnit, setCustomItemUnit] = useState<string>('pcs');
  const [customItemLoss, setCustomItemLoss] = useState<number>(1.0);
  const [customItemNotes, setCustomItemNotes] = useState<string>('');

  // Edit Profile Details modal
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileTitle, setEditProfileTitle] = useState('');
  const [editProfileDesc, setEditProfileDesc] = useState('');

  // Reference guide toggle
  const [showReferenceGuide, setShowReferenceGuide] = useState(false);

  // Quick feedback notification
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 3500);
  };

  // Load initial profiles from SQLite backend
  useEffect(() => {
    let isMounted = true;
    async function loadFromSqlite() {
      try {
        const res = await fetch('/api/fiber-budget/profiles');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
            setProfiles(data.profiles);
            if (data.activeProfileId && data.profiles.some((p: any) => p.id === data.activeProfileId)) {
              setActiveProfileId(data.activeProfileId);
            }
            setSqliteSyncStatus('synced');
            setLastSavedTime(new Date().toLocaleTimeString());
          }
        }
      } catch (err) {
        console.warn('Could not connect to SQLite backend for fiber profiles, using cached storage:', err);
      }
    }
    loadFromSqlite();
    return () => {
      isMounted = false;
    };
  }, []);

  // Save changes to localStorage as secondary backup
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch (e) {
      console.error('Error saving profiles to localStorage:', e);
    }
  }, [profiles]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
    } catch (e) {
      console.error('Error saving active profile ID:', e);
    }
  }, [activeProfileId]);

  // Direct persistence helper to SQLite
  const persistProfileToSqlite = async (profileToSave: FiberBudgetProfile) => {
    try {
      setSqliteSyncStatus('saving');
      const res = await fetch('/api/fiber-budget/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileToSave),
      });
      if (res.ok) {
        setSqliteSyncStatus('synced');
        setLastSavedTime(new Date().toLocaleTimeString());
      } else {
        setSqliteSyncStatus('error');
      }
    } catch (err) {
      console.error('Failed to persist profile to SQLite:', err);
      setSqliteSyncStatus('error');
    }
  };

  const scheduleSaveToSqlite = (profileToSave: FiberBudgetProfile) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setSqliteSyncStatus('saving');
    saveTimeoutRef.current = setTimeout(() => {
      persistProfileToSqlite(profileToSave);
    }, 500);
  };

  const handleSelectProfile = (newId: string) => {
    setActiveProfileId(newId);
    fetch('/api/fiber-budget/active-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProfileId: newId }),
    }).catch(() => {});
  };

  // Current active profile
  const currentProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || profiles[0] || DEFAULT_PROFILES[0];
  }, [profiles, activeProfileId]);

  // Profile update helper
  const updateCurrentProfile = (updater: (prev: FiberBudgetProfile) => FiberBudgetProfile) => {
    setProfiles((prevList) => {
      const updatedList = prevList.map((p) => {
        if (p.id === currentProfile.id) {
          const updated = { ...updater(p), updatedAt: new Date().toISOString() };
          scheduleSaveToSqlite(updated);
          return updated;
        }
        return p;
      });
      return updatedList;
    });
  };

  // Multiple PON and Manual dBm Management Handlers
  const handleSetManualTxPower = (newTxPower: number, targetPonId?: string) => {
    updateCurrentProfile((prev) => {
      const ports = prev.ponPorts && prev.ponPorts.length > 0 ? [...prev.ponPorts] : [
        {
          id: 'pon-1',
          name: 'PON 1',
          portNumber: 1,
          txPowerDbm: prev.txPowerDbm ?? 5.0,
          wavelengthNm: prev.wavelengthNm ?? 1490,
          items: prev.items || [],
        },
      ];
      const activeId = targetPonId || prev.activePonPortId || ports[0].id;
      const updatedPorts = ports.map((p) =>
        p.id === activeId ? { ...p, txPowerDbm: newTxPower } : p
      );
      return {
        ...prev,
        txPowerDbm: newTxPower,
        ponPorts: updatedPorts,
        activePonPortId: activeId,
      };
    });
  };

  const handleAddPonPort = (name?: string, txPowerDbm?: number) => {
    updateCurrentProfile((prev) => {
      const existingPorts = prev.ponPorts && prev.ponPorts.length > 0 ? [...prev.ponPorts] : [
        {
          id: 'pon-1',
          name: 'PON 1',
          portNumber: 1,
          txPowerDbm: prev.txPowerDbm ?? 5.0,
          wavelengthNm: prev.wavelengthNm ?? 1490,
          items: prev.items || [],
        },
      ];
      const nextPortNum = existingPorts.length + 1;
      const newPonId = `pon-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newPort: FiberPonPort = {
        id: newPonId,
        name: name || `PON ${nextPortNum}`,
        portNumber: nextPortNum,
        txPowerDbm: txPowerDbm !== undefined ? txPowerDbm : (prev.txPowerDbm ?? 5.0),
        wavelengthNm: prev.wavelengthNm ?? 1490,
        items: [],
      };
      return {
        ...prev,
        ponPorts: [...existingPorts, newPort],
        activePonPortId: newPonId,
        items: [],
        txPowerDbm: newPort.txPowerDbm,
      };
    });
    showNotification(`Created ${name || 'New PON Port'} successfully`);
  };

  const handleDeletePonPort = (ponId: string) => {
    updateCurrentProfile((prev) => {
      if (!prev.ponPorts || prev.ponPorts.length <= 1) return prev;
      const remainingPorts = prev.ponPorts.filter((p) => p.id !== ponId);
      const nextActive = remainingPorts[0];
      return {
        ...prev,
        ponPorts: remainingPorts,
        activePonPortId: nextActive.id,
        items: nextActive.items || [],
        txPowerDbm: nextActive.txPowerDbm,
      };
    });
    showNotification('PON Port deleted');
  };

  const handleSelectPonPort = (ponId: string) => {
    updateCurrentProfile((prev) => {
      if (!prev.ponPorts || prev.ponPorts.length === 0) return prev;
      const currentActiveId = prev.activePonPortId || prev.ponPorts[0].id;
      const updatedPorts = prev.ponPorts.map((p) => {
        if (p.id === currentActiveId) {
          return { ...p, items: prev.items, txPowerDbm: prev.txPowerDbm };
        }
        return p;
      });

      const targetPort = updatedPorts.find((p) => p.id === ponId) || updatedPorts[0];
      return {
        ...prev,
        ponPorts: updatedPorts,
        activePonPortId: targetPort.id,
        items: targetPort.items || [],
        txPowerDbm: targetPort.txPowerDbm,
      };
    });
  };

  const handleRenamePonPort = (ponId: string, newName: string) => {
    updateCurrentProfile((prev) => {
      if (!prev.ponPorts) return prev;
      return {
        ...prev,
        ponPorts: prev.ponPorts.map((p) => (p.id === ponId ? { ...p, name: newName } : p)),
      };
    });
    showNotification(`PON Port renamed to "${newName}"`);
  };

  // Top-level optical loss calculation
  const calculateTotalLoss = (items: FiberBudgetItem[]): number => {
    return items.reduce((acc, item) => {
      if (!item.enabled) return acc;
      const selfLoss = Number(item.quantity) * Number(item.lossPerUnit) || 0;
      return acc + selfLoss;
    }, 0);
  };

  const accumulateCategoryTotals = (
    items: FiberBudgetItem[],
    totals: Record<FiberComponentCategory, number>
  ) => {
    items.forEach((item) => {
      if (item.enabled) {
        const loss = Number(item.quantity) * Number(item.lossPerUnit) || 0;
        totals[item.category] = (totals[item.category] || 0) + loss;
      }
    });
  };

  // Calculate totals
  const calculation = useMemo(() => {
    const profileItems = currentProfile?.items || [];
    const totalLossDb = calculateTotalLoss(profileItems);
    const txPower = Number(currentProfile?.txPowerDbm) || 0;
    const rxPowerDbm = txPower - totalLossDb;
    const powerMarginDb = rxPowerDbm - (currentProfile?.targetRxMinDbm ?? -27.0);

    const categoryTotals: Record<FiberComponentCategory, number> = {
      splitter: 0,
      onu: 0,
      cable: 0,
      splice: 0,
      connector: 0,
      attenuator: 0,
      margin: 0,
      other: 0,
    };

    accumulateCategoryTotals(profileItems, categoryTotals);

    let status: 'optimal' | 'good' | 'marginal' | 'critical' | 'overload' = 'optimal';
    let statusLabel = 'Optimal Signal';
    let statusDesc = 'Excellent signal level. High SNR with zero frame drops.';
    let statusColor = 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40';
    let meterColor = 'bg-emerald-500';

    if (rxPowerDbm > currentProfile.targetRxMaxDbm) {
      status = 'overload';
      statusLabel = 'Laser Overload Warning';
      statusDesc = 'Optical power exceeds EPON receiver overload limit (-6 dBm). May damage or saturate ONT photodiode.';
      statusColor = 'text-rose-400 bg-rose-950/60 border-rose-500/40';
      meterColor = 'bg-rose-500';
    } else if (rxPowerDbm < currentProfile.targetRxMinDbm) {
      status = 'critical';
      statusLabel = 'Critical Loss / Link Down';
      statusDesc = `Signal is below EPON ONU sensitivity floor (${currentProfile.targetRxMinDbm} dBm). ONU will fail to authenticate or suffer high packet loss.`;
      statusColor = 'text-red-400 bg-red-950/60 border-red-500/40';
      meterColor = 'bg-red-600';
    } else if (rxPowerDbm < currentProfile.targetOptimalMinDbm) {
      status = 'marginal';
      statusLabel = 'Marginal / Borderline';
      statusDesc = 'Operating near threshold (<3 dB buffer). Vulnerable to cable bends or fiber aging.';
      statusColor = 'text-amber-400 bg-amber-950/60 border-amber-500/40';
      meterColor = 'bg-amber-500';
    } else if (rxPowerDbm < -22.0) {
      status = 'good';
      statusLabel = 'Good / Stable Link';
      statusDesc = 'Normal working window for EPON PX20/PX20+ ONUs with stable throughput.';
      statusColor = 'text-cyan-400 bg-cyan-950/60 border-cyan-500/40';
      meterColor = 'bg-cyan-500';
    }

    let measuredDelta: number | null = null;
    let measuredStatusText = '';
    if (currentProfile.measuredRxDbm !== null && currentProfile.measuredRxDbm !== undefined && !isNaN(currentProfile.measuredRxDbm)) {
      measuredDelta = currentProfile.measuredRxDbm - rxPowerDbm;
      if (Math.abs(measuredDelta) <= 1.0) {
        measuredStatusText = 'Field OPM matches calculated light budget within acceptable ±1.0 dB tolerance.';
      } else if (measuredDelta < -1.0) {
        measuredStatusText = `Excess loss of ${Math.abs(measuredDelta).toFixed(2)} dB detected in field. Check for dirty SC/UPC blue connectors, microbends, or splice degradation.`;
      } else {
        measuredStatusText = `Field OPM reading is ${measuredDelta.toFixed(2)} dB stronger than theoretical estimate.`;
      }
    }

    return {
      totalLossDb,
      txPower,
      rxPowerDbm,
      powerMarginDb,
      status,
      statusLabel,
      statusDesc,
      statusColor,
      meterColor,
      categoryTotals,
      measuredDelta,
      measuredStatusText,
    };
  }, [currentProfile]);

  // Tree recursive helpers
  const updateTreeItemRecursive = (
    items: FiberBudgetItem[],
    id: string,
    updates: Partial<FiberBudgetItem>
  ): FiberBudgetItem[] => {
    return items.map((it) => {
      if (it.id === id) {
        const next = { ...it, ...updates };
        if (updates.quantity !== undefined || updates.lossPerUnit !== undefined) {
          const qty = updates.quantity !== undefined ? updates.quantity : it.quantity;
          const loss = updates.lossPerUnit !== undefined ? updates.lossPerUnit : it.lossPerUnit;
          next.totalLoss = Number((qty * loss).toFixed(4));
        }
        return next;
      }
      if (it.children && it.children.length > 0) {
        return {
          ...it,
          children: updateTreeItemRecursive(it.children, id, updates),
        };
      }
      return it;
    });
  };

  const deleteTreeItemRecursive = (items: FiberBudgetItem[], id: string): FiberBudgetItem[] => {
    return items
      .filter((it) => it.id !== id)
      .map((it) => {
        if (it.children && it.children.length > 0) {
          return {
            ...it,
            children: deleteTreeItemRecursive(it.children, id),
          };
        }
        return it;
      });
  };

  const toggleTreeItemRecursive = (items: FiberBudgetItem[], id: string): FiberBudgetItem[] => {
    return items.map((it) => {
      if (it.id === id) {
        return { ...it, enabled: !it.enabled };
      }
      if (it.children && it.children.length > 0) {
        return {
          ...it,
          children: toggleTreeItemRecursive(it.children, id),
        };
      }
      return it;
    });
  };

  const duplicateTreeItemRecursive = (items: FiberBudgetItem[], id: string): FiberBudgetItem[] => {
    const next: FiberBudgetItem[] = [];
    items.forEach((it) => {
      next.push(it);
      if (it.id === id) {
        const copy: FiberBudgetItem = {
          ...it,
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: `${it.name} (Copy)`,
        };
        next.push(copy);
      } else if (it.children && it.children.length > 0) {
        it.children = duplicateTreeItemRecursive(it.children, id);
      }
    });
    return next;
  };

  const addChildToTreeRecursive = (
    items: FiberBudgetItem[],
    parentId: string,
    newChild: FiberBudgetItem
  ): FiberBudgetItem[] => {
    return items.map((it) => {
      if (it.id === parentId) {
        return {
          ...it,
          children: [...(it.children || []), newChild],
        };
      }
      if (it.children && it.children.length > 0) {
        return {
          ...it,
          children: addChildToTreeRecursive(it.children, parentId, newChild),
        };
      }
      return it;
    });
  };

  const handleItemToggle = (itemId: string) => {
    updateCurrentProfile((prof) => ({
      ...prof,
      items: toggleTreeItemRecursive(prof.items, itemId),
    }));
  };

  const handleItemDelete = (itemId: string) => {
    updateCurrentProfile((prof) => ({
      ...prof,
      items: deleteTreeItemRecursive(prof.items, itemId),
    }));
    showNotification('Item removed from budget calculation.');
  };

  const handleItemDuplicate = (itemId: string) => {
    updateCurrentProfile((prof) => ({
      ...prof,
      items: duplicateTreeItemRecursive(prof.items, itemId),
    }));
    showNotification('Item duplicated.');
  };

  const handleItemMove = (itemId: string, direction: 'up' | 'down') => {
    updateCurrentProfile((prof) => {
      const index = prof.items.findIndex((it) => it.id === itemId);
      if (index < 0) return prof;
      if (direction === 'up' && index === 0) return prof;
      if (direction === 'down' && index === prof.items.length - 1) return prof;

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const newItems = [...prof.items];
      const [moved] = newItems.splice(index, 1);
      newItems.splice(targetIndex, 0, moved);
      return { ...prof, items: newItems };
    });
  };

  const handleUpdateItem = (itemId: string, updates: Partial<FiberBudgetItem>) => {
    updateCurrentProfile((prof) => ({
      ...prof,
      items: updateTreeItemRecursive(prof.items, itemId, updates),
    }));
  };

  const handleAddChildItem = (parentId: string, item: Omit<FiberBudgetItem, 'id'>) => {
    const newChild: FiberBudgetItem = {
      ...item,
      id: `child-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      totalLoss: Number(((item.quantity || 1) * (item.lossPerUnit || 0)).toFixed(4)),
    };
    updateCurrentProfile((prof) => ({
      ...prof,
      items: addChildToTreeRecursive(prof.items, parentId, newChild),
    }));
    showNotification(`Added "${newChild.name}" into branch.`);
  };

  const handleAddItemDirect = (item: Omit<FiberBudgetItem, 'id'>, insertAtIndex?: number) => {
    const newItem: FiberBudgetItem = {
      ...item,
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      totalLoss: Number((item.quantity * item.lossPerUnit).toFixed(4)),
    };
    updateCurrentProfile((prof) => {
      const newItems = [...prof.items];
      if (insertAtIndex !== undefined && insertAtIndex >= 0 && insertAtIndex <= newItems.length) {
        newItems.splice(insertAtIndex, 0, newItem);
      } else {
        newItems.push(newItem);
      }
      return { ...prof, items: newItems };
    });
    showNotification(`Added "${newItem.name}" to link tree.`);
  };

  // Clear all items on active PON port
  const handleClearAllItems = () => {
    if (confirm('Clear all optical components on this PON port and start from scratch?')) {
      updateCurrentProfile((prof) => ({
        ...prof,
        items: [],
      }));
      showNotification('All components cleared. Blank canvas ready.');
    }
  };

  // Splitter Modal Submission
  const handleSplitterRatioChange = (ratio: string) => {
    setSplitterRatioSelect(ratio);
    const opt = STANDARD_SPLITTER_OPTIONS.find((s) => s.ratio === ratio);
    if (opt) {
      setSplitterCustomName(`${opt.label} (SC/UPC)`);
      setSplitterLoss(opt.loss);
    }
  };

  const handleSaveSplitterModal = (e: React.FormEvent) => {
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
    handleAddItemDirect(newItem);
    setIsAddSplitterModalOpen(false);
  };

  // PON Modal Submission
  const handleSavePonModal = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddPonPort(newPonName.trim() || `PON ${(currentProfile.ponPorts?.length || 1) + 1}`, newPonTxPower);
    setIsAddPonModalOpen(false);
  };

  // Cable Modal Submission
  const handleSaveCableModal = (e: React.FormEvent) => {
    e.preventDefault();
    const len = Number(cableLength) || 1;
    const loss = Number(cableLossPerKm) || 0.35;
    const newItem: Omit<FiberBudgetItem, 'id'> = {
      name: cableName.trim() || 'Fiber Cable Span',
      category: 'cable',
      quantity: len,
      unit: 'km',
      lossPerUnit: loss,
      totalLoss: Number((len * loss).toFixed(4)),
      enabled: true,
      notes: cableNotes.trim(),
      children: [],
    };
    handleAddItemDirect(newItem);
    setIsAddCableModalOpen(false);
  };

  // Connector Modal Submission
  const handleSaveConnModal = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(connQty) || 1;
    const loss = Number(connLoss) || 0;
    const newItem: Omit<FiberBudgetItem, 'id'> = {
      name: connName.trim() || (connCategory === 'connector' ? 'SC/UPC Connector' : 'Fusion Splice'),
      category: connCategory,
      quantity: qty,
      unit: connCategory === 'splice' ? 'splices' : 'pcs',
      lossPerUnit: loss,
      totalLoss: Number((qty * loss).toFixed(4)),
      enabled: true,
      notes: connNotes.trim(),
      children: [],
    };
    handleAddItemDirect(newItem);
    setIsAddConnModalOpen(false);
  };

  // Custom Item Modal Submission
  const handleSaveCustomModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customItemName.trim()) {
      alert('Please enter a component name');
      return;
    }

    const newItem: Omit<FiberBudgetItem, 'id'> = {
      name: customItemName.trim(),
      category: customItemCategory,
      quantity: Number(customItemQty) || 1,
      unit: customItemUnit || 'pcs',
      lossPerUnit: Number(customItemLoss) || 0,
      totalLoss: Number(((Number(customItemQty) || 1) * (Number(customItemLoss) || 0)).toFixed(4)),
      enabled: true,
      notes: customItemNotes.trim(),
      children: [],
    };

    handleAddItemDirect(newItem);
    setIsAddCustomModalOpen(false);
  };

  // Profile Management Handlers
  const handleCreateNewProfile = () => {
    const newProfId = `prof-${Date.now()}`;
    const newProfile: FiberBudgetProfile = {
      id: newProfId,
      title: 'New EPON Link Budget',
      description: 'Custom EPON optical link path',
      txPowerDbm: 5.0,
      wavelengthNm: 1490,
      targetRxMinDbm: -27.0,
      targetRxMaxDbm: -6.0,
      targetOptimalMinDbm: -24.0,
      targetOptimalMaxDbm: -14.0,
      measuredRxDbm: null,
      updatedAt: new Date().toISOString(),
      items: [],
      ponPorts: [
        {
          id: 'pon-1',
          name: 'PON 1',
          portNumber: 1,
          txPowerDbm: 5.0,
          wavelengthNm: 1490,
          items: [],
        },
      ],
      activePonPortId: 'pon-1',
    };

    setProfiles((prev) => [newProfile, ...prev]);
    setActiveProfileId(newProfId);
    persistProfileToSqlite(newProfile);
    fetch('/api/fiber-budget/active-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProfileId: newProfId }),
    }).catch(() => {});
    showNotification('Created new blank EPON profile.');
  };

  const handleDuplicateProfile = () => {
    const copyId = `prof-${Date.now()}`;
    const copyProfile: FiberBudgetProfile = {
      ...currentProfile,
      id: copyId,
      title: `${currentProfile.title} (Copy)`,
      updatedAt: new Date().toISOString(),
      items: currentProfile.items.map((it) => ({ ...it, id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}` })),
    };
    setProfiles((prev) => [copyProfile, ...prev]);
    setActiveProfileId(copyId);
    persistProfileToSqlite(copyProfile);
    fetch('/api/fiber-budget/active-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProfileId: copyId }),
    }).catch(() => {});
    showNotification('Duplicated link budget profile.');
  };

  const handleDeleteProfile = async () => {
    if (profiles.length <= 1) {
      alert('You must have at least one link budget profile.');
      return;
    }
    if (confirm(`Are you sure you want to delete profile "${currentProfile.title}"?`)) {
      const deletedId = currentProfile.id;
      const remaining = profiles.filter((p) => p.id !== deletedId);
      setProfiles(remaining);
      const nextActiveId = remaining[0].id;
      setActiveProfileId(nextActiveId);
      try {
        setSqliteSyncStatus('saving');
        await fetch(`/api/fiber-budget/profiles/${deletedId}`, { method: 'DELETE' });
        await fetch('/api/fiber-budget/active-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeProfileId: nextActiveId }),
        });
        setSqliteSyncStatus('synced');
        setLastSavedTime(new Date().toLocaleTimeString());
      } catch (e) {
        console.error('Error deleting from SQLite:', e);
        setSqliteSyncStatus('error');
      }
      showNotification('Profile deleted.');
    }
  };

  const handleSaveProfileMetadata = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProfileTitle.trim()) return;
    updateCurrentProfile((p) => ({
      ...p,
      title: editProfileTitle.trim(),
      description: editProfileDesc.trim(),
    }));
    setIsEditProfileOpen(false);
    showNotification('Profile details updated.');
  };

  const handleExportCsv = () => {
    const headers = ['Category', 'Component Name', 'Quantity', 'Unit', 'Loss Per Unit (dB)', 'Total Loss (dB)', 'Enabled', 'Notes'];
    const rows = currentProfile.items.map((it) => [
      it.category,
      `"${it.name.replace(/"/g, '""')}"`,
      it.quantity,
      it.unit,
      it.lossPerUnit,
      (it.quantity * it.lossPerUnit).toFixed(4),
      it.enabled ? 'Yes' : 'No',
      `"${(it.notes || '').replace(/"/g, '""')}"`,
    ]);

    const summaryRows = [
      [],
      ['Summary Calculation - EPON SC/UPC Light Budget'],
      ['Profile Name', `"${currentProfile.title}"`],
      ['EPON OLT TX Laser Power', `${currentProfile.txPowerDbm} dBm`],
      ['Total Optical Link Loss', `${calculation.totalLossDb.toFixed(2)} dB`],
      ['Calculated RX Power at ONT', `${calculation.rxPowerDbm.toFixed(2)} dBm`],
      ['Power Margin (vs Sensitivity)', `${calculation.powerMarginDb.toFixed(2)} dB`],
      ['Status', calculation.statusLabel],
      ['Measured Field OPM', currentProfile.measuredRxDbm !== null ? `${currentProfile.measuredRxDbm} dBm` : 'N/A'],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(',')), ...summaryRows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `epon_light_budget_${currentProfile.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryBadge = (cat: FiberComponentCategory) => {
    switch (cat) {
      case 'splitter':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 whitespace-nowrap">Splitter</span>;
      case 'onu':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">Subscriber ONU</span>;
      case 'cable':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 whitespace-nowrap">Fiber Cable</span>;
      case 'connector':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 whitespace-nowrap">SC/UPC Connector</span>;
      case 'splice':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">Splice</span>;
      case 'attenuator':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 whitespace-nowrap">Attenuator</span>;
      case 'margin':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">Margin Buffer</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-700 text-slate-300 whitespace-nowrap">Other</span>;
    }
  };

  return (
    <div className="space-y-5 pb-20 sm:pb-12 max-w-7xl mx-auto px-1 sm:px-0 font-sans">
      {/* Toast Notification */}
      {feedbackMessage && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-50 bg-slate-900/95 text-cyan-300 px-4 py-3 rounded-xl border border-cyan-500/40 shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Top Header & Profile Selection Bar */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/30 rounded-xl text-blue-400 shrink-0 shadow-inner">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  EPON Optical Light Budget Calculator
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30 uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                  EPON • SC/UPC (Blue)
                </span>
                <span
                  title={sqliteSyncStatus === 'saving' ? 'Saving changes to SQLite database...' : sqliteSyncStatus === 'error' ? 'SQLite sync error. Using local storage.' : `Light budget data is securely persisted in SQLite database (${lastSavedTime ? `Synced at ${lastSavedTime}` : 'Synced'}).`}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 shadow-xs transition-colors ${
                    sqliteSyncStatus === 'saving'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : sqliteSyncStatus === 'error'
                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  <Database className={`w-3 h-3 ${sqliteSyncStatus === 'saving' ? 'text-amber-400 animate-spin' : sqliteSyncStatus === 'error' ? 'text-rose-400' : 'text-emerald-400'}`} />
                  <span>
                    {sqliteSyncStatus === 'saving' ? 'Saving to SQLite...' : sqliteSyncStatus === 'error' ? 'SQLite Offline' : 'SQLite Synced'}
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Add PON ports and splitters from scratch, configure link parameters, and diagnose optical loss.
              </p>
            </div>
          </div>

          {/* Profile Switcher & Actions Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
            <div className="relative flex-1 min-w-[200px]">
              <select
                value={activeProfileId}
                onChange={(e) => handleSelectProfile(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2.5 pr-8 focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="flex items-center justify-between sm:justify-start gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => {
                  setEditProfileTitle(currentProfile.title);
                  setEditProfileDesc(currentProfile.description || '');
                  setIsEditProfileOpen(true);
                }}
                title="Edit Profile Name & Description"
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors text-xs font-semibold flex items-center justify-center cursor-pointer min-w-[38px] min-h-[38px]"
              >
                <Edit2 className="w-4 h-4" />
              </button>

              <button
                onClick={handleDuplicateProfile}
                title="Clone Profile"
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors text-xs font-semibold flex items-center justify-center cursor-pointer min-w-[38px] min-h-[38px]"
              >
                <Copy className="w-4 h-4" />
              </button>

              <button
                onClick={handleCreateNewProfile}
                className="py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0 min-h-[38px]"
              >
                <Plus className="w-4 h-4" />
                <span className="whitespace-nowrap">New Link</span>
              </button>

              <div className="border-l border-slate-800 pl-1.5 flex items-center gap-1">
                <button
                  onClick={handleExportCsv}
                  title="Export CSV"
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center"
                >
                  <Download className="w-4 h-4" />
                </button>
                {profiles.length > 1 && (
                  <button
                    onClick={handleDeleteProfile}
                    title="Delete Current Profile"
                    className="p-2.5 bg-slate-800/80 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-700/80 transition-colors cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {currentProfile.description && (
          <p className="text-xs text-slate-400 mt-2.5 pt-2.5 border-t border-slate-800/80 italic leading-relaxed">
            {currentProfile.description}
          </p>
        )}
      </div>

      {/* Main Optical Power Gauge & Parameters Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Calculated Optical Power Meter Card (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  EPON Optical Power at ONU/ONT
                </span>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${calculation.statusColor}`}>
                {calculation.statusLabel}
              </span>
            </div>

            {/* Main Key Metric Numbers: Responsive 3 Columns */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 my-2">
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 sm:p-3.5">
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block mb-0.5 truncate">
                  OLT Laser TX
                </span>
                <div className="flex items-baseline gap-0.5 sm:gap-1">
                  <span className="text-lg sm:text-2xl lg:text-3xl font-extrabold text-white font-mono">
                    {calculation.txPower >= 0 ? `+${calculation.txPower.toFixed(2)}` : calculation.txPower.toFixed(2)}
                  </span>
                  <span className="text-[10px] sm:text-xs font-bold text-cyan-400">dBm</span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 block truncate">EPON SFP Out</span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 sm:p-3.5">
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block mb-0.5 truncate">
                  Total Link Loss
                </span>
                <div className="flex items-baseline gap-0.5 sm:gap-1">
                  <span className="text-lg sm:text-2xl lg:text-3xl font-extrabold text-amber-300 font-mono">
                    -{calculation.totalLossDb.toFixed(2)}
                  </span>
                  <span className="text-[10px] sm:text-xs font-bold text-amber-400">dB</span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 block truncate">Path sum</span>
              </div>

              <div className="bg-slate-950/95 border border-cyan-500/50 rounded-xl p-2.5 sm:p-3.5 shadow-md shadow-cyan-950/40">
                <span className="text-[10px] sm:text-[11px] font-bold text-cyan-300 block mb-0.5 truncate">
                  Received (RX)
                </span>
                <div className="flex items-baseline gap-0.5 sm:gap-1">
                  <span className="text-lg sm:text-2xl lg:text-3xl font-extrabold text-cyan-300 font-mono">
                    {calculation.rxPowerDbm.toFixed(2)}
                  </span>
                  <span className="text-[10px] sm:text-xs font-bold text-cyan-400">dBm</span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 block truncate">At subscriber</span>
              </div>
            </div>

            {/* Graphical Scale Bar */}
            <div className="mt-4 sm:mt-5 space-y-2">
              <div className="flex justify-between text-[9px] sm:text-[10px] font-bold text-slate-400 gap-1 overflow-x-hidden">
                <span className="text-red-400">&lt; {currentProfile.targetRxMinDbm} dBm (Fail)</span>
                <span className="text-amber-400 hidden xs:inline">Marginal (-25)</span>
                <span className="text-emerald-400 font-extrabold text-center">
                  Optimal (-14 to -24 dBm)
                </span>
                <span className="text-rose-400 text-right">&gt; -6 dBm (Overload)</span>
              </div>

              <div className="h-4 bg-slate-950 rounded-full border border-slate-800 p-0.5 relative overflow-hidden flex">
                <div className="w-[15%] bg-red-800/50" title={`Fail (< ${currentProfile.targetRxMinDbm} dBm)`} />
                <div className="w-[10%] bg-amber-700/50" title="Marginal Buffer" />
                <div className="w-[50%] bg-emerald-700/50" title="Optimal Range (-24 to -14 dBm)" />
                <div className="w-[15%] bg-cyan-700/40" title="High Input (-14 to -6 dBm)" />
                <div className="w-[10%] bg-rose-700/60" title="Overload (> -6 dBm)" />

                {(() => {
                  const minScale = -32;
                  const maxScale = 0;
                  const clamped = Math.max(minScale, Math.min(maxScale, calculation.rxPowerDbm));
                  const percent = ((clamped - minScale) / (maxScale - minScale)) * 100;
                  return (
                    <div
                      className="absolute top-0 bottom-0 w-3 bg-white border-2 border-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,1)] -ml-1.5 transition-all duration-300"
                      style={{ left: `${percent}%` }}
                      title={`Calculated RX Power: ${calculation.rxPowerDbm.toFixed(2)} dBm`}
                    />
                  );
                })()}
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[10px] sm:text-[11px] text-slate-400 pt-1 gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-500">Power Margin:</span>
                  <span className={`font-mono font-bold ${calculation.powerMarginDb >= 3 ? 'text-emerald-400' : calculation.powerMarginDb > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                    {calculation.powerMarginDb >= 0 ? `+${calculation.powerMarginDb.toFixed(2)} dB` : `${calculation.powerMarginDb.toFixed(2)} dB`}
                  </span>
                  <span className="text-slate-500 text-[10px]">(vs {currentProfile.targetRxMinDbm} dBm floor)</span>
                </div>
                <div className="text-slate-400 text-[10px]">
                  Target Window: <strong className="text-slate-200">-14.0 dBm to -24.0 dBm</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Status Message Footer */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-start gap-2.5 text-xs">
            {calculation.status === 'optimal' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            {calculation.status === 'good' && <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />}
            {calculation.status === 'marginal' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
            {(calculation.status === 'critical' || calculation.status === 'overload') && <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
            <p className="text-slate-300 leading-relaxed text-[11px] sm:text-xs">{calculation.statusDesc}</p>
          </div>
        </div>

        {/* Right: Optical Source & Field Measurement Controls (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>EPON OLT &amp; OPM Field Test</span>
              </span>
              <button
                onClick={() => setShowReferenceGuide(!showReferenceGuide)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer font-semibold"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{showReferenceGuide ? 'Hide Guide' : 'EPON Guide'}</span>
              </button>
            </div>

            {/* Laser TX Power */}
            <div className="space-y-2 mb-4">
              <label className="text-[11px] font-semibold text-slate-300 flex justify-between items-center">
                <span>EPON SFP Laser TX Power</span>
                <span className="text-cyan-400 font-mono font-bold">+{currentProfile.txPowerDbm} dBm</span>
              </label>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-700 rounded-xl p-0.5">
                  <button
                    onClick={() => handleSetManualTxPower(Number((currentProfile.txPowerDbm - 0.5).toFixed(2)))}
                    className="px-1.5 py-1 text-slate-400 hover:text-white text-[10px] font-bold cursor-pointer"
                    title="-0.5 dBm"
                  >
                    -0.5
                  </button>
                  <input
                    type="number"
                    step="0.1"
                    value={currentProfile.txPowerDbm}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      handleSetManualTxPower(isNaN(val) ? 0 : val);
                    }}
                    className="w-16 bg-transparent text-center text-white font-mono text-xs focus:outline-none"
                  />
                  <button
                    onClick={() => handleSetManualTxPower(Number((currentProfile.txPowerDbm + 0.5).toFixed(2)))}
                    className="px-1.5 py-1 text-slate-400 hover:text-white text-[10px] font-bold cursor-pointer"
                    title="+0.5 dBm"
                  >
                    +0.5
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1.5 flex-1">
                  <button
                    onClick={() => handleSetManualTxPower(3.5)}
                    className={`py-1.5 text-[10px] font-bold rounded-xl border transition-colors cursor-pointer text-center ${
                      currentProfile.txPowerDbm === 3.5
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-xs'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    PX20 (+3.5)
                  </button>
                  <button
                    onClick={() => handleSetManualTxPower(5.0)}
                    className={`py-1.5 text-[10px] font-bold rounded-xl border transition-colors cursor-pointer text-center ${
                      currentProfile.txPowerDbm === 5.0
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    PX20+ (+5)
                  </button>
                  <button
                    onClick={() => handleSetManualTxPower(7.5)}
                    className={`py-1.5 text-[10px] font-bold rounded-xl border transition-colors cursor-pointer text-center ${
                      currentProfile.txPowerDbm === 7.5
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    PX20++ (+7.5)
                  </button>
                  <button
                    onClick={() => handleSetManualTxPower(9.0)}
                    className={`py-1.5 text-[10px] font-bold rounded-xl border transition-colors cursor-pointer text-center ${
                      currentProfile.txPowerDbm === 9.0
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-xs'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    PX20+++ (+9)
                  </button>
                </div>
              </div>
            </div>

            {/* Field OPM Measurement Comparator */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span>Field OPM Test (Live Reading)</span>
                </span>
                {currentProfile.measuredRxDbm !== null && (
                  <button
                    onClick={() => updateCurrentProfile((p) => ({ ...p, measuredRxDbm: null }))}
                    className="text-[10px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. -21.40"
                    value={currentProfile.measuredRxDbm !== null && currentProfile.measuredRxDbm !== undefined ? currentProfile.measuredRxDbm : ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseFloat(e.target.value);
                      updateCurrentProfile((p) => ({ ...p, measuredRxDbm: val }));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2.5 pr-12 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] font-bold text-amber-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    dBm
                  </span>
                </div>
                {calculation.measuredDelta !== null && (
                  <div className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-xl text-right shrink-0">
                    <span className="text-[9px] text-slate-400 block">Variance</span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        Math.abs(calculation.measuredDelta) <= 1.0
                          ? 'text-emerald-400'
                          : calculation.measuredDelta < -1.0
                          ? 'text-rose-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {calculation.measuredDelta > 0 ? `+${calculation.measuredDelta.toFixed(2)}` : calculation.measuredDelta.toFixed(2)} dB
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Optical Reference Cheat Sheet (Collapsible) */}
      {showReferenceGuide && (
        <div className="bg-slate-900 border border-blue-500/40 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-4 h-4 text-blue-400" />
              <span>EPON &amp; SC Optical Connector Reference Guide</span>
            </h3>
            <button
              onClick={() => setShowReferenceGuide(false)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer px-2 py-1 bg-slate-800 rounded-lg"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
            <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800">
              <span className="font-bold text-blue-300 block mb-1.5">SC/UPC (Blue) — EPON Standard</span>
              <ul className="space-y-1.5 text-slate-400 text-[11px] leading-relaxed">
                <li>• <strong>Polish</strong>: 0° Ultra Physical Contact (Flat/Curved)</li>
                <li>• <strong>Color</strong>: Blue housing / Blue boot</li>
                <li>• <strong>Return Loss (ORL)</strong>: <strong className="text-blue-300">&ge; 50 dB</strong></li>
                <li>• <strong>Fast Field Connector</strong>: 0.40 - 0.60 dB (avg 0.50 dB)</li>
                <li>• <strong>Factory Pigtail / SOC</strong>: 0.10 - 0.20 dB (avg 0.15 dB)</li>
                <li>• <strong>Mating Sleeve / Coupler</strong>: 0.15 - 0.25 dB</li>
              </ul>
            </div>

            <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800">
              <span className="font-bold text-emerald-300 block mb-1.5">SC/APC (Green) — 8° Angled</span>
              <ul className="space-y-1.5 text-slate-400 text-[11px] leading-relaxed">
                <li>• <strong>Polish</strong>: 8° Angled Physical Contact</li>
                <li>• <strong>Color</strong>: Green housing / Green boot</li>
                <li>• <strong>Return Loss (ORL)</strong>: <strong className="text-emerald-300">&ge; 60 dB</strong> (Low backreflection)</li>
                <li>• <strong>Application</strong>: RF Video CATV, GPON/XG-PON, high-power lasers</li>
                <li className="text-amber-400 font-semibold">• ⚠️ <strong>NEVER mate SC/UPC (Blue) with SC/APC (Green)</strong> — 8° mismatch causes &gt;10 dB loss &amp; endface damage!</li>
              </ul>
            </div>

            <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800">
              <span className="font-bold text-purple-300 block mb-1.5">EPON Power &amp; Splitters</span>
              <ul className="space-y-1.5 text-slate-400 text-[11px] leading-relaxed">
                <li>• <strong>PX20+ SFP TX</strong>: +3.0 to +7.0 dBm (Standard: +5.0 dBm)</li>
                <li>• <strong>1:8 PLC Splitter</strong>: ~10.60 dB | <strong>1:16</strong>: ~13.90 dB</li>
                <li>• <strong>G.652D Fiber @ 1490nm</strong>: 0.35 dB/km (0.40 dB @ 1310nm)</li>
                <li>• <strong>Fusion Splice</strong>: 0.05 dB (Arc fusion)</li>
                <li>• <strong>Optimal ONU RX Window</strong>: <strong className="text-emerald-400">-14.0 to -24.0 dBm</strong></li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main ODN Action Bar & Components Workspace */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Workspace Top Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Optical Network Distribution (ODN)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
                {currentProfile.items.length} Elements
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Build your fiber link from scratch: add PON ports, splitters, cables, and SC connectors.
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
              <button
                onClick={() => setViewMode('tree')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'tree' ? 'bg-cyan-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Directory Tree Structure View"
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Tree View</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                  viewMode === 'table' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Table Spreadsheet Layout"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Table</span>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                  viewMode === 'cards' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Cards Layout"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Cards</span>
              </button>
            </div>
          </div>
        </div>

        {/* Clean Action Bar (Add from scratch) */}
        <div className="bg-slate-950/90 px-3.5 sm:px-5 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setSplitterRatioSelect('1:8');
                setSplitterPolish('SC/UPC');
                setSplitterCustomName('1:8 PLC Splitter (SC/UPC)');
                setSplitterLoss(10.60);
                setSplitterQty(1);
                setSplitterNotes('');
                setIsAddSplitterModalOpen(true);
              }}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Splitter</span>
            </button>

            <button
              onClick={() => {
                const nextNum = (currentProfile.ponPorts?.length || 0) + 1;
                setNewPonName(`PON ${nextNum}`);
                setNewPonTxPower(5.0);
                setNewPonWavelength(1490);
                setIsAddPonModalOpen(true);
              }}
              className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>+ Add PON Port</span>
            </button>

            <button
              onClick={() => {
                setCableName('G.652D Trunk Fiber Cable');
                setCableLength(1.0);
                setCableLossPerKm(0.35);
                setCableNotes('');
                setIsAddCableModalOpen(true);
              }}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Cable className="w-4 h-4" />
              <span>+ Add Cable</span>
            </button>

            <button
              onClick={() => {
                setConnCategory('connector');
                setConnTypePreset('sc_upc_fast');
                setConnName('SC/UPC Fast Connector (Field Mechanical)');
                setConnLoss(0.50);
                setConnQty(2);
                setConnNotes('');
                setIsAddConnModalOpen(true);
              }}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Radio className="w-4 h-4" />
              <span>+ Add SC Connector</span>
            </button>

            <button
              onClick={() => {
                setCustomItemName('');
                setCustomItemCategory('other');
                setCustomItemQty(1);
                setCustomItemUnit('pcs');
                setCustomItemLoss(1.0);
                setCustomItemNotes('');
                setIsAddCustomModalOpen(true);
              }}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium border border-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Custom</span>
            </button>
          </div>

          {currentProfile.items.length > 0 && (
            <button
              onClick={handleClearAllItems}
              className="text-xs text-slate-500 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Items</span>
            </button>
          )}
        </div>

        {/* DIRECTORY TREE VIEW */}
        {viewMode === 'tree' && (
          <div className="p-3 sm:p-5">
            <FiberDirectoryTree
              profile={currentProfile}
              calculation={calculation}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleItemDelete}
              onDuplicateItem={handleItemDuplicate}
              onMoveItem={handleItemMove}
              onAddItem={handleAddItemDirect}
              onAddChildItem={handleAddChildItem}
              onUpdateTxPower={handleSetManualTxPower}
              onAddPonPort={handleAddPonPort}
              onDeletePonPort={handleDeletePonPort}
              onSelectPonPort={handleSelectPonPort}
              onRenamePonPort={handleRenamePonPort}
            />
          </div>
        )}

        {/* MOBILE CARD VIEW */}
        {viewMode === 'cards' && (
          <div className="p-3 sm:p-4 space-y-3">
            {currentProfile.items.length === 0 ? (
              <div className="py-12 text-center text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800/80 p-4">
                <p className="text-sm font-semibold text-slate-400">No optical components yet.</p>
                <p className="text-xs mt-1">Tap "+ Add Splitter", "+ Add Cable", or "+ Add PON Port" above to begin.</p>
              </div>
            ) : (
              currentProfile.items.map((item, index) => {
                const itemTotal = Number((item.quantity * item.lossPerUnit).toFixed(4));
                return (
                  <div
                    key={item.id}
                    className={`bg-slate-950/90 border rounded-xl p-3.5 space-y-3 transition-all ${
                      item.enabled ? 'border-slate-800 hover:border-slate-700' : 'border-slate-900 opacity-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleItemToggle(item.id)}
                          className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 w-5 h-5 bg-slate-900 cursor-pointer mt-0.5 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-500 font-mono text-[10px]">#{index + 1}</span>
                            <span className="text-xs sm:text-sm font-bold text-white leading-tight break-words">
                              {item.name}
                            </span>
                          </div>
                          <div className="mt-1">{getCategoryBadge(item.category)}</div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block">Total Loss</span>
                        <span className="text-xs sm:text-sm font-mono font-extrabold text-amber-300">
                          {item.enabled ? `-${itemTotal.toFixed(2)} dB` : '0.00 dB'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                      <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800">
                        <span className="text-[10px] font-semibold text-slate-400 block mb-1">Loss (dB)</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.lossPerUnit}
                          onChange={(e) => handleUpdateItem(item.id, { lossPerUnit: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-slate-950 border border-cyan-500/50 text-cyan-300 font-mono font-bold text-xs rounded-md px-2 py-1.5 text-right focus:outline-none"
                        />
                      </div>

                      <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800">
                        <span className="text-[10px] font-semibold text-slate-400 block mb-1">Quantity ({item.unit})</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={item.quantity}
                          onChange={(e) => handleUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 1 })}
                          className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-md px-2 py-1.5 text-center focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleItemMove(item.id, 'up')}
                          disabled={index === 0}
                          className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-md border border-slate-800 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleItemMove(item.id, 'down')}
                          disabled={index === currentProfile.items.length - 1}
                          className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-md border border-slate-800 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleItemDuplicate(item.id)}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-md border border-slate-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Clone</span>
                        </button>
                        <button
                          onClick={() => handleItemDelete(item.id)}
                          className="p-1.5 bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-md border border-slate-800 text-[11px] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* DESKTOP TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <th className="py-3 px-3 w-12 text-center">Inc</th>
                  <th className="py-3 px-4">Component / Element</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3 w-28">Quantity</th>
                  <th className="py-3 px-3 w-36">Loss per Unit (dB)</th>
                  <th className="py-3 px-4 w-32 text-right">Total Loss</th>
                  <th className="py-3 px-4">Location / Notes</th>
                  <th className="py-3 px-3 w-28 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {currentProfile.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <p className="text-sm font-semibold text-slate-400">No optical components in this budget.</p>
                      <p className="text-xs mt-1">Use the action bar above to add splitters, cables, or connectors.</p>
                    </td>
                  </tr>
                ) : (
                  currentProfile.items.map((item, index) => {
                    const itemTotal = Number((item.quantity * item.lossPerUnit).toFixed(4));
                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          item.enabled ? 'hover:bg-slate-800/40' : 'opacity-40 bg-slate-950/40'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={item.enabled}
                            onChange={() => handleItemToggle(item.id)}
                            className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 w-4 h-4 bg-slate-900 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-mono text-[10px] w-4">{index + 1}.</span>
                            <span>{item.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">{getCategoryBadge(item.category)}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 1 })}
                              className="w-16 bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 text-center"
                            />
                            <span className="text-[10px] text-slate-400">{item.unit}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="number"
                            step="0.01"
                            value={item.lossPerUnit}
                            onChange={(e) => handleUpdateItem(item.id, { lossPerUnit: parseFloat(e.target.value) || 0 })}
                            className="w-20 bg-slate-950 border border-cyan-500/50 text-cyan-300 font-mono font-bold text-xs rounded-lg px-2 py-1 text-right focus:outline-none"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-300">
                          {item.enabled ? `-${itemTotal.toFixed(2)} dB` : '0.00 dB'}
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={item.notes || ''}
                            onChange={(e) => handleUpdateItem(item.id, { notes: e.target.value })}
                            placeholder="e.g. NAP-01 Pole #12"
                            className="w-full bg-transparent border border-transparent hover:border-slate-800 text-slate-300 text-[11px] rounded px-1.5 py-0.5 focus:outline-none"
                          />
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleItemMove(item.id, 'up')}
                              disabled={index === 0}
                              className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleItemMove(item.id, 'down')}
                              disabled={index === currentProfile.items.length - 1}
                              className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleItemDuplicate(item.id)}
                              className="p-1 text-slate-400 hover:text-cyan-400 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleItemDelete(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Summary */}
        <div className="bg-slate-950 border-t border-slate-800 p-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="text-slate-400 text-center sm:text-left">
            Total Link Loss: <strong className="text-amber-300 font-mono text-sm">-{calculation.totalLossDb.toFixed(2)} dB</strong>
          </div>
          <div className="text-slate-300 text-center sm:text-right">
            Resulting RX Power: <strong className="text-cyan-300 font-mono text-sm">{calculation.rxPowerDbm.toFixed(2)} dBm</strong>
          </div>
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
                  <h3 className="text-sm sm:text-base font-bold text-white">Add Splitter (PLC / Tap)</h3>
                  <p className="text-xs text-slate-400">Configure split ratio and insertion loss</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddSplitterModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSplitterModal} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Splitter Ratio &amp; Model *</label>
                <select
                  value={splitterRatioSelect}
                  onChange={(e) => {
                    const ratio = e.target.value;
                    setSplitterRatioSelect(ratio);
                    const opt = STANDARD_SPLITTER_OPTIONS.find((s) => s.ratio === ratio);
                    if (opt) {
                      setSplitterCustomName(`${opt.label} (${splitterPolish})`);
                      setSplitterLoss(opt.loss);
                    }
                  }}
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
                    <option value="custom">Custom Ratio</option>
                  </optgroup>
                </select>
              </div>

              {/* SC Connector Polish selector for Splitter */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">SC Connector Polish Type</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSplitterPolish('SC/UPC');
                      setSplitterCustomName(splitterCustomName.replace(/\(SC\/[A-Z]+\)|\(Bare\)/g, '').trim() + ' (SC/UPC)');
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      splitterPolish === 'SC/UPC'
                        ? 'bg-blue-600 text-white border-blue-400 shadow-xs'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
                    <span>SC/UPC (Blue)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitterPolish('SC/APC');
                      setSplitterCustomName(splitterCustomName.replace(/\(SC\/[A-Z]+\)|\(Bare\)/g, '').trim() + ' (SC/APC)');
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      splitterPolish === 'SC/APC'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-xs'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                    <span>SC/APC (Green)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitterPolish('Bare');
                      setSplitterCustomName(splitterCustomName.replace(/\(SC\/[A-Z]+\)|\(Bare\)/g, '').trim() + ' (Bare Fiber)');
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      splitterPolish === 'Bare'
                        ? 'bg-slate-700 text-white border-slate-500 shadow-xs'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <span>Bare Fiber</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Splitter Label / Name *</label>
                <input
                  type="text"
                  required
                  value={splitterCustomName}
                  onChange={(e) => setSplitterCustomName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500"
                />
              </div>

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
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Quantity</label>
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

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Location / Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. NAP Box Pole #14, FDT-01"
                  value={splitterNotes}
                  onChange={(e) => setSplitterNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500"
                />
              </div>

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

      {/* ADD PON MODAL */}
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
                  <p className="text-xs text-slate-400">Add an EPON port to start building from scratch</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddPonModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePonModal} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">PON Port Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PON 2, North Sector"
                  value={newPonName}
                  onChange={(e) => setNewPonName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Laser TX Output Power (dBm) *</label>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setNewPonTxPower(3.5)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg border cursor-pointer ${
                      newPonTxPower === 3.5 ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    PX20 (+3.5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPonTxPower(5.0)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg border cursor-pointer ${
                      newPonTxPower === 5.0 ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    PX20+ (+5.0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPonTxPower(7.5)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg border cursor-pointer ${
                      newPonTxPower === 7.5 ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    PX20++ (+7.5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPonTxPower(9.0)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg border cursor-pointer ${
                      newPonTxPower === 9.0 ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    PX20+++ (+9)
                  </button>
                </div>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={newPonTxPower}
                  onChange={(e) => setNewPonTxPower(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
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

      {/* ADD CABLE MODAL */}
      {isAddCableModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-blue-500/40 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl">
                  <Cable className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Add Fiber Cable Span</h3>
                  <p className="text-xs text-slate-400">Specify cable distance and attenuation</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddCableModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCableModal} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Cable Description *</label>
                <input
                  type="text"
                  required
                  value={cableName}
                  onChange={(e) => setCableName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Distance (km) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.001"
                    required
                    value={cableLength}
                    onChange={(e) => setCableLength(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Loss (dB/km) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={cableLossPerKm}
                    onChange={(e) => setCableLossPerKm(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddCableModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Cable</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CONNECTOR / SPLICE MODAL */}
      {isAddConnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Add SC Connector or Splice</h3>
                  <p className="text-xs text-slate-400">Configure SC/UPC (Blue), SC/APC (Green), adapters, or splices</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddConnModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConnModal} className="space-y-3.5">
              {/* Category tabs */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConnCategory('connector');
                    setConnTypePreset('sc_upc_fast');
                    setConnName('SC/UPC Fast Connector (Field Mechanical)');
                    setConnLoss(0.50);
                  }}
                  className={`py-2 text-xs font-bold rounded-xl border cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                    connCategory === 'connector' ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>SC Connector</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConnCategory('splice');
                    setConnTypePreset('fusion_splice');
                    setConnName('Fusion Splice (Arc Welded)');
                    setConnLoss(0.05);
                  }}
                  className={`py-2 text-xs font-bold rounded-xl border cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                    connCategory === 'splice' ? 'bg-amber-600 text-white border-amber-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Splice</span>
                </button>
              </div>

              {/* Quick SC Presets */}
              {connCategory === 'connector' ? (
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Standard SC Connector Presets
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConnTypePreset('sc_upc_fast');
                        setConnName('SC/UPC Fast Connector (Field Mechanical)');
                        setConnLoss(0.50);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        connTypePreset === 'sc_upc_fast'
                          ? 'bg-blue-950/60 border-blue-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-blue-300">
                          <span className="w-2 h-2 rounded-full bg-blue-400" />
                          SC/UPC Fast (Field)
                        </span>
                        <span className="text-amber-400 font-mono">0.50 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Blue • EPON standard</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConnTypePreset('sc_apc_fast');
                        setConnName('SC/APC Fast Connector (Field Mechanical)');
                        setConnLoss(0.50);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        connTypePreset === 'sc_apc_fast'
                          ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          SC/APC Fast (Field)
                        </span>
                        <span className="text-amber-400 font-mono">0.50 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Green • 8° Angled polish</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConnTypePreset('sc_upc_soc');
                        setConnName('SC/UPC Factory Pigtail (Fusion Splice SOC)');
                        setConnLoss(0.15);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        connTypePreset === 'sc_upc_soc'
                          ? 'bg-blue-950/60 border-blue-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-blue-300">
                          <span className="w-2 h-2 rounded-full bg-blue-400" />
                          SC/UPC Pigtail (SOC)
                        </span>
                        <span className="text-emerald-400 font-mono">0.15 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Factory ferrule + splice</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConnTypePreset('sc_adapter');
                        setConnName('SC/UPC Mating Adapter / Coupler Flange');
                        setConnLoss(0.20);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        connTypePreset === 'sc_adapter'
                          ? 'bg-blue-950/60 border-blue-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-cyan-300">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          SC Adapter (Mating)
                        </span>
                        <span className="text-emerald-400 font-mono">0.20 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">NAP / ODF bulkhead sleeve</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConnTypePreset('sc_patchcord');
                        setConnName('SC/UPC to SC/UPC Simplex Patchcord (1-3m)');
                        setConnLoss(0.40);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        connTypePreset === 'sc_patchcord'
                          ? 'bg-blue-950/60 border-blue-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-blue-300">
                          <span className="w-2 h-2 rounded-full bg-blue-400" />
                          SC Simplex Patchcord
                        </span>
                        <span className="text-amber-400 font-mono">0.40 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Includes 2 SC ends + fiber</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConnTypePreset('sc_apc_soc');
                        setConnName('SC/APC Factory Pigtail (Fusion Splice SOC)');
                        setConnLoss(0.15);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        connTypePreset === 'sc_apc_soc'
                          ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          SC/APC Pigtail (SOC)
                        </span>
                        <span className="text-emerald-400 font-mono">0.15 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Green • Factory ferrule</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Standard Splice Presets
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConnTypePreset('fusion_splice');
                        setConnName('Fusion Splice (Arc Welded)');
                        setConnLoss(0.05);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        connTypePreset === 'fusion_splice'
                          ? 'bg-amber-950/60 border-amber-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-amber-300">Fusion Splice</span>
                        <span className="text-emerald-400 font-mono">0.05 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Core-alignment arc machine</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConnTypePreset('mechanical_splice');
                        setConnName('Mechanical Splice (V-Groove)');
                        setConnLoss(0.10);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs cursor-pointer transition-all ${
                        connTypePreset === 'mechanical_splice'
                          ? 'bg-amber-950/60 border-amber-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-amber-300">Mechanical Splice</span>
                        <span className="text-amber-400 font-mono">0.10 dB</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Matching gel joint</span>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={connName}
                  onChange={(e) => setConnName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Loss per Unit (dB) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={connLoss}
                    onChange={(e) => setConnLoss(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 text-amber-300 font-mono font-bold text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={connQty}
                    onChange={(e) => setConnQty(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Location / Tag (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. OLT ODF Port 1, NAP-01 Drop Terminal, Customer ONT"
                  value={connNotes}
                  onChange={(e) => setConnNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 text-xs flex justify-between items-center">
                <span className="text-slate-400">Total Element Loss:</span>
                <span className="text-amber-300 font-mono font-extrabold text-sm">
                  -{(connLoss * (connQty || 1)).toFixed(2)} dB
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddConnModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Item</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CUSTOM MODAL */}
      {isAddCustomModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                <span>Add Custom Element</span>
              </h3>
              <button
                onClick={() => setIsAddCustomModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomModal} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Component Name *</label>
                <input
                  type="text"
                  required
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Loss (dB) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={customItemLoss}
                    onChange={(e) => setCustomItemLoss(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-cyan-500 text-cyan-300 font-mono font-bold text-xs rounded-xl px-3 py-2.5 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={customItemQty}
                    onChange={(e) => setCustomItemQty(parseFloat(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-none text-center"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddCustomModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                >
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PROFILE DETAILS MODAL */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-cyan-400" />
                <span>Edit Link Profile Details</span>
              </h3>
              <button
                onClick={() => setIsEditProfileOpen(false)}
                className="p-1 text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfileMetadata} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Profile Title *</label>
                <input
                  type="text"
                  required
                  value={editProfileTitle}
                  onChange={(e) => setEditProfileTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Description / Notes</label>
                <textarea
                  rows={3}
                  value={editProfileDesc}
                  onChange={(e) => setEditProfileDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
