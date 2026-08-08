import React from 'react';
import { ViewTab } from '../types';

interface NavigationTabsProps {
  currentTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  overdueCount: number;
  totalUnpaidAmount: number;
  expenseCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  currentTab,
  onTabChange,
  overdueCount,
  expenseCount = 0,
}) => {
  const tabs = [
    {
      id: 'subscribers' as ViewTab,
      label: 'Subscribers',
    },
    {
      id: 'analytics' as ViewTab,
      label: 'Revenue Analytics',
    },
    {
      id: 'expenses' as ViewTab,
      label: 'Expenses',
      badge: expenseCount > 0 ? expenseCount : undefined,
    },
    {
      id: 'overdue' as ViewTab,
      label: 'Overdue Tracker',
      badge: overdueCount > 0 ? overdueCount : undefined,
    },
    {
      id: 'mikrotik' as ViewTab,
      label: 'MikroTik RouterOS',
    },
  ];

  return (
    <div className="bg-white border-b border-slate-200 px-3.5 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar py-1">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`py-2.5 sm:py-3 text-xs sm:text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 min-h-[42px] ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
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

