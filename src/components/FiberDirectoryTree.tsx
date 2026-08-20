import React from 'react';
import { FiberBudgetProfile, FiberBudgetItem } from '../types';
import { COMPONENT_PRESETS } from '../data/opticalPresets';
import { ConsoleDirectoryTree } from './ConsoleDirectoryTree';

interface FiberDirectoryTreeProps {
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
  onQuickAddPreset?: (preset: typeof COMPONENT_PRESETS[number], qty?: number) => void;
  onUpdateTxPower?: (newTxPower: number, targetPonId?: string) => void;
  onAddPonPort?: (name?: string, txPowerDbm?: number) => void;
  onDeletePonPort?: (ponId: string) => void;
  onSelectPonPort?: (ponId: string) => void;
  onRenamePonPort?: (ponId: string, newName: string) => void;
}

export const FiberDirectoryTree: React.FC<FiberDirectoryTreeProps> = ({
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
  return (
    <ConsoleDirectoryTree
      profile={profile}
      calculation={calculation}
      onUpdateItem={onUpdateItem}
      onDeleteItem={onDeleteItem}
      onDuplicateItem={onDuplicateItem}
      onMoveItem={onMoveItem}
      onAddItem={onAddItem}
      onAddChildItem={onAddChildItem}
      onUpdateTxPower={onUpdateTxPower}
      onAddPonPort={onAddPonPort}
      onDeletePonPort={onDeletePonPort}
      onSelectPonPort={onSelectPonPort}
      onRenamePonPort={onRenamePonPort}
    />
  );
};
