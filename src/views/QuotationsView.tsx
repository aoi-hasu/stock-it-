import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Printer,
  ShoppingBag,
  Copy,
  Trash2,
  X,
  IndianRupee,
  CheckCircle2,
  Layers,
  Receipt,
  AlertTriangle,
  Mail,
  Scale,
  History,
} from 'lucide-react';
import { Quotation, Product, Customer, CompanySettings, TaxInvoice } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { QuotationPDFModal } from './QuotationPDFModal.tsx';
import { TaxInvoiceModal } from './TaxInvoiceModal.tsx';
import { AdminAuthModal } from '../components/common/AdminAuthModal.tsx';
import { FollowUpSequenceModal } from '../components/pipeline/FollowUpSequenceModal.tsx';
import { NegotiationModal } from '../components/pipeline/NegotiationModal.tsx';
import { QuoteActivityTimelineModal } from '../components/pipeline/QuoteActivityTimelineModal.tsx';
import { numberToIndianWords } from '../utils/formatters.ts';

interface QuotationsViewProps {
  initialLeadOrCustomer?: any;
  preselectedProduct?: Product;
}

export const QuotationsView: React.FC<QuotationsViewProps> = ({
  initialLeadOrCustomer,
  preselectedProduct,
}) => {
  const { currentUser, users } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // PDF Preview Modal
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);
  const [previewTaxInvoice, setPreviewTaxInvoice] = useState<TaxInvoice | null>(null);

  // Permission Guard Delete State
  const [quotationToDelete, setQuotationToDelete] = useState<Quotation | null>(null);

  // Convert to Order Modal
  const [convertingQtn, setConvertingQtn] = useState<Quotation | null>(null);
  const [advancePaymentInput, setAdvancePaymentInput] = useState<number>(0);
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>('Bank Transfer');
  const [referenceNumberInput, setReferenceNumberInput] = useState<string>('');
  const [convertingOrder, setConvertingOrder] = useState(false);

  // Post-Quoting Pipeline Modals
  const [followUpQuote, setFollowUpQuote] = useState<Quotation | null>(null);
  const [negotiationQuote, setNegotiationQuote] = useState<Quotation | null>(null);
  const [timelineQuote, setTimelineQuote] = useState<Quotation | null>(null);

  // New Quotation Wizard Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customerMode, setCustomerMode] = useState<'existing' | 'manual'>('existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [salespersonId, setSalespersonId] = useState(currentUser?.id || '');
  const [validityDays, setValidityDays] = useState(30);

  // Dynamic Line Items
  const [items, setItems] = useState<
    {
      productId: string;
      productName: string;
      modelNumber: string;
      quantity: number;
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
      const [qList, pList, cList, sData] = await Promise.all([
        api.getQuotations(),
        api.getProducts(),
        api.getCustomers(),
        api.getSettings(),
      ]);
      setQuotations(qList);
      setProducts(pList);
      setCustomers(cList);
      setSettings(sData.company);

      // Handle initial props if provided
      if (initialLeadOrCustomer) {
        setCustomerName(initialLeadOrCustomer.companyName);
        setContactPerson(initialLeadOrCustomer.contactPerson);
        setMobile(initialLeadOrCustomer.mobile);
        setEmail(initialLeadOrCustomer.email || '');
        setBillingAddress(initialLeadOrCustomer.address || `${initialLeadOrCustomer.city}, ${initialLeadOrCustomer.state}`);
        setShowCreateModal(true);
      }
      if (preselectedProduct) {
        setItems([
          {
            productId: preselectedProduct.id,
            productName: preselectedProduct.name,
            modelNumber: preselectedProduct.modelNumber,
            quantity: 1,
            unitPrice: preselectedProduct.price,
            discountPercentage: 0,
            gstPercentage: preselectedProduct.gstPercentage || 18,
          },
        ]);
        setShowCreateModal(true);
      }
    } catch (e: any) {
      console.error('Failed to load quotations:', e);
      setError(e?.message || 'Failed to load quotations from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddItem = (productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    setItems([
      ...items,
      {
        productId: prod.id,
        productName: prod.name,
        modelNumber: prod.modelNumber,
        quantity: 1,
        unitPrice: prod.price,
        discountPercentage: 0,
        gstPercentage: prod.gstPercentage || 18,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    const c = customers.find(cust => cust.id === custId);
    if (c) {
      setCustomerName(c.companyName);
      setContactPerson(c.contactPerson);
      setMobile(c.mobile);
      setEmail(c.email || '');
      setBillingAddress(c.address || `${c.city}, ${c.state}`);
      setShippingAddress(c.address || `${c.city}, ${c.state}`);
    }
  };

  const calculateSubtotal = () =>
    items.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);

  const calculateDiscountTotal = () =>
    items.reduce(
      (acc, it) => acc + (it.quantity * it.unitPrice * it.discountPercentage) / 100,
      0
    );

  const calculateTaxable = () => calculateSubtotal() - calculateDiscountTotal();

  const calculateGST = () => (calculateTaxable() * 18) / 100;

  const calculateGrandTotal = () => calculateTaxable() + calculateGST();

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      alert('Please add at least one footwear machine to the quotation line items.');
      return;
    }

    try {
      const sp = users.find(u => u.id === salespersonId);
      await api.createQuotation({
        customerId: selectedCustomerId || undefined,
        customerName,
        contactPerson,
        mobile,
        email,
        billingAddress,
        shippingAddress: shippingAddress || billingAddress,
        salespersonId,
        salespersonName: sp?.name || 'Direct Technical Sales',
        validityDays,
        items,
      });

      setShowCreateModal(false);
      setItems([]);
      loadData();
    } catch (err: any) {
      alert(`Error creating quotation: ${err.message}`);
    }
  };

  const handleConvertToOrder = async () => {
    if (!convertingQtn) return;
    setConvertingOrder(true);
    try {
      const res = await api.convertQuotationToOrder(convertingQtn.id, {
        advancePayment: advancePaymentInput,
        paymentMethod: paymentMethodInput,
        referenceNumber: referenceNumberInput,
      });
      setConvertingQtn(null);
      alert(`Quotation successfully converted to Confirmed Sales Order #${res.order.orderNumber}! Machinery inventory has been reserved.`);
      loadData();
    } catch (err: any) {
      alert(`Conversion failed: ${err.message || 'Please check quotation details'}`);
    } finally {
      setConvertingOrder(false);
    }
  };

  const handleConfirmDeleteQuotation = async () => {
    if (!quotationToDelete) return;
    try {
      await api.deleteQuotation(quotationToDelete.id);
      setQuotationToDelete(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete quotation');
    }
  };

  const filtered = quotations.filter(q => {
    const s = search.toLowerCase();
    const matchSearch =
      q.quotationNumber.toLowerCase().includes(s) ||
      q.customerName.toLowerCase().includes(s) ||
      q.contactPerson.toLowerCase().includes(s) ||
      q.mobile.includes(s);

    const matchStatus = statusFilter === 'all' || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleGenerateTaxInvoiceFromQuote = async (qtn: Quotation) => {
    try {
      const existingInvoices = await api.getTaxInvoices();
      const matched = existingInvoices.find(inv => inv.quotationId === qtn.id || inv.quotationNumber === qtn.quotationNumber);
      if (matched) {
        setPreviewTaxInvoice(matched);
      } else {
        const cust = customers.find(c => c.id === qtn.customerId || c.companyName.toLowerCase() === qtn.customerName.toLowerCase());
        const custAddress = cust?.address || qtn.billingAddress || (cust?.city ? `${cust.city}, ${cust.state || ''}` : 'Factory Premises');
        const custState = (cust?.state || '').trim();
        const compState = (settings?.state || 'Haryana').trim();
        const isInterState = custState ? custState.toLowerCase() !== compState.toLowerCase() : false;
        const placeOfSupply = custState ? `${custState}${isInterState ? ' (Inter-State)' : ' (06)'}` : `${compState} (06)`;

        const processedItems = qtn.items.map((it, idx) => ({
          id: `inv-i-${Date.now()}-${idx}`,
          productId: it.productId,
          productName: it.productName,
          modelNumber: it.modelNumber,
          hsnCode: settings?.defaultHsnCode || '',
          quantity: it.quantity,
          unit: 'Unit',
          unitPrice: it.unitPrice,
          discountPercentage: it.discountPercentage || 0,
          taxableAmount: it.taxableAmount,
          gstPercentage: it.gstPercentage,
          cgstAmount: isInterState ? 0 : it.gstAmount / 2,
          sgstAmount: isInterState ? 0 : it.gstAmount / 2,
          igstAmount: isInterState ? it.gstAmount : 0,
          totalAmount: it.totalAmount,
        }));

        const newInv: Partial<TaxInvoice> = {
          quotationId: qtn.id,
          quotationNumber: qtn.quotationNumber,
          customerId: qtn.customerId || cust?.id || 'cust-direct',
          customerName: qtn.customerName,
          contactPerson: qtn.contactPerson || cust?.contactPerson,
          mobile: qtn.mobile || cust?.mobile,
          email: qtn.email || cust?.email,
          billingAddress: custAddress,
          shippingAddress: qtn.shippingAddress || custAddress,
          customerGstin: cust?.gstNumber || '',
          customerPan: cust?.pan || '',
          placeOfSupply,
          stateCode: isInterState ? '99' : '06',
          isInterState,
          reverseCharge: false,
          transportMode: 'Surface Logistics Express',
          items: processedItems,
          subtotal: qtn.subtotal,
          discountTotal: qtn.discountTotal,
          taxableAmount: qtn.taxableAmount,
          cgstTotal: isInterState ? 0 : qtn.gstTotal / 2,
          sgstTotal: isInterState ? 0 : qtn.gstTotal / 2,
          igstTotal: isInterState ? qtn.gstTotal : 0,
          totalTax: qtn.gstTotal,
          grandTotal: qtn.grandTotal,
          amountInWords: numberToIndianWords(qtn.grandTotal),
          paymentStatus: 'Pending',
          paymentTerms: qtn.paymentTerms,
          companyId: qtn.companyId || 'org-1',
          createdById: currentUser?.id,
          createdByName: currentUser?.name,
        };

        const created = await api.createTaxInvoice(newInv);
        setPreviewTaxInvoice(created);
      }
    } catch (e: any) {
      alert(`Error generating tax invoice: ${e.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-sky-600" />
            Commercial Quotation Generator & Proposals
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Auto-numbered proposals (AFM-QTN-2026-XXXX), GST 18% tax calculation, printable PDF templates, and order conversions
          </p>
        </div>

        <button
          onClick={() => {
            if (items.length === 0 && products.length > 0) {
              handleAddItem(products[0].id);
            }
            setShowCreateModal(true);
          }}
          className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> + Create Quotation
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2.5 items-center justify-between">
        <div className="flex flex-wrap gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search quotation #, customer, mobile..."
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
            <option value="all">All Quotation Statuses</option>
            <option value="Sent">Sent</option>
            <option value="Accepted">Accepted</option>
            <option value="Negotiation">Negotiation</option>
            <option value="Draft">Draft</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        <button
          onClick={loadData}
          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Quotations Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-3">Quotation Number</th>
                <th className="py-3 px-3">Customer & Contact</th>
                <th className="py-3 px-3">Date & Validity</th>
                <th className="py-3 px-3">Machine Items</th>
                <th className="py-3 px-3">Grand Total (INR)</th>
                <th className="py-3 px-3">Sales Officer</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
                    Loading quotations...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-rose-600 bg-rose-50/50">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
                    <p className="font-semibold">{error}</p>
                    <button
                      onClick={loadData}
                      className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 cursor-pointer"
                    >
                      Retry Loading Quotations
                    </button>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No quotations found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(qtn => (
                  <tr key={qtn.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-extrabold text-slate-900 font-mono text-sky-800">
                        {qtn.quotationNumber}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{qtn.customerName}</div>
                      <div className="text-[10px] text-slate-500">
                        Attn: {qtn.contactPerson} • {qtn.mobile}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="text-slate-700 font-mono">{qtn.date}</div>
                      <div className="text-[10px] text-slate-400">Valid: {qtn.validUntil}</div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="space-y-0.5 max-w-[200px] truncate">
                        {qtn.items.map(it => (
                          <div key={it.id} className="truncate text-slate-700 font-medium">
                            • {it.productName} ({it.quantity}x)
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono font-extrabold text-slate-950 text-sm">
                      ₹{qtn.grandTotal.toLocaleString('en-IN')}
                    </td>

                    <td className="py-3 px-3 text-slate-600 font-medium">
                      {qtn.salespersonName || 'Direct'}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-1 items-start">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            qtn.status === 'Accepted'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : qtn.status === 'Sent'
                              ? 'bg-sky-100 text-sky-800 border border-sky-200'
                              : qtn.status === 'Viewed'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : qtn.status === 'Rejected'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {qtn.status}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded border border-slate-200 font-bold">
                            v{qtn.version || 1}
                          </span>
                        </div>
                        {qtn.pipelineStage && (
                          <span className="text-[9px] font-semibold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                            {qtn.pipelineStage}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          onClick={() => setFollowUpQuote(qtn)}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded font-bold text-[11px] flex items-center gap-1 shadow-2xs"
                          title="1-Click Follow-Up Sequence"
                        >
                          <Mail className="w-3 h-3 text-amber-600" /> Follow-Up
                        </button>

                        <button
                          onClick={() => setNegotiationQuote(qtn)}
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 rounded font-bold text-[11px] flex items-center gap-1 shadow-2xs"
                          title="Negotiation, Objections & Revisions"
                        >
                          <Scale className="w-3 h-3 text-indigo-600" /> Negotiate
                        </button>

                        <button
                          onClick={() => setTimelineQuote(qtn)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                          title="Activity Timeline & Version History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setPreviewQuotation(qtn)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded font-semibold text-[11px] flex items-center gap-1 shadow-2xs"
                        >
                          <Eye className="w-3 h-3 text-sky-600" /> PDF
                        </button>

                        <button
                          onClick={() => handleGenerateTaxInvoiceFromQuote(qtn)}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded font-bold text-[11px] flex items-center gap-1 shadow-2xs"
                          title="Generate official printable GST Tax Invoice"
                        >
                          <Receipt className="w-3 h-3 text-emerald-600" /> Invoice
                        </button>

                        {qtn.convertedOrderId || qtn.status === 'Converted' ? (
                          <span className="px-2 py-1 bg-emerald-50 text-emerald-800 rounded font-bold text-[10px] flex items-center gap-1 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Converted
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setConvertingQtn(qtn);
                              setAdvancePaymentInput(Math.round(qtn.grandTotal * 0.3)); // 30% default advance
                            }}
                            className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 rounded font-bold text-[11px] flex items-center gap-1 shadow-2xs"
                            title="Convert quotation into production Sales Order"
                          >
                            <ShoppingBag className="w-3 h-3" /> Order
                          </button>
                        )}

                        <button
                          onClick={() => setQuotationToDelete(qtn)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Delete Quotation (Requires Admin Permission for non-admins)"
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

      {/* Convert to Order Modal */}
      {convertingQtn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5 text-emerald-700">
                <ShoppingBag className="w-5 h-5" /> Convert to Confirmed Order
              </h3>
              <button onClick={() => setConvertingQtn(null)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600">
              Converting quotation <strong className="font-mono text-slate-900">{convertingQtn.quotationNumber}</strong> for <strong>{convertingQtn.customerName}</strong> will create a production Sales Order and automatically reserve the machinery from available inventory.
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span>Total Order Value:</span>
                <span className="font-bold">₹{convertingQtn.grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Advance Payment Amount (INR)</label>
              <input
                type="number"
                value={advancePaymentInput}
                onChange={e => setAdvancePaymentInput(Number(e.target.value))}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Standard term: 30% advance on PO confirmation
              </span>
            </div>

            {advancePaymentInput > 0 && (
              <div className="grid grid-cols-2 gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Payment Method</label>
                  <select
                    value={paymentMethodInput}
                    onChange={e => setPaymentMethodInput(e.target.value)}
                    className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded text-xs"
                  >
                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Reference / UTR #</label>
                  <input
                    type="text"
                    value={referenceNumberInput}
                    onChange={e => setReferenceNumberInput(e.target.value)}
                    placeholder="UTR / Cheque No."
                    className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setConvertingQtn(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleConvertToOrder}
                disabled={convertingOrder}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
              >
                {convertingOrder ? 'Creating Order...' : 'Confirm Order & Reserve Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF View Modal */}
      {previewQuotation && settings && (
        <QuotationPDFModal
          quotation={previewQuotation}
          companySettings={settings}
          onClose={() => setPreviewQuotation(null)}
        />
      )}

      {/* Create Quotation Wizard Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-sky-600" />
                <h3 className="font-extrabold text-slate-900 text-base">Generate Official Commercial Quotation</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuotation} className="p-6 overflow-y-auto space-y-5">
              {/* Customer Selector */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">
                    Customer Information
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        checked={customerMode === 'existing'}
                        onChange={() => setCustomerMode('existing')}
                      />
                      Select Existing Customer
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer ml-3">
                      <input
                        type="radio"
                        checked={customerMode === 'manual'}
                        onChange={() => setCustomerMode('manual')}
                      />
                      New / Custom Buyer
                    </label>
                  </div>
                </div>

                {customerMode === 'existing' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Choose Customer Account</label>
                    <select
                      value={selectedCustomerId}
                      onChange={e => handleCustomerSelect(e.target.value)}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="">-- Choose Account --</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.companyName} ({c.city}, {c.state})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Company Name *</label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Person *</label>
                    <input
                      type="text"
                      required
                      value={contactPerson}
                      onChange={e => setContactPerson(e.target.value)}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Mobile Number *</label>
                    <input
                      type="text"
                      required
                      value={mobile}
                      onChange={e => setMobile(e.target.value)}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Machinery Items Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">Footwear Machinery Line Items ({items.length})</h4>
                  <div className="flex items-center gap-2">
                    <select
                      onChange={e => {
                        if (e.target.value) {
                          handleAddItem(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="text-xs bg-sky-50 border border-sky-300 text-sky-800 font-bold rounded-lg px-2.5 py-1.5"
                    >
                      <option value="">+ Add Machine from Catalogue</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} [{p.modelNumber}] — ₹{p.price.toLocaleString('en-IN')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                        <th className="p-2.5">Machine Details</th>
                        <th className="p-2.5 w-20">Qty</th>
                        <th className="p-2.5 w-28">Unit Price (INR)</th>
                        <th className="p-2.5 w-20">Disc %</th>
                        <th className="p-2.5 w-24">GST %</th>
                        <th className="p-2.5 text-right w-28">Total</th>
                        <th className="p-2.5 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, idx) => {
                        const itemSub = item.quantity * item.unitPrice;
                        const itemTaxable = itemSub - (itemSub * item.discountPercentage) / 100;
                        const itemTotal = itemTaxable + (itemTaxable * item.gstPercentage) / 100;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2.5">
                              <span className="font-extrabold text-slate-900 block">{item.productName}</span>
                              <span className="text-[10px] text-slate-400 font-mono">Model: {item.modelNumber}</span>
                            </td>
                            <td className="p-2.5">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => {
                                  const updated = [...items];
                                  updated[idx].quantity = Number(e.target.value);
                                  setItems(updated);
                                }}
                                className="w-16 p-1 bg-slate-50 border border-slate-200 rounded text-center font-mono font-bold"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="number"
                                value={item.unitPrice}
                                onChange={e => {
                                  const updated = [...items];
                                  updated[idx].unitPrice = Number(e.target.value);
                                  setItems(updated);
                                }}
                                className="w-24 p-1 bg-slate-50 border border-slate-200 rounded text-right font-mono"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={item.discountPercentage}
                                onChange={e => {
                                  const updated = [...items];
                                  updated[idx].discountPercentage = Number(e.target.value);
                                  setItems(updated);
                                }}
                                className="w-16 p-1 bg-slate-50 border border-slate-200 rounded text-center font-mono"
                              />
                            </td>
                            <td className="p-2.5 font-mono text-center text-slate-600">
                              {item.gstPercentage}%
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                              ₹{itemTotal.toLocaleString('en-IN')}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-rose-500 hover:text-rose-700"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Live Totals Calculation */}
                <div className="flex justify-end pt-2">
                  <div className="w-72 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span>₹{calculateSubtotal().toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Discount Total:</span>
                      <span className="text-emerald-700">- ₹{calculateDiscountTotal().toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Taxable Value:</span>
                      <span>₹{calculateTaxable().toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>GST (18%):</span>
                      <span>₹{calculateGST().toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-slate-950 border-t border-slate-200 pt-1.5 text-sky-800">
                      <span>Grand Total:</span>
                      <span>₹{calculateGrandTotal().toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Generate Official Quotation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Tax Invoice Preview Modal */}
      {previewTaxInvoice && settings && (
        <TaxInvoiceModal
          invoice={previewTaxInvoice}
          companySettings={settings}
          onClose={() => setPreviewTaxInvoice(null)}
        />
      )}

      {/* Permission Guard Modal for Deleting Quotation */}
      <AdminAuthModal
        isOpen={Boolean(quotationToDelete)}
        onClose={() => setQuotationToDelete(null)}
        onConfirm={handleConfirmDeleteQuotation}
        title="Delete Quotation"
        itemType="Quotation"
        itemName={quotationToDelete ? `${quotationToDelete.quotationNumber} (${quotationToDelete.customerName} - ₹${quotationToDelete.grandTotal.toLocaleString('en-IN')})` : ''}
        warningMessage="Deleting a quotation permanently removes pricing calculations, item line breakdowns, and attached terms."
      />

      {/* Post-Quote Pipeline Modals */}
      {followUpQuote && (
        <FollowUpSequenceModal
          quotation={followUpQuote}
          onClose={() => setFollowUpQuote(null)}
          onSuccess={() => {
            setFollowUpQuote(null);
            loadData();
          }}
        />
      )}

      {negotiationQuote && (
        <NegotiationModal
          quotation={negotiationQuote}
          onClose={() => setNegotiationQuote(null)}
          onSuccess={() => {
            setNegotiationQuote(null);
            loadData();
          }}
        />
      )}

      {timelineQuote && (
        <QuoteActivityTimelineModal
          quotation={timelineQuote}
          onClose={() => setTimelineQuote(null)}
        />
      )}
    </div>
  );
};
