import React, { useState, useEffect } from 'react';
import { X, UserPlus, Save, Network, ChevronDown } from 'lucide-react';
import { Subscriber, AccountStatus, MikroTikInterface } from '../types';
import { TODAY, parseDateSafe, capitalizeWords, getUnassignedVlans } from '../utils/billingUtils';

interface AddSubscriberModalProps {
  isOpen: boolean;
  subscribers?: Subscriber[];
  mikrotikInterfaces?: MikroTikInterface[];
  onClose: () => void;
  onSaveSubscriber: (sub: Subscriber) => void;
  nextId: number;
}

const getInitialDueDate = () => {
  const y = TODAY.year;
  const m = String(TODAY.monthIdx + 1).padStart(2, '0');
  const day = String(TODAY.day).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const AddSubscriberModal: React.FC<AddSubscriberModalProps> = ({
  isOpen,
  subscribers = [],
  mikrotikInterfaces = [],
  onClose,
  onSaveSubscriber,
  nextId,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [rate, setRate] = useState<number>(600);
  const [dueDate, setDueDate] = useState<string>('');
  const [status, setStatus] = useState<AccountStatus>('Active');
  const [vlan, setVlan] = useState<number | null>(null);
  const [isCustomVlan, setIsCustomVlan] = useState<boolean>(false);
  const [customVlanInput, setCustomVlanInput] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [macAddress, setMacAddress] = useState('');

  const unassignedVlans = getUnassignedVlans(subscribers, mikrotikInterfaces);

  useEffect(() => {
    if (!isOpen) return;
    setFirstName('');
    setLastName('');
    setRate(600);
    setDueDate(getInitialDueDate());
    setStatus('Active');
    setVlan(null);
    setCustomVlanInput('');
    setIsCustomVlan(false);
    setPhone('');
    setAddress('');
    setMacAddress('');
  }, [isOpen]);

  if (!isOpen) return null;

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

    const finalVlan = isCustomVlan
      ? (customVlanInput ? parseInt(customVlanInput.trim(), 10) : null)
      : vlan;

    const newSub: Subscriber = {
      id: nextId,
      first: capitalizeWords(firstName),
      last: capitalizeWords(lastName),
      rate: Number(rate) || 600,
      dueRaw: dueRawVal || undefined,
      dueDay: parsedDueDay,
      status,
      vlan: finalVlan && finalVlan > 0 ? finalVlan : null,
      phone: phone.trim(),
      address: address.trim(),
      macAddress: macAddress.trim().toUpperCase(),
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
            <UserPlus className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold">
              Add New Subscriber (#{nextId})
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
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium"
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
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium"
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
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono font-bold"
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
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AccountStatus)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Exclude">Exclude</option>
              </select>
            </div>
          </div>

          {/* VLAN Assignment Dropdown or Custom VLAN ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-indigo-600" />
                <span>Assign / Change VLAN (RouterOS)</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsCustomVlan(!isCustomVlan);
                  if (!isCustomVlan && vlan) {
                    setCustomVlanInput(String(vlan));
                  }
                }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline"
              >
                {isCustomVlan ? 'Select from list' : 'Enter custom VLAN ID'}
              </button>
            </div>

            {isCustomVlan ? (
              <div className="space-y-1">
                <input
                  type="number"
                  min="1"
                  max="4094"
                  value={customVlanInput}
                  onChange={(e) => setCustomVlanInput(e.target.value)}
                  placeholder="e.g. 105 (1 - 4094)"
                  className="w-full text-xs font-mono font-bold p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400">
                  Enter any VLAN ID between 1 and 4094.
                </span>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={vlan ? String(vlan) : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setVlan(val ? parseInt(val, 10) : null);
                  }}
                  className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium appearance-none"
                >
                  <option value="">— No VLAN Assigned (Unassigned) —</option>
                  {unassignedVlans.map((opt) => (
                    <option key={opt.vlanId} value={opt.vlanId}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              Assigning a VLAN automatically binds this subscriber and updates the MikroTik VLAN interface description.
            </p>
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
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* ONU / Router MAC Address */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                ONU / Router MAC Address
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Format: XX:XX:XX:XX:XX:XX</span>
            </div>
            <input
              type="text"
              placeholder="e.g. 48:8F:5A:12:34:56 or BC:54:51:A2:3B:4C"
              value={macAddress}
              onChange={(e) => setMacAddress(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono tracking-wider font-semibold text-slate-800 placeholder-slate-400 uppercase"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Used to match and identify the subscriber's ONU device in MikroTik DHCP leases and network telemetry.
            </p>
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
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Subscriber</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

