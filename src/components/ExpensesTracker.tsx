import React, { useState } from 'react';
import { Plus, Search, Trash2, Edit3, ReceiptText, Filter, Calendar } from 'lucide-react';
import { Expense, AuthUser } from '../types';
import { MONTH_NAMES, CURRENT_MONTH, formatCurrency } from '../utils/billingUtils';
import { canWrite } from '../utils/auth';

interface ExpensesTrackerProps {
  expenses: Expense[];
  currentUser?: AuthUser | null;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
}

export const ExpensesTracker: React.FC<ExpensesTrackerProps> = ({
  expenses,
  currentUser,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
}) => {
  const isReadOnly = !canWrite(currentUser);
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Categories list
  const categories = Array.from(new Set(expenses.map((e) => e.category || 'Other').filter(Boolean)));

  // Filter logic
  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch =
      e.itemName.toLowerCase().includes(search.toLowerCase()) ||
      (e.note && e.note.toLowerCase().includes(search.toLowerCase())) ||
      (e.category && e.category.toLowerCase().includes(search.toLowerCase()));

    const matchesMonth = selectedMonth === 'ALL' || e.month === selectedMonth;
    const matchesCategory = selectedCategory === 'ALL' || e.category === selectedCategory;

    return matchesSearch && matchesMonth && matchesCategory;
  });

  // Financial calculations
  const totalAllTimeExpenses = expenses.reduce((sum, e) => sum + (e.totalPrice || 0), 0);
  const currentMonthExpenses = expenses
    .filter((e) => e.month === CURRENT_MONTH)
    .reduce((sum, e) => sum + (e.totalPrice || 0), 0);

  const filteredTotal = filteredExpenses.reduce((sum, e) => sum + (e.totalPrice || 0), 0);

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: All Time Expenses */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Expenses
            </div>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
              {formatCurrency(totalAllTimeExpenses)}
            </div>
          </div>
          <div className="text-xs text-slate-400 font-mono">{expenses.length} items</div>
        </div>

        {/* Card 2: Current Month Expenses */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              {CURRENT_MONTH} Expenses
            </div>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
              {formatCurrency(currentMonthExpenses)}
            </div>
          </div>
        </div>

        {/* Card 3: Filtered Total */}
        <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Filtered Cost
            </div>
            <div className="text-lg font-bold font-mono text-rose-400 mt-0.5">
              {formatCurrency(filteredTotal)}
            </div>
          </div>
          <div className="text-xs text-slate-400">{filteredExpenses.length} items</div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        
        {/* Controls Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search expense item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium"
            />
          </div>

          {/* Filters & Actions */}
          <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
            
            <div className="flex items-center gap-2">
              {/* Filter by Month */}
              <div className="flex items-center gap-1 bg-white border border-slate-300 px-2.5 py-1.5 rounded-lg text-xs">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Months</option>
                  {MONTH_NAMES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter by Category */}
              {categories.length > 0 && (
                <div className="flex items-center gap-1 bg-white border border-slate-300 px-2.5 py-1.5 rounded-lg text-xs">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Add Expense Button */}
            {!isReadOnly && (
              <button
                onClick={onAddExpense}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Expense</span>
              </button>
            )}

          </div>

        </div>

        {/* Mobile Cards View (Visible on small screens) */}
        <div className="block sm:hidden divide-y divide-slate-100">
          {filteredExpenses.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <ReceiptText className="w-7 h-7 mx-auto mb-2 text-slate-300" />
              <p className="font-medium text-slate-600 text-xs">No expenses recorded</p>
            </div>
          ) : (
            filteredExpenses.map((exp) => (
              <div key={exp.id} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900 text-xs">{exp.itemName}</div>
                    {exp.note && (
                      <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{exp.note}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-rose-600 text-xs">
                      {formatCurrency(exp.totalPrice)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {exp.quantity} × {formatCurrency(exp.unitPrice)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">
                      {exp.category || 'Hardware'}
                    </span>
                    <span className="text-slate-500">{exp.month}</span>
                    <span className="text-slate-400 font-mono text-[10px]">{exp.date}</span>
                  </div>

                  {!isReadOnly && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEditExpense(exp)}
                        className="p-1 text-slate-500 hover:text-cyan-600 rounded"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteExpense(exp.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Expenses Table (Hidden on small screens) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                <th className="py-2.5 px-4">Item Name</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-right">Total</th>
                <th className="py-2.5 px-3">Month</th>
                <th className="py-2.5 px-3">Date</th>
                {!isReadOnly && <th className="py-2.5 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={isReadOnly ? 7 : 8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ReceiptText className="w-8 h-8 text-slate-300" />
                      <p className="font-medium text-slate-600 text-sm">No expenses recorded</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    {/* Item Name & Note */}
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>{exp.itemName}</div>
                      {exp.note && (
                        <div className="text-[11px] font-normal text-slate-400 truncate max-w-xs mt-0.5">
                          {exp.note}
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                        {exp.category || 'Hardware'}
                      </span>
                    </td>

                    {/* Per piece price */}
                    <td className="py-3 px-3 text-right font-mono text-slate-600">
                      {formatCurrency(exp.unitPrice)}
                    </td>

                    {/* Quantity */}
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">
                      {exp.quantity}
                    </td>

                    {/* Total Price */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-rose-600">
                      {formatCurrency(exp.totalPrice)}
                    </td>

                    {/* Expense Month */}
                    <td className="py-3 px-3 font-medium text-slate-700">
                      {exp.month}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {exp.date}
                    </td>

                    {/* Actions */}
                    {!isReadOnly && (
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onEditExpense(exp)}
                            className="p-1 text-slate-500 hover:text-cyan-600 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteExpense(exp.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        {filteredExpenses.length > 0 && (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              <span className="font-bold text-slate-800">{filteredExpenses.length}</span> items
            </div>
            <div className="font-mono">
              Total:{' '}
              <span className="font-bold text-rose-600 ml-1">
                {formatCurrency(filteredTotal)}
              </span>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
