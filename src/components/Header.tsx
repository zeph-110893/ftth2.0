import React, { useState, useEffect } from 'react';
import { Plus, Receipt, Clock, Calendar } from 'lucide-react';

interface HeaderProps {
  onAddSubscriber: () => void;
  onRecordPayment: () => void;
  onAddExpense?: () => void;
  onExportCSV?: () => void;
  onResetData?: () => void;
  totalSubsCount: number;
  activeCount: number;
  dueCount?: number;
  overdueCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onAddSubscriber,
  onRecordPayment,
  onAddExpense,
  totalSubsCount,
  activeCount,
  dueCount = 0,
  overdueCount,
}) => {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = time.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedTime = time.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Brand & Subtitle */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              FTTH Subscriber Billing
            </h1>

            {/* Realtime Clock Badge */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-medium border border-slate-200/80 w-fit">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>{formattedDate}</span>
              <span className="text-slate-300">•</span>
              <Clock className="w-3.5 h-3.5 text-emerald-600 animate-pulse shrink-0" />
              <span className="font-bold text-slate-900">{formattedTime}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between md:justify-end gap-3">
            {/* Quick Counters */}
            <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-700">{totalSubsCount} Subs</span>
              <span>•</span>
              <span className="text-emerald-600 font-bold">{activeCount} Active</span>
              {dueCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-amber-600 font-bold">{dueCount} Due</span>
                </>
              )}
              {overdueCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-rose-600 font-bold">{overdueCount} Overdue</span>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onRecordPayment}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer min-h-[38px] shadow-2xs"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Record Payment</span>
              </button>

              {onAddExpense && (
                <button
                  onClick={onAddExpense}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer min-h-[38px]"
                >
                  <span>+ Expense</span>
                </button>
              )}

              <button
                onClick={onAddSubscriber}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 active:bg-black text-white text-xs font-bold rounded-lg transition-colors cursor-pointer min-h-[38px] shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Subscriber</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
};

