import React from 'react';
import { AlertTriangle, Phone, MapPin, CheckCircle2, ShieldAlert, Calendar, ArrowRight } from 'lucide-react';
import { Subscriber, PaymentRecord, AuthUser } from '../types';
import { calculateSubMetrics, displayName, formatCurrency, CURRENT_MONTH, formatDueDate, getUnpaidMonths, abbrMonth } from '../utils/billingUtils';
import { canWrite } from '../utils/auth';

interface OverdueTrackerProps {
  subscribers: Subscriber[];
  payments: PaymentRecord[];
  currentUser?: AuthUser | null;
  onSelectSubscriber: (sub: Subscriber) => void;
}

export const OverdueTracker: React.FC<OverdueTrackerProps> = ({
  subscribers,
  payments,
  currentUser,
  onSelectSubscriber,
}) => {
  const isReadOnly = !canWrite(currentUser);
  
  // Find overdue subscribers: Must be active, have at least 1 unpaid due month, and be classified as overdue
  const overdueSubs = subscribers
    .map((sub) => {
      const unpaidMonths = getUnpaidMonths(sub, payments);
      const metrics = calculateSubMetrics(sub, payments, CURRENT_MONTH);
      return {
        sub,
        metrics,
        unpaidMonths,
      };
    })
    .filter(({ sub, metrics, unpaidMonths }) => {
      // Avoid subscribers who are Inactive/Exclude, or have paid for the same/current month or have 0 unpaid months
      return sub.status !== 'Inactive' && sub.status !== 'Exclude' && unpaidMonths.length > 0 && metrics.statusPill === 'overdue';
    })
    .sort((a, b) => b.unpaidMonths.length - a.unpaidMonths.length);

  const totalOverdueBalance = overdueSubs.reduce((acc, curr) => {
    return acc + (curr.unpaidMonths.length * curr.metrics.rate);
  }, 0);

  return (
    <div className="space-y-6">
      
      {/* Alert Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-500 text-white rounded-lg shrink-0 mt-0.5 sm:mt-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-amber-900">Overdue & Outstanding Balance Center</h2>
            <p className="text-xs text-amber-700 mt-0.5">
              {overdueSubs.length} subscriber{overdueSubs.length === 1 ? '' : 's'} require collection attention for unpaid billing cycles.
            </p>
          </div>
        </div>

        <div className="bg-white px-4 py-2 rounded-lg border border-amber-200 text-right self-stretch sm:self-auto">
          <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">Total Outstanding Debt</div>
          <div className="text-xl font-black font-mono text-amber-900">{formatCurrency(totalOverdueBalance)}</div>
        </div>
      </div>

      {/* List of Overdue Subscribers */}
      {overdueSubs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-xs">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">All Accounts Up to Date!</h3>
          <p className="text-xs text-slate-500 mt-1">There are currently no overdue accounts or missed payments recorded.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {overdueSubs.map(({ sub, metrics, unpaidMonths }) => {
            const nameStr = displayName(sub);
            const totalDebt = unpaidMonths.length * metrics.rate;

            return (
              <div
                key={sub.id}
                onClick={() => onSelectSubscriber(sub)}
                className="bg-white border border-slate-200 hover:border-amber-300 rounded-xl p-5 shadow-xs transition-all hover:shadow-md cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  {/* Top info */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs">
                        #{sub.id}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm group-hover:text-cyan-600 transition-colors">
                          {nameStr}
                        </h3>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Due: {formatDueDate(sub)} • Rate {formatCurrency(sub.rate)}/mo
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 font-bold text-[10px] uppercase rounded-full border border-amber-200">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      {unpaidMonths.length > 0 ? `${unpaidMonths.length} mo. late` : 'Overdue'}
                    </span>
                  </div>

                  {/* Unpaid Months Breakdown */}
                  <div className="py-2.5 border-b border-slate-100">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-rose-500" />
                      <span>Unpaid Billing Cycles ({unpaidMonths.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {unpaidMonths.map((m) => (
                        <span
                          key={m}
                          className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold"
                        >
                          {abbrMonth(m)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Contact & Address */}
                  <div className="py-2.5 space-y-1 text-xs text-slate-600">
                    {sub.phone && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{sub.phone}</span>
                      </div>
                    )}
                    {sub.address && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{sub.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Debt & Quick Settle Action */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Outstanding Debt</div>
                    <div className="text-base font-black font-mono text-rose-600">{formatCurrency(totalDebt)}</div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSubscriber(sub);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    <span>View & Settle</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
