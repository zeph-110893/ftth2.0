import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Eye,
  Edit3,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { UserAccount, AuthUser } from '../types';
import { authFetch } from '../utils/auth';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: AuthUser | null;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for creating a new user
  const [isCreating, setIsCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [permission, setPermission] = useState<'ADMIN' | 'RW' | 'R'>('RW');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for editing a user
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editPermission, setEditPermission] = useState<'ADMIN' | 'RW' | 'R'>('RW');

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/users');

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch users');
      }

      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Error loading users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setIsCreating(false);
      setEditingUser(null);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          name: username.trim(),
          permission,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user account');
      }

      setSuccessMsg(`User "${username}" created successfully with ${permission} permission.`);
      setUsername('');
      setPassword('');
      setPermission('RW');
      setIsCreating(false);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setError(null);
    setSuccessMsg(null);

    setIsSubmitting(true);
    try {
      const payload: any = {
        name: editingUser.username,
        permission: editPermission,
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      const res = await authFetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user account');
      }

      setSuccessMsg(`User account "${editingUser.username}" updated successfully.`);
      setEditingUser(null);
      setEditPassword('');
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: UserAccount) => {
    if (!confirm(`Are you sure you want to permanently delete user account "${user.username}"?`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);
    try {
      const res = await authFetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      setSuccessMsg(`User "${user.username}" was deleted.`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const startEdit = (user: UserAccount) => {
    setEditingUser(user);
    setEditPassword('');
    const userPerm = user.permission || (user.role === 'admin' ? 'ADMIN' : user.role === 'r' ? 'R' : 'RW');
    setEditPermission(userPerm as any);
    setIsCreating(false);
    setError(null);
    setSuccessMsg(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 relative max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>User Accounts & Permissions</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Admin Only
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Grant (R) Read Only, (RW) Read & Write, or (ADMIN) Administrator privileges.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Permission Legend */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0 text-[11px]">
          <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-2">
            <div className="p-1 rounded bg-slate-800 text-slate-300 shrink-0 mt-0.5">
              <Eye className="w-3 h-3" />
            </div>
            <div>
              <div className="font-bold text-slate-200">(R) Read Only</div>
              <div className="text-[10px] text-slate-400">Can view records, analytics, and portal without write access.</div>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-2">
            <div className="p-1 rounded bg-cyan-950 text-cyan-400 shrink-0 mt-0.5">
              <Edit3 className="w-3 h-3" />
            </div>
            <div>
              <div className="font-bold text-cyan-300">(RW) Read & Write</div>
              <div className="text-[10px] text-slate-400">Add subscribers, record payments, expenses & MikroTik syncs.</div>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-2">
            <div className="p-1 rounded bg-purple-950 text-purple-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-3 h-3" />
            </div>
            <div>
              <div className="font-bold text-purple-300">(ADMIN) Administrator</div>
              <div className="text-[10px] text-slate-400">Full control: manage users, permissions & database restores.</div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="mt-4 overflow-y-auto pr-1 space-y-4 flex-1">
          
          {/* Create User Section */}
          {isCreating ? (
            <form onSubmit={handleCreateUser} className="p-4 bg-slate-950/90 rounded-xl border border-cyan-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4" />
                  <span>Create New Operator Account</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. staff_john"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 4 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Assigned Permission *</label>
                  <select
                    value={permission}
                    onChange={(e) => setPermission(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="R">(R) Read Only</option>
                    <option value="RW">(RW) Read & Write</option>
                    <option value="ADMIN">(ADMIN) Full Administrator</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>Save Account</span>
                </button>
              </div>
            </form>
          ) : editingUser ? (
            <form onSubmit={handleUpdateUser} className="p-4 bg-slate-950/90 rounded-xl border border-purple-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <Edit2 className="w-4 h-4" />
                  <span>Edit User: {editingUser.username}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">New Password (leave blank to keep)</label>
                  <input
                    type="password"
                    placeholder="Enter new password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Permission Level</label>
                  <select
                    value={editPermission}
                    onChange={(e) => setEditPermission(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="R">(R) Read Only</option>
                    <option value="RW">(RW) Read & Write</option>
                    <option value="ADMIN">(ADMIN) Full Administrator</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Update Account</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-300">Registered Accounts ({users.length})</span>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(true);
                  setEditingUser(null);
                  setError(null);
                  setSuccessMsg(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add New User</span>
              </button>
            </div>
          )}

          {/* User List Table */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="py-10 text-center text-slate-400">
                <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin mx-auto mb-2" />
                <p className="text-xs">Loading user list...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">No user accounts found.</div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Permission</th>
                    <th className="py-2.5 px-3">Created</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u) => {
                    const uPerm = u.permission || (u.role === 'admin' ? 'ADMIN' : u.role === 'r' ? 'R' : 'RW');
                    const isSelf = currentUser && currentUser.id === u.id;

                    return (
                      <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-cyan-300">
                              {u.username[0].toUpperCase()}
                            </div>
                            <div className="font-bold text-slate-200 flex items-center gap-1.5">
                              <span>{u.username}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                                  You
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          {uPerm === 'ADMIN' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">
                              <ShieldCheck className="w-3 h-3" />
                              <span>(ADMIN) Administrator</span>
                            </span>
                          ) : uPerm === 'RW' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                              <Edit3 className="w-3 h-3" />
                              <span>(RW) Read & Write</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              <Eye className="w-3 h-3 text-slate-400" />
                              <span>(R) Read Only</span>
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Initial'}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEdit(u)}
                              title="Edit user details or permissions"
                              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                title="Delete user account"
                                className="p-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer border border-rose-900/40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
