import React, { useState, useEffect } from 'react';
import {
  Users2,
  Plus,
  Upload,
  Download,
  Search,
  Phone,
  MessageCircle,
  CheckSquare,
  Square,
  AlertTriangle,
  X,
  FileText,
  Trash2,
} from 'lucide-react';
import { Lead, Product, User, LeadStatus, Priority, LeadSource } from '../types/index.ts';
import { api } from '../services/api.ts';
import { LeadDetailModal } from './LeadDetailModal.tsx';
import { ExcelImportModal } from './ExcelImportModal.tsx';
import { AdminAuthModal } from '../components/common/AdminAuthModal.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { exportToExcel } from '../utils/excel.ts';

interface LeadsViewProps {
  initialLeadId?: string;
  onOpenCreateQuotation?: (lead: Lead) => void;
}

export const LeadsView: React.FC<LeadsViewProps> = ({ initialLeadId, onOpenCreateQuotation }) => {
  const { activeCompanyId, isSuperAdmin, isAllTenantsView, currentUser, currentTenant } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');

  // Modals & Details
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeadId || null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignUserId, setBulkAssignUserId] = useState('');

  // New Lead Form
  const [newCompany, setNewCompany] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newSource, setNewSource] = useState<LeadSource>('IndiaMART');
  const [newPriority, setNewPriority] = useState<Priority>('Medium');
  const [newStatus, setNewStatus] = useState<LeadStatus>('New');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newRequirement, setNewRequirement] = useState('');
  const [newProductInterested, setNewProductInterested] = useState('');
  const [newBudget, setNewBudget] = useState<number>(0);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);

  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const comp = isSuperAdmin ? (isAllTenantsView ? 'all' : activeCompanyId) : (currentUser?.companyId || 'org-1');
      const [leadsData, usersData, productsData] = await Promise.all([
        api.getLeads({ companyId: comp }),
        api.getUsers({ companyId: comp, excludeSuperAdmin: !isSuperAdmin }),
        api.getProducts({ companyId: comp }),
      ]);
      setLeads(leadsData);
      setUsers(usersData);
      setProducts(productsData);
    } catch (err: any) {
      console.error('Error loading leads', err);
      setError(err?.message || 'Failed to load leads from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeCompanyId, isAllTenantsView]);

  useEffect(() => {
    if (initialLeadId) {
      setSelectedLeadId(initialLeadId);
    }
  }, [initialLeadId]);

  const handleConfirmDeleteLead = async () => {
    if (!leadToDelete) return;
    try {
      await api.deleteLead(leadToDelete.id);
      if (selectedLeadId === leadToDelete.id) {
        setSelectedLeadId(null);
      }
      setLeadToDelete(null);
      loadData();
    } catch (err: any) {
      alert(`Error deleting lead: ${err.message}`);
    }
  };

  // Real-time duplicate phone checking on new lead creation
  useEffect(() => {
    if (!newMobile || newMobile.trim().length < 6) {
      setDuplicateWarning(null);
      return;
    }
    const cleanMobile = newMobile.replace(/[^0-9]/g, '');
    const found = leads.find(l => (l.mobile || '').replace(/[^0-9]/g, '').includes(cleanMobile));
    if (found) {
      setDuplicateWarning(`Potential duplicate! Existing lead: "${found.companyName || found.contactPerson}" has mobile ${found.mobile}.`);
    } else {
      setDuplicateWarning(null);
    }
  }, [newMobile, leads]);

  // Filtering
  const filteredLeads = leads.filter(lead => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        lead.companyName?.toLowerCase().includes(q) ||
        lead.contactPerson?.toLowerCase().includes(q) ||
        lead.mobile?.includes(q) ||
        lead.email?.toLowerCase().includes(q) ||
        lead.city?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
    if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false;
    if (priorityFilter !== 'all' && lead.priority !== priorityFilter) return false;
    if (assignedFilter !== 'all' && lead.assignedSalespersonId !== assignedFilter) return false;
    return true;
  });

  const handleSelectAll = () => {
    if (selectedIds.length === filteredLeads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLeads.map(l => l.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignUserId || selectedIds.length === 0) return;
    try {
      const targetUser = users.find(u => u.id === bulkAssignUserId);
      await api.bulkAssignLeads(selectedIds, bulkAssignUserId, targetUser?.name || '');
      alert(`Assigned ${selectedIds.length} leads to ${targetUser?.name}`);
      setSelectedIds([]);
      setShowBulkAssign(false);
      loadData();
    } catch (err) {
      console.error('Bulk assign error', err);
    }
  };

  const handleExportCSV = async () => {
    const listToExport = selectedIds.length > 0
      ? leads.filter(l => selectedIds.includes(l.id))
      : filteredLeads;

    const companyName = currentTenant?.name || 'StockItEase';
    const cleanPrefix = companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const headers = [
      'Lead ID',
      'Lead Date',
      'Company Name',
      'Contact Person',
      'Mobile',
      'WhatsApp',
      'Email',
      'City',
      'State',
      'Source',
      'Status',
      'Priority',
      'Assigned To',
      'Interested Machines',
      'Estimated Budget (INR)',
      'Requirements',
    ];
    const data = listToExport.map(l => [
      l.id,
      l.leadDate,
      l.companyName,
      l.contactPerson,
      l.mobile,
      l.whatsapp,
      l.email,
      l.city,
      l.state,
      l.source,
      l.status,
      l.priority,
      l.assignedSalespersonName || 'Unassigned',
      l.productInterested || '',
      l.budget || 0,
      l.requirement || '',
    ]);

    await exportToExcel(`${cleanPrefix}_Leads_${new Date().toISOString().split('T')[0]}.xlsx`, 'Leads', headers, data);
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const assignedUser = users.find(u => u.id === newAssignedTo);

      await api.createLead({
        companyName: newCompany,
        contactPerson: newContact,
        mobile: newMobile,
        whatsapp: newWhatsapp || newMobile,
        email: newEmail,
        city: newCity,
        state: newState,
        country: 'India',
        source: newSource,
        status: newStatus,
        priority: newPriority,
        assignedSalespersonId: newAssignedTo || undefined,
        assignedSalespersonName: assignedUser?.name,
        requirement: newRequirement,
        productInterested: newProductInterested,
        budget: Number(newBudget) || undefined,
        companyId: activeCompanyId || currentUser?.companyId || 'org-1',
      });

      // Reset
      setNewCompany('');
      setNewContact('');
      setNewMobile('');
      setNewWhatsapp('');
      setNewEmail('');
      setNewCity('');
      setNewState('');
      setNewRequirement('');
      setNewProductInterested('');
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      alert('Error saving lead: ' + (err.message || 'Server error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Users2 className="w-6 h-6 text-sky-600" />
            Leads & Buyer Enquiries
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Total {leads.length} enquiries recorded • Showing {filteredLeads.length} filtered
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition"
          >
            <Upload className="w-4 h-4 text-emerald-600" />
            Import Excel / CSV
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition"
          >
            <Download className="w-4 h-4 text-sky-600" />
            Export ({selectedIds.length > 0 ? selectedIds.length : 'All'})
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            + Add New Lead
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by company, buyer, phone, city..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white transition"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700"
            >
              <option value="all">All Statuses</option>
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

          {/* Source Filter */}
          <div>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700"
            >
              <option value="all">All Sources</option>
              <option value="IndiaMART">IndiaMART</option>
              <option value="Website">Website</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Phone">Phone</option>
              <option value="Exhibition">Exhibition</option>
              <option value="Referral">Referral</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Assigned Filter */}
          <div>
            <select
              value={assignedFilter}
              onChange={e => setAssignedFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700"
            >
              <option value="all">All Salespeople</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 bg-sky-50/50 p-2.5 rounded-lg text-xs">
            <span className="font-semibold text-sky-900">
              {selectedIds.length} lead{selectedIds.length > 1 ? 's' : ''} selected
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBulkAssign(prev => !prev)}
                className="px-3 py-1 bg-white border border-sky-300 text-sky-700 rounded font-semibold hover:bg-sky-50"
              >
                Assign to Salesperson...
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="px-3 py-1 text-slate-500 hover:text-slate-800"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {showBulkAssign && (
          <div className="p-3 bg-white border border-sky-200 rounded-lg flex items-center gap-3 text-xs">
            <span className="font-semibold text-slate-700">Assign selected to:</span>
            <select
              value={bulkAssignUserId}
              onChange={e => setBulkAssignUserId(e.target.value)}
              className="px-3 py-1.5 border rounded-lg bg-slate-50"
            >
              <option value="">Select Salesperson</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkAssignUserId}
              className="px-3 py-1.5 bg-sky-600 text-white font-bold rounded-lg disabled:opacity-50"
            >
              Confirm Assignment
            </button>
          </div>
        )}
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-600">
                    {selectedIds.length === filteredLeads.length && filteredLeads.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-sky-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-3">Company & Contact</th>
                <th className="py-3 px-3">Phone / WhatsApp</th>
                <th className="py-3 px-3">Interested Machinery</th>
                <th className="py-3 px-3">Source</th>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Assigned</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
                      <p className="text-xs font-medium">Loading leads from database...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-rose-600 bg-rose-50/50">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
                    <p className="font-semibold">{error}</p>
                    <button
                      onClick={loadData}
                      className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 cursor-pointer"
                    >
                      Retry Loading Leads
                    </button>
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Users2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No matching leads found</p>
                    <p className="text-xs text-slate-400">Try changing your search terms or filters</p>
                  </td>
                </tr>
              ) : (
                filteredLeads.map(lead => {
                  const isSelected = selectedIds.includes(lead.id);
                  const cleanPhone = (lead.whatsapp || lead.mobile || '').replace(/[^0-9]/g, '');

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-sky-50/30' : ''}`}
                    >
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleToggleSelect(lead.id)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-sky-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-3">
                        <div
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="font-bold text-slate-900 hover:text-sky-600 cursor-pointer"
                        >
                          {lead.companyName || lead.contactPerson}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <span>{lead.contactPerson}</span>
                          {lead.city && <span>• {lead.city}</span>}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 font-mono text-slate-800">
                          <a
                            href={`tel:${lead.mobile}`}
                            className="hover:text-sky-600 flex items-center gap-1"
                            title="Call phone"
                          >
                            <Phone className="w-3 h-3 text-slate-400" />
                            {lead.mobile}
                          </a>
                        </div>
                        {lead.whatsapp && (
                          <div className="text-[11px] text-emerald-600 flex items-center gap-1 mt-0.5 font-mono">
                            <MessageCircle className="w-3 h-3" />
                            {lead.whatsapp}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 max-w-xs">
                        <span className="font-semibold text-slate-800 text-[11px] line-clamp-1">
                          {lead.productInterested || lead.requirement || 'Footwear Machinery'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          lead.source === 'IndiaMART' ? 'bg-orange-100 text-orange-800' :
                          lead.source === 'WhatsApp' ? 'bg-emerald-100 text-emerald-800' :
                          lead.source === 'Website' ? 'bg-blue-100 text-blue-800' :
                          lead.source === 'Exhibition' ? 'bg-purple-100 text-purple-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {lead.source}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          lead.priority === 'Urgent' ? 'bg-red-100 text-red-800' :
                          lead.priority === 'High' ? 'bg-amber-100 text-amber-800' :
                          lead.priority === 'Medium' ? 'bg-blue-100 text-blue-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {lead.priority}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          lead.status === 'Won' ? 'bg-emerald-100 text-emerald-800' :
                          lead.status === 'Lost' ? 'bg-rose-100 text-rose-800' :
                          lead.status === 'Negotiation' ? 'bg-purple-100 text-purple-800' :
                          lead.status === 'Quotation Sent' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {lead.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-slate-600">
                        {lead.assignedSalespersonName || <span className="text-slate-400 italic">Unassigned</span>}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* WhatsApp Button */}
                          <a
                            href={`https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}?text=${encodeURIComponent(`Hello ${lead.contactPerson || ''}, greetings from StockItEase!`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Chat on WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>

                          {/* Quick Quote */}
                          {onOpenCreateQuotation && (
                            <button
                              onClick={() => onOpenCreateQuotation(lead)}
                              className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"
                              title="Create Quotation"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}

                          {/* View details */}
                          <button
                            onClick={() => setSelectedLeadId(lead.id)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-[11px]"
                          >
                            Details
                          </button>

                          {/* Delete Lead with Admin Permission Protection */}
                          <button
                            onClick={() => setLeadToDelete(lead)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete Lead (Requires Admin Permission)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 my-auto">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Plus className="w-5 h-5 text-sky-400" />
                <h2 className="font-bold text-base sm:text-lg">Add New Machine Enquiry / Lead</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="p-6 space-y-4 text-xs">
              {duplicateWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2.5 text-amber-900 font-medium">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>{duplicateWarning}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Company / Footwear Unit Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Footwear Ltd"
                    value={newCompany}
                    onChange={e => setNewCompany(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Contact Person Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Kumar"
                    value={newContact}
                    onChange={e => setNewContact(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    value={newMobile}
                    onChange={e => setNewMobile(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    placeholder="Same as mobile if blank"
                    value={newWhatsapp}
                    onChange={e => setNewWhatsapp(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="buyer@company.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">City / Hub</label>
                  <input
                    type="text"
                    placeholder="Agra, Kanpur, Delhi, Ambur..."
                    value={newCity}
                    onChange={e => setNewCity(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Enquiry Source</label>
                  <select
                    value={newSource}
                    onChange={e => setNewSource(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="IndiaMART">IndiaMART</option>
                    <option value="Website">Website Form</option>
                    <option value="WhatsApp">WhatsApp Direct</option>
                    <option value="Phone">Direct Phone Call</option>
                    <option value="Exhibition">Exhibition / Expo</option>
                    <option value="Referral">Referral</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Initial Priority</label>
                  <select
                    value={newPriority}
                    onChange={e => setNewPriority(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Assign Salesperson</label>
                  <select
                    value={newAssignedTo}
                    onChange={e => setNewAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="">Unassigned</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Estimated Budget (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 350000"
                    value={newBudget || ''}
                    onChange={e => setNewBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Product Interested</label>
                <input
                  type="text"
                  placeholder="e.g. Hydraulic Sole Attaching Machine, Automatic Toe Lasting Machine"
                  value={newProductInterested}
                  onChange={e => setNewProductInterested(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Requirement Details & Notes</label>
                <textarea
                  rows={2}
                  placeholder="Customer requirements, plant capacity, special attachments..."
                  value={newRequirement}
                  onChange={e => setNewRequirement(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
                >
                  {isSubmitting ? 'Saving...' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel / CSV Import Modal */}
      {showImportModal && (
        <ExcelImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false);
            loadData();
          }}
        />
      )}

      {/* Lead Detail View / Timeline Modal */}
      {selectedLeadId && (
        <LeadDetailModal
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onUpdated={loadData}
          onOpenCreateQuotation={onOpenCreateQuotation}
        />
      )}

      {/* Admin Authorization Deletion Modal */}
      <AdminAuthModal
        isOpen={Boolean(leadToDelete)}
        onClose={() => setLeadToDelete(null)}
        onConfirm={handleConfirmDeleteLead}
        title="Delete Enquiry / Lead"
        itemType="Lead"
        itemName={leadToDelete ? `${leadToDelete.companyName} (${leadToDelete.contactPerson})` : ''}
        warningMessage="Deleting an enquiry permanently removes its conversation logs, timeline events, and notes."
      />
    </div>
  );
};
