import React from 'react';
import {
  X,
  History,
  FileText,
  Mail,
  Eye,
  AlertCircle,
  Layers,
  Trophy,
  XCircle,
  MessageSquare,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Quotation, QuotationActivityLog } from '../../types/index.ts';

interface QuoteActivityTimelineModalProps {
  quotation: Quotation;
  onClose: () => void;
}

export const QuoteActivityTimelineModal: React.FC<QuoteActivityTimelineModalProps> = ({
  quotation,
  onClose,
}) => {
  const activities: QuotationActivityLog[] = quotation.activities && quotation.activities.length > 0
    ? [...quotation.activities].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    : [
        {
          id: 'def-1',
          timestamp: quotation.createdAt,
          type: 'created',
          title: 'Quotation Generated',
          description: `Quote #${quotation.quotationNumber} initialized for ₹${quotation.grandTotal?.toLocaleString('en-IN')}`,
          actorName: quotation.salespersonName || 'Representative',
        },
      ];

  const getEventIcon = (type: QuotationActivityLog['type']) => {
    switch (type) {
      case 'created':
        return <FileText className="w-4 h-4 text-sky-600" />;
      case 'sent':
        return <Mail className="w-4 h-4 text-blue-600" />;
      case 'viewed':
        return <Eye className="w-4 h-4 text-teal-600" />;
      case 'followed_up':
        return <MessageSquare className="w-4 h-4 text-amber-600" />;
      case 'objection_logged':
        return <AlertCircle className="w-4 h-4 text-purple-600" />;
      case 'version_updated':
        return <Layers className="w-4 h-4 text-indigo-600" />;
      case 'closed_won':
        return <Trophy className="w-4 h-4 text-emerald-600" />;
      case 'closed_lost':
        return <XCircle className="w-4 h-4 text-rose-600" />;
      default:
        return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const getEventBadge = (type: QuotationActivityLog['type']) => {
    switch (type) {
      case 'created':
        return 'bg-sky-100 text-sky-800 border-sky-200';
      case 'sent':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'viewed':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'followed_up':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'objection_logged':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'version_updated':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'closed_won':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200 font-bold';
      case 'closed_lost':
        return 'bg-rose-100 text-rose-800 border-rose-200 font-bold';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full flex flex-col max-h-[90vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-sky-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600/30 border border-sky-400/30 flex items-center justify-center text-sky-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Deal Activity &amp; Quote Timeline</h3>
                <span className="px-2 py-0.5 bg-sky-500/20 text-sky-300 font-mono text-[10px] rounded border border-sky-400/30 font-bold">
                  {quotation.quotationNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {quotation.customerName} ({quotation.contactPerson})
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

        {/* Quick Summary Pill */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Current Status:</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-extrabold text-slate-900">{quotation.status}</span>
              <span className="text-slate-400">•</span>
              <span className="font-mono text-emerald-600 font-bold">₹{quotation.grandTotal?.toLocaleString('en-IN')}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600">v{quotation.version || 1}</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400">Sales Officer:</span>
            <p className="font-semibold text-slate-800">{quotation.salespersonName || 'Direct'}</p>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {activities.map(act => (
              <div key={act.id} className="relative group">
                {/* Dot / Icon */}
                <div className="absolute -left-6 top-0 w-5 h-5 rounded-full bg-white border-2 border-slate-300 group-hover:border-sky-500 flex items-center justify-center transition shadow-2xs">
                  <div className="scale-75">{getEventIcon(act.type)}</div>
                </div>

                <div className="bg-slate-50/80 hover:bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5 transition shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] border ${getEventBadge(act.type)}`}>
                      {act.title}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(act.timestamp).toLocaleString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {act.description && (
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {act.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                    <span>Logged by: <strong className="text-slate-600">{act.actorName}</strong></span>
                    {act.metadata?.channel && (
                      <span className="font-mono uppercase bg-slate-200/80 px-1.5 py-0.5 rounded text-slate-700">
                        Channel: {act.metadata.channel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
          >
            Close Timeline
          </button>
        </div>
      </div>
    </div>
  );
};
