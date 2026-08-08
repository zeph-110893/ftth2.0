import React, { useState, useEffect } from 'react';
import { X, UserPlus, Save } from 'lucide-react';
import { Subscriber, AccountStatus } from '../types';
import { TODAY, parseDateSafe } from '../utils/billingUtils';

interface AddSubscriberModalProps {
  isOpen: boolean;
  editingSubscriber?: Subscriber | null;
  onClose: () => void;
  onSaveSubscriber: (sub: Subscriber) => void;
  nextId: number;
}

const getInitialDueDate = (sub?: Subscriber | null) => {
  if (sub?.dueRaw) {
    const d = parseDateSafe(sub.dueRaw);
    if (d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  if (sub?.dueDay) {
    const y = TODAY.year;
    const m = String(TODAY.monthIdx + 1).padStart(2, '0');
    const day = String(sub.dueDay).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const y = TODAY.year;
  const m = String(TODAY.monthIdx + 1).padStart(2, '0');
  const day = String(TODAY.day).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const AddSubscriberModal: React.FC<AddSubscriberModalProps> = ({
  isOpen,
  editingSubscriber,
  onClose,
  onSaveSubscriber,
  nextId,
}) => {
  if (!isOpen) return null;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [rate, setRate] = useState<number>(600);
  const [dueDate, setDueDate] = useState<string>('');
  const [status, setStatus] = useState<AccountStatus>('Active');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (editingSubscriber) {
      setFirstName(editingSubscriber.first);
      setLastName(editingSubscriber.last);
      setRate(editingSubscriber.rate);
      setDueDate(getInitialDueDate(editingSubscriber));
      setStatus(editingSubscriber.status);
      setPhone(editingSubscriber.phone || '');
      setAddress(editingSubscriber.address || '');
    } else {
      setFirstName('');
      setLastName('');
      setRate(600);
      setDueDate(getInitialDueDate(null));
      setStatus('Active');
      setPhone('');
      setAddress('');
    }
  }, [editingSubscriber]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName) return;

    let parsedDueDay: number | null = null;
    let dueRawVal: string = dueDate;

    if (dueDate) {
      const d = parseDateSafe(dueDate);
      if (d) {
        parsedDueDay = d.getDate();
      }
    }

    const newSub: Subscriber = {
      id: editingSubscriber ? editingSubscriber.id : nextId,
      first: firstName.trim(),
      last: lastName.trim(),
      rate: Number(rate) || 600,
      dueRaw: dueRawVal || undefined,
      dueDay: parsedDueDay,
      status,
      vlan: editingSubscriber ? (editingSubscriber.vlan ?? null) : null,
      phone: phone.trim(),
      address: address.trim(),
    };

    onSaveSubscriber(newSub);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold">
              {editingSubscriber ? `Edit Subscriber #${editingSubscriber.id}` : `Add New Subscriber (#${nextId})`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                First Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Maria"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Last Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Santos"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>
          </div>

          {/* Rate, Due Date & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Monthly Rate (₱)
              </label>
              <input
                type="number"
                required
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Installation Date *
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AccountStatus)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Contact Phone & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                placeholder="0917-000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Installation Address
              </label>
              <input
                type="text"
                placeholder="Block & Lot, Street, Subd., Barangay"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
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
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{editingSubscriber ? 'Update Subscriber' : 'Save Subscriber'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
