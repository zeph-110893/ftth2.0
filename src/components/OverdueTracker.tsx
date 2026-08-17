import React from 'react';
import { AlertTriangle, Phone, MapPin, Receipt, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Subscriber, PaymentRecord } from '../types';
import { calculateSubMetrics, displayName, formatCurrency, CURRENT_MONTH, formatDueDate } from '../utils/billingUtils';

interface OverdueTrackerProps {
  subscribers: Subscriber[];
  payments: PaymentRecord[];
  onRecordPaymentForSub: (sub: Subscriber) => void;
  onSelectSubscriber: (sub: Subscriber) => void;
}

export const OverdueTracker: React.FC<OverdueTrackerProps> = ({
  subscribers,
  payments,
  onRecordPaymentForSub,
  onSelectSubscriber,
}) => {
  // Find overdue or missed payment subscribers
  const overdueSubs = subscribers
    .map((sub) => ({
      sub,
      metrics: calculateSubMetrics(sub, payments, CURRENT_MONTH),
    }))
    .filter(({ metrics }) => metrics.statusPill === 'overdue')
    .sort((a, b) => b.metrics.missed - a.metrics.missed);

  const totalOverdueBalance = overdueSubs.reduce((acc, curr) => {
    return acc + (curr.metrics.missed * curr.metrics.rate || curr.metrics.rate);
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
              {overdueSubs.length} subscribers require collection attention for unpaid billing cycles.
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
          {overdueSubs.map(({ sub, metrics }) => {
            const nameStr = displayName(sub);
            const totalDebt = (metrics.missed > 0 ? metrics.missed : 1) * metrics.rate;

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
                      {metrics.missed > 0 ? `${metrics.missed} mo. late` : 'Overdue'}
                    </span>
                  </div>

                  {/* Contact & Address */}
                  <div className="py-3 space-y-1 text-xs text-slate-600">
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

                {/* Bottom Debt & Quick Collect */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Estimated Debt</div>
                    <div className="text-base font-black font-mono text-rose-600">{formatCurrency(totalDebt)}</div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRecordPaymentForSub(sub);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Collect Payment</span>
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
