import React, { useState } from 'react';
import {
  X,
  Trophy,
  ShoppingBag,
  Receipt,
  Mail,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  FileCheck,
} from 'lucide-react';
import { Quotation, Order, TaxInvoice } from '../../types/index.ts';
import { postQuoteService } from '../../services/postQuotePipeline.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface ClosedWonModalProps {
  quotation: Quotation;
  onClose: () => void;
  onSuccess: (result: { order: Order; invoice: TaxInvoice }) => void;
}

export const ClosedWonModal: React.FC<ClosedWonModalProps> = ({
  quotation,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  const defaultAdvance = Math.round((quotation.grandTotal || 0) * 0.3);

  const [advancePayment, setAdvancePayment] = useState<number>(defaultAdvance);
  const [paymentMethod, setPaymentMethod] = useState<string>('Bank Transfer');
  const [referenceNumber, setReferenceNumber] = useState<string>(
    `ADV-${Date.now().toString().slice(-6)}`
  );
  const [agreementNotes, setAgreementNotes] = useState<string>(
    `Standard commercial machinery supply & commissioning agreement for ${quotation.customerName}. 12-month manufacturer warranty.`
  );
  const [processing, setProcessing] = useState(false);
  const [completedResult, setCompletedResult] = useState<{
    order: Order;
    invoice: TaxInvoice;
  } | null>(null);

  const handleExecuteWon = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const res = await postQuoteService.closeQuoteWon(quotation.id, {
        advancePayment: Number(advancePayment) || 0,
        paymentMethod,
        referenceNumber,
        customAgreementTerms: agreementNotes,
        actorName: currentUser?.name || quotation.salespersonName || 'Sales Representative',
      });

      setCompletedResult({
        order: res.order,
        invoice: res.invoice,
      });

      setTimeout(() => {
        onSuccess({ order: res.order, invoice: res.invoice });
      }, 1500);
    } catch (err) {
      console.error('Failed to close quote won', err);
      alert('Failed to execute Closed-Won actions. Please try again.');
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-900 to-teal-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <ShoppingBag className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Generate Confirmed Sales Order (Close Won)</h3>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono text-[10px] rounded border border-emerald-400/30 font-bold">
                  {quotation.quotationNumber}
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/80 mt-0.5">
                {quotation.customerName} • Deal Value: ₹{quotation.grandTotal?.toLocaleString('en-IN')}
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

        {/* Dual Action Automation Explanation Banner */}
        <div className="bg-emerald-50 border-b border-emerald-200/80 p-4 text-emerald-950 space-y-2">
          <p className="font-bold flex items-center gap-1.5 text-emerald-900 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Automated Dual Action Pipeline Trigger
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-start gap-2 bg-white/80 p-2.5 rounded-lg border border-emerald-200">
              <ShoppingBag className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-emerald-950">Action 1: Sales Order</strong>
                <span className="text-emerald-800 text-[10px]">Converts quote into confirmed sales agreement with stock allocation.</span>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-white/80 p-2.5 rounded-lg border border-emerald-200">
              <Receipt className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-emerald-950">Action 2: Tax Invoice & Email</strong>
                <span className="text-emerald-800 text-[10px]">Generates GST invoice and triggers client onboarding email.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Success Feedback Screen */}
        {completedResult ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">Congratulations! Deal Closed-Won</h4>
              <p className="text-xs text-slate-500 mt-1">Both automated fulfillment actions executed successfully:</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2 font-mono text-xs max-w-sm mx-auto">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-sans">Sales Order Ref:</span>
                <span className="font-bold text-slate-900">{completedResult.order.orderNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-sans">Initial Tax Invoice:</span>
                <span className="font-bold text-slate-900">{completedResult.invoice.invoiceNumber}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-700 font-sans text-[11px] pt-1 border-t border-slate-200">
                <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Onboarding Email:</span>
                <span className="font-bold">Dispatched</span>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleExecuteWon} className="p-5 overflow-y-auto space-y-4 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Agreed Advance Payment (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  max={quotation.grandTotal}
                  value={advancePayment}
                  onChange={e => setAdvancePayment(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Balance Payable: ₹{((quotation.grandTotal || 0) - advancePayment).toLocaleString('en-IN')}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Payment Mode
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="UPI">UPI / Digital Gateway</option>
                  <option value="Cheque">Commercial Cheque / DD</option>
                  <option value="Cash">Cash Receipt</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Advance Payment Reference / UTR Number
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                placeholder="e.g., UTR-98234789123 or Cheque #492810"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Service Agreement & Delivery Terms
              </label>
              <textarea
                rows={2}
                value={agreementNotes}
                onChange={e => setAgreementNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Client summary pill */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-[11px]">
              <div>
                <span className="font-semibold text-slate-700">Client Onboarding Trigger:</span>
                <p className="text-slate-500">{quotation.email || quotation.contactPerson}</p>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                Ready to Deploy
              </span>
            </div>

            {/* Footer */}
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
                disabled={processing}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-2 shadow-sm transition"
              >
                {processing ? (
                  'Executing Automated Actions...'
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" /> Generate Confirmed Sales Order &amp; Invoice
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
