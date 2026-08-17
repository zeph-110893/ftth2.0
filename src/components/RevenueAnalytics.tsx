import React, { useState } from 'react';
import { DollarSign, TrendingUp, Users, AlertCircle, ReceiptText, ArrowDownRight, MinusCircle } from 'lucide-react';
import { Subscriber, PaymentRecord, Expense } from '../types';
import { MONTH_NAMES, formatCurrency, calculateSubMetrics, CURRENT_MONTH } from '../utils/billingUtils';

interface RevenueAnalyticsProps {
  subscribers: Subscriber[];
  payments: PaymentRecord[];
  expenses?: Expense[];
  onOpenExpensesTab?: () => void;
}

export const RevenueAnalytics: React.FC<RevenueAnalyticsProps> = ({
  subscribers,
  payments,
  expenses = [],
  onOpenExpensesTab,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<string>(CURRENT_MONTH);

  // All time metrics
  const totalLifetimeRevenue = payments.reduce((acc, p) => acc + p.amount, 0);
  const totalLifetimeExpenses = expenses.reduce((acc, e) => acc + (e.totalPrice || 0), 0);
  const totalLifetimeNet = totalLifetimeRevenue - totalLifetimeExpenses;

  // Unpaid total across all subscribers
  let totalUnpaidBalance = 0;
  let totalOverdueBalance = 0;

  subscribers.forEach((sub) => {
    const m = calculateSubMetrics(sub, payments, CURRENT_MONTH);
    totalUnpaidBalance += m.missed * m.rate;
    if (m.statusPill === 'overdue') {
      totalOverdueBalance += m.rate;
    }
  });

  // Available months for selector
  const availableYears = [2024, 2025, 2026, 2027];
  const monthsForSelectedYear = MONTH_NAMES.map((mName) => `${mName} ${selectedYear}`);

  // Monthly stats
  const monthlyPayments = payments.filter((p) => p.month === selectedMonth);
  const monthlyPaidSubsCount = new Set(monthlyPayments.map((p) => p.sub)).size;
  const monthlyGross = monthlyPayments.reduce((acc, p) => acc + p.amount, 0);

  const monthlyExpensesList = expenses.filter((e) => e.month === selectedMonth);
  const monthlyExpensesTotal = monthlyExpensesList.reduce((acc, e) => acc + (e.totalPrice || 0), 0);
  const monthlyNet = monthlyGross - monthlyExpensesTotal;

  // Annual stats
  const annualPayments = payments.filter((p) => {
    const parts = p.month.split(' ');
    return parts.length === 2 && parseInt(parts[1], 10) === selectedYear;
  });
  const annualGross = annualPayments.reduce((acc, p) => acc + p.amount, 0);

  const annualExpensesList = expenses.filter((e) => {
    const parts = e.month.split(' ');
    if (parts.length === 2 && parseInt(parts[1], 10) === selectedYear) return true;
    if (e.date && e.date.startsWith(String(selectedYear))) return true;
    return false;
  });
  const annualExpensesTotal = annualExpensesList.reduce((acc, e) => acc + (e.totalPrice || 0), 0);
  const annualNet = annualGross - annualExpensesTotal;

  return (
    <div className="space-y-6">
      
      {/* Hero Lifetime Revenue & Net Income Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white rounded-2xl p-6 sm:p-8 shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300">Financial Performance Overview</h2>
              <p className="text-xs text-slate-400">All-time revenue, operating expenses & net profit</p>
            </div>
          </div>
          <span className="self-start sm:self-auto px-3 py-1 bg-slate-800/80 text-cyan-300 text-xs font-semibold rounded-full border border-slate-700">
            All Time Summary
          </span>
        </div>

        {/* 3 Main Highlights: Gross Revenue, Expenses, Net Profit */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 border-b border-slate-800">
          
          {/* Lifetime Gross */}
          <div className="text-center md:text-left">
            <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
              1. Gross Revenue
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-400 mt-1">
              {formatCurrency(totalLifetimeRevenue)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {payments.length} payment transactions
            </div>
          </div>

          {/* Lifetime Expenses */}
          <div className="text-center md:text-left">
            <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-center md:justify-start gap-1">
              <MinusCircle className="w-3.5 h-3.5 text-rose-400" /> Less Expenses
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-rose-400 mt-1">
              -{formatCurrency(totalLifetimeExpenses)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {expenses.length} operating expense items
            </div>
          </div>

          {/* Lifetime Net Profit */}
          <div className="text-center md:text-left bg-slate-800/80 p-4 rounded-xl border border-cyan-500/30">
            <div className="text-[11px] uppercase font-bold text-cyan-400 tracking-wider">
              = Lifetime Net Profit
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-white mt-1">
              {formatCurrency(totalLifetimeNet)}
            </div>
            <div className="text-[11px] text-slate-300 mt-1 font-medium">
              Gross Revenue minus Expenses
            </div>
          </div>

        </div>

        {/* Subscriber & Overdue Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6">
          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>Total Subscribers</span>
            </div>
            <div className="text-xl font-bold font-mono text-white mt-1">{subscribers.length}</div>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Unpaid Outstanding</span>
            </div>
            <div className="text-xl font-bold font-mono text-rose-400 mt-1">{formatCurrency(totalUnpaidBalance)}</div>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              <span>Overdue Current Month</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-1">{formatCurrency(totalOverdueBalance)}</div>
          </div>
        </div>
      </div>

      {/* Monthly, Annual & Overall Comparison Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Monthly Income Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Monthly Financials</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs font-medium border border-slate-200 rounded-md px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none"
              >
                {monthsForSelectedYear.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 mt-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Paid Subscribers</span>
                <span className="font-bold text-slate-900 font-mono">
                  {monthlyPaidSubsCount} / {subscribers.length}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <div className="text-[11px] font-semibold text-emerald-800 uppercase">Gross Revenue</div>
                <div className="text-xl font-bold text-emerald-700 font-mono mt-0.5">{formatCurrency(monthlyGross)}</div>
              </div>

              <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100">
                <div className="text-[11px] font-semibold text-rose-800 uppercase flex items-center justify-between">
                  <span>Less Expenses</span>
                  <span className="text-[10px] font-normal text-rose-600">({monthlyExpensesList.length} items)</span>
                </div>
                <div className="text-xl font-bold text-rose-700 font-mono mt-0.5">-{formatCurrency(monthlyExpensesTotal)}</div>
              </div>

              <div className="p-3.5 bg-slate-900 text-white rounded-xl">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Net Profit</div>
                <div className="text-2xl font-black font-mono text-white mt-0.5">{formatCurrency(monthlyNet)}</div>
                <p className="text-[10px] text-slate-400 italic mt-0.5">= gross revenue ({formatCurrency(monthlyGross)}) less expenses ({formatCurrency(monthlyExpensesTotal)})</p>
              </div>
            </div>
          </div>
        </div>

        {/* Annual Income Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Annual Financials</span>
              <select
                value={selectedYear}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  setSelectedYear(y);
                  setSelectedMonth(`August ${y}`);
                }}
                className="text-xs font-medium border border-slate-200 rounded-md px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 mt-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Recorded Entries</span>
                <span className="font-bold text-slate-900 font-mono">{annualPayments.length} entries</span>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <div className="text-[11px] font-semibold text-emerald-800 uppercase">Annual Gross Revenue</div>
                <div className="text-xl font-bold text-emerald-700 font-mono mt-0.5">{formatCurrency(annualGross)}</div>
              </div>

              <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100">
                <div className="text-[11px] font-semibold text-rose-800 uppercase flex items-center justify-between">
                  <span>Annual Expenses</span>
                  <span className="text-[10px] font-normal text-rose-600">({annualExpensesList.length} items)</span>
                </div>
                <div className="text-xl font-bold text-rose-700 font-mono mt-0.5">-{formatCurrency(annualExpensesTotal)}</div>
              </div>

              <div className="p-3.5 bg-slate-900 text-white rounded-xl">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Annual Net Profit</div>
                <div className="text-2xl font-black font-mono text-white mt-0.5">{formatCurrency(annualNet)}</div>
                <p className="text-[10px] text-slate-400 italic mt-0.5">= Year {selectedYear} gross less expenses</p>
              </div>
            </div>
          </div>
        </div>

        {/* Lifetime Overall Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overall Lifetime</span>
              <span className="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600 font-semibold rounded-full">
                All-Time
              </span>
            </div>

            <div className="space-y-3 mt-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Total Transactions</span>
                <span className="font-bold text-slate-900 font-mono">{payments.length} payments</span>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <div className="text-[11px] font-semibold text-emerald-800 uppercase">Lifetime Gross</div>
                <div className="text-xl font-bold text-emerald-700 font-mono mt-0.5">
                  {formatCurrency(totalLifetimeRevenue)}
                </div>
              </div>

              <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100">
                <div className="text-[11px] font-semibold text-rose-800 uppercase flex items-center justify-between">
                  <span>Lifetime Expenses</span>
                  <span className="text-[10px] font-normal text-rose-600">({expenses.length} items)</span>
                </div>
                <div className="text-xl font-bold text-rose-700 font-mono mt-0.5">
                  -{formatCurrency(totalLifetimeExpenses)}
                </div>
              </div>

              <div className="p-3.5 bg-slate-900 text-white rounded-xl">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Lifetime Net Profit</div>
                <div className="text-2xl font-black font-mono text-white mt-0.5">
                  {formatCurrency(totalLifetimeNet)}
                </div>
                <p className="text-[10px] text-slate-400 italic mt-0.5">= lifetime accumulated net profit</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Expenses Quick Management Link */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
            <ReceiptText className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Manage Itemized Operating Expenses</h4>
            <p className="text-xs text-slate-500">
              Log fiber cables, ONU routers, bandwidth line fees, and labor costs with quantity &amp; per-piece pricing.
            </p>
          </div>
        </div>
        {onOpenExpensesTab && (
          <button
            onClick={onOpenExpensesTab}
            className="px-4 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <span>Open Expense Tracker</span>
            <ArrowDownRight className="w-3.5 h-3.5 -rotate-90" />
          </button>
        )}
      </div>

    </div>
  );
};

