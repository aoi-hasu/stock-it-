import React, { useState, useEffect } from 'react';
import {
  X,
  Building,
  Phone,
  Clock,
  Send,
  FileText,
  UserCheck,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  Lead,
  FollowUp,
  Communication,
  User,
  LeadStatus,
  Priority,
  FollowUpType,
  CommunicationType,
  Quotation,
} from '../types/index.ts';
import {
  History,
  AlertCircle,
  Eye,
  Mail,
  Layers,
  Trophy,
  XCircle,
  MessageSquare,
  ShoppingBag,
} from 'lucide-react';
import { GenerateSalesOrderModal } from '../components/orders/GenerateSalesOrderModal.tsx';
import { api } from '../services/api.ts';

interface LeadDetailModalProps {
  leadId: string;
  onClose: () => void;
  onUpdated: () => void;
  onOpenCreateQuotation?: (lead: Lead) => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  leadId,
  onClose,
  onUpdated,
  onOpenCreateQuotation,
}) => {
  const [lead, setLead] = useState<Lead | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [relatedQuotes, setRelatedQuotes] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'followups' | 'communications' | 'edit'>('overview');

  // New follow-up form state
  const [showAddFollowup, setShowAddFollowup] = useState(false);
  const [newFollowupDate, setNewFollowupDate] = useState('');
  const [newFollowupTime, setNewFollowupTime] = useState('11:00');
  const [newFollowupType, setNewFollowupType] = useState<FollowUpType>('Phone Call');
  const [newFollowupNotes, setNewFollowupNotes] = useState('');

  // New communication log state
  const [commType, setCommType] = useState<CommunicationType>('Phone Call');
  const [commDirection, setCommDirection] = useState<'Inbound' | 'Outbound'>('Outbound');
  const [commMessage, setCommMessage] = useState('');

  // Editable fields
  const [editCompany, setEditCompany] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editStatus, setEditStatus] = useState<LeadStatus>('New');
  const [editPriority, setEditPriority] = useState<Priority>('Medium');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editRequirement, setEditRequirement] = useState('');
  const [editProductInterested, setEditProductInterested] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Generate Sales Order Modal
  const [showGenerateOrderModal, setShowGenerateOrderModal] = useState(false);
  const [selectedQuoteForOrder, setSelectedQuoteForOrder] = useState<Quotation | null>(null);

  const loadLeadDetails = async () => {
    setLoading(true);
    try {
      const [leadDetails, usersData, quotesData] = await Promise.all([
        api.getLeadById(leadId),
        api.getUsers(),
        api.getQuotations(),
      ]);
      setLead(leadDetails.lead);
      setFollowups(leadDetails.followUps || []);
      setCommunications(leadDetails.communications || []);
      setUsers(usersData);

      // Find matching quotes for this lead
      const l = leadDetails.lead;
      const matched = (quotesData || []).filter(
        q =>
          q.leadId === leadId ||
          (q.customerName && l.companyName && q.customerName.toLowerCase() === l.companyName.toLowerCase()) ||
          (q.email && l.email && q.email.toLowerCase() === l.email.toLowerCase()) ||
          (q.mobile && l.mobile && q.mobile.replace(/[^0-9]/g, '').slice(-10) === l.mobile.replace(/[^0-9]/g, '').slice(-10))
      );
      setRelatedQuotes(matched);

      setEditCompany(l.companyName || '');
      setEditContact(l.contactPerson || '');
      setEditMobile(l.mobile || '');
      setEditWhatsapp(l.whatsapp || '');
      setEditEmail(l.email || '');
      setEditCity(l.city || '');
      setEditState(l.state || '');
      setEditStatus(l.status);
      setEditPriority(l.priority);
      setEditAssignedTo(l.assignedSalespersonId || '');
      setEditRequirement(l.requirement || '');
      setEditProductInterested(l.productInterested || '');
    } catch (err) {
      console.error('Error loading lead', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeadDetails();
  }, [leadId]);

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;
    setIsSaving(true);
    try {
      const assignedUser = users.find(u => u.id === editAssignedTo);
      await api.updateLead(lead.id, {
        companyName: editCompany,
        contactPerson: editContact,
        mobile: editMobile,
        whatsapp: editWhatsapp || editMobile,
        email: editEmail,
        city: editCity,
        state: editState,
        status: editStatus,
        priority: editPriority,
        assignedSalespersonId: editAssignedTo || undefined,
        assignedSalespersonName: assignedUser ? assignedUser.name : undefined,
        requirement: editRequirement,
        productInterested: editProductInterested,
      });
      await loadLeadDetails();
      onUpdated();
      setActiveTab('overview');
    } catch (err) {
      console.error('Update failed', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConvertToCustomer = async () => {
    if (!lead) return;
    if (!window.confirm(`Convert "${lead.companyName || lead.contactPerson}" into an official customer?`)) return;
    try {
      await api.convertLead(lead.id, {
        customerType: 'Manufacturer',
        industry: 'Manufacturing',
      });
      alert('Lead successfully converted to Customer!');
      onUpdated();
      onClose();
    } catch (err: any) {
      console.error('Conversion failed', err);
      alert(err.message || 'Conversion failed');
    }
  };

  const handleAddFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !newFollowupDate) return;
    try {
      await api.createFollowUp({
        entityType: 'lead',
        entityId: lead.id,
        entityName: lead.companyName || lead.contactPerson,
        contactPerson: lead.contactPerson,
        mobile: lead.mobile,
        followUpType: newFollowupType,
        date: newFollowupDate,
        time: newFollowupTime,
        notes: newFollowupNotes,
        status: 'Pending',
        assignedUserId: lead.assignedSalespersonId || '',
        assignedUserName: lead.assignedSalespersonName || '',
      });
      setNewFollowupNotes('');
      setShowAddFollowup(false);
      loadLeadDetails();
      onUpdated();
    } catch (err) {
      console.error('Failed to add follow-up', err);
    }
  };

  const handleAddCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !commMessage) return;
    try {
      await api.createCommunication({
        entityType: 'lead',
        entityId: lead.id,
        entityName: lead.companyName || lead.contactPerson,
        type: commType,
        direction: commDirection,
        message: commMessage,
      });
      setCommMessage('');
      loadLeadDetails();
    } catch (err) {
      console.error('Failed to log communication', err);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!lead) return;
    const phone = (lead.whatsapp || lead.mobile || '').replace(/[^0-9]/g, '');
    const cleanPhone = phone.startsWith('91') ? phone : `91${phone}`;
    const text = encodeURIComponent(
      `Hello ${lead.contactPerson || 'Sir/Madam'},\nGreetings from StockItEase! We are following up regarding your requirement for ${lead.productInterested || 'inventory items'}. Please let us know if you need technical specifications or pricing.`
    );
    const link = document.createElement('a');
    link.href = `https://wa.me/${cleanPhone}?text=${text}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  if (loading && !lead) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl shadow-xl flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-sky-600" />
          <span>Loading lead details...</span>
        </div>
      </div>
    );
  }

  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto border border-slate-200">
        {/* Top Header */}
        <div className="p-4 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-sky-600 rounded-xl">
              <Building className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold truncate">
                  {lead.companyName || lead.contactPerson}
                </h2>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                  lead.status === 'Won' ? 'bg-emerald-500 text-white' :
                  lead.status === 'Lost' ? 'bg-rose-500 text-white' :
                  lead.status === 'Negotiation' ? 'bg-purple-500 text-white' :
                  'bg-sky-500 text-white'
                }`}>
                  {lead.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 font-mono">
                ID: {lead.id} • Source: <span className="uppercase font-semibold">{lead.source}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenWhatsApp}
              title="Chat on WhatsApp"
              className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
            >
              <Send className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'overview' ? 'bg-white shadow-xs text-sky-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                activeTab === 'timeline' ? 'bg-white shadow-xs text-sky-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" /> Activity Timeline
            </button>
            <button
              onClick={() => setActiveTab('followups')}
              className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                activeTab === 'followups' ? 'bg-white shadow-xs text-sky-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Follow-ups ({followups.length})
            </button>
            <button
              onClick={() => setActiveTab('communications')}
              className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                activeTab === 'communications' ? 'bg-white shadow-xs text-sky-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Logs ({communications.length})
            </button>
            <button
              onClick={() => setActiveTab('edit')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeTab === 'edit' ? 'bg-white shadow-xs text-sky-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Edit Lead
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onOpenCreateQuotation && (
              <button
                onClick={() => {
                  onClose();
                  onOpenCreateQuotation(lead);
                }}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold flex items-center gap-1.5 transition"
              >
                <FileText className="w-3.5 h-3.5" />
                Create Quotation
              </button>
            )}
            <button
              onClick={handleConvertToCustomer}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1.5 transition"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Convert to Customer
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Information Card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Building className="w-4 h-4 text-sky-600" />
                  Buyer & Contact Details
                </h3>
                <div className="text-xs space-y-2 text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Contact Person:</span>
                    <span className="font-semibold text-slate-900">{lead.contactPerson || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Phone / Mobile:</span>
                    <a href={`tel:${lead.mobile}`} className="font-mono text-sky-600 hover:underline flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {lead.mobile}
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">WhatsApp:</span>
                    <span className="font-mono text-emerald-600 font-semibold">{lead.whatsapp || lead.mobile}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Email:</span>
                    <span className="text-slate-800">{lead.email || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Location:</span>
                    <span className="text-slate-800">
                      {[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || 'India'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Assigned Salesperson:</span>
                    <span className="font-semibold text-slate-900">{lead.assignedSalespersonName || 'Unassigned'}</span>
                  </div>
                </div>
              </div>

              {/* Requirement & Machinery Intent */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-600" />
                  Machine Requirement & Notes
                </h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-1">Interested Machines / Products:</span>
                    <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-semibold text-slate-800 text-[11px] inline-block">
                      {lead.productInterested || 'General Footwear Machinery'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-1">Requirement Notes:</span>
                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-700 min-h-[60px] whitespace-pre-wrap">
                      {lead.requirement || 'No detailed requirement specified.'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-slate-500">Estimated Budget:</span>
                    <span className="font-bold text-emerald-600 text-sm">
                      {lead.budget ? `₹${lead.budget.toLocaleString('en-IN')}` : 'To be estimated'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Follow-up Schedule widget in overview */}
              <div className="md:col-span-2 bg-sky-50/50 p-4 rounded-xl border border-sky-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-sky-600" />
                    Scheduled Next Action
                  </h4>
                  <button
                    onClick={() => {
                      setActiveTab('followups');
                      setShowAddFollowup(true);
                    }}
                    className="text-xs text-sky-600 hover:text-sky-800 font-semibold flex items-center gap-1"
                  >
                    + Schedule Follow-up
                  </button>
                </div>

                {followups.length > 0 ? (
                  <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-sky-100 text-xs">
                    <div>
                      <span className="font-bold text-slate-900 uppercase mr-2">{followups[0].followUpType}</span>
                      <span className="text-slate-600">{followups[0].notes || 'Regular follow up'}</span>
                    </div>
                    <span className="font-mono text-sky-700 font-semibold">
                      {followups[0].date} {followups[0].time}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No pending follow-ups. Click above to schedule a callback.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-5">
              {/* Associated Quotations Overview */}
              {relatedQuotes.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-sky-600" />
                      Associated Quotations ({relatedQuotes.length})
                    </span>
                    <span className="text-[11px] text-slate-500">Post-Quoting Lifecycle</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {relatedQuotes.map(q => (
                      <div
                        key={q.id}
                        className="p-3 bg-white border border-slate-200 rounded-lg space-y-1 text-xs shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sky-800 font-mono">{q.quotationNumber}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {q.status} (v{q.version || 1})
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="font-mono font-bold text-slate-900">
                            ₹{q.grandTotal?.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Date: {q.date}
                          </span>
                        </div>
                        {q.objections && q.objections.length > 0 && (
                          <p className="text-[10px] text-purple-700 font-semibold pt-1">
                            ⚠️ {q.objections.length} objection(s) logged
                          </p>
                        )}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedQuoteForOrder(q);
                              setShowGenerateOrderModal(true);
                            }}
                            className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded font-bold text-[10px] flex items-center gap-1 shadow-2xs"
                            title="Generate Confirmed Sales Order"
                          >
                            <ShoppingBag className="w-3 h-3 text-emerald-600" /> Generate Sales Order
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Centralized Timeline Feed */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <History className="w-4 h-4 text-sky-600" />
                    Centralized Lead &amp; Deal Activity Timeline
                  </h3>
                  <span className="text-[11px] text-slate-400">Chronological Audit Log</span>
                </div>

                <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {/* Collect and sort all timeline events */}
                  {(() => {
                    type TimelineItem = {
                      id: string;
                      timestamp: string;
                      type: string;
                      title: string;
                      description: string;
                      actor: string;
                      badgeColor: string;
                      icon: any;
                    };

                    const items: TimelineItem[] = [];

                    // 1. Quote activities
                    relatedQuotes.forEach(q => {
                      (q.activities || []).forEach(act => {
                        let badgeColor = 'bg-slate-100 text-slate-800 border-slate-200';
                        let icon = <Clock className="w-3.5 h-3.5 text-slate-500" />;

                        if (act.type === 'created') {
                          badgeColor = 'bg-sky-100 text-sky-800 border-sky-200';
                          icon = <FileText className="w-3.5 h-3.5 text-sky-600" />;
                        } else if (act.type === 'sent') {
                          badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
                          icon = <Mail className="w-3.5 h-3.5 text-blue-600" />;
                        } else if (act.type === 'viewed') {
                          badgeColor = 'bg-teal-100 text-teal-800 border-teal-200';
                          icon = <Eye className="w-3.5 h-3.5 text-teal-600" />;
                        } else if (act.type === 'followed_up') {
                          badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
                          icon = <MessageSquare className="w-3.5 h-3.5 text-amber-600" />;
                        } else if (act.type === 'objection_logged') {
                          badgeColor = 'bg-purple-100 text-purple-800 border-purple-200';
                          icon = <AlertCircle className="w-3.5 h-3.5 text-purple-600" />;
                        } else if (act.type === 'version_updated') {
                          badgeColor = 'bg-indigo-100 text-indigo-800 border-indigo-200';
                          icon = <Layers className="w-3.5 h-3.5 text-indigo-600" />;
                        } else if (act.type === 'closed_won') {
                          badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                          icon = <Trophy className="w-3.5 h-3.5 text-emerald-600" />;
                        } else if (act.type === 'closed_lost') {
                          badgeColor = 'bg-rose-100 text-rose-800 border-rose-200';
                          icon = <XCircle className="w-3.5 h-3.5 text-rose-600" />;
                        }

                        items.push({
                          id: act.id,
                          timestamp: act.timestamp,
                          type: act.type,
                          title: `[Quote ${q.quotationNumber}] ${act.title}`,
                          description: act.description || '',
                          actor: act.actorName,
                          badgeColor,
                          icon,
                        });
                      });
                    });

                    // 2. Communications
                    communications.forEach(c => {
                      items.push({
                        id: c.id,
                        timestamp: c.createdAt || c.timestamp,
                        type: 'comm',
                        title: `${c.direction} ${c.type}`,
                        description: c.message,
                        actor: c.userName || 'Representative',
                        badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
                        icon: <Phone className="w-3.5 h-3.5 text-slate-600" />,
                      });
                    });

                    // 3. Follow-ups
                    followups.forEach(f => {
                      items.push({
                        id: f.id,
                        timestamp: f.createdAt,
                        type: 'followup',
                        title: `Follow-up (${f.followUpType}): ${f.status}`,
                        description: `${f.notes} • Scheduled for ${f.date} ${f.time || ''}`,
                        actor: f.assignedUserName || 'Representative',
                        badgeColor: f.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                        icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
                      });
                    });

                    // Sort descending
                    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                    if (items.length === 0) {
                      return (
                        <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                          <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                          <p className="font-bold text-slate-700">No activity recorded yet</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Quotation dispatch, client views, follow-ups, and negotiation updates will show here.
                          </p>
                        </div>
                      );
                    }

                    return items.map(it => (
                      <div key={it.id} className="relative group">
                        <div className="absolute -left-6 top-0 w-5 h-5 rounded-full bg-white border-2 border-slate-300 group-hover:border-sky-500 flex items-center justify-center transition shadow-2xs">
                          <div className="scale-75">{it.icon}</div>
                        </div>

                        <div className="bg-slate-50/80 hover:bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5 transition shadow-2xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${it.badgeColor}`}>
                              {it.title}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(it.timestamp).toLocaleString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 leading-relaxed font-medium">
                            {it.description}
                          </p>

                          <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                            Logged by: <strong className="text-slate-600">{it.actor}</strong>
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'followups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Follow-up History & Schedules</h3>
                <button
                  onClick={() => setShowAddFollowup(prev => !prev)}
                  className="px-3 py-1.5 bg-sky-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showAddFollowup ? 'Cancel' : 'New Follow-up'}
                </button>
              </div>

              {showAddFollowup && (
                <form onSubmit={handleAddFollowup} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-600 mb-1">Date</label>
                      <input
                        type="date"
                        required
                        value={newFollowupDate}
                        onChange={e => setNewFollowupDate(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">Time</label>
                      <input
                        type="time"
                        value={newFollowupTime}
                        onChange={e => setNewFollowupTime(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">Type</label>
                      <select
                        value={newFollowupType}
                        onChange={e => setNewFollowupType(e.target.value as any)}
                        className="w-full px-3 py-2 border rounded-lg bg-white"
                      >
                        <option value="Phone Call">Phone Call</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Meeting">Physical Meeting / Demo</option>
                        <option value="Email">Email</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1">Follow-up Notes / Agenda</label>
                    <textarea
                      rows={2}
                      value={newFollowupNotes}
                      onChange={e => setNewFollowupNotes(e.target.value)}
                      placeholder="e.g. Call regarding sole stitching machine price negotiation..."
                      className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddFollowup(false)}
                      className="px-3 py-1.5 text-xs text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-sky-600 text-white text-xs font-semibold rounded-lg"
                    >
                      Save Follow-up
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {followups.map(f => (
                  <div key={f.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold uppercase text-slate-900">{f.followUpType}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          f.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {f.status}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1">{f.notes || 'No notes'}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-slate-700 font-semibold">{f.date}</span>
                      <p className="text-[11px] text-slate-400">{f.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'communications' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Communication History</h3>
              <form onSubmit={handleAddCommunication} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">Medium</label>
                    <select
                      value={commType}
                      onChange={e => setCommType(e.target.value as any)}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="Phone Call">Phone Call</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Email">Email</option>
                      <option value="Meeting">In-Person Meeting</option>
                      <option value="Notes">Internal Note</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Direction</label>
                    <select
                      value={commDirection}
                      onChange={e => setCommDirection(e.target.value as any)}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="Outbound">Outbound (We reached out)</option>
                      <option value="Inbound">Inbound (Buyer called/messaged)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1">Summary / Log Message</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Key discussion points, customer feedback, machine requirements discussed..."
                    value={commMessage}
                    onChange={e => setCommMessage(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded-lg"
                  >
                    Log Activity
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                {communications.map(c => (
                  <div key={c.id} className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 uppercase">{c.type}</span>
                        <span className="text-[11px] text-slate-500">({c.direction})</span>
                      </div>
                      <span className="text-slate-400 font-mono text-[11px]">{new Date(c.createdAt || c.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-600 whitespace-pre-wrap">{c.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'edit' && (
            <form onSubmit={handleUpdateLead} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Company / Firm Name</label>
                  <input
                    type="text"
                    required
                    value={editCompany}
                    onChange={e => setEditCompany(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Contact Person</label>
                  <input
                    type="text"
                    required
                    value={editContact}
                    onChange={e => setEditContact(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    value={editMobile}
                    onChange={e => setEditMobile(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={editWhatsapp}
                    onChange={e => setEditWhatsapp(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">City</label>
                  <input
                    type="text"
                    value={editCity}
                    onChange={e => setEditCity(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Lead Status</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Requirement Confirmed">Requirement Confirmed</option>
                    <option value="Quotation Sent">Quotation Sent</option>
                    <option value="Negotiation">Negotiation</option>
                    <option value="Won">Won (Converted)</option>
                    <option value="Lost">Lost</option>
                    <option value="On Hold">On Hold</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={e => setEditPriority(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Product Interested</label>
                  <input
                    type="text"
                    value={editProductInterested}
                    onChange={e => setEditProductInterested(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Assign Salesperson</label>
                  <select
                    value={editAssignedTo}
                    onChange={e => setEditAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="">Unassigned</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Detailed Requirement / Machine Needs</label>
                <textarea
                  rows={3}
                  value={editRequirement}
                  onChange={e => setEditRequirement(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="px-4 py-2 border rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Generate Sales Order Modal */}
      {showGenerateOrderModal && (
        <GenerateSalesOrderModal
          preselectedQuotation={selectedQuoteForOrder}
          onClose={() => {
            setShowGenerateOrderModal(false);
            setSelectedQuoteForOrder(null);
          }}
          onSuccess={() => {
            setShowGenerateOrderModal(false);
            setSelectedQuoteForOrder(null);
            loadLeadDetails();
            onUpdated();
          }}
        />
      )}
    </div>
  );
};
