import React, { useState, useRef } from 'react';
import { Database, Download, Upload, AlertTriangle, CheckCircle2, Loader2, X, HardDrive, FileText, Shield } from 'lucide-react';
import { authFetch, isAdmin } from '../utils/auth';
import { Subscriber, PaymentRecord, Expense, AuthUser } from '../types';

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscribersCount: number;
  paymentsCount: number;
  expensesCount: number;
  currentUser?: AuthUser | null;
  onDatabaseRestored: (data: { subscribers: Subscriber[]; payments: PaymentRecord[]; expenses: Expense[] }) => void;
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({
  isOpen,
  onClose,
  subscribersCount,
  paymentsCount,
  expensesCount,
  currentUser,
  onDatabaseRestored,
}) => {
  const isUserAdmin = isAdmin(currentUser);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !isUserAdmin) return null;

  // Handler: Download SQLite Database File
  const handleDownload = async () => {
    setIsDownloading(true);
    setUploadError(null);
    try {
      const res = await authFetch('/api/database/download');
      if (!res.ok) {
        throw new Error('Failed to generate database backup file');
      }

      const blob = await res.blob();
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `ftth_database_backup_${dateStr}.sqlite`;

      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download database error:', err);
      setUploadError(err.message || 'Error downloading database');
    } finally {
      setIsDownloading(false);
    }
  };

  // Handler: Upload / Restore SQLite Database File
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Are you sure you want to restore the database with "${file.name}"?\n\nThis will replace current subscribers, payments, and expenses with data from the uploaded file.`)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const resultStr = reader.result as string;
          // Extract base64 payload
          const base64Data = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;

          const res = await authFetch('/api/database/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: base64Data }),
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to restore database');
          }

          setUploadSuccess(`Database restored successfully! Loaded ${data.subscribers?.length || 0} subscribers, ${data.payments?.length || 0} payments, and ${data.expenses?.length || 0} expenses.`);
          
          if (data.subscribers && data.payments && data.expenses) {
            onDatabaseRestored({
              subscribers: data.subscribers,
              payments: data.payments,
              expenses: data.expenses,
            });
          }
        } catch (err: any) {
          console.error('Upload processing error:', err);
          setUploadError(err.message || 'Error importing database file');
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };

      reader.onerror = () => {
        setUploadError('Failed to read file from disk');
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('File select error:', err);
      setUploadError(err.message || 'Error selecting file');
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-100">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Database Backup & Restore</h2>
              <p className="text-xs text-slate-500">Download offline backups or upload an existing SQLite database</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          
          {/* Notifications */}
          {uploadError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="font-medium">{uploadError}</div>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="font-medium">{uploadSuccess}</div>
            </div>
          )}

          {/* Current Database Summary */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
            <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                Current SQLite Database State
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                Active
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2 bg-white rounded-lg border border-slate-200/60">
                <div className="text-base font-extrabold text-slate-900">{subscribersCount}</div>
                <div className="text-[11px] text-slate-500 font-medium">Subscribers</div>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200/60">
                <div className="text-base font-extrabold text-slate-900">{paymentsCount}</div>
                <div className="text-[11px] text-slate-500 font-medium">Payments</div>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200/60">
                <div className="text-base font-extrabold text-slate-900">{expensesCount}</div>
                <div className="text-[11px] text-slate-500 font-medium">Expenses</div>
              </div>
            </div>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            
            {/* Download Backup */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-cyan-200 bg-white hover:bg-cyan-50/20 transition-all flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Download className="w-4 h-4 text-cyan-600" />
                  Download Backup
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Export the complete SQLite database file (.sqlite) containing all subscribers, payments, and expenses.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading || isUploading}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Download (.sqlite)</span>
                  </>
                )}
              </button>
            </div>

            {/* Upload / Restore */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-emerald-200 bg-white hover:bg-emerald-50/20 transition-all flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  Upload Database
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Restore from an existing SQLite backup file (.sqlite or .db). Replaces existing database state.
                </p>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept=".sqlite,.db,.sqlite3,application/octet-stream,application/x-sqlite3"
                onChange={handleFileChange}
                className="hidden"
                id="database-upload-input"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isDownloading || isUploading}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload & Restore</span>
                  </>
                )}
              </button>
            </div>

          </div>

          <div className="text-[11px] text-slate-400 bg-slate-50 p-3 rounded-lg border border-slate-200/60 leading-normal flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-500 shrink-0" />
            <span>
              Tip: Keep periodic offline backups before making major bulk updates or router reconfigurations.
            </span>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
