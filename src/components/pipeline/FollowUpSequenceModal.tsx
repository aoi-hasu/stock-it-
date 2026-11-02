import React, { useState } from 'react';
import { X, Mail, MessageSquare, Send, Clock, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { Quotation } from '../../types/index.ts';
import { generateFollowUpEmailTemplate, postQuoteService, getDaysSinceQuoteSent } from '../../services/postQuotePipeline.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface FollowUpSequenceModalProps {
  quotation: Quotation;
  onClose: () => void;
  onSuccess: () => void;
}

export const FollowUpSequenceModal: React.FC<FollowUpSequenceModalProps> = ({
  quotation,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  const daysSinceSent = getDaysSinceQuoteSent(quotation);
  const isStalled = daysSinceSent >= 3;

  const defaultSalesName = currentUser?.name || quotation.salespersonName || 'Sales Representative';
  const initialTemplate = generateFollowUpEmailTemplate(quotation, defaultSalesName);

  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const [subject, setSubject] = useState(initialTemplate.subject);
  const [message, setMessage] = useState(initialTemplate.body);
  const [recipient, setRecipient] = useState(quotation.email || '');
  const [recipientPhone, setRecipientPhone] = useState(quotation.mobile || '');
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await postQuoteService.sendFollowUp(quotation.id, {
        subject,
        message,
        channel,
        actorName: defaultSalesName,
      });

      // If WhatsApp selected, also trigger WhatsApp web link for convenience
      if (channel === 'whatsapp' && recipientPhone) {
        const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
        const waPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
        const waText = encodeURIComponent(`*${subject}*\n\n${message}`);
        window.open(`https://wa.me/${waPhone}?text=${waText}`, '_blank');
      }

      setSentSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to dispatch follow-up', err);
      alert('Could not dispatch follow-up. Please check connection.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full flex flex-col max-h-[90vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-sky-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600/30 border border-sky-400/30 flex items-center justify-center text-sky-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">1-Click Follow-Up Sequence</h3>
                <span className="px-2 py-0.5 bg-sky-500/20 text-sky-300 font-mono text-[10px] rounded border border-sky-400/30 font-bold">
                  {quotation.quotationNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {quotation.customerName} • Contact: {quotation.contactPerson}
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

        {/* Inactivity Flag Banner */}
        {isStalled && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 text-amber-900 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Follow-Up Alert:</strong> No client response recorded in{' '}
                <strong className="underline decoration-amber-400">{daysSinceSent} business days</strong> (Threshold: 3 days).
              </span>
            </div>
            <span className="px-2 py-0.5 bg-amber-200/80 text-amber-950 text-[10px] font-bold rounded">
              High Priority
            </span>
          </div>
        )}

        {/* Content Body */}
        <form onSubmit={handleSend} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Channel selector */}
          <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-700">Dispatch Channel:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setChannel('email')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
                  channel === 'email'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Mail className="w-3.5 h-3.5" /> Email
              </button>
              <button
                type="button"
                onClick={() => setChannel('whatsapp')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
                  channel === 'whatsapp'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
              </button>
            </div>
          </div>

          {channel === 'email' ? (
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                required
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="client@company.com"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-sky-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Recipient Mobile / WhatsApp
              </label>
              <input
                type="text"
                required
                value={recipientPhone}
                onChange={e => setRecipientPhone(e.target.value)}
                placeholder="9812345678"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-700">
                Email Subject Line
              </label>
              <span className="text-[10px] text-slate-400">Pre-formatted sequence</span>
            </div>
            <input
              type="text"
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-700">
                Pre-formatted Template Body
              </label>
              <button
                type="button"
                onClick={() => {
                  const t = generateFollowUpEmailTemplate(quotation, defaultSalesName);
                  setSubject(t.subject);
                  setMessage(t.body);
                }}
                className="text-[10px] text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> Reset Template
              </button>
            </div>
            <textarea
              rows={9}
              required
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 leading-relaxed font-sans focus:bg-white focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Sequence info pill */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>
                Follow-ups logged so far:{' '}
                <strong className="text-slate-900">{quotation.followUpCount || 0}</strong>
              </span>
            </div>
            <span className="text-slate-400 font-mono text-[10px]">
              Quote Date: {quotation.date}
            </span>
          </div>

          {/* Footer Action */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold text-xs"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={sending || sentSuccess}
              className={`px-5 py-2 rounded-lg font-bold text-xs text-white flex items-center gap-2 shadow-sm transition ${
                sentSuccess
                  ? 'bg-emerald-600'
                  : channel === 'whatsapp'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-sky-600 hover:bg-sky-700'
              }`}
            >
              {sentSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Dispatched Successfully!
                </>
              ) : sending ? (
                'Dispatching...'
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Dispatch Follow-Up Sequence
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
