import React, { useState, useEffect } from 'react';
import { X, ReceiptText, Calculator } from 'lucide-react';
import { Expense } from '../types';
import { MONTH_NAMES, CURRENT_MONTH, formatCurrency } from '../utils/billingUtils';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveExpense: (expense: Omit<Expense, 'id'> & { id?: string }) => void;
  editingExpense?: Expense | null;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSaveExpense,
  editingExpense,
}) => {
  const [itemName, setItemName] = useState('');
  const [unitPrice, setUnitPrice] = useState<number | ''>(0);
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [totalPrice, setTotalPrice] = useState<number | ''>(0);
  const [isManualTotal, setIsManualTotal] = useState(false);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Hardware');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (editingExpense) {
      setItemName(editingExpense.itemName || '');
      setUnitPrice(editingExpense.unitPrice || 0);
      setQuantity(editingExpense.quantity || 1);
      setTotalPrice(editingExpense.totalPrice || 0);
      setMonth(editingExpense.month || CURRENT_MONTH);
      setDate(editingExpense.date || new Date().toISOString().split('T')[0]);
      setCategory(editingExpense.category || 'Hardware');
      setNote(editingExpense.note || '');
      setIsManualTotal(true);
    } else {
      setItemName('');
      setUnitPrice(0);
      setQuantity(1);
      setTotalPrice(0);
      setMonth(CURRENT_MONTH);
      setDate(new Date().toISOString().split('T')[0]);
      setCategory('Hardware');
      setNote('');
      setIsManualTotal(false);
    }
  }, [editingExpense, isOpen]);

  // Auto-calculate Total Price when unitPrice or quantity changes unless manually overridden
  const handleUnitPriceChange = (val: number) => {
    setUnitPrice(val);
    if (!isManualTotal) {
      const q = typeof quantity === 'number' ? quantity : 0;
      setTotalPrice(val * q);
    }
  };

  const handleQuantityChange = (val: number) => {
    setQuantity(val);
    if (!isManualTotal) {
      const p = typeof unitPrice === 'number' ? unitPrice : 0;
      setTotalPrice(p * val);
    }
  };

  const handleTotalPriceChange = (val: number) => {
    setTotalPrice(val);
    setIsManualTotal(true);
  };

  const resetAutoCalc = () => {
    setIsManualTotal(false);
    const p = typeof unitPrice === 'number' ? unitPrice : 0;
    const q = typeof quantity === 'number' ? quantity : 0;
    setTotalPrice(p * q);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    const uPrice = typeof unitPrice === 'number' ? unitPrice : 0;
    const qty = typeof quantity === 'number' ? quantity : 1;
    const tot = typeof totalPrice === 'number' ? totalPrice : uPrice * qty;

    onSaveExpense({
      id: editingExpense?.id,
      itemName: itemName.trim(),
      unitPrice: uPrice,
      quantity: qty,
      totalPrice: tot,
      date,
      month,
      category,
      note: note.trim(),
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 transition-all transform animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-lg">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {editingExpense ? 'Edit Expense Item' : 'Add New Expense'}
              </h2>
              <p className="text-xs text-slate-400">Record hardware, cables, or operating costs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Item Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Item Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Fiber Patch Cord 10m, ONU Router, Utility Bill"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full text-sm p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          {/* Unit Price & Quantity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Per Piece Price (₱)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={unitPrice === '' ? '' : unitPrice}
                onChange={(e) => handleUnitPriceChange(e.target.value === '' ? 0 : Number(e.target.value))}
                className="w-full text-sm p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="1"
                value={quantity === '' ? '' : quantity}
                onChange={(e) => handleQuantityChange(e.target.value === '' ? 1 : Number(e.target.value))}
                className="w-full text-sm p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-semibold"
              />
            </div>
          </div>

          {/* Total Price */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Total Price (₱)
              </label>
              {isManualTotal && (
                <button
                  type="button"
                  onClick={resetAutoCalc}
                  className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 font-medium"
                >
                  <Calculator className="w-3 h-3" /> Auto-calculate (Unit × Qty)
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                required
                placeholder="0.00"
                value={totalPrice === '' ? '' : totalPrice}
                onChange={(e) => handleTotalPriceChange(e.target.value === '' ? 0 : Number(e.target.value))}
                className="w-full text-base p-3 bg-rose-50/50 border border-rose-200 text-rose-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono font-bold"
              />
              <div className="absolute right-3 top-3.5 text-xs text-rose-600 font-mono font-semibold">
                {formatCurrency(typeof totalPrice === 'number' ? totalPrice : 0)}
              </div>
            </div>
          </div>

          {/* Month & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Expense Month
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                {MONTH_NAMES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Date Recorded
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="Hardware">Hardware / Routers</option>
              <option value="Hardware / Cabling">Hardware / Cabling & Fittings</option>
              <option value="Bandwidth / Utility">Bandwidth / Utility Wholesale</option>
              <option value="Tools / Equipment">Tools / Equipment</option>
              <option value="Maintenance / Repairs">Maintenance / Repairs</option>
              <option value="Labor / Field">Labor / Field Operations</option>
              <option value="Other">Other Expenses</option>
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Note / Reference (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Add optional notes or supplier receipt number..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
            >
              {editingExpense ? 'Update Expense' : 'Save Expense Item'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
