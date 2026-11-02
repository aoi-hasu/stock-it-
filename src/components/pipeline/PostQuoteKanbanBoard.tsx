import React, { useState } from 'react';
import {
  FileText,
  Clock,
  AlertTriangle,
  Mail,
  Scale,
  Trophy,
  XCircle,
  Eye,
  History,
  Phone,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Search,
  Filter,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  Receipt,
  ShoppingBag,
} from 'lucide-react';
import { Quotation, PostQuoteStage, Order, TaxInvoice } from '../../types/index.ts';
import {
  normalizeQuoteStage,
  isQuoteStalled,
  getDaysSinceQuoteSent,
} from '../../services/postQuotePipeline.ts';
import { FollowUpSequenceModal } from './FollowUpSequenceModal.tsx';
import { NegotiationModal } from './NegotiationModal.tsx';
import { ClosedWonModal } from './ClosedWonModal.tsx';
import { ClosedLostModal } from './ClosedLostModal.tsx';
import { QuoteActivityTimelineModal } from './QuoteActivityTimelineModal.tsx';
import { QuotationPDFModal } from '../../views/QuotationPDFModal.tsx';
import { GenerateSalesOrderModal } from '../orders/GenerateSalesOrderModal.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';

interface PostQuoteKanbanBoardProps {
  quotations: Quotation[];
  onRefresh: () => void;
  onOpenCreateQuotation?: () => void;
}

interface ColumnDef {
  id: PostQuoteStage;
  title: string;
  subtitle: string;
  headerColor: string;
  borderColor: string;
  badgeBg: string;
}

const KANBAN_COLUMNS: ColumnDef[] = [
  {
    id: 'quote_sent',
    title: 'Quote Sent',
    subtitle: 'Trigger State · Freshly dispatched',
    headerColor: 'bg-sky-50 text-sky-950',
    borderColor: 'border-sky-400',
    badgeBg: 'bg-sky-100 text-sky-800',
  },
  {
    id: 'follow_up',
    title: 'Follow-Up Sequence',
    subtitle: 'Flagged if inactive >3 days',
    headerColor: 'bg-amber-50 text-amber-950',
    borderColor: 'border-amber-400',
    badgeBg: 'bg-amber-100 text-amber-900',
  },
  {
    id: 'negotiation',
    title: 'Negotiation / Review',
    subtitle: 'Client objections & versioning',
    headerColor: 'bg-purple-50 text-purple-950',
    borderColor: 'border-purple-400',
    badgeBg: 'bg-purple-100 text-purple-900',
  },
  {
    id: 'closed_won',
    title: 'Closed-Won',
    subtitle: 'Auto Order + Tax Invoice',
    headerColor: 'bg-emerald-50 text-emerald-950',
    borderColor: 'border-emerald-500',
    badgeBg: 'bg-emerald-100 text-emerald-900',
  },
  {
    id: 'closed_lost',
    title: 'Closed-Lost',
    subtitle: 'Mandatory loss reason',
    headerColor: 'bg-rose-50 text-rose-950',
    borderColor: 'border-rose-400',
    badgeBg: 'bg-rose-100 text-rose-900',
  },
];

export const PostQuoteKanbanBoard: React.FC<PostQuoteKanbanBoardProps> = ({
  quotations,
  onRefresh,
  onOpenCreateQuotation,
}) => {
  const { currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [filterStalledOnly, setFilterStalledOnly] = useState(false);

  // Active modals
  const [activeFollowUpQuote, setActiveFollowUpQuote] = useState<Quotation | null>(null);
  const [activeNegotiationQuote, setActiveNegotiationQuote] = useState<Quotation | null>(null);
  const [activeWonQuote, setActiveWonQuote] = useState<Quotation | null>(null);
  const [activeLostQuote, setActiveLostQuote] = useState<Quotation | null>(null);
  const [activeTimelineQuote, setActiveTimelineQuote] = useState<Quotation | null>(null);
  const [activePDFQuote, setActivePDFQuote] = useState<Quotation | null>(null);

  // Generate Sales Order Modal
  const [orderQuote, setOrderQuote] = useState<Quotation | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);

  // Drag and drop state
  const [draggedQuoteId, setDraggedQuoteId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<PostQuoteStage | null>(null);

  // Filter quotes
  const filteredQuotes = quotations.filter(q => {
    if (filterStalledOnly && !isQuoteStalled(q)) return false;
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      q.quotationNumber?.toLowerCase().includes(query) ||
      q.customerName?.toLowerCase().includes(query) ||
      q.contactPerson?.toLowerCase().includes(query) ||
      q.mobile?.includes(query) ||
      q.items?.some(it => it.productName?.toLowerCase().includes(query))
    );
  });

  const formatCurrency = (amt: number = 0) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amt);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Accepted':
      case 'Converted':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Sent':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Viewed':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'Negotiation':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Rejected':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'Expired':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Draft':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, quoteId: string) => {
    setDraggedQuoteId(quoteId);
    e.dataTransfer.setData('text/plain', quoteId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: PostQuoteStage) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: PostQuoteStage) => {
    e.preventDefault();
    setDragOverColumn(null);
    const quoteId = e.dataTransfer.getData('text/plain') || draggedQuoteId;
    if (!quoteId) return;

    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) return;

    const currentStage = normalizeQuoteStage(quote);
    if (currentStage === targetStage) return;

    // Trigger specific interactive modals for target stages
    if (targetStage === 'closed_won') {
      setActiveWonQuote(quote);
      return;
    }
    if (targetStage === 'closed_lost') {
      setActiveLostQuote(quote);
      return;
    }
    if (targetStage === 'negotiation') {
      setActiveNegotiationQuote(quote);
      return;
    }
    if (targetStage === 'follow_up') {
      setActiveFollowUpQuote(quote);
      return;
    }

    // Direct movement to quote_sent
    try {
      await api.updateQuotation(quoteId, {
        pipelineStage: targetStage,
        status: targetStage === 'quote_sent' ? 'Sent' : quote.status,
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to update stage', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Quick Filters Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search quotation #, customer, machinery item..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterStalledOnly(!filterStalledOnly)}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
              filterStalledOnly
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {filterStalledOnly ? 'Showing Stalled (>3d) Only' : 'Filter Stalled (>3d)'}
          </button>

          <button
            onClick={() => {
              setOrderQuote(null);
              setShowOrderModal(true);
            }}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs transition flex items-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Generate Sales Order
          </button>

          {onOpenCreateQuotation && (
            <button
              onClick={onOpenCreateQuotation}
              className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-xs shadow-xs transition"
            >
              + Create New Quote
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Drag-and-Drop Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-6 pt-1 items-start min-h-[640px]">
        {KANBAN_COLUMNS.map((col, colIdx) => {
          const colQuotes = filteredQuotes.filter(q => normalizeQuoteStage(q) === col.id);
          const colTotalValue = colQuotes.reduce((sum, q) => sum + (q.grandTotal || 0), 0);
          const isOver = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={e => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.id)}
              className={`w-76 shrink-0 bg-slate-100/80 rounded-2xl p-3 border-t-4 ${
                col.borderColor
              } border border-slate-200/90 flex flex-col max-h-[780px] shadow-2xs transition-all ${
                isOver ? 'ring-2 ring-sky-500 bg-sky-50/50 scale-[1.01]' : ''
              }`}
            >
              {/* Column Header */}
              <div className="pb-3 border-b border-slate-200/80 mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                    {col.title}
                  </h3>
                  <p className="text-[10px] text-slate-500">{col.subtitle}</p>
                  <span className="text-[11px] text-slate-700 font-bold font-mono mt-0.5 block">
                    {formatCurrency(colTotalValue)}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badgeBg}`}>
                  {colQuotes.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                {colQuotes.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-300 rounded-xl bg-white/40">
                    <p className="font-semibold">No deals in this stage</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Drag quotes here to advance</p>
                  </div>
                ) : (
                  colQuotes.map(quote => {
                    const daysSinceSent = getDaysSinceQuoteSent(quote);
                    const isStalled = isQuoteStalled(quote);
                    const version = quote.version || 1;
                    const itemsSummary = quote.items && quote.items.length
                      ? quote.items.map(it => it.productName).join(', ')
                      : 'Machinery unit';

                    return (
                      <div
                        key={quote.id}
                        draggable
                        onDragStart={e => handleDragStart(e, quote.id)}
                        className={`p-3.5 bg-white rounded-xl border transition-all space-y-2.5 text-xs shadow-2xs hover:shadow-md cursor-grab active:cursor-grabbing group relative ${
                          isStalled
                            ? 'border-amber-300 ring-1 ring-amber-300/80 bg-amber-50/20'
                            : 'border-slate-200/90'
                        }`}
                      >
                        {/* Top Quote Ref & Version */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold font-mono text-sky-800 text-xs">
                              {quote.quotationNumber}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-mono text-[10px] font-bold">
                              v{version}
                            </span>
                          </div>

                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(quote.status)}`}>
                            {quote.status}
                          </span>
                        </div>

                        {/* Customer & Machinery */}
                        <div>
                          <h4 className="font-bold text-slate-900 line-clamp-1 text-[13px]">
                            {quote.customerName}
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {quote.contactPerson} • {quote.mobile}
                          </p>
                          <p className="text-[11px] text-slate-700 mt-1 line-clamp-2 bg-slate-50 p-1.5 rounded border border-slate-100">
                            ⚙️ {itemsSummary}
                          </p>
                        </div>

                        {/* Stalled Alert Badge */}
                        {isStalled && (
                          <div className="p-1.5 rounded-lg bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-bold flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              Stalled: {daysSinceSent}d without response
                            </span>
                            <button
                              onClick={() => setActiveFollowUpQuote(quote)}
                              className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[9px] font-bold"
                            >
                              Follow-Up
                            </button>
                          </div>
                        )}

                        {/* Objections Tag */}
                        {quote.objections && quote.objections.length > 0 && (
                          <div className="text-[10px] text-purple-700 font-semibold bg-purple-50 p-1 rounded border border-purple-100 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-purple-600" />
                            {quote.objections.length} Client Objection(s) logged
                          </div>
                        )}

                        {/* Loss Reason Tag */}
                        {quote.lossReason && (
                          <div className="text-[10px] text-rose-700 font-bold bg-rose-50 p-1 rounded border border-rose-200">
                            Lost Reason: {quote.lossReason}
                          </div>
                        )}

                        {/* Converted Order / Invoice Badge */}
                        {quote.convertedOrderId && (
                          <div className="text-[10px] text-emerald-800 font-bold bg-emerald-50 p-1 rounded border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Order #{quote.convertedOrderId} • Inv #{quote.convertedInvoiceNumber || 'INV'}
                          </div>
                        )}

                        {/* Deal Value & Velocity Counter */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-extrabold text-slate-900 font-mono">
                            ₹{quote.grandTotal?.toLocaleString('en-IN')}
                          </span>

                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {daysSinceSent}d in cycle
                          </span>
                        </div>

                        {/* Action Toolbar */}
                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            {/* 1-Click Follow Up */}
                            <button
                              type="button"
                              onClick={() => setActiveFollowUpQuote(quote)}
                              className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"
                              title="1-Click Follow-Up Sequence"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>

                            {/* Negotiation & Review */}
                            <button
                              type="button"
                              onClick={() => setActiveNegotiationQuote(quote)}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded"
                              title="Negotiate & Adjust Line Items"
                            >
                              <Scale className="w-3.5 h-3.5" />
                            </button>

                            {/* Activity Timeline */}
                            <button
                              type="button"
                              onClick={() => setActiveTimelineQuote(quote)}
                              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                              title="View Activity Timeline"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>

                            {/* PDF Preview */}
                            <button
                              type="button"
                              onClick={() => setActivePDFQuote(quote)}
                              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                              title="View Quotation PDF"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Fast Closure Buttons */}
                          {col.id !== 'closed_won' && col.id !== 'closed_lost' && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setOrderQuote(quote);
                                  setShowOrderModal(true);
                                }}
                                className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-bold text-[10px] flex items-center gap-1"
                                title="Generate Confirmed Sales Order"
                              >
                                <ShoppingBag className="w-3 h-3 text-emerald-600" /> Order
                              </button>

                              <button
                                type="button"
                                onClick={() => setActiveWonQuote(quote)}
                                className="px-1.5 py-0.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded font-bold text-[10px] flex items-center gap-1"
                                title="Close Won (Auto-Order + Invoice)"
                              >
                                <Trophy className="w-3 h-3 text-sky-600" /> Won
                              </button>

                              <button
                                type="button"
                                onClick={() => setActiveLostQuote(quote)}
                                className="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-bold text-[10px]"
                                title="Close Lost (Mandatory Reason)"
                              >
                                Lost
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODALS */}
      {activeFollowUpQuote && (
        <FollowUpSequenceModal
          quotation={activeFollowUpQuote}
          onClose={() => setActiveFollowUpQuote(null)}
          onSuccess={() => {
            setActiveFollowUpQuote(null);
            onRefresh();
          }}
        />
      )}

      {activeNegotiationQuote && (
        <NegotiationModal
          quotation={activeNegotiationQuote}
          onClose={() => setActiveNegotiationQuote(null)}
          onSuccess={() => {
            setActiveNegotiationQuote(null);
            onRefresh();
          }}
        />
      )}

      {activeWonQuote && (
        <ClosedWonModal
          quotation={activeWonQuote}
          onClose={() => setActiveWonQuote(null)}
          onSuccess={() => {
            setActiveWonQuote(null);
            onRefresh();
          }}
        />
      )}

      {activeLostQuote && (
        <ClosedLostModal
          quotation={activeLostQuote}
          onClose={() => setActiveLostQuote(null)}
          onSuccess={() => {
            setActiveLostQuote(null);
            onRefresh();
          }}
        />
      )}

      {activeTimelineQuote && (
        <QuoteActivityTimelineModal
          quotation={activeTimelineQuote}
          onClose={() => setActiveTimelineQuote(null)}
        />
      )}

      {activePDFQuote && (
        <QuotationPDFModal
          quotation={activePDFQuote}
          companySettings={{
            companyName: 'StockItEase Partner Technologies',
            brandTitle: 'StockItEase',
            tagline: 'Precision Footwear & Industrial Machinery Solutions',
            address: 'Industrial Development Estate, Sector 18',
            city: 'Gurugram',
            state: 'Haryana',
            country: 'India',
            pincode: '122001',
            phone: '+91 98112 34567',
            mobile: '+91 98112 34567',
            email: 'sales@stockitease.com',
            website: 'www.stockitease.com',
            gstin: '07AAACS1234F1Z8',
            pan: 'AAACS1234F',
            bankName: 'HDFC Bank Ltd',
            bankBranch: 'Industrial Area Branch',
            accountNumber: '50200012345678',
            ifscCode: 'HDFC0001234',
            defaultPaymentTerms: activePDFQuote.paymentTerms,
            defaultDeliveryTerms: activePDFQuote.deliveryTerms,
            defaultWarrantyTerms: activePDFQuote.warrantyTerms,
            defaultTermsAndConditions: activePDFQuote.termsAndConditions,
            defaultQuotationValidityDays: 30,
            quotationPrefix: 'QTN-',
            orderPrefix: 'SO-',
          }}
          onClose={() => setActivePDFQuote(null)}
        />
      )}

      {/* Generate Sales Order Modal */}
      {showOrderModal && (
        <GenerateSalesOrderModal
          preselectedQuotation={orderQuote}
          onClose={() => {
            setShowOrderModal(false);
            setOrderQuote(null);
          }}
          onSuccess={() => {
            setShowOrderModal(false);
            setOrderQuote(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
