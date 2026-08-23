import React from 'react';
import { Users, BarChart3, Receipt, AlertTriangle, Router, Activity } from 'lucide-react';
import { ViewTab, AuthUser } from '../types';
import { canWrite } from '../utils/auth';

interface NavigationTabsProps {
  currentTab: ViewTab;
  currentUser?: AuthUser | null;
  onTabChange: (tab: ViewTab) => void;
  overdueCount: number;
  totalUnpaidAmount: number;
  expenseCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  currentTab,
  currentUser,
  onTabChange,
  overdueCount,
  expenseCount = 0,
}) => {
  const isReadOnly = !canWrite(currentUser);

  const allTabs = [
    {
      id: 'subscribers' as ViewTab,
      label: 'Subscribers',
      icon: Users,
    },
    {
      id: 'analytics' as ViewTab,
      label: 'Revenue Analytics',
      icon: BarChart3,
    },
    {
      id: 'expenses' as ViewTab,
      label: 'Expenses',
      icon: Receipt,
      badge: expenseCount > 0 ? expenseCount : undefined,
    },
    {
      id: 'overdue' as ViewTab,
      label: 'Overdue Tracker',
      icon: AlertTriangle,
      badge: overdueCount > 0 ? overdueCount : undefined,
      badgeColor: 'bg-rose-100 text-rose-700 border border-rose-200',
    },
    {
      id: 'mikrotik' as ViewTab,
      label: 'MikroTik RouterOS',
      icon: Router,
      hidden: isReadOnly, // Strictly hide MikroTik tab for Read-Only permission
    },
    {
      id: 'activity' as ViewTab,
      label: 'Activity Log',
      icon: Activity,
    },
  ];

  const visibleTabs = allTabs.filter((t) => !t.hidden);

  return (
    <div className="bg-slate-900 border-b border-slate-800/90 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-1.5">
        {visibleTabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`py-2 px-3 sm:py-2.5 sm:px-3.5 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 shrink-0 ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    tab.badgeColor || (isActive ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/40' : 'bg-slate-800 text-slate-400')
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
