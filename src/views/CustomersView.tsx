import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  Phone,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  FileText,
  ShoppingBag,
  CreditCard,
  X,
  Mail,
  MapPin,
  Calendar,
  Download,
  Upload,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { exportToExcel, parseExcelFile, downloadExcelTemplate } from '../utils/excel.ts';
import { Customer, CustomerType, CustomerStatus } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { AdminAuthModal } from '../components/common/AdminAuthModal.tsx';

interface CustomersViewProps {
  initialCustomerId?: string;
  onOpenCreateQuotation: (customer: Customer) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  initialCustomerId,
  onOpenCreateQuotation,
}) => {
  const { users, currentUser, activeCompanyId, isSuperAdmin, isAllTenantsView, currentTenant } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Customer Detail Drawer/Modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomerId || null);
  const [customerDetails, setCustomerDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Add Customer Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    contactPerson: '',
    mobile: '',
    whatsapp: '',
    email: '',
    address: '',
    city: 'Faridabad',
    state: 'Haryana',
    gstNumber: '',
    pan: '',
    customerType: 'Manufacturer' as CustomerType,
    industry: 'Sports & Leather Footwear',
    assignedSalespersonId: currentUser?.id || '',
    notes: '',
  });

  // Excel Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedCustomers, setParsedCustomers] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  // Delete Customer Protection State
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const [error, setError] = useState<string | null>(null);

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const comp = isSuperAdmin ? (isAllTenantsView ? 'all' : activeCompanyId) : (currentUser?.companyId || 'org-1');
      const data = await api.getCustomers({ search, status: statusFilter, type: typeFilter, companyId: comp });
      setCustomers(data);
    } catch (e: any) {
      console.error('Failed to load customers:', e);
      setError(e?.message || 'Failed to load customers from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search, statusFilter, typeFilter, activeCompanyId, isAllTenantsView]);

  const loadCustomerDetails = async (id: string) => {
    setSelectedCustomerId(id);
    setLoadingDetails(true);
    try {
      const res = await api.getCustomerById(id);
      setCustomerDetails(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sp = users.find(u => u.id === form.assignedSalespersonId);
      await api.createCustomer({
        ...form,
        assignedSalespersonName: sp?.name || 'Unassigned',
      });
      setShowAddModal(false);
      setForm({
        companyName: '',
        contactPerson: '',
        mobile: '',
        whatsapp: '',
        email: '',
        address: '',
        city: 'Faridabad',
        state: 'Haryana',
        gstNumber: '',
        pan: '',
        customerType: 'Manufacturer',
        industry: 'Sports & Leather Footwear',
        assignedSalespersonId: currentUser?.id || '',
        notes: '',
      });
      loadCustomers();
    } catch (err: any) {
      alert(`Error creating customer: ${err.message}`);
    }
  };

  // EXPORT CUSTOMERS TO EXCEL
  const handleExportToExcel = async () => {
    try {
      const companyName = currentTenant?.name || 'StockItEase';
      const cleanPrefix = companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const headers = [
        'Customer ID',
        'Company Name',
        'Contact Person',
        'Mobile',
        'WhatsApp',
        'Email',
        'GST Number',
        'PAN',
        'Customer Type',
        'Industry',
        'City',
        'State',
        'Country',
        'Factory Address',
        'Assigned Salesperson',
        'Account Status',
        'Notes',
      ];
      const data = customers.map(c => [
        c.id,
        c.companyName,
        c.contactPerson,
        c.mobile,
        c.whatsapp || c.mobile,
        c.email || '',
        c.gstNumber || '',
        c.pan || '',
        c.customerType,
        c.industry,
        c.city,
        c.state,
        c.country,
        c.address || '',
        c.assignedSalespersonName || '',
        c.status,
        c.notes || '',
      ]);

      await exportToExcel(`${cleanPrefix}_Customers_${new Date().toISOString().split('T')[0]}.xlsx`, 'Customers Directory', headers, data);
    } catch (err) {
      console.error('Failed to export customers', err);
      alert('Error exporting customers to Excel.');
    }
  };

  // IMPORT CUSTOMERS FROM EXCEL
  const handleDownloadSampleCustomerExcel = async () => {
    const headers = [
      'Company Name',
      'Contact Person',
      'Mobile',
      'WhatsApp',
      'Email',
      'GST Number',
      'PAN',
      'City',
      'State',
      'Address',
      'Customer Type',
      'Industry',
      'Status',
      'Notes',
    ];
    const sample = [
      [
        'Action Shoes Manufacturing Corp',
        'Sunil Mittal',
        '+91 98110 22334',
        '+91 98110 22334',
        'mittal@actionshoes.com',
        '07AAACA1234F1Z8',
        'AAACA1234F',
        'Bahadurgarh',
        'Haryana',
        'Modern Industrial Estate, Part B',
        'Manufacturer',
        'PU & PVC Footwear',
        'Active',
        'High volume client with 4 conveyor assembly lines',
      ],
      [
        'Relaxo Footwears Partner Unit',
        'Virender Dua',
        '+91 98220 55667',
        '+91 98220 55667',
        'virender@relaxofab.in',
        '08AAACR5678G1ZP',
        'AAACR5678G',
        'Bhiwadi',
        'Rajasthan',
        'RIICO Industrial Area, Phase III',
        'Manufacturer',
        'EVA & Rubber Footwear',
        'Active',
        'Inquires about automatic sole injection presses',
      ],
    ];
    await downloadExcelTemplate('sample_customers_template.xlsx', 'Sample Customers', headers, sample);
  };

  const handleCustomerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const company = getVal(['company', 'firm', 'client', 'buyer', 'factory']) || 'Business Client';
        return {
          companyName: company,
          contactPerson: getVal(['contact', 'person', 'owner', 'manager', 'name']) || company,
          mobile: getVal(['mobile', 'phone', 'contact no']) || '+91 98000 00000',
          whatsapp: getVal(['whatsapp']) || getVal(['mobile', 'phone']) || '',
          email: getVal(['email', 'mail']) || '',
          gstNumber: getVal(['gst', 'gstin']) || '',
          pan: getVal(['pan']) || '',
          city: getVal(['city', 'location']) || 'Delhi NCR',
          state: getVal(['state']) || 'Delhi',
          address: getVal(['address', 'plant', 'factory address']) || '',
          customerType: (getVal(['type', 'customer type']) || 'Manufacturer') as CustomerType,
          industry: getVal(['industry', 'sector']) || 'Manufacturing',
          status: (getVal(['status']) || 'Active') as CustomerStatus,
          notes: getVal(['note', 'remark']) || '',
        };
      }).filter(item => item.companyName && item.companyName.length > 2);

      setParsedCustomers(mapped);
    } catch (err: any) {
      console.error('Failed to parse excel file', err);
      alert(err.message || 'Could not parse the selected Excel file.');
    }
  };

  const handleExecuteCustomerImport = async () => {
    if (parsedCustomers.length === 0) return;
    setImporting(true);
    try {
      const res = await api.bulkImportCustomers(parsedCustomers);
      setImportSuccessMessage(`Successfully imported ${res.count} customer accounts!`);
      setTimeout(() => {
        setShowImportModal(false);
        setImportFile(null);
        setParsedCustomers([]);
        setImportSuccessMessage(null);
        loadCustomers();
      }, 1200);
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!customerToDelete) return;
    try {
      await api.deleteCustomer(customerToDelete.id);
      if (selectedCustomerId === customerToDelete.id) {
        setSelectedCustomerId(null);
        setCustomerDetails(null);
      }
      setCustomerToDelete(null);
      loadCustomers();
    } catch (err: any) {
      alert(`Error deleting customer: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-sky-600" />
            Customer Accounts & Manufacturing Plants
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage permanent footwear manufacturing clients, distributor accounts, and their linked machines and orders
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export to Excel */}
          <button
            onClick={handleExportToExcel}
            className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors border border-slate-200"
            title="Export customers directory to Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" /> Export Excel
          </button>

          {/* Import from Excel */}
          <button
            onClick={() => {
              setImportFile(null);
              setParsedCustomers([]);
              setImportSuccessMessage(null);
              setShowImportModal(true);
            }}
            className="px-3 py-2 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors border border-emerald-200"
            title="Import customer records from Excel"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-600" /> Import Excel
          </button>

          {/* Add Customer (all employees can add) */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> + Add Customer
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search company, contact, GST, mobile..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
        >
          <option value="all">All Types</option>
          <option value="Manufacturer">Manufacturer</option>
          <option value="Exporter">Exporter</option>
          <option value="Dealer">Dealer</option>
          <option value="Distributor">Distributor</option>
          <option value="Trader">Trader</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
        >
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Prospect">Prospect</option>
          <option value="Inactive">Inactive</option>
        </select>

        <button
          onClick={loadCustomers}
          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-3">Customer ID & Company</th>
                <th className="py-3 px-3">Contact Person</th>
                <th className="py-3 px-3">Mobile & WhatsApp</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3">GSTIN / PAN</th>
                <th className="py-3 px-3">Type & Industry</th>
                <th className="py-3 px-3">Account Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
                    Loading customers...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-rose-600 bg-rose-50/50">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
                    <p className="font-semibold">{error}</p>
                    <button
                      onClick={loadCustomers}
                      className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 cursor-pointer"
                    >
                      Retry Loading Customers
                    </button>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No customers found</p>
                  </td>
                </tr>
              ) : (
                customers.map(cust => (
                  <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors group">
                    <td
                      onClick={() => loadCustomerDetails(cust.id)}
                      className="py-3 px-3 cursor-pointer"
                    >
                      <div className="font-extrabold text-slate-900 group-hover:text-sky-600 transition-colors flex items-center gap-1.5">
                        {cust.companyName}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{cust.id}</div>
                    </td>

                    <td className="py-3 px-3 font-medium text-slate-800">
                      {cust.contactPerson}
                    </td>

                    <td className="py-3 px-3 font-mono">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`tel:${cust.mobile}`}
                          className="p-1 rounded bg-slate-100 hover:bg-sky-100 text-slate-700"
                        >
                          <Phone className="w-3 h-3" />
                        </a>
                        <a
                          href={`https://wa.me/${cust.whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                        >
                          <MessageCircle className="w-3 h-3" />
                        </a>
                        <span className="text-slate-700">{cust.mobile}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-slate-600">
                      {cust.city}, {cust.state}
                    </td>

                    <td className="py-3 px-3 font-mono">
                      {cust.gstNumber ? (
                        <span className="text-slate-700 font-medium">{cust.gstNumber}</span>
                      ) : (
                        <span className="text-slate-400 italic">Not set</span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {cust.customerType}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]">{cust.industry}</div>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          cust.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {cust.status}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => loadCustomerDetails(cust.id)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[11px]"
                        >
                          Profile
                        </button>
                        <button
                          onClick={() => onOpenCreateQuotation(cust)}
                          className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded font-semibold text-[11px]"
                        >
                          Quote
                        </button>
                        {/* Delete Customer with Admin Permission Protection */}
                        <button
                          onClick={() => setCustomerToDelete(cust)}
                          title="Delete Customer (Requires Admin Permission)"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer 360 Detail Modal */}
      {selectedCustomerId && customerDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">{customerDetails.customer.companyName}</h3>
                  <p className="text-xs text-slate-500">
                    {customerDetails.customer.city}, {customerDetails.customer.state} • {customerDetails.customer.customerType}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCustomerToDelete(customerDetails.customer)}
                  className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Account
                </button>
                <button
                  onClick={() => {
                    setSelectedCustomerId(null);
                    setCustomerDetails(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Contact Info</h4>
                  <div className="space-y-1 text-slate-600">
                    <p><strong>Primary:</strong> {customerDetails.customer.contactPerson}</p>
                    <p><strong>Mobile:</strong> {customerDetails.customer.mobile}</p>
                    <p><strong>Email:</strong> {customerDetails.customer.email || '—'}</p>
                    <p><strong>GSTIN:</strong> {customerDetails.customer.gstNumber || 'Unregistered'}</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Orders & Financials</h4>
                  <div className="space-y-1 text-slate-600">
                    <p><strong>Total Orders:</strong> {customerDetails.orders?.length || 0}</p>
                    <p><strong>Quotations:</strong> {customerDetails.quotations?.length || 0}</p>
                    <p><strong>Assigned To:</strong> {customerDetails.customer.assignedSalespersonName || 'Sales Team'}</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Factory Address</h4>
                  <p className="text-slate-600 leading-relaxed">
                    {customerDetails.customer.address || `${customerDetails.customer.city}, ${customerDetails.customer.state}`}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => {
                  onOpenCreateQuotation(customerDetails.customer);
                  setSelectedCustomerId(null);
                }}
                className="px-4 py-2 bg-sky-600 text-white font-bold rounded-lg text-xs"
              >
                Create Quotation for Client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Register Client / Factory</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Employees can create client accounts freely</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Company / Firm Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Paragon Footwear Partner Unit"
                    value={form.companyName}
                    onChange={e => setForm({ ...form, companyName: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Person *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. K. Ranganathan"
                    value={form.contactPerson}
                    onChange={e => setForm({ ...form, contactPerson: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Mobile Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98421 88776"
                    value={form.mobile}
                    onChange={e => setForm({ ...form, mobile: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">WhatsApp</label>
                  <input
                    type="text"
                    placeholder="+91 98421 88776"
                    value={form.whatsapp}
                    onChange={e => setForm({ ...form, whatsapp: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Email Address</label>
                  <input
                    type="email"
                    placeholder="ranga@paragon.com"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">GSTIN</label>
                  <input
                    type="text"
                    placeholder="33AABCP1234F1Z8"
                    value={form.gstNumber}
                    onChange={e => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Customer Type</label>
                  <select
                    value={form.customerType}
                    onChange={e => setForm({ ...form, customerType: e.target.value as any })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="Manufacturer">Manufacturer</option>
                    <option value="Exporter">Exporter</option>
                    <option value="Dealer">Dealer</option>
                    <option value="Distributor">Distributor</option>
                    <option value="Trader">Trader</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Industry</label>
                  <input
                    type="text"
                    value={form.industry}
                    onChange={e => setForm({ ...form, industry: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setForm({ ...form, city: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={e => setForm({ ...form, state: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Plant / Factory Address</label>
                <textarea
                  rows={2}
                  placeholder="Plot number, industrial area..."
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Customers from Excel Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Import Customer Accounts from Excel</h3>
                  <p className="text-[11px] text-slate-500">Upload .xlsx or .xls file containing factory and client records</p>
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
                <p className="font-bold text-slate-800">Customer Import Template</p>
                <p className="text-[11px] text-slate-500">Pre-formatted columns: Company Name, Contact, Mobile, GSTIN, City</p>
              </div>
              <button
                onClick={handleDownloadSampleCustomerExcel}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-100 flex items-center gap-1.5 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-sky-600" /> Download Template (.xlsx)
              </button>
            </div>

            {/* File Upload Drop Area */}
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors bg-slate-50/50">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                id="customerExcelUpload"
                className="hidden"
                onChange={handleCustomerFileChange}
              />
              <label htmlFor="customerExcelUpload" className="cursor-pointer space-y-2 block">
                <Upload className="w-8 h-8 mx-auto text-emerald-600" />
                <div>
                  <span className="font-bold text-emerald-700 hover:underline">Choose Excel file</span> or drag & drop here
                </div>
                <p className="text-[10px] text-slate-400">Supported formats: .xlsx, .xls</p>
                {importFile && (
                  <p className="text-xs font-bold text-slate-800 bg-white inline-block px-3 py-1 rounded-full border border-slate-200 mt-2">
                    Selected: {importFile.name} ({parsedCustomers.length} accounts recognized)
                  </p>
                )}
              </label>
            </div>

            {/* Preview of Parsed Customers */}
            {parsedCustomers.length > 0 && (
              <div className="space-y-2">
                <span className="font-bold text-slate-700">Preview ({parsedCustomers.length} clients ready):</span>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {parsedCustomers.slice(0, 5).map((c, i) => (
                    <div key={i} className="p-2 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-bold text-slate-800">{c.companyName}</span>
                        <div className="text-slate-500">{c.contactPerson} • {c.city}, {c.state}</div>
                      </div>
                      <div className="text-right font-mono text-slate-600">
                        {c.gstNumber ? <div className="text-[10px] text-sky-700 font-bold">{c.gstNumber}</div> : null}
                        <div>{c.mobile}</div>
                      </div>
                    </div>
                  ))}
                  {parsedCustomers.length > 5 && (
                    <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50">
                      + {parsedCustomers.length - 5} more customers
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
                disabled={parsedCustomers.length === 0 || importing}
                onClick={handleExecuteCustomerImport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5"
              >
                {importing ? 'Importing...' : `Import ${parsedCustomers.length} Customers`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Authorization Deletion Modal */}
      <AdminAuthModal
        isOpen={Boolean(customerToDelete)}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={handleConfirmDeleteCustomer}
        title="Delete Customer Account"
        itemType="Customer"
        itemName={customerToDelete ? `${customerToDelete.companyName} (${customerToDelete.city})` : ''}
        warningMessage="Permanently deleting a customer account removes linked machinery references and customer profile data."
      />
    </div>
  );
};
