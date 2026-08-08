import React, { useState, useEffect } from 'react';
import { Subscriber, PaymentRecord, Expense, ViewTab, MikroTikDhcpLease, MikroTikInterface } from './types';
import { calculateSubMetrics, exportToCSV, CURRENT_MONTH } from './utils/billingUtils';

import { Header } from './components/Header';
import { NavigationTabs } from './components/NavigationTabs';
import { SubscribersList } from './components/SubscribersList';
import { RevenueAnalytics } from './components/RevenueAnalytics';
import { ExpensesTracker } from './components/ExpensesTracker';
import { OverdueTracker } from './components/OverdueTracker';
import { MikroTikManager } from './components/MikroTikManager';

import { SubscriberDetailModal } from './components/SubscriberDetailModal';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { AddSubscriberModal } from './components/AddSubscriberModal';
import { AddExpenseModal } from './components/AddExpenseModal';

export default function App() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dhcpLeases, setDhcpLeases] = useState<MikroTikDhcpLease[]>([]);
  const [mikrotikInterfaces, setMikrotikInterfaces] = useState<MikroTikInterface[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch initial data from SQLite backend API
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [resData, resLeases, resInterfaces] = await Promise.all([
        fetch('/api/data'),
        fetch('/api/mikrotik/leases').catch(() => null),
        fetch('/api/mikrotik/interfaces').catch(() => null),
      ]);

      if (resData.ok) {
        const data = await resData.json();
        setSubscribers(data.subscribers || []);
        setPayments(data.payments || []);
        setExpenses(data.expenses || []);
      }

      if (resLeases && resLeases.ok) {
        const leaseData = await resLeases.json();
        if (leaseData.success) {
          setDhcpLeases(leaseData.leases || []);
        }
      }

      if (resInterfaces && resInterfaces.ok) {
        const ifaceData = await resInterfaces.json();
        if (ifaceData.success) {
          setMikrotikInterfaces(ifaceData.interfaces || []);
        }
      }
    } catch (err) {
      console.error('Error fetching SQLite data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // View state
  const [currentTab, setCurrentTab] = useState<ViewTab>('subscribers');

  // Modal states
  const [selectedSubDetail, setSelectedSubDetail] = useState<Subscriber | null>(null);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [preselectedPaymentSub, setPreselectedPaymentSub] = useState<Subscriber | null>(null);
  const [isAddSubOpen, setIsAddSubOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscriber | null>(null);

  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Computed metrics for counts
  const overdueCount = subscribers.filter((sub) => {
    const m = calculateSubMetrics(sub, payments, CURRENT_MONTH);
    return m.statusPill === 'overdue';
  }).length;

  const dueCount = subscribers.filter((sub) => {
    const m = calculateSubMetrics(sub, payments, CURRENT_MONTH);
    return m.statusPill === 'due';
  }).length;

  const activeCount = subscribers.filter((sub) => {
    const m = calculateSubMetrics(sub, payments, CURRENT_MONTH);
    return m.statusPill === 'active';
  }).length;

  const totalUnpaidAmount = subscribers.reduce((acc, sub) => {
    const m = calculateSubMetrics(sub, payments, CURRENT_MONTH);
    return acc + m.missed * m.rate;
  }, 0);

  // Payment Handlers (SQLite integration)
  const handleSavePayment = async (newPayment: PaymentRecord) => {
    // Optimistic UI update
    setPayments((prev) => [newPayment, ...prev]);

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPayment),
      });
      if (res.ok) {
        const saved = await res.json();
        setPayments((prev) => prev.map((p) => (p.ts === newPayment.ts && p.sub === newPayment.sub && p.month === newPayment.month ? saved : p)));
      }
    } catch (err) {
      console.error('Failed to save payment to SQLite:', err);
    }
  };

  const handleDeletePayment = async (ts: string, subId: number, month: string) => {
    const target = payments.find((p) => p.sub === subId && p.month === month && (p.ts === ts || !ts));
    setPayments((prev) => prev.filter((p) => !(p.sub === subId && p.month === month && (p.ts === ts || !ts))));

    if (target && target.id) {
      try {
        await fetch(`/api/payments/${target.id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete payment from SQLite:', err);
      }
    }
  };

  // Expense Handlers (SQLite integration)
  const handleSaveExpense = async (expenseData: Omit<Expense, 'id'> & { id?: string }) => {
    const id = expenseData.id || `exp-${Date.now()}`;
    const fullExpense: Expense = { ...expenseData, id };

    setExpenses((prev) => {
      const exists = prev.some((e) => e.id === id);
      if (exists) return prev.map((e) => (e.id === id ? fullExpense : e));
      return [fullExpense, ...prev];
    });

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullExpense),
      });
      if (res.ok) {
        const saved = await res.json();
        setExpenses((prev) => prev.map((e) => (e.id === id ? saved : e)));
      }
    } catch (err) {
      console.error('Failed to save expense to SQLite:', err);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (confirm('Are you sure you want to delete this expense record?')) {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      try {
        await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete expense from SQLite:', err);
      }
    }
  };

  // Subscriber Handlers (SQLite integration)
  const handleSaveSubscriber = async (savedSub: Subscriber) => {
    setSubscribers((prev) => {
      const exists = prev.some((s) => s.id === savedSub.id);
      if (exists) {
        return prev.map((s) => (s.id === savedSub.id ? savedSub : s));
      } else {
        return [...prev, savedSub];
      }
    });

    setSelectedSubDetail((prev) => (prev && prev.id === savedSub.id ? savedSub : prev));

    try {
      const res = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedSub),
      });
      if (res.ok) {
        const updated = await res.json();
        setSubscribers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        setSelectedSubDetail((prev) => (prev && prev.id === updated.id ? updated : prev));
      }
    } catch (err) {
      console.error('Failed to save subscriber to SQLite:', err);
    }
  };

  const handleDeleteSubscriber = async (subId: number) => {
    setSubscribers((prev) => prev.filter((s) => s.id !== subId));
    setPayments((prev) => prev.filter((p) => p.sub !== subId));
    if (selectedSubDetail?.id === subId) {
      setSelectedSubDetail(null);
    }

    try {
      await fetch(`/api/subscribers/${subId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete subscriber from SQLite:', err);
    }
  };

  const handleDeleteDhcpLease = async (leaseId: string, macAddress?: string): Promise<boolean> => {
    setDhcpLeases((prev) => prev.filter((l) => l.id !== leaseId && l.macAddress !== macAddress));
    try {
      const res = await fetch('/api/mikrotik/delete-lease', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaseId, macAddress }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.success;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete DHCP lease:', err);
      return false;
    }
  };

  // Reset SQLite dataset
  const handleResetData = async () => {
    if (confirm('Reset SQLite database to default initial sample data? All local edits will be replaced.')) {
      try {
        const res = await fetch('/api/reset', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setSubscribers(data.subscribers || []);
          setPayments(data.payments || []);
          setExpenses(data.expenses || []);
        }
      } catch (err) {
        console.error('Failed to reset SQLite database:', err);
      }
    }
  };

  // Next Subscriber ID
  const nextSubId = Math.max(0, ...subscribers.map((s) => s.id)) + 1;

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-800 flex flex-col font-sans antialiased">
      {/* App Header */}
      <Header
        onAddSubscriber={() => {
          setEditingSub(null);
          setIsAddSubOpen(true);
        }}
        onRecordPayment={() => {
          setPreselectedPaymentSub(null);
          setIsRecordPaymentOpen(true);
        }}
        onAddExpense={() => {
          setEditingExpense(null);
          setIsAddExpenseOpen(true);
        }}
        totalSubsCount={subscribers.length}
        activeCount={activeCount}
        dueCount={dueCount}
        overdueCount={overdueCount}
      />

      {/* Navigation Tabs */}
      <NavigationTabs
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        overdueCount={overdueCount}
        totalUnpaidAmount={totalUnpaidAmount}
        expenseCount={expenses.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold text-slate-600">Loading FTTH Database from SQLite...</span>
          </div>
        ) : (
          <>
            {currentTab === 'subscribers' && (
              <SubscribersList
                subscribers={subscribers}
                payments={payments}
                dhcpLeases={dhcpLeases}
                mikrotikInterfaces={mikrotikInterfaces}
                onSelectSubscriber={(sub) => setSelectedSubDetail(sub)}
                onRecordPaymentForSub={(sub) => {
                  setPreselectedPaymentSub(sub);
                  setIsRecordPaymentOpen(true);
                }}
                onAddSubscriber={() => {
                  setEditingSub(null);
                  setIsAddSubOpen(true);
                }}
              />
            )}

            {currentTab === 'analytics' && (
              <RevenueAnalytics
                subscribers={subscribers}
                payments={payments}
                expenses={expenses}
                onOpenExpensesTab={() => setCurrentTab('expenses')}
              />
            )}

            {currentTab === 'expenses' && (
              <ExpensesTracker
                expenses={expenses}
                onAddExpense={() => {
                  setEditingExpense(null);
                  setIsAddExpenseOpen(true);
                }}
                onEditExpense={(exp) => {
                  setEditingExpense(exp);
                  setIsAddExpenseOpen(true);
                }}
                onDeleteExpense={handleDeleteExpense}
              />
            )}

            {currentTab === 'overdue' && (
              <OverdueTracker
                subscribers={subscribers}
                payments={payments}
                onRecordPaymentForSub={(sub) => {
                  setPreselectedPaymentSub(sub);
                  setIsRecordPaymentOpen(true);
                }}
                onSelectSubscriber={(sub) => setSelectedSubDetail(sub)}
              />
            )}

            {currentTab === 'mikrotik' && (
              <MikroTikManager
                subscribers={subscribers}
                payments={payments}
                onRefreshData={fetchData}
              />
            )}
          </>
        )}
      </main>

      {/* Modals & Drawers */}
      <SubscriberDetailModal
        subscriber={selectedSubDetail}
        payments={payments}
        dhcpLeases={dhcpLeases}
        onClose={() => setSelectedSubDetail(null)}
        onUpdateSubscriber={handleSaveSubscriber}
        onDeleteSubscriber={handleDeleteSubscriber}
        onDeleteDhcpLease={handleDeleteDhcpLease}
        onAddPayment={handleSavePayment}
        onDeletePayment={handleDeletePayment}
        onOpenEditModal={(sub) => {
          setEditingSub(sub);
          setIsAddSubOpen(true);
        }}
      />

      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        subscribers={subscribers}
        preselectedSub={preselectedPaymentSub}
        onClose={() => {
          setIsRecordPaymentOpen(false);
          setPreselectedPaymentSub(null);
        }}
        onSavePayment={handleSavePayment}
      />

      <AddSubscriberModal
        isOpen={isAddSubOpen}
        editingSubscriber={editingSub}
        onClose={() => {
          setIsAddSubOpen(false);
          setEditingSub(null);
        }}
        onSaveSubscriber={handleSaveSubscriber}
        nextId={nextSubId}
      />

      <AddExpenseModal
        isOpen={isAddExpenseOpen}
        editingExpense={editingExpense}
        onClose={() => {
          setIsAddExpenseOpen(false);
          setEditingExpense(null);
        }}
        onSaveExpense={handleSaveExpense}
      />
    </div>
  );
}
