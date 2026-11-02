import React, { useState, useEffect } from 'react';
import {
  Contact as ContactIcon,
  Plus,
  Search,
  Phone,
  MessageCircle,
  Building,
  RefreshCw,
  Mail,
  X,
  Download,
  Upload,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { exportToExcel, parseExcelFile, downloadExcelTemplate } from '../utils/excel.ts';
import { Contact, Customer } from '../types/index.ts';
import { api } from '../services/api.ts';
import { AdminAuthModal } from '../components/common/AdminAuthModal.tsx';
import { useAuth } from '../context/AuthContext.tsx';

export const ContactsView: React.FC = () => {
  const { currentTenant } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Delete protection modal state
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  // Multi-select bulk deletion state
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<boolean>(false);
  const [deletingBulk, setDeletingBulk] = useState<boolean>(false);

  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    name: '',
    designation: 'Purchase Manager',
    mobile: '',
    whatsapp: '',
    email: '',
    department: 'Purchasing & Machinery',
    isPrimary: false,
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [contList, custList] = await Promise.all([
        api.getContacts(),
        api.getCustomers(),
      ]);
      setContacts(contList);
      setCustomers(custList);
      if (custList.length > 0 && !form.customerId) {
        setForm(prev => ({
          ...prev,
          customerId: custList[0].id,
          customerName: custList[0].companyName,
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedCust = customers.find(c => c.id === form.customerId);
      await api.createContact({
        ...form,
        customerName: selectedCust?.companyName || form.customerName || 'Client',
      });
      setShowAddModal(false);
      setForm({
        customerId: customers[0]?.id || '',
        customerName: customers[0]?.companyName || '',
        name: '',
        designation: 'Purchase Manager',
        mobile: '',
        whatsapp: '',
        email: '',
        department: 'Purchasing & Machinery',
        isPrimary: false,
        notes: '',
      });
      loadData();
    } catch (err: any) {
      alert(`Error creating contact: ${err.message}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!contactToDelete) return;
    try {
      await api.deleteContact(contactToDelete.id);
      setSelectedContactIds(prev => prev.filter(id => id !== contactToDelete.id));
      setContactToDelete(null);
      loadData();
    } catch (err: any) {
      alert(`Error deleting contact: ${err.message}`);
    }
  };

  const handleToggleSelectContact = (id: string) => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filtered.map(c => c.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedContactIds.includes(id));
    if (allSelected) {
      // Unselect filtered
      setSelectedContactIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      // Select all filtered
      const newSet = new Set([...selectedContactIds, ...filteredIds]);
      setSelectedContactIds(Array.from(newSet));
    }
  };

  const handleExecuteBulkDelete = async () => {
    if (selectedContactIds.length === 0) return;
    setDeletingBulk(true);
    try {
      await api.bulkDeleteContacts(selectedContactIds);
      const count = selectedContactIds.length;
      setSelectedContactIds([]);
      setShowBulkDeleteModal(false);
      await loadData();
      alert(`Successfully deleted ${count} contacts simultaneously!`);
    } catch (err: any) {
      alert(`Error during bulk deletion: ${err.message}`);
    } finally {
      setDeletingBulk(false);
    }
  };

  // EXPORT CONTACTS TO EXCEL
  const handleExportToExcel = async () => {
    try {
      const companyName = currentTenant?.name || 'StockItEase';
      const cleanPrefix = companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const headers = [
        'Contact Name',
        'Company / Factory',
        'Designation',
        'Department',
        'Mobile Number',
        'WhatsApp Number',
        'Email Address',
        'Is Primary Contact',
        'Notes',
        'Created Date',
      ];
      const data = contacts.map(c => [
        c.name,
        c.customerName || 'N/A',
        c.designation || '',
        c.department || '',
        c.mobile,
        c.whatsapp || c.mobile,
        c.email || '',
        c.isPrimary ? 'Yes' : 'No',
        c.notes || '',
        c.createdAt ? c.createdAt.split('T')[0] : '',
      ]);

      await exportToExcel(`${cleanPrefix}_Contacts_Directory_${new Date().toISOString().split('T')[0]}.xlsx`, 'Contacts Directory', headers, data);
    } catch (err) {
      console.error('Failed to export contacts to Excel', err);
      alert('Error exporting contacts to Excel.');
    }
  };

  // IMPORT CONTACTS FROM EXCEL
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedContacts, setParsedContacts] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  const handleDownloadSampleExcel = async () => {
    const headers = [
      'Contact Name',
      'Company Name',
      'Designation',
      'Department',
      'Mobile Number',
      'WhatsApp Number',
      'Email Address',
      'Primary Contact',
      'Notes',
    ];
    const sample = [
      [
        'Rajesh Gupta',
        'Apex Industrial Corp',
        'VP Operations',
        'Plant Engineering',
        '+91 98765 43210',
        '+91 98765 43210',
        'rajesh@apexcorp.test',
        'Yes',
        'Key decision maker for machinery',
      ],
      [
        'Sunita Rawat',
        'Pinnacle Technologies',
        'Procurement Head',
        'Purchase',
        '+91 98123 45678',
        '+91 98123 45678',
        'sunita@pinnacle.test',
        'No',
        'Coordinates equipment inquiries',
      ],
    ];
    await downloadExcelTemplate('sample_contacts_import.xlsx', 'Sample Contacts', headers, sample);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportSuccessMessage(null);

    try {
      const { rows } = await parseExcelFile(file);
      const mapped = rows.map(row => {
        const getVal = (keywords: string[]) => {
          const foundKey = Object.keys(row).find(k =>
            keywords.some(kw => k.toLowerCase().includes(kw))
          );
          return foundKey ? String(row[foundKey]).trim() : '';
        };

        return {
          name: getVal(['contact', 'person', 'name']) || 'Contact',
          customerName: getVal(['company', 'firm', 'factory', 'client']) || 'Factory Client',
          designation: getVal(['designation', 'role', 'title']) || 'Purchase Manager',
          department: getVal(['department', 'dept']) || 'Procurement',
          mobile: getVal(['mobile', 'phone', 'contact no']) || '+91 98000 00000',
          whatsapp: getVal(['whatsapp']) || getVal(['mobile', 'phone']) || '',
          email: getVal(['email', 'mail']) || '',
          isPrimary: getVal(['primary']).toLowerCase().includes('y'),
          notes: getVal(['note', 'remark', 'comment']) || '',
        };
      }).filter(item => item.name && item.name.length > 1);

      setParsedContacts(mapped);
    } catch (err: any) {
      console.error('Failed to parse excel file', err);
      alert(err.message || 'Could not parse the selected Excel file.');
    }
  };

  const handleExecuteImport = async () => {
    if (parsedContacts.length === 0) return;
    setImporting(true);
    try {
      await api.bulkImportContacts(parsedContacts);
      setImportSuccessMessage(`Successfully imported ${parsedContacts.length} contacts!`);
      setTimeout(() => {
        setShowImportModal(false);
        setImportFile(null);
        setParsedContacts([]);
        setImportSuccessMessage(null);
        loadData();
      }, 1200);
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.customerName && c.customerName.toLowerCase().includes(q)) ||
      c.mobile.includes(q) ||
      c.designation.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ContactIcon className="w-5 h-5 text-sky-600" />
            Contacts & Factory Executives Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Key personnel directory across client manufacturing plants (Owners, Purchase Heads, Plant Engineers)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export to Excel */}
          <button
            onClick={handleExportToExcel}
            className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors border border-slate-200"
            title="Export contacts to Excel spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" /> Export Excel
          </button>

          {/* Import from Excel */}
          <button
            onClick={() => {
              setImportFile(null);
              setParsedContacts([]);
              setImportSuccessMessage(null);
              setShowImportModal(true);
            }}
            className="px-3 py-2 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors border border-emerald-200"
            title="Import contacts from Excel spreadsheet"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-600" /> Import Excel
          </button>

          {/* Add Contact (all employees can add) */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" /> + Add Contact
          </button>
        </div>
      </div>

      {/* Search & Refresh */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search contact name, company, designation, mobile..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Multi-Select All Checkbox */}
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors select-none">
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every(c => selectedContactIds.includes(c.id))}
              onChange={handleSelectAllFiltered}
              className="w-3.5 h-3.5 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer"
            />
            <span>Select All</span>
          </label>
          <span className="text-[11px] font-semibold text-slate-500">
            {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={loadData}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bulk Action Bar (when 1 or more contacts selected) */}
      {selectedContactIds.length > 0 && (
        <div className="bg-sky-50 border-2 border-sky-400 p-3 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-sky-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
              {selectedContactIds.length}
            </div>
            <div>
              <p className="text-xs font-extrabold text-sky-950">
                {selectedContactIds.length} contact{selectedContactIds.length !== 1 ? 's' : ''} selected
              </p>
              <p className="text-[10px] text-sky-700">
                You can delete all selected contacts at once
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedContactIds([])}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Deselect All
            </button>
            <button
              type="button"
              onClick={() => setShowBulkDeleteModal(true)}
              className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected ({selectedContactIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Contacts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
            Loading contacts...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <ContactIcon className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">No contacts found</p>
          </div>
        ) : (
          filtered.map(contact => (
            <div
              key={contact.id}
              className={`bg-white p-4 rounded-xl border transition-all space-y-3 relative group ${
                selectedContactIds.includes(contact.id)
                  ? 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-50/20 shadow-md'
                  : 'border-slate-200 shadow-xs hover:border-sky-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedContactIds.includes(contact.id)}
                    onChange={() => handleToggleSelectContact(contact.id)}
                    title="Select contact for bulk deletion"
                    className="mt-0.5 w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-extrabold text-sm text-slate-900 truncate">{contact.name}</h3>
                      {contact.isPrimary && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-800 uppercase shrink-0">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-sky-700 truncate">{contact.designation}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {contact.department}
                  </span>
                  {/* Delete Button with Admin Permission Check */}
                  <button
                    onClick={() => setContactToDelete(contact)}
                    title="Delete Contact"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-600 flex items-center gap-1.5 font-medium border-t border-slate-100 pt-2.5">
                <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-bold text-slate-800 truncate">{contact.customerName || 'Client Factory'}</span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Phone / WhatsApp:</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${contact.mobile}`}
                      className="p-1 rounded bg-slate-100 hover:bg-sky-100 text-slate-700"
                    >
                      <Phone className="w-3 h-3" />
                    </a>
                    <a
                      href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                    >
                      <MessageCircle className="w-3 h-3" />
                    </a>
                    <span className="font-mono text-slate-800 font-semibold">{contact.mobile}</span>
                  </div>
                </div>

                {contact.email && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11px]">Email:</span>
                    <a href={`mailto:${contact.email}`} className="text-sky-600 hover:underline truncate max-w-[180px]">
                      {contact.email}
                    </a>
                  </div>
                )}

                {contact.notes && (
                  <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-2">
                    "{contact.notes}"
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Add Company Contact</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Employees can create directory contacts freely</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Customer Company *</label>
                <select
                  value={form.customerId}
                  onChange={e => {
                    const c = customers.find(cust => cust.id === e.target.value);
                    setForm({ ...form, customerId: e.target.value, customerName: c?.companyName || '' });
                  }}
                  required
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Gurpreet Singh"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Chief Maintenance Engineer"
                    value={form.designation}
                    onChange={e => setForm({ ...form, designation: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Mobile Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98110 88992"
                    value={form.mobile}
                    onChange={e => setForm({ ...form, mobile: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">WhatsApp</label>
                  <input
                    type="text"
                    placeholder="+91 98110 88992"
                    value={form.whatsapp}
                    onChange={e => setForm({ ...form, whatsapp: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Department</label>
                  <input
                    type="text"
                    placeholder="Engineering / Maintenance"
                    value={form.department}
                    onChange={e => setForm({ ...form, department: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Email Address</label>
                  <input
                    type="email"
                    placeholder="engineer@lancer.in"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Notes / Machinery Interests</label>
                <textarea
                  rows={2}
                  placeholder="Notes about machines handled, plant visit history..."
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isPrimary"
                  checked={form.isPrimary}
                  onChange={e => setForm({ ...form, isPrimary: e.target.checked })}
                  className="rounded text-sky-600"
                />
                <label htmlFor="isPrimary" className="text-xs text-slate-700 font-semibold cursor-pointer">
                  Set as primary purchasing / technical contact
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Contacts from Excel Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Import Contacts from Excel</h3>
                  <p className="text-[11px] text-slate-500">Upload .xlsx or .xls file with client executive records</p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template download */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-800">Need a pre-formatted template?</p>
                <p className="text-[11px] text-slate-500">Download the sample excel sheet with correct columns</p>
              </div>
              <button
                onClick={handleDownloadSampleExcel}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-100 flex items-center gap-1.5 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-sky-600" /> Sample Template (.xlsx)
              </button>
            </div>

            {/* File Upload Drop Area */}
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors bg-slate-50/50">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                id="contactExcelUpload"
                className="hidden"
                onChange={handleFileChange}
              />
              <label htmlFor="contactExcelUpload" className="cursor-pointer space-y-2 block">
                <Upload className="w-8 h-8 mx-auto text-emerald-600" />
                <div>
                  <span className="font-bold text-emerald-700 hover:underline">Choose Excel file</span> or drag & drop here
                </div>
                <p className="text-[10px] text-slate-400">Supported formats: .xlsx, .xls</p>
                {importFile && (
                  <p className="text-xs font-bold text-slate-800 bg-white inline-block px-3 py-1 rounded-full border border-slate-200 mt-2">
                    Selected: {importFile.name} ({parsedContacts.length} rows detected)
                  </p>
                )}
              </label>
            </div>

            {/* Preview of Parsed Contacts */}
            {parsedContacts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">Preview ({parsedContacts.length} records ready):</span>
                </div>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {parsedContacts.slice(0, 5).map((c, i) => (
                    <div key={i} className="p-2 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-bold text-slate-800">{c.name}</span>
                        <span className="text-slate-500 ml-1.5">({c.designation})</span>
                        <div className="text-slate-400">{c.customerName}</div>
                      </div>
                      <div className="text-right font-mono text-slate-600">
                        {c.mobile}
                      </div>
                    </div>
                  ))}
                  {parsedContacts.length > 5 && (
                    <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50">
                      + {parsedContacts.length - 5} more contacts
                    </div>
                  )}
                </div>
              </div>
            )}

            {importSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold">{importSuccessMessage}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                disabled={parsedContacts.length === 0 || importing}
                onClick={handleExecuteImport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5"
              >
                {importing ? 'Importing...' : `Import ${parsedContacts.length} Contacts`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Authorization Deletion Modal */}
      <AdminAuthModal
        isOpen={Boolean(contactToDelete)}
        onClose={() => setContactToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Contact"
        itemType="Contact"
        itemName={contactToDelete ? `${contactToDelete.name} (${contactToDelete.customerName || 'Client'})` : ''}
        warningMessage="Are you sure you want to permanently delete this contact from the factory directory?"
      />

      {/* Multiple Contacts Bulk Deletion Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Delete Multiple Contacts</h3>
                <p className="text-[11px] text-slate-500">Simultaneous batch deletion</p>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 space-y-1">
              <p className="font-bold text-xs">
                Are you sure you want to permanently delete {selectedContactIds.length} selected contact{selectedContactIds.length !== 1 ? 's' : ''}?
              </p>
              <p className="text-[11px] text-rose-600 leading-relaxed">
                All selected contacts will be removed simultaneously from the directory. This operation cannot be reversed.
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="font-bold text-slate-700 text-[11px]">Contacts to be deleted ({selectedContactIds.length}):</span>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 divide-y divide-slate-100 bg-slate-50">
                {contacts
                  .filter(c => selectedContactIds.includes(c.id))
                  .map(c => (
                    <div key={c.id} className="py-1.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900">{c.name}</span>
                        <span className="text-[11px] text-slate-500 ml-1">({c.designation})</span>
                        <div className="text-[10px] text-slate-400">{c.customerName || 'Client Factory'}</div>
                      </div>
                      <span className="font-mono text-[11px] text-slate-600 shrink-0">{c.mobile}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={deletingBulk}
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingBulk}
                onClick={handleExecuteBulkDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {deletingBulk ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Confirm Delete ({selectedContactIds.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
