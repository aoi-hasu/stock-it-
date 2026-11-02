import React, { useState } from 'react';
import {
  X,
  Scale,
  History,
  AlertCircle,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Send,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Quotation, ObjectionCategory, QuoteObjection, QuotationItem } from '../../types/index.ts';
import { postQuoteService } from '../../services/postQuotePipeline.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface NegotiationModalProps {
  quotation: Quotation;
  onClose: () => void;
  onSuccess: () => void;
}

const OBJECTION_CATEGORIES: ObjectionCategory[] = [
  'Price',
  'Delivery Timeline',
  'Payment Terms',
  'Competitor Match',
  'Warranty / Service',
  'Technical Specifications',
  'Other',
];

export const NegotiationModal: React.FC<NegotiationModalProps> = ({
  quotation,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'objection' | 'line_items' | 'history'>('objection');

  // Objection form
  const [category, setCategory] = useState<ObjectionCategory>('Price');
  const [description, setDescription] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Line items state
  const [items, setItems] = useState<QuotationItem[]>(
    quotation.items && quotation.items.length > 0
      ? quotation.items.map(it => ({ ...it }))
      : []
  );
  const [changeSummary, setChangeSummary] = useState('');
  const [reSendToClient, setReSendToClient] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Recalculate totals in real-time
  const calculateTotals = (currentItems: QuotationItem[]) => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxableAmount = 0;
    let gstTotal = 0;

    const calculated = currentItems.map(it => {
      const lineSubtotal = it.quantity * it.unitPrice;
      const discount = Math.round((lineSubtotal * (it.discountPercentage || 0)) / 100);
      const taxable = lineSubtotal - discount;
      const gst = Math.round((taxable * (it.gstPercentage || 18)) / 100);
      const total = taxable + gst;

      subtotal += lineSubtotal;
      discountTotal += discount;
      taxableAmount += taxable;
      gstTotal += gst;

      return {
        ...it,
        taxableAmount: taxable,
        gstAmount: gst,
        totalAmount: total,
      };
    });

    const grandTotal = taxableAmount + gstTotal;
    return { calculated, subtotal, discountTotal, taxableAmount, gstTotal, grandTotal };
  };

  const handleItemChange = (
    index: number,
    field: keyof QuotationItem,
    value: any
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    const { calculated } = calculateTotals(updated);
    setItems(calculated);
  };

  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    const { calculated } = calculateTotals(updated);
    setItems(calculated);
  };

  const handleAddItem = () => {
    const newItem: QuotationItem = {
      id: `it-${Date.now()}`,
      productId: `prod-custom-${Date.now()}`,
      productName: 'Additional Machinery / Accessory Unit',
      modelNumber: 'ACC-01',
      quantity: 1,
      unitPrice: 50000,
      discountPercentage: 0,
      taxableAmount: 50000,
      gstPercentage: 18,
      gstAmount: 9000,
      totalAmount: 59000,
    };
    const { calculated } = calculateTotals([...items, newItem]);
    setItems(calculated);
  };

  const totals = calculateTotals(items);
  const currentVersion = quotation.version || 1;
  const nextVersion = currentVersion + 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const objectionPayload = description.trim()
        ? {
            category,
            description: description.trim(),
            resolutionNotes: resolutionNotes.trim() || undefined,
          }
        : undefined;

      const hasItemChanges =
        JSON.stringify(items) !== JSON.stringify(quotation.items) ||
        Boolean(changeSummary.trim());

      await postQuoteService.logNegotiationAndRevision(quotation.id, {
        objection: objectionPayload,
        revisedItems: hasItemChanges ? items : undefined,
        changeSummary: changeSummary.trim() || (objectionPayload ? `Addressed objection: ${category}` : undefined),
        actorName: currentUser?.name || quotation.salespersonName || 'Sales Representative',
        reSendToClient,
      });

      setSaveSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to log negotiation & revision', err);
      alert('Failed to save changes. Please check connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full flex flex-col max-h-[92vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-400/30 flex items-center justify-center text-purple-300">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Negotiation & Review Desk</h3>
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 font-mono text-[10px] rounded border border-purple-400/30 font-bold">
                  {quotation.quotationNumber} • v{currentVersion}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Client: {quotation.customerName} ({quotation.contactPerson})
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

        {/* Tab Navigation */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('objection')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
              activeTab === 'objection'
                ? 'bg-white shadow-xs text-purple-700'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" /> Log Client Objections ({quotation.objections?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('line_items')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
              activeTab === 'line_items'
                ? 'bg-white shadow-xs text-purple-700'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Adjust Line Items (Next: v{nextVersion})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
              activeTab === 'history'
                ? 'bg-white shadow-xs text-purple-700'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" /> Version History ({quotation.versionHistory?.length || 0})
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: OBJECTIONS */}
          {activeTab === 'objection' && (
            <div className="space-y-4">
              <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-3.5 text-xs text-purple-950">
                <p className="font-semibold flex items-center gap-1.5 text-purple-900">
                  <AlertCircle className="w-4 h-4 text-purple-600" /> Track Buyer Objections & Feedback
                </p>
                <p className="text-[11px] text-purple-800 mt-1">
                  Log commercial or technical objections raised by the client. Helps reps adjust terms, revise pricing, and feeds lost reason analytics if the deal falls through.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Objection Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as ObjectionCategory)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-purple-500"
                  >
                    {OBJECTION_CATEGORIES.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Logged By Sales Officer
                  </label>
                  <input
                    type="text"
                    disabled
                    value={currentUser?.name || quotation.salespersonName || 'Representative'}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-600 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Client Objection Details
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g., Buyer claims competitor offered 8% lower price for equivalent hydraulic press and requires 40% advance instead of 30%..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Internal Proposed Counter / Resolution (Optional)
                </label>
                <input
                  type="text"
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  placeholder="e.g., Counter-offered 5% discount on line items with complimentary tooling kit..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Previously logged objections */}
              {quotation.objections && quotation.objections.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-800 text-xs">Previously Logged Objections:</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {quotation.objections.map(obj => (
                      <div
                        key={obj.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded text-[10px]">
                            {obj.category}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {obj.date} • {obj.loggedBy}
                          </span>
                        </div>
                        <p className="text-slate-800 text-[11px]">{obj.description}</p>
                        {obj.resolutionNotes && (
                          <p className="text-emerald-700 text-[11px] font-medium pt-1 border-t border-slate-200/60 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Resolved: {obj.resolutionNotes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ADJUST LINE ITEMS */}
          {activeTab === 'line_items' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">
                    Revising Quote Line Items (v{currentVersion} ➔ v{nextVersion})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Adjust rates, discounts, or quantities. Totals recalculate with 18% GST automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Line Item
                </button>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Item Description</th>
                      <th className="p-2.5 w-16 text-center">Qty</th>
                      <th className="p-2.5 w-24 text-right">Unit Price (₹)</th>
                      <th className="p-2.5 w-16 text-center">Disc%</th>
                      <th className="p-2.5 w-24 text-right">Taxable</th>
                      <th className="p-2.5 w-24 text-right">Total (incl. GST)</th>
                      <th className="p-2.5 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <tr key={it.id || idx} className="hover:bg-slate-50/80">
                        <td className="p-2">
                          <input
                            type="text"
                            value={it.productName}
                            onChange={e => handleItemChange(idx, 'productName', e.target.value)}
                            className="w-full px-2 py-1 bg-transparent border border-slate-200 rounded text-xs font-semibold text-slate-900"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={e => handleItemChange(idx, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                            className="w-14 text-center px-1.5 py-1 bg-transparent border border-slate-200 rounded font-mono text-xs"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            min="0"
                            value={it.unitPrice}
                            onChange={e => handleItemChange(idx, 'unitPrice', Number(e.target.value) || 0)}
                            className="w-24 text-right px-1.5 py-1 bg-transparent border border-slate-200 rounded font-mono text-xs font-semibold"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={it.discountPercentage}
                            onChange={e => handleItemChange(idx, 'discountPercentage', Number(e.target.value) || 0)}
                            className="w-14 text-center px-1.5 py-1 bg-transparent border border-slate-200 rounded font-mono text-xs"
                          />
                        </td>
                        <td className="p-2 text-right font-mono text-slate-700">
                          ₹{it.taxableAmount?.toLocaleString('en-IN')}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">
                          ₹{it.totalAmount?.toLocaleString('en-IN')}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-xs text-slate-600">
                  <p>Subtotal: <span className="font-mono font-semibold">₹{totals.subtotal.toLocaleString('en-IN')}</span></p>
                  <p>Discount: <span className="font-mono text-rose-600 font-semibold">-₹{totals.discountTotal.toLocaleString('en-IN')}</span></p>
                  <p>GST (18%): <span className="font-mono font-semibold">₹{totals.gstTotal.toLocaleString('en-IN')}</span></p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block">
                    Revised Grand Total (v{nextVersion})
                  </span>
                  <span className="text-xl font-extrabold text-slate-900 font-mono text-purple-900">
                    ₹{totals.grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Change summary note */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Revision Change Summary (Saved to Version History)
                </label>
                <input
                  type="text"
                  value={changeSummary}
                  onChange={e => setChangeSummary(e.target.value)}
                  placeholder="e.g., Applied 5% additional discount; updated delivery timeline to 21 days..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="reSendCheck"
                  checked={reSendToClient}
                  onChange={e => setReSendToClient(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded border-slate-300"
                />
                <label htmlFor="reSendCheck" className="text-xs text-slate-700 font-medium">
                  Automatically mark quote as re-sent to client and update activity log
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: VERSION HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-900 text-xs">
                  Quote Version Audit Trail (Current: v{currentVersion})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Track full iteration history across negotiations and discount concessions.
                </p>
              </div>

              {(!quotation.versionHistory || quotation.versionHistory.length === 0) ? (
                <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-700">Currently on initial Version 1</p>
                  <p className="text-[11px] mt-0.5">
                    Modifying line items in the "Adjust Line Items" tab will record version snapshots here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {quotation.versionHistory.map(v => (
                    <div
                      key={v.version}
                      className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-900 text-white text-[11px] font-mono font-bold rounded">
                            Version {v.version}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            Created by {v.createdBy}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          ₹{v.grandTotal.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <p className="text-slate-700 text-[11px]">
                        <strong>Change Summary:</strong> {v.changeSummary}
                      </p>
                      {v.objectionNotes && (
                        <p className="text-purple-700 text-[11px] italic">
                          Addressed: "{v.objectionNotes}"
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 font-mono">
                        Archived on: {v.createdAt}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
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
              disabled={saving || saveSuccess}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-xs flex items-center gap-2 shadow-sm transition"
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Updated Successfully!
                </>
              ) : saving ? (
                'Saving Revision...'
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Save Revision &amp; Update Deal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
