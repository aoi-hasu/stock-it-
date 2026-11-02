import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  RefreshCw,
  Phone,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  FileText,
  Clock,
  Trophy,
  Filter,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Lead, LeadStatus, Quotation } from '../types/index.ts';
import { api } from '../services/api.ts';
import { PostQuoteKanbanBoard } from '../components/pipeline/PostQuoteKanbanBoard.tsx';
import { QuotePipelineAnalyticsWidget } from '../components/pipeline/QuotePipelineAnalyticsWidget.tsx';

interface PipelineViewProps {
  onOpenCreateQuotation?: (lead?: Lead) => void;
  onOpenLeadModal?: (id: string) => void;
}

const LEAD_PIPELINE_COLUMNS: { id: LeadStatus; label: string; color: string; badge: string }[] = [
  { id: 'New', label: 'New Lead', color: 'border-blue-400', badge: 'bg-blue-100 text-blue-800' },
  { id: 'Contacted', label: 'Contacted', color: 'border-sky-400', badge: 'bg-sky-100 text-sky-800' },
  { id: 'Qualified', label: 'Qualified', color: 'border-teal-400', badge: 'bg-teal-100 text-teal-800' },
  { id: 'Requirement Confirmed', label: 'Req Confirmed', color: 'border-indigo-400', badge: 'bg-indigo-100 text-indigo-800' },
  { id: 'Quotation Sent', label: 'Quotation Sent', color: 'border-amber-400', badge: 'bg-amber-100 text-amber-800' },
  { id: 'Negotiation', label: 'Negotiation', color: 'border-purple-400', badge: 'bg-purple-100 text-purple-800' },
  { id: 'Won', label: 'Closed Won', color: 'border-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
  { id: 'Lost', label: 'Closed Lost', color: 'border-rose-400', badge: 'bg-rose-100 text-rose-800' },
];

export const PipelineView: React.FC<PipelineViewProps> = ({
  onOpenCreateQuotation,
  onOpenLeadModal,
}) => {
  const [pipelineMode, setPipelineMode] = useState<'post_quote' | 'lead_funnel'>('post_quote');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [leadsData, quotesData] = await Promise.all([
        api.getLeads(),
        api.getQuotations(),
      ]);
      setLeads(leadsData || []);
      setQuotations(quotesData || []);
    } catch (err) {
      console.error('Error fetching pipeline data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleMoveLeadStage = async (leadId: string, currentStatus: LeadStatus, direction: 'next' | 'prev') => {
    const currentIndex = LEAD_PIPELINE_COLUMNS.findIndex(c => c.id === currentStatus);
    if (currentIndex === -1) return;

    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0 || newIndex >= LEAD_PIPELINE_COLUMNS.length) return;

    const newStatus = LEAD_PIPELINE_COLUMNS[newIndex].id;

    // Optimistic UI update
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status: newStatus } : l)));

    try {
      await api.updateLead(leadId, { status: newStatus });
    } catch (err) {
      console.error('Failed to move stage', err);
      loadData();
    }
  };

  const formatCurrency = (amt: number = 0) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amt);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Pipeline Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-bold uppercase rounded-md tracking-wider">
              Sales Pipeline &amp; Deal Velocity
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-sky-600" />
            Post-Quoting Sales Pipeline (Kanban)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Automate and track a lead's journey immediately after a quote is dispatched, through follow-ups, negotiations, and closing.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Mode Switcher Tabs */}
          <div className="bg-slate-200/80 p-1 rounded-xl flex items-center gap-1 text-xs font-bold">
            <button
              onClick={() => setPipelineMode('post_quote')}
              className={`px-3 py-1.5 rounded-lg transition ${
                pipelineMode === 'post_quote'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Post-Quoting Kanban ({quotations.length})
            </button>
            <button
              onClick={() => setPipelineMode('lead_funnel')}
              className={`px-3 py-1.5 rounded-lg transition ${
                pipelineMode === 'lead_funnel'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pre-Quote Leads ({leads.length})
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition"
            title="Refresh Pipeline Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Analytics Widget: Velocity, Win-Rate, Stalled Alert & Lost Reasons Breakdown */}
      <QuotePipelineAnalyticsWidget
        quotations={quotations}
        onOpenStalledQuotes={() => setPipelineMode('post_quote')}
      />

      {/* MAIN VIEW: Post-Quoting Kanban Board */}
      {pipelineMode === 'post_quote' && (
        <div className="space-y-4">
          <PostQuoteKanbanBoard
            quotations={quotations}
            onRefresh={loadData}
            onOpenCreateQuotation={() => onOpenCreateQuotation && onOpenCreateQuotation()}
          />
        </div>
      )}

      {/* SECONDARY VIEW: Pre-Quoting Lead Funnel */}
      {pipelineMode === 'lead_funnel' && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 flex items-center justify-between">
            <span>
              Showing early lead intake stages. Once an inquiry is confirmed, generate a quotation to enter the <strong>Post-Quoting Sequence</strong>.
            </span>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-6 pt-1 items-start min-h-[600px]">
            {LEAD_PIPELINE_COLUMNS.map((col, colIndex) => {
              const colLeads = leads.filter(l => l.status === col.id);
              const colTotalValue = colLeads.reduce((sum, l) => sum + (l.budget || 0), 0);

              return (
                <div
                  key={col.id}
                  className={`w-72 shrink-0 bg-slate-100/80 rounded-2xl p-3 border-t-4 ${col.color} border border-slate-200/80 flex flex-col max-h-[750px] shadow-2xs`}
                >
                  <div className="pb-3 border-b border-slate-200/80 mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-xs sm:text-sm">{col.label}</h3>
                      <span className="text-[11px] text-slate-500 font-semibold">
                        {colLeads.length} leads • {formatCurrency(colTotalValue)}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badge}`}>
                      {colLeads.length}
                    </span>
                  </div>

                  <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                    {colLeads.length === 0 ? (
                      <div className="py-10 text-center text-slate-400 text-xs border border-dashed border-slate-300 rounded-xl">
                        No leads in this stage
                      </div>
                    ) : (
                      colLeads.map(lead => {
                        const cleanPhone = (lead.whatsapp || lead.mobile || '').replace(/[^0-9]/g, '');

                        return (
                          <div
                            key={lead.id}
                            className="p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-md transition space-y-2.5 text-xs group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <h4
                                onClick={() => onOpenLeadModal && onOpenLeadModal(lead.id)}
                                className="font-bold text-slate-900 group-hover:text-sky-600 cursor-pointer line-clamp-1 text-[13px]"
                              >
                                {lead.companyName || lead.contactPerson}
                              </h4>
                              <span className="font-bold text-emerald-600 font-mono text-[11px] shrink-0">
                                {lead.budget ? `₹${(lead.budget / 1000).toFixed(0)}k` : '—'}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-500 space-y-0.5">
                              <p className="truncate">{lead.contactPerson} • {lead.city || 'India'}</p>
                              {lead.productInterested && (
                                <p className="font-medium text-slate-700 truncate text-[11px]">
                                  🏷️ {lead.productInterested}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  title="Chat on WhatsApp"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                                <a
                                  href={`tel:${lead.mobile}`}
                                  className="p-1 text-slate-500 hover:text-slate-800 rounded"
                                  title="Call"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                                {onOpenCreateQuotation && (
                                  <button
                                    onClick={() => onOpenCreateQuotation(lead)}
                                    className="p-1 text-sky-600 hover:bg-sky-50 rounded"
                                    title="Create Quotation"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                {colIndex > 0 && (
                                  <button
                                    onClick={() => handleMoveLeadStage(lead.id, lead.status, 'prev')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                                    title="Move back"
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {colIndex < LEAD_PIPELINE_COLUMNS.length - 1 && (
                                  <button
                                    onClick={() => handleMoveLeadStage(lead.id, lead.status, 'next')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                                    title="Advance stage"
                                  >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
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
        </div>
      )}
    </div>
  );
};
