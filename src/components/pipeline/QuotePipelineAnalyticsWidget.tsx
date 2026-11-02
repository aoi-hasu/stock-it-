import React from 'react';
import {
  TrendingUp,
  Clock,
  PieChart,
  AlertTriangle,
  Trophy,
  XCircle,
  IndianRupee,
  ChevronRight,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import { Quotation, PostQuoteStage, LossReason } from '../../types/index.ts';
import { calculatePipelineAnalytics, isQuoteStalled } from '../../services/postQuotePipeline.ts';

interface QuotePipelineAnalyticsWidgetProps {
  quotations: Quotation[];
  onOpenStalledQuotes?: () => void;
  onOpenFollowUpModal?: (quote: Quotation) => void;
  compact?: boolean;
}

export const QuotePipelineAnalyticsWidget: React.FC<QuotePipelineAnalyticsWidgetProps> = ({
  quotations,
  onOpenStalledQuotes,
  onOpenFollowUpModal,
  compact = false,
}) => {
  const analytics = calculatePipelineAnalytics(quotations);
  const stalledQuotes = quotations.filter(q => isQuoteStalled(q));

  const formatCurrency = (amt: number = 0) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amt);
  };

  const getReasonColor = (index: number) => {
    const colors = [
      'bg-rose-500 text-rose-500',
      'bg-amber-500 text-amber-500',
      'bg-purple-500 text-purple-500',
      'bg-sky-500 text-sky-500',
      'bg-indigo-500 text-indigo-500',
      'bg-slate-500 text-slate-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-4">
      {/* 4 Core Velocity & Win Rate Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Quote Win Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Quote Win Rate
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {analytics.winRate}%
            </span>
            <span className="text-[11px] text-slate-400 font-semibold">
              ({analytics.wonCount} won / {analytics.wonCount + analytics.lostCount} decided)
            </span>
          </div>

          {/* Mini progress bar */}
          <div className="mt-2.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${analytics.winRate}%` }}
            />
            <div
              className="bg-rose-400 h-full transition-all duration-500"
              style={{ width: `${100 - analytics.winRate}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-2 flex items-center justify-between">
            <span>Decided Deals: {analytics.wonCount + analytics.lostCount}</span>
            <span className="text-emerald-700 font-bold">{analytics.wonCount} Closed-Won</span>
          </p>
        </div>

        {/* Metric 2: Quote-to-Close Velocity */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Quote-to-Close Velocity
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-mono">
              {analytics.avgVelocityDays}
            </span>
            <span className="text-sm font-bold text-slate-600">Days Avg</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>
              Won Deals:{' '}
              <strong className="text-emerald-600 font-mono">
                {analytics.wonVelocityDays}d
              </strong>
            </span>
            <span>
              Lost Deals:{' '}
              <strong className="text-rose-600 font-mono">
                {analytics.lostVelocityDays}d
              </strong>
            </span>
          </div>
        </div>

        {/* Metric 3: Stalled Quotes Alert (>3 days inactive) */}
        <div
          className={`p-4 rounded-2xl border transition relative overflow-hidden group ${
            analytics.stalledCount > 0
              ? 'bg-amber-50/70 border-amber-300 shadow-2xs hover:shadow-xs'
              : 'bg-white border-slate-200/90 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
              Stalled Deals (&gt;3 Days)
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                analytics.stalledCount > 0
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-950 tracking-tight font-mono">
              {analytics.stalledCount}
            </span>
            <span className="text-[11px] text-amber-800 font-semibold">
              quotes need sequence follow-up
            </span>
          </div>
          <p className="text-[10px] text-amber-800 mt-2">
            Quotes sent with no client response in 3+ business days.
          </p>
        </div>

        {/* Metric 4: Open Pipeline Value */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Active Quoted Pipeline
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-mono text-purple-900 block truncate">
              {formatCurrency(analytics.totalPipelineValue - analytics.wonPipelineValue - analytics.lostPipelineValue)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>
              Won Value: <strong className="text-emerald-700 font-mono font-bold">{formatCurrency(analytics.wonPipelineValue)}</strong>
            </span>
            <span>{analytics.openQuotesCount} active deals</span>
          </div>
        </div>
      </div>

      {/* Breakdown of Lost Reasons & Stalled Quotes Action Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lost Reasons Breakdown Widget (2 cols) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-rose-500" />
                Lost Reasons Breakdown &amp; Analysis
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Aggregated from mandatory Closed-Lost exit surveys across {analytics.lostCount} lost deals.
              </p>
            </div>
            <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg">
              {analytics.lostCount} Lost Deals
            </span>
          </div>

          {analytics.lostCount === 0 ? (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl text-xs">
              <Trophy className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              <p className="font-bold text-slate-700">No deals closed-lost yet!</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                When deals are marked Closed-Lost, the mandatory reason breakdown will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {analytics.lostReasonsBreakdown.map((item, idx) => {
                const color = getReasonColor(idx);
                const bgBar = color.split(' ')[0];

                return (
                  <div key={item.reason} className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${bgBar}`} />
                        {item.reason}
                      </span>
                      <span className="font-mono text-slate-600 font-semibold">
                        {item.count} deals • <strong className="text-slate-900">{item.percentage}%</strong>
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bgBar} transition-all duration-500`}
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Strategic Insight Pill */}
          {analytics.lostCount > 0 && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <span>
                <strong>Win/Loss Insight:</strong> Top loss driver is{' '}
                <strong className="text-slate-900">
                  {analytics.lostReasonsBreakdown[0]?.reason} ({analytics.lostReasonsBreakdown[0]?.percentage}%)
                </strong>
                . Reps should address this during the initial quotation presentation or proactively counter-offer in the Negotiation stage.
              </span>
            </div>
          )}
        </div>

        {/* Stalled Quotes Action Panel (1 col) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Overdue Follow-Up Radar
              </h3>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                &gt;3 Days
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 mb-3">
              Quotes awaiting customer feedback. Prompt action increases win rate by 42%.
            </p>

            {stalledQuotes.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                <Clock className="w-6 h-6 mx-auto text-emerald-500 mb-1" />
                <p className="font-bold text-slate-700">All quotes followed up on time!</p>
                <p className="text-[10px] text-slate-400">Zero quotes idling over 3 business days.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {stalledQuotes.slice(0, 4).map(sq => (
                  <div
                    key={sq.id}
                    className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1 text-xs hover:bg-amber-50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 font-mono text-sky-800">
                        {sq.quotationNumber}
                      </span>
                      <span className="font-mono text-amber-900 font-bold text-[11px]">
                        ₹{((sq.grandTotal || 0) / 1000).toFixed(0)}k
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 truncate font-medium">{sq.customerName}</p>
                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                      <span>Contact: {sq.contactPerson}</span>
                      {onOpenFollowUpModal && (
                        <button
                          type="button"
                          onClick={() => onOpenFollowUpModal(sq)}
                          className="px-2 py-0.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded text-[10px] transition"
                        >
                          1-Click Follow-Up
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {onOpenStalledQuotes && stalledQuotes.length > 0 && (
            <button
              onClick={onOpenStalledQuotes}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition shadow-xs"
            >
              View All In Kanban <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
