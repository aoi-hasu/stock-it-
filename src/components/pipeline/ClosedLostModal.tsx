import React, { useState } from 'react';
import { X, XCircle, AlertTriangle, CheckCircle2, TrendingDown, Building2 } from 'lucide-react';
import { Quotation, LossReason } from '../../types/index.ts';
import { postQuoteService } from '../../services/postQuotePipeline.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface ClosedLostModalProps {
  quotation: Quotation;
  onClose: () => void;
  onSuccess: () => void;
}

const LOSS_REASONS: { id: LossReason; label: string; desc: string }[] = [
  { id: 'Price', label: 'Price / Budget Limitation', desc: 'Competitor price lower, discount insufficient, or buyer budget reduced.' },
  { id: 'Competitor', label: 'Lost to Competitor', desc: 'Buyer selected another brand or existing distributor relationship.' },
  { id: 'Timeline', label: 'Delivery Timeline', desc: 'Lead needed machinery immediately; our lead time was too long.' },
  { id: 'Ghosted', label: 'Ghosted / No Response', desc: 'Lead ceased communication across multiple follow-ups.' },
  { id: 'Budget Cancelled', label: 'Project / Expansion Cancelled', desc: 'Client deferred or cancelled their manufacturing line expansion.' },
  { id: 'Technical Specifications', label: 'Technical Non-Compliance', desc: 'Capacity, footprint, power, or automation specs did not align.' },
  { id: 'Other', label: 'Other Commercial Reason', desc: 'Any other commercial or internal reason.' },
];

export const ClosedLostModal: React.FC<ClosedLostModalProps> = ({
  quotation,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  const [lossReason, setLossReason] = useState<LossReason>('Price');
  const [competitorName, setCompetitorName] = useState('');
  const [lossNotes, setLossNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!lossReason) {
      setError('Please select a mandatory loss reason.');
      return;
    }

    if (!lossNotes.trim()) {
      setError('Please provide feedback notes explaining why this deal was lost for analytics.');
      return;
    }

    setProcessing(true);
    try {
      await postQuoteService.closeQuoteLost(quotation.id, {
        lossReason,
        competitorName: competitorName.trim() || undefined,
        lossNotes: lossNotes.trim(),
        actorName: currentUser?.name || quotation.salespersonName || 'Sales Representative',
      });

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1100);
    } catch (err) {
      console.error('Failed to log closed-lost deal', err);
      setError('Could not update deal. Please check network connection.');
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full flex flex-col max-h-[90vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-900 to-slate-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-300">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Deal Closure: Closed-Lost</h3>
                <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 font-mono text-[10px] rounded border border-rose-400/30 font-bold">
                  {quotation.quotationNumber}
                </span>
              </div>
              <p className="text-[11px] text-rose-200/80 mt-0.5">
                {quotation.customerName} • Quote Total: ₹{quotation.grandTotal?.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-900 text-xs">
            <p className="font-semibold flex items-center gap-1.5 text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              Mandatory Deal Loss Recording
            </p>
            <p className="text-[11px] text-rose-700 mt-1">
              Selecting a loss reason is required. This feeds directly into our Lost Reasons Breakdown analytics and Quote Win Rate calculations.
            </p>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Select Primary Loss Reason <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={lossReason}
              onChange={e => setLossReason(e.target.value as LossReason)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-rose-500"
            >
              {LOSS_REASONS.map(r => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">
              {LOSS_REASONS.find(r => r.id === lossReason)?.desc}
            </p>
          </div>

          {lossReason === 'Competitor' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Competitor Name / Brand (Optional)
              </label>
              <div className="relative">
                <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={competitorName}
                  onChange={e => setCompetitorName(e.target.value)}
                  placeholder="e.g., King Steel / Chen Hsong / Local Manufacturer"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Loss Analysis &amp; Rep Notes <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={lossNotes}
              onChange={e => setLossNotes(e.target.value)}
              placeholder="e.g., Buyer opted for Taiwanese competitor offering 8% lower price and 60-day credit. Requested we follow up in Q3 for expansion plant..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Footer Action */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold text-xs"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={processing || success}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs flex items-center gap-2 shadow-sm transition"
            >
              {success ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Loss Recorded Successfully
                </>
              ) : processing ? (
                'Recording Loss...'
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" /> Mark Deal Closed-Lost
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
