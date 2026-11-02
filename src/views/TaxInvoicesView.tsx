import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Printer,
  Eye,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  Download,
  IndianRupee,
  FileText,
  X,
  Ban,
} from 'lucide-react';
import { TaxInvoice, Customer, Product, CompanySettings } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { TaxInvoiceModal } from './TaxInvoiceModal.tsx';
import { numberToIndianWords } from '../utils/formatters.ts';

interface TaxInvoicesViewProps {
  onNavigateTo?: (tab: string, entityId?: string) => void;
}

export const TaxInvoicesView: React.FC<TaxInvoicesViewProps> = ({ onNavigateTo }) => {
  const { currentTenant, isAllTenantsView, isSuperAdmin, activeCompanyId, currentUser } = useAuth();
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Preview Modal
  const [selectedInvoice, setSelectedInvoice] = useState<TaxInvoice | null>(null);

  // Cancellation State (No deletes on tax invoices)
  const [invoiceToCancel, setInvoiceToCancel] = useState<TaxInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Create Invoice Wizard Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('Haryana (06)');
  const [isInterState, setIsInterState] = useState(false);
  const [transportMode, setTransportMode] = useState('Road Transport');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 15 Days from invoice date');

  // Line Items
  const [items, setItems] = useState<
    {
      productId?: string;
      productName: string;
      modelNumber?: string;
      hsnCode: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      discountPercentage: number;
      gstPercentage: number;
    }[]
  >([]);

  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const compId = isSuperAdmin ? (isAllTenantsView ? 'all' : activeCompanyId) : activeCompanyId;
      const [invList, custList, prodList, setts] = await Promise.all([
        api.getTaxInvoices(compId ? { companyId: compId } : undefined),
        api.getCustomers(compId ? { companyId: compId } : {}),
        api.getProducts(compId ? { companyId: compId } : {}),
        api.getSettings(),
      ]);
      setInvoices(invList);
      setCustomers(custList);
      setProducts(prodList);
      setSettings(setts.company);
    } catch (e: any) {
      console.error('Failed to load tax invoices:', e);
      setError(e?.message || 'Failed to load tax invoices from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeCompanyId, isAllTenantsView]);

  const handleSelectCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = customers.find(c => c.id === custId);
    if (cust) {
      setCustomerName(cust.companyName);
      setContactPerson(cust.contactPerson);
      setMobile(cust.mobile);
      setEmail(cust.email || '');
      setBillingAddress(cust.address || `${cust.city}, ${cust.state}`);
      setCustomerGstin(cust.gstNumber || '');
      const stateCode = cust.state?.toLowerCase().includes('delhi') ? 'Delhi (07)' : `${cust.state || 'Haryana'}`;
      setPlaceOfSupply(stateCode);
      setIsInterState(!stateCode.toLowerCase().includes('haryana'));
    }
  };

  const handleAddItem = (productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    setItems([
      ...items,
      {
        productId: prod.id,
        productName: prod.name,
        modelNumber: prod.modelNumber,
        hsnCode: settings?.defaultHsnCode || '',
        quantity: 1,
        unit: prod.unit || 'Unit',
        unitPrice: prod.price,
        discountPercentage: 0,
        gstPercentage: prod.gstPercentage || 18,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      alert('Please add at least one item or machine to generate an invoice.');
      return;
    }

    // Calculations
    const processedItems = items.map((it, idx) => {
      const gross = it.quantity * it.unitPrice;
      const discount = (gross * it.discountPercentage) / 100;
      const taxable = gross - discount;
      const gstAmt = (taxable * it.gstPercentage) / 100;
      const cgst = isInterState ? 0 : gstAmt / 2;
      const sgst = isInterState ? 0 : gstAmt / 2;
      const igst = isInterState ? gstAmt : 0;
      return {
        id: `inv-i-${Date.now()}-${idx}`,
        productId: it.productId,
        productName: it.productName,
        modelNumber: it.modelNumber,
        hsnCode: it.hsnCode,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discountPercentage: it.discountPercentage,
        taxableAmount: taxable,
        gstPercentage: it.gstPercentage,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        totalAmount: taxable + gstAmt,
      };
    });

    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const taxableAmount = processedItems.reduce((sum, it) => sum + it.taxableAmount, 0);
    const discountTotal = subtotal - taxableAmount;
    const cgstTotal = processedItems.reduce((sum, it) => sum + it.cgstAmount, 0);
    const sgstTotal = processedItems.reduce((sum, it) => sum + it.sgstAmount, 0);
    const igstTotal = processedItems.reduce((sum, it) => sum + it.igstAmount, 0);
    const totalTax = cgstTotal + sgstTotal + igstTotal;
    const grandTotal = taxableAmount + totalTax;

    try {
      const newInv = await api.createTaxInvoice({
        customerId: selectedCustomerId || 'cust-direct',
        customerName,
        contactPerson,
        mobile,
        email,
        billingAddress,
        customerGstin,
        placeOfSupply,
        stateCode: placeOfSupply.match(/\((\d+)\)/)?.[1] || '06',
        isInterState,
        transportMode,
        vehicleNumber,
        lrNumber,
        paymentTerms,
        items: processedItems,
        subtotal,
        discountTotal,
        taxableAmount,
        cgstTotal,
        sgstTotal,
        igstTotal,
        totalTax,
        grandTotal,
        amountInWords: numberToIndianWords(grandTotal),
        paymentStatus: 'Pending',
        companyId: activeCompanyId || 'org-1',
        createdById: currentUser?.id,
        createdByName: currentUser?.name,
      });

      setShowCreateModal(false);
      resetForm();
      await loadData();
      setSelectedInvoice(newInv);
    } catch (err: any) {
      alert(`Error creating tax invoice: ${err.message}`);
    }
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setCustomerName('');
    setContactPerson('');
    setMobile('');
    setEmail('');
    setBillingAddress('');
    setCustomerGstin('');
    setItems([]);
  };

  const handleConfirmCancelInvoice = async () => {
    if (!invoiceToCancel || !cancelReason.trim()) {
      alert('Please state a reason for cancelling this invoice.');
      return;
    }
    setCancelling(true);
    try {
      await api.cancelTaxInvoice(invoiceToCancel.id, cancelReason.trim());
      setInvoiceToCancel(null);
      setCancelReason('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel invoice');
    } finally {
      setCancelling(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch =
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.customerName.toLowerCase().includes(q) ||
      (inv.customerGstin && inv.customerGstin.toLowerCase().includes(q)) ||
      (inv.mobile && inv.mobile.includes(q));
    const matchStatus = statusFilter === 'all' || inv.paymentStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalTaxCollected = invoices.reduce((sum, inv) => sum + inv.totalTax, 0);
  const totalPaidInvoices = invoices.filter(inv => inv.paymentStatus === 'Paid').length;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            GST Tax Invoices & Billing
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Generate, print, and download official Indian GST compliant tax invoices with HSN breakdown & e-Way bill data.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" /> + Create Tax Invoice
          </button>
          <button
            onClick={loadData}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium">Total Tax Invoiced</div>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
            ₹{totalInvoiced.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">
            {invoices.length} invoices generated
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium">GST Tax Component</div>
          <div className="text-2xl font-black text-sky-700 mt-1 font-mono">
            ₹{totalTaxCollected.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">CGST / SGST / IGST Collected</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium">Fully Paid Invoices</div>
          <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
            {totalPaidInvoices} / {invoices.length}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">Reconciled via NEFT / Bank</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-xs font-medium">Active Client Billing Context</div>
          <div className="text-sm font-bold text-slate-800 mt-1 truncate">
            {currentTenant?.name || 'All Clients (Consolidated)'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            GSTIN: {settings?.gstin || '-'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2.5 items-center justify-between">
        <div className="flex flex-wrap gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice #, customer name, GSTIN..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
          >
            <option value="all">All Payment Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Invoice Number</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Billed Customer</th>
                <th className="py-3 px-3">GSTIN</th>
                <th className="py-3 px-3">Taxable Value</th>
                <th className="py-3 px-3">GST Total</th>
                <th className="py-3 px-3">Grand Total</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
                      <p className="text-xs font-medium">Loading tax invoices...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-rose-600 bg-rose-50/50">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
                    <p className="font-semibold">{error}</p>
                    <button
                      onClick={loadData}
                      className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 cursor-pointer"
                    >
                      Retry Loading Invoices
                    </button>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No tax invoices found</p>
                    <p className="text-xs text-slate-400 mt-0.5">Click "+ Create Tax Invoice" to generate one.</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-900">{inv.invoiceNumber}</div>
                      <div className="text-[10px] text-slate-400">
                        {inv.orderNumber ? `Order: ${inv.orderNumber}` : 'Direct'}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">{inv.invoiceDate}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{inv.customerName}</div>
                      <div className="text-[10px] text-slate-500">{inv.placeOfSupply}</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {inv.customerGstin || <span className="text-slate-400 italic">Unregistered</span>}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      ₹{inv.taxableAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      ₹{inv.totalTax.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 font-mono font-extrabold text-emerald-800">
                      ₹{inv.grandTotal.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3">
                      {inv.status === 'Cancelled' ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          Cancelled
                        </span>
                      ) : (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.paymentStatus === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.paymentStatus === 'Partially Paid'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded flex items-center gap-1 transition-colors text-xs cursor-pointer"
                        >
                          <Printer className="w-3 h-3" /> View & Print
                        </button>
                        {inv.status !== 'Cancelled' && (
                          <button
                            onClick={() => {
                              setInvoiceToCancel(inv);
                              setCancelReason('');
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Cancel Tax Invoice with Reason"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Print & View */}
      {selectedInvoice && settings && (
        <TaxInvoiceModal
          invoice={selectedInvoice}
          companySettings={settings}
          onClose={() => setSelectedInvoice(null)}
        />
      )}

      {/* Modal for Creating New Tax Invoice */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 font-extrabold text-slate-900 text-sm">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>Create New GST Tax Invoice</span>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Customer Selector */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  Select Existing Customer (Optional autofill)
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={e => handleSelectCustomer(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="">-- Choose Customer or Fill Manually --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.city}, {c.state})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Buyer / Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Customer GSTIN</label>
                  <input
                    type="text"
                    placeholder="e.g. 07AAACA9876K1Z3"
                    value={customerGstin}
                    onChange={e => setCustomerGstin(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Mobile Number</label>
                  <input
                    type="text"
                    value={mobile}
                    onChange={e => setMobile(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Billing & Shipping Address</label>
                <textarea
                  rows={2}
                  value={billingAddress}
                  onChange={e => setBillingAddress(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Place of Supply</label>
                  <input
                    type="text"
                    value={placeOfSupply}
                    onChange={e => setPlaceOfSupply(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Transport Mode</label>
                  <input
                    type="text"
                    value={transportMode}
                    onChange={e => setTransportMode(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Vehicle Number</label>
                  <input
                    type="text"
                    placeholder="HR-38-AF-9844"
                    value={vehicleNumber}
                    onChange={e => setVehicleNumber(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="interstate"
                  checked={isInterState}
                  onChange={e => setIsInterState(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <label htmlFor="interstate" className="text-xs font-semibold text-slate-700">
                  Inter-State Supply (Apply IGST 18% instead of CGST 9% + SGST 9%)
                </label>
              </div>

              {/* Items Section */}
              <div className="border-t border-slate-200 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">Invoice Machinery & Line Items</span>
                  <div className="flex items-center gap-2">
                    <select
                      onChange={e => {
                        if (e.target.value) {
                          handleAddItem(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="text-xs bg-emerald-50 text-emerald-800 font-bold border border-emerald-300 rounded-lg px-2 py-1"
                    >
                      <option value="">+ Add Machine from Catalogue</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.modelNumber}) - ₹{p.price.toLocaleString('en-IN')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-400 text-xs border border-dashed border-slate-300">
                    No items added yet. Pick a machine above to add to this invoice.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-[180px]">
                          <p className="font-bold text-slate-900">{it.productName}</p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            Model: {it.modelNumber} | HSN: {it.hsnCode}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Qty</span>
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setItems(items.map((item, i) => (i === idx ? { ...item, quantity: val } : item)));
                              }}
                              className="w-16 p-1 bg-white border border-slate-300 rounded text-center font-bold"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block">Rate (₹)</span>
                            <input
                              type="number"
                              value={it.unitPrice}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setItems(items.map((item, i) => (i === idx ? { ...item, unitPrice: val } : item)));
                              }}
                              className="w-24 p-1 bg-white border border-slate-300 rounded text-right font-mono"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block">Disc %</span>
                            <input
                              type="number"
                              value={it.discountPercentage}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setItems(items.map((item, i) => (i === idx ? { ...item, discountPercentage: val } : item)));
                              }}
                              className="w-14 p-1 bg-white border border-slate-300 rounded text-center"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 mt-3"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm"
                >
                  Generate Tax Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancellation Modal for Tax Invoice (Statutory Retained Serial Record) */}
      {invoiceToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Cancel Tax Invoice</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Invoice <strong className="text-slate-800 font-mono">{invoiceToCancel.invoiceNumber}</strong> ({invoiceToCancel.customerName})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Under Indian GST regulations, consecutively numbered tax invoices cannot be deleted. Cancelling retains the serial audit record and voids tax liabilities.
            </p>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Reason for Cancellation (Required)</label>
              <textarea
                rows={3}
                required
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Buyer order cancellation prior to dispatch / Line item pricing adjustment requested"
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setInvoiceToCancel(null);
                  setCancelReason('');
                }}
                className="px-4 py-2 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={cancelling || !cancelReason.trim()}
                onClick={handleConfirmCancelInvoice}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Invoice Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
