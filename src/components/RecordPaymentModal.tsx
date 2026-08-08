import React, { useState, useEffect } from 'react';
import { X, Receipt } from 'lucide-react';
import { Subscriber, PaymentRecord } from '../types';
import { MONTH_NAMES, displayName, formatCurrency, CURRENT_MONTH } from '../utils/billingUtils';

interface RecordPaymentModalProps {
  isOpen: boolean;
  subscribers: Subscriber[];
  preselectedSub?: Subscriber | null;
  onClose: () => void;
  onSavePayment: (payment: PaymentRecord) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  subscribers,
  preselectedSub,
  onClose,
  onSavePayment,
}) => {
  if (!isOpen) return null;

  const [selectedSubId, setSelectedSubId] = useState<number>(preselectedSub?.id || subscribers[0]?.id || 1);
  const [selectedMonth, setSelectedMonth] = useState<string>(CURRENT_MONTH);
  const [amount, setAmount] = useState<number>(600);
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // Update default rate when selected subscriber changes
  useEffect(() => {
    if (preselectedSub) {
      setSelectedSubId(preselectedSub.id);
      setAmount(preselectedSub.rate || 600);
    } else {
      const currentSub = subscribers.find((s) => s.id === selectedSubId);
      if (currentSub) {
        setAmount(currentSub.rate || 600);
      }
    }
  }, [selectedSubId, preselectedSub, subscribers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubId) return;

    const newPayment: PaymentRecord = {
      sub: selectedSubId,
      month: selectedMonth,
      amount: Number(amount) || 600,
      referenceNo,
      note,
      ts: new Date().toLocaleString(),
    };

    onSavePayment(newPayment);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            <h2 className="text-base font-bold">Record Subscriber Payment</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-indigo-700 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Subscriber Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Select Subscriber *
            </label>
            <select
              value={selectedSubId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedSubId(id);
                const sub = subscribers.find((s) => s.id === id);
                if (sub) setAmount(sub.rate);
              }}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              {subscribers.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} — {displayName(s)} (Rate: ₱{s.rate})
                </option>
              ))}
            </select>
          </div>

          {/* Billing Month & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Billing Month *
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                {[2026, 2025, 2024].flatMap((year) =>
                  MONTH_NAMES.map((m) => {
                    const monthStr = `${m} ${year}`;
                    return (
                      <option key={monthStr} value={monthStr}>
                        {monthStr}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Amount (₱) *
              </label>
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold text-slate-900"
              />
            </div>
          </div>

          {/* Reference / OR No. */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Reference / OR No.
            </label>
            <input
              type="text"
              placeholder="e.g. Ref #102938"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Optional Note
            </label>
            <input
              type="text"
              placeholder="e.g. Paid in cash at office counter"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs cursor-pointer"
            >
              Save Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
