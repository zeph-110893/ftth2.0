import React, { useState, useEffect } from 'react';
import { Subscriber, PaymentRecord, Expense, ViewTab, MikroTikDhcpLease, MikroTikInterface, AuthUser } from './types';
import { calculateSubMetrics, exportToCSV, CURRENT_MONTH } from './utils/billingUtils';
import { getStoredUser, getAuthToken, clearAuthSession, authFetch, canWrite, isAdmin } from './utils/auth';

import { Header } from './components/Header';
import { NavigationTabs } from './components/NavigationTabs';
import { SubscribersList } from './components/SubscribersList';
import { RevenueAnalytics } from './components/RevenueAnalytics';
import { ExpensesTracker } from './components/ExpensesTracker';
import { OverdueTracker } from './components/OverdueTracker';
import { MikroTikManager } from './components/MikroTikManager';
import { ActivityView } from './components/ActivityView';
import { UserManagementModal } from './components/UserManagementModal';
import { LoginPage } from './components/LoginPage';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { DatabaseModal } from './components/DatabaseModal';

import { SubscriberDetailPage } from './components/SubscriberDetailPage';
import { AddSubscriberModal } from './components/AddSubscriberModal';
import { AddExpenseModal } from './components/AddExpenseModal';
import { SubscriberPortal } from './components/SubscriberPortal';

export default function App() {
  // Main View state: Subscriber Portal is the default main landing page (no authentication required).
  // Admin management / login is accessed via the Admin Login button or /admin route.
  const [isAdminView, setIsAdminView] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const search = window.location.search.toLowerCase();
      return (
        path.startsWith('/admin') ||
        path.startsWith('/login') ||
        search.includes('admin') ||
        search.includes('view=admin')
      );
    }
    return false;
  });

  // Auth state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState<boolean>(false);
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState<boolean>(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState<boolean>(false);

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dhcpLeases, setDhcpLeases] = useState<MikroTikDhcpLease[]>([]);
  const [mikrotikInterfaces, setMikrotikInterfaces] = useState<MikroTikInterface[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Sync browser back/forward buttons with admin/portal views
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      const search = window.location.search.toLowerCase();
      if (getAuthToken() || currentUser) {
        setIsAdminView(true);
        return;
      }
      setIsAdminView(
        path.startsWith('/admin') ||
        path.startsWith('/login') ||
        search.includes('admin') ||
        search.includes('view=admin')
      );
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentUser]);

  // Keep authenticated admins restricted strictly to Admin View
  useEffect(() => {
    if (currentUser && !isAdminView) {
      setIsAdminView(true);
      if (typeof window !== 'undefined' && window.history?.pushState) {
        window.history.pushState({}, '', '/admin');
      }
    }
  }, [currentUser, isAdminView]);

  // Navigation helpers
  const navigateToAdmin = () => {
    setIsAdminView(true);
    if (typeof window !== 'undefined' && window.history?.pushState) {
      window.history.pushState({}, '', '/admin');
    }
  };

  const navigateToSubscriberPortal = () => {
    // Admins and authenticated staff are not allowed to access the subscriber portal
    if (currentUser || getAuthToken()) {
      setIsAdminView(true);
      return;
    }
    setIsAdminView(false);
    if (typeof window !== 'undefined' && window.history?.pushState) {
      window.history.pushState({}, '', '/');
    }
  };

  // Check existing session validity on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      if (!token) {
        setCurrentUser(null);
        setIsAuthChecking(false);
        setIsLoading(false);
        return;
      }

      try {
        const res = await authFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
          } else {
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
          clearAuthSession();
        }
      } catch (err) {
        console.error('Error verifying auth session:', err);
        setCurrentUser(null);
      } finally {
        setIsAuthChecking(false);
      }
    };

    checkAuth();

    // Listen for unauthorized 401 events
    const handleUnauthorized = () => {
      setCurrentUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  // Fetch initial data or perform background sync (2 requests/min = every 30s)
  const fetchData = async (isSilent = false) => {
    if (!currentUser && !getAuthToken()) return;

    try {
      if (!isSilent) {
        setIsLoading(true);
      } else {
        setIsSyncing(true);
      }

      const [resData, resLeases, resInterfaces] = await Promise.all([
        authFetch('/api/data'),
        authFetch('/api/mikrotik/leases').catch(() => null),
        authFetch('/api/mikrotik/interfaces').catch(() => null),
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
      setLastSyncedTime(new Date());
    } catch (err) {
      console.error('Error fetching SQLite data:', err);
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
      setIsSyncing(false);
    }
  };

  // Initial load when authenticated
  useEffect(() => {
    if (!currentUser) return;
    fetchData(false);
  }, [currentUser]);

  // Handle Logout
  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      clearAuthSession();
      setCurrentUser(null);
      setSubscribers([]);
      setPayments([]);
      setExpenses([]);
    }
  };

  // View state
  const [currentTab, setCurrentTab] = useState<ViewTab>('subscribers');

  // Ensure operator users cannot access mikrotik or activity tabs
  useEffect(() => {
    if (!isAdmin(currentUser) && (currentTab === 'mikrotik' || currentTab === 'activity')) {
      setCurrentTab('subscribers');
    }
  }, [currentUser, currentTab]);

  // Modal & View states
  const [selectedSubDetail, setSelectedSubDetail] = useState<Subscriber | null>(null);
  const [isAddSubOpen, setIsAddSubOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscriber | null>(null);

  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Dedicated Subscriber Detail Page selection & browser URL query sync
  const handleSelectSubscriber = (sub: Subscriber | null) => {
    setSelectedSubDetail(sub);
    try {
      const url = new URL(window.location.href);
      if (sub) {
        url.searchParams.set('sub', String(sub.id));
        window.history.pushState({ subId: sub.id }, '', url.toString());
      } else {
        url.searchParams.delete('sub');
        url.searchParams.delete('subscriber');
        window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
      }
    } catch (e) {
      // Fallback in case of history state error
    }
  };

  // Synchronize URL with selected subscriber on popstate or on initial data load
  useEffect(() => {
    const handleUrlChange = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const subIdParam = params.get('sub') || params.get('subscriber');
        if (subIdParam) {
          const id = parseInt(subIdParam, 10);
          const found = subscribers.find((s) => s.id === id);
          if (found) {
            setSelectedSubDetail(found);
            return;
          }
        }
        setSelectedSubDetail(null);
      } catch (e) {}
    };

    window.addEventListener('popstate', handleUrlChange);
    if (subscribers.length > 0) {
      handleUrlChange();
    }
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, [subscribers]);

  // Computed metrics for counts (excluding Exclude status)
  const nonExcludedSubscribers = subscribers.filter((sub) => sub.status !== 'Exclude');

  const overdueCount = nonExcludedSubscribers.filter((sub) => {
    const m = calculateSubMetrics(sub, payments, CURRENT_MONTH);
    return m.statusPill === 'overdue';
  }).length;

  const dueCount = nonExcludedSubscribers.filter((sub) => {
    const m = calculateSubMetrics(sub, payments, CURRENT_MONTH);
    return m.statusPill === 'due';
  }).length;

  const activeCount = nonExcludedSubscribers.filter((sub) => {
    const m = calculateSubMetrics(sub, payments, CURRENT_MONTH);
    return m.statusPill === 'active';
  }).length;

  const totalUnpaidAmount = nonExcludedSubscribers.reduce((acc, sub) => {
    const m = calculateSubMetrics(sub, payments, CURRENT_MONTH);
    return acc + m.missed * m.rate;
  }, 0);

  // Payment Handlers (SQLite integration)
  const handleSavePayment = async (newPayment: PaymentRecord) => {
    // Optimistic UI update
    setPayments((prev) => [newPayment, ...prev]);

    try {
      const res = await authFetch('/api/payments', {
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
        await authFetch(`/api/payments/${target.id}`, { method: 'DELETE' });
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
      const res = await authFetch('/api/expenses', {
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
        await authFetch(`/api/expenses/${id}`, { method: 'DELETE' });
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
      const res = await authFetch('/api/subscribers', {
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
      handleSelectSubscriber(null);
    }

    try {
      await authFetch(`/api/subscribers/${subId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete subscriber from SQLite:', err);
    }
  };

  const handleDeleteDhcpLease = async (leaseId: string, macAddress?: string): Promise<boolean> => {
    setDhcpLeases((prev) => prev.filter((l) => l.id !== leaseId && l.macAddress !== macAddress));
    try {
      const res = await authFetch('/api/mikrotik/delete-lease', {
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

  // Default Landing Page: Subscriber Portal (only for public unauthenticated visitors)
  if (!isAdminView && !currentUser) {
    return (
      <SubscriberPortal
        onOpenAdminLogin={navigateToAdmin}
      />
    );
  }

  // If initial auth check is in progress, show clean loading state
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-9 h-9 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wide text-slate-300">Checking authorization...</span>
      </div>
    );
  }

  // If not logged in, render the secure Login Page with back to Subscriber Portal button
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(user) => {
          setCurrentUser(user);
        }}
        onOpenSubscriberPortal={navigateToSubscriberPortal}
      />
    );
  }

  // Next Subscriber ID
  const nextSubId = Math.max(0, ...subscribers.map((s) => s.id)) + 1;

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-800 flex flex-col font-sans antialiased selection:bg-cyan-500 selection:text-white">
      {/* App Header */}
      <Header
        onAddSubscriber={() => {
          setEditingSub(null);
          setIsAddSubOpen(true);
        }}
        onAddExpense={() => {
          setEditingExpense(null);
          setIsAddExpenseOpen(true);
        }}
        onOpenDatabaseModal={() => setIsDatabaseModalOpen(true)}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        onRefresh={() => fetchData(true)}
        isSyncing={isSyncing}
        currentUser={currentUser}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        onLogout={async () => {
          await handleLogout();
          navigateToAdmin();
        }}
        totalSubsCount={nonExcludedSubscribers.length}
        activeCount={activeCount}
        dueCount={dueCount}
        overdueCount={overdueCount}
      />

      {/* Navigation Tabs */}
      <NavigationTabs
        currentTab={currentTab}
        currentUser={currentUser}
        onTabChange={(tab) => {
          if (selectedSubDetail) {
            handleSelectSubscriber(null);
          }
          if (!isAdmin(currentUser) && (tab === 'mikrotik' || tab === 'activity')) {
            setCurrentTab('subscribers');
          } else {
            setCurrentTab(tab);
          }
        }}
        overdueCount={overdueCount}
        totalUnpaidAmount={totalUnpaidAmount}
        expenseCount={expenses.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold text-slate-600 font-mono">Loading FTTH Database from SQLite...</span>
          </div>
        ) : selectedSubDetail ? (
          <SubscriberDetailPage
            subscriber={selectedSubDetail}
            subscribers={subscribers}
            payments={payments}
            dhcpLeases={dhcpLeases}
            mikrotikInterfaces={mikrotikInterfaces}
            currentUser={currentUser}
            previousTabName={currentTab}
            onBack={() => handleSelectSubscriber(null)}
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
        ) : (
          <>
            {currentTab === 'subscribers' && (
              <SubscribersList
                subscribers={subscribers}
                payments={payments}
                dhcpLeases={dhcpLeases}
                mikrotikInterfaces={mikrotikInterfaces}
                currentUser={currentUser}
                onSelectSubscriber={(sub) => handleSelectSubscriber(sub)}
                onAddSubscriber={() => {
                  setEditingSub(null);
                  setIsAddSubOpen(true);
                }}
                onRefreshData={fetchData}
                onAddPayment={handleSavePayment}
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
                currentUser={currentUser}
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
                currentUser={currentUser}
                onSelectSubscriber={(sub) => handleSelectSubscriber(sub)}
              />
            )}

            {currentTab === 'mikrotik' && isAdmin(currentUser) && (
              <MikroTikManager
                currentUser={currentUser}
                onRefreshData={fetchData}
              />
            )}

            {currentTab === 'activity' && isAdmin(currentUser) && (
              <ActivityView
                currentUser={currentUser}
                onRefreshStats={fetchData}
              />
            )}
          </>
        )}
      </main>

      {/* Modals & Drawers */}
      <AddSubscriberModal
        isOpen={isAddSubOpen}
        editingSubscriber={editingSub}
        subscribers={subscribers}
        mikrotikInterfaces={mikrotikInterfaces}
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

      {/* User Management & Permissions Modal (Admin only) */}
      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        currentUser={currentUser}
      />

      {/* Security / Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        currentUser={currentUser}
        onUserUpdated={(updatedUser) => setCurrentUser(updatedUser)}
      />

      {/* Database Backup & Restore Modal */}
      <DatabaseModal
        isOpen={isDatabaseModalOpen}
        onClose={() => setIsDatabaseModalOpen(false)}
        subscribersCount={subscribers.length}
        paymentsCount={payments.length}
        expensesCount={expenses.length}
        currentUser={currentUser}
        onDatabaseRestored={({ subscribers: newSubs, payments: newPayments, expenses: newExpenses }) => {
          setSubscribers(newSubs);
          setPayments(newPayments);
          setExpenses(newExpenses);
          setLastSyncedTime(new Date());
        }}
      />
    </div>
  );
}

