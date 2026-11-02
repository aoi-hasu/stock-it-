import React, { useState, useEffect } from 'react';
import {
  X,
  ShoppingBag,
  FileSpreadsheet,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  CreditCard,
  Truck,
  Plus,
  Trash2,
  FileText,
  Building,
  User,
  Phone,
  Mail,
  Sparkles,
} from 'lucide-react';
import { Quotation, Product, Customer, Order, CompanySettings, TaxInvoice } from '../../types/index.ts';
import { api } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { numberToIndianWords } from '../../utils/formatters.ts';

interface GenerateSalesOrderModalProps {
  preselectedQuotation?: Quotation | null;
  onClose: () => void;
  onSuccess: (order: Order) => void;
}

export const GenerateSalesOrderModal: React.FC<GenerateSalesOrderModalProps> = ({
  preselectedQuotation,
  onClose,
  onSuccess,
}) => {
  const { currentUser, users, activeCompanyId } = useAuth();
  const [mode, setMode] = useState<'from_quotation' | 'direct'>(
    preselectedQuotation ? 'from_quotation' : 'from_quotation'
  );

  // Available data
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Selected quotation
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>(
    preselectedQuotation?.id || ''
  );
  const [selectedQuote, setSelectedQuote] = useState<Quotation | null>(
    preselectedQuotation || null
  );

  // Order Details
  const [orderNumber, setOrderNumber] = useState<string>(
    `SO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [orderDate, setOrderDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>(
    new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  // Customer info (for direct mode or overridden)
  const [customerName, setCustomerName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [salespersonId, setSalespersonId] = useState(currentUser?.id || '');

  // Direct line items
  const [lineItems, setLineItems] = useState<
    {
      id: string;
      productId: string;
      productName: string;
      modelNumber: string;
      quantity: number;
      unitPrice: number;
      discountPercentage: number;
      gstPercentage: number;
    }[]
  >([]);

  // Advance Payment
  const [advancePayment, setAdvancePayment] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'UPI' | 'Cheque' | 'Cash' | 'Card'>('Bank Transfer');
  const [referenceNumber, setReferenceNumber] = useState<string>(
    `ADV-${Date.now().toString().slice(-6)}`
  );
  const [orderNotes, setOrderNotes] = useState<string>(
    'Confirmed sales order for footwear machinery manufacturing and technical commissioning.'
  );

  // Automated workflows
  const [autoGenerateInvoice, setAutoGenerateInvoice] = useState(true);
  const [autoSendOnboarding, setAutoSendOnboarding] = useState(true);
  const [reserveInventory, setReserveInventory] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<TaxInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load available quotations, products, and customers
  useEffect(() => {
    const fetchData = async () => {
      setLoadingInitial(true);
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

        if (preselectedQuotation) {
          bindQuoteToForm(preselectedQuotation);
        } else if (qList.length > 0) {
          // Select first available quotation
          bindQuoteToForm(qList[0]);
        }
      } catch (err: any) {
        console.error('Failed to load initial order data', err);
      } finally {
        setLoadingInitial(false);
      }
    };
    fetchData();
  }, [preselectedQuotation]);

  const bindQuoteToForm = (q: Quotation) => {
    setSelectedQuoteId(q.id);
    setSelectedQuote(q);
    setCustomerName(q.customerName || '');
    setContactPerson(q.contactPerson || '');
    setMobile(q.mobile || '');
    setEmail(q.email || '');
    setBillingAddress(q.billingAddress || '');
    setShippingAddress(q.shippingAddress || q.billingAddress || '');
    setSalespersonId(q.salespersonId || currentUser?.id || '');
    // Standard 30% advance on quote grand total
    const defaultAdvance = Math.round((q.grandTotal || 0) * 0.3);
    setAdvancePayment(defaultAdvance);
  };

  const handleQuoteChange = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    const q = quotations.find(item => item.id === quoteId);
    if (q) {
      bindQuoteToForm(q);
    }
  };

  // Add line item in direct mode
  const handleAddDirectItem = () => {
    if (products.length === 0) return;
    const p = products[0];
    setLineItems(prev => [
      ...prev,
      {
        id: `it-${Date.now()}-${prev.length}`,
        productId: p.id,
        productName: p.name,
        modelNumber: p.modelNumber || 'IND-MCH',
        quantity: 1,
        unitPrice: p.price || 500000,
        discountPercentage: 0,
        gstPercentage: 18,
      },
    ]);
  };

  // Calculations
  const calculateTotals = () => {
    if (mode === 'from_quotation' && selectedQuote) {
      const subtotal = selectedQuote.subtotal || 0;
      const gstTotal = selectedQuote.gstTotal || 0;
      const grandTotal = selectedQuote.grandTotal || 0;
      const balance = Math.max(0, grandTotal - advancePayment);
      return { subtotal, gstTotal, grandTotal, balance };
    }

    let subtotal = 0;
    lineItems.forEach(item => {
      const discounted = item.unitPrice * (1 - (item.discountPercentage || 0) / 100);
      subtotal += discounted * item.quantity;
    });
    const gstTotal = Math.round(subtotal * 0.18);
    const grandTotal = Math.round(subtotal + gstTotal);
    const balance = Math.max(0, grandTotal - advancePayment);
    return { subtotal, gstTotal, grandTotal, balance };
  };

  const { subtotal, gstTotal, grandTotal, balance } = calculateTotals();

  // Submission
  const handleGenerateSalesOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'from_quotation' && !selectedQuote) {
      setError('Please select a valid quotation to generate the sales order.');
      return;
    }

    if (mode === 'direct' && lineItems.length === 0) {
      setError('Please add at least one machinery item to the sales order.');
      return;
    }

    if (!customerName.trim()) {
      setError('Please enter the customer company name.');
      return;
    }

    setSubmitting(true);
    try {
      let finalOrder: Order;

      // 1. Generate Order
      if (mode === 'from_quotation' && selectedQuote) {
        // Use convertQuotationToOrder API with advance payment and payment method
        const res = await api.convertQuotationToOrder(selectedQuote.id, {
          advancePayment,
          paymentMethod,
          referenceNumber,
        });
        finalOrder = res.order;

        // Ensure order details match form values
        finalOrder = await api.updateOrder(finalOrder.id, {
          orderNumber,
          notes: `${orderNotes} | Delivery Target: ${expectedDeliveryDate}`,
        });
      } else {
        // Direct order creation
        const mappedItems = lineItems.map((item, idx) => {
          const discounted = item.unitPrice * (1 - (item.discountPercentage || 0) / 100);
          const taxable = discounted * item.quantity;
          const gst = Math.round(taxable * 0.18);
          return {
            id: `ord-it-${Date.now()}-${idx}`,
            productId: item.productId,
            productName: item.productName,
            modelNumber: item.modelNumber,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercentage: item.discountPercentage,
            taxableAmount: taxable,
            gstPercentage: 18,
            gstAmount: gst,
            totalAmount: taxable + gst,
          };
        });

        finalOrder = await api.createOrder({
          orderNumber,
          customerId: `cust-${Date.now()}`,
          customerName,
          contactPerson: contactPerson || customerName,
          mobile: mobile || '9800000000',
          orderDate,
          salespersonId,
          salespersonName: users.find(u => u.id === salespersonId)?.name || 'Direct Sales',
          items: mappedItems,
          subtotal,
          gstTotal,
          totalAmount: grandTotal,
          advancePayment,
          balancePayment: balance,
          deliveryStatus: 'Pending',
          paymentStatus: advancePayment >= grandTotal ? 'Paid' : advancePayment > 0 ? 'Partially Paid' : 'Pending',
          orderStatus: 'Confirmed',
          notes: `${orderNotes} | Target Delivery: ${expectedDeliveryDate}`,
          companyId: activeCompanyId || 'org-1',
        });
      }

      // 2. Auto-Generate initial Tax Invoice if checked
      let invoiceCreated: TaxInvoice | null = null;
      if (autoGenerateInvoice) {
        try {
          const invNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
          const invItems = (finalOrder.items || []).map((it, idx) => ({
            id: `inv-it-${Date.now()}-${idx}`,
            productId: it.productId,
            productName: it.productName,
            modelNumber: it.modelNumber,
            quantity: it.quantity,
            unit: 'Unit',
            unitPrice: it.unitPrice,
            discountPercentage: it.discountPercentage || 0,
            taxableAmount: it.taxableAmount,
            gstPercentage: it.gstPercentage || 18,
            cgstAmount: Math.round(it.gstAmount / 2),
            sgstAmount: Math.round(it.gstAmount / 2),
            igstAmount: 0,
            totalAmount: it.totalAmount,
          }));

          invoiceCreated = await api.createTaxInvoice({
            invoiceNumber: invNumber,
            invoiceDate: orderDate,
            dueDate: expectedDeliveryDate,
            orderId: finalOrder.id,
            orderNumber: finalOrder.orderNumber,
            quotationId: selectedQuote?.id,
            quotationNumber: selectedQuote?.quotationNumber,
            customerId: finalOrder.customerId,
            customerName: finalOrder.customerName,
            contactPerson: finalOrder.contactPerson,
            mobile: finalOrder.mobile,
            email: email || selectedQuote?.email || '',
            billingAddress: billingAddress || 'Factory Premises',
            shippingAddress: shippingAddress || billingAddress || 'Factory Premises',
            placeOfSupply: 'State Intra-Sale',
            stateCode: '06',
            isInterState: false,
            reverseCharge: false,
            items: invItems,
            subtotal: finalOrder.subtotal,
            discountTotal: 0,
            taxableAmount: finalOrder.subtotal,
            cgstTotal: Math.round(finalOrder.gstTotal / 2),
            sgstTotal: Math.round(finalOrder.gstTotal / 2),
            igstTotal: 0,
            totalTax: finalOrder.gstTotal,
            grandTotal: finalOrder.totalAmount,
            paymentStatus: advancePayment >= finalOrder.totalAmount ? 'Paid' : advancePayment > 0 ? 'Partially Paid' : 'Pending',
            paymentTerms: 'Balance due prior to factory dispatch',
            notes: `Official Tax Invoice generated for Sales Order ${finalOrder.orderNumber}`,
          });
          setCreatedInvoice(invoiceCreated);
        } catch (invErr) {
          console.warn('Failed to auto-create tax invoice:', invErr);
        }
      }

      // 3. Log communication if checked
      if (autoSendOnboarding) {
        try {
          await api.createCommunication({
            entityType: 'customer',
            entityId: finalOrder.customerId,
            entityName: finalOrder.customerName,
            userId: currentUser?.id || 'system',
            userName: currentUser?.name || 'Sales Desk',
            timestamp: new Date().toISOString(),
            type: 'Email',
            direction: 'Outbound',
            message: `[Sales Order Confirmed: #${finalOrder.orderNumber}] Dear ${finalOrder.contactPerson || finalOrder.customerName}, your sales order has been generated and queued for factory production. Total: ₹${finalOrder.totalAmount.toLocaleString('en-IN')}, Advance: ₹${finalOrder.advancePayment.toLocaleString('en-IN')}.`,
          });
        } catch {
          // Non-blocking
        }
      }

      setCreatedOrder(finalOrder);
      onSuccess(finalOrder);
    } catch (err: any) {
      console.error('Order generation error:', err);
      setError(err?.message || 'Failed to generate sales order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full my-6 text-xs flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-sky-900 via-sky-800 to-indigo-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-xs">
              <ShoppingBag className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                Generate Official Sales Order
              </h2>
              <p className="text-[11px] text-sky-200">
                Execute client confirmation, allocate factory machinery inventory, and generate invoice
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Confirmation State */}
        {createdOrder ? (
          <div className="p-6 sm:p-8 space-y-6 text-center max-w-lg mx-auto">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900">
                Sales Order Generated Successfully!
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Order <strong className="font-mono text-sky-800">{createdOrder.orderNumber}</strong> for <strong>{createdOrder.customerName}</strong> is confirmed.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Order Number:</span>
                <span className="font-mono font-bold text-slate-900">{createdOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Order Amount:</span>
                <span className="font-mono font-bold text-slate-900">₹{createdOrder.totalAmount?.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Advance Received:</span>
                <span className="font-mono font-bold text-emerald-700">₹{createdOrder.advancePayment?.toLocaleString('en-IN')} ({paymentMethod})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Balance Pending:</span>
                <span className="font-mono font-bold text-slate-900">₹{createdOrder.balancePayment?.toLocaleString('en-IN')}</span>
              </div>
              {createdInvoice && (
                <div className="flex justify-between border-t border-slate-200 pt-2 text-emerald-800 font-medium">
                  <span>Attached Tax Invoice:</span>
                  <span className="font-mono font-bold">{createdInvoice.invoiceNumber}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow-sm transition"
              >
                Done & Return to Orders List
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerateSalesOrder} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Mode Switcher */}
            <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 max-w-md">
              <button
                type="button"
                onClick={() => setMode('from_quotation')}
                className={`flex-1 py-1.5 px-3 rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                  mode === 'from_quotation'
                    ? 'bg-white text-sky-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                From Existing Quotation
              </button>

              <button
                type="button"
                onClick={() => setMode('direct')}
                className={`flex-1 py-1.5 px-3 rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                  mode === 'direct'
                    ? 'bg-white text-sky-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Direct Custom Order
              </button>
            </div>

            {/* Mode 1: From Quotation Selector */}
            {mode === 'from_quotation' ? (
              <div className="p-4 bg-sky-50/60 border border-sky-100 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-sky-900 uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-sky-600" />
                    Select Active Quotation to Convert
                  </label>
                  <span className="text-[11px] text-sky-700">
                    {quotations.length} available quotes in system
                  </span>
                </div>

                <select
                  value={selectedQuoteId}
                  onChange={e => handleQuoteChange(e.target.value)}
                  className="w-full p-2.5 bg-white border border-sky-200 rounded-xl text-xs font-medium text-slate-800 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                >
                  <option value="">-- Choose Quotation --</option>
                  {quotations.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.quotationNumber} — {q.customerName} (₹{q.grandTotal?.toLocaleString('en-IN')}) • Status: {q.status}
                    </option>
                  ))}
                </select>

                {selectedQuote && (
                  <div className="bg-white p-3 rounded-xl border border-sky-200/80 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-mono font-bold text-sky-900 text-xs">
                          {selectedQuote.quotationNumber} (v{selectedQuote.version || 1})
                        </span>
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          {selectedQuote.customerName}
                        </h4>
                      </div>
                      <span className="text-right">
                        <span className="text-[10px] text-slate-400 block">Total Quoted Value</span>
                        <span className="text-sm font-extrabold font-mono text-slate-900">
                          ₹{selectedQuote.grandTotal?.toLocaleString('en-IN')}
                        </span>
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 space-y-1">
                      <p>
                        <strong>Machinery Items:</strong>{' '}
                        {selectedQuote.items?.map(it => `${it.productName} (${it.quantity}x)`).join(', ')}
                      </p>
                      <p>
                        <strong>Contact:</strong> {selectedQuote.contactPerson} • {selectedQuote.mobile} • {selectedQuote.email}
                      </p>
                      <p>
                        <strong>Payment Terms:</strong> {selectedQuote.paymentTerms || '30% Advance on confirmation'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Mode 2: Direct Customer & Items Form */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Customer Company Name *</label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="e.g. Acme Footwear Industries"
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Contact Person</label>
                    <input
                      type="text"
                      value={contactPerson}
                      onChange={e => setContactPerson(e.target.value)}
                      placeholder="e.g. Ramesh Sharma (Plant Manager)"
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Mobile Number</label>
                    <input
                      type="text"
                      value={mobile}
                      onChange={e => setMobile(e.target.value)}
                      placeholder="e.g. 9811223344"
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="e.g. procurement@acme.com"
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Delivery & Factory Address</label>
                    <input
                      type="text"
                      value={billingAddress}
                      onChange={e => {
                        setBillingAddress(e.target.value);
                        setShippingAddress(e.target.value);
                      }}
                      placeholder="e.g. Plot 42, Sector 18, Industrial Area, Gurugram, Haryana"
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>

                {/* Direct Line Items Table */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                      Machinery Line Items
                    </h4>
                    <button
                      type="button"
                      onClick={handleAddDirectItem}
                      className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Machinery Item
                    </button>
                  </div>

                  {lineItems.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-slate-300 rounded-xl bg-white text-slate-400 text-xs">
                      No machinery added yet. Click &ldquo;Add Machinery Item&rdquo; above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lineItems.map((item, idx) => (
                        <div key={item.id} className="p-3 bg-white border border-slate-200 rounded-xl grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <label className="text-[9px] font-bold text-slate-400">Machine Product</label>
                            <select
                              value={item.productId}
                              onChange={e => {
                                const prod = products.find(p => p.id === e.target.value);
                                if (prod) {
                                  const updated = [...lineItems];
                                  updated[idx] = {
                                    ...updated[idx],
                                    productId: prod.id,
                                    productName: prod.name,
                                    modelNumber: prod.modelNumber || 'IND-MCH',
                                    unitPrice: prod.price || updated[idx].unitPrice,
                                  };
                                  setLineItems(updated);
                                }
                              }}
                              className="w-full p-1.5 border border-slate-200 rounded text-xs font-semibold"
                            >
                              {products.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.modelNumber})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-span-2">
                            <label className="text-[9px] font-bold text-slate-400">Qty</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => {
                                const updated = [...lineItems];
                                updated[idx].quantity = Math.max(1, Number(e.target.value));
                                setLineItems(updated);
                              }}
                              className="w-full p-1.5 border border-slate-200 rounded text-xs font-mono font-bold"
                            />
                          </div>

                          <div className="col-span-3">
                            <label className="text-[9px] font-bold text-slate-400">Unit Price (INR)</label>
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={e => {
                                const updated = [...lineItems];
                                updated[idx].unitPrice = Number(e.target.value);
                                setLineItems(updated);
                              }}
                              className="w-full p-1.5 border border-slate-200 rounded text-xs font-mono font-bold"
                            />
                          </div>

                          <div className="col-span-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Order Administration & Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Sales Order Number</label>
                <input
                  type="text"
                  required
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                  className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Order Date</label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                  className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Expected Dispatch / Delivery</label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={e => setExpectedDeliveryDate(e.target.value)}
                  className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            {/* Financials & Advance Payment Calculation */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                Commercial Terms & Advance Payment
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-white border border-slate-200 rounded-xl text-center">
                <div>
                  <span className="text-[10px] text-slate-400 block">Subtotal</span>
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    ₹{subtotal.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">GST (18%)</span>
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    ₹{gstTotal.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Grand Total</span>
                  <span className="font-mono font-extrabold text-sky-900 text-sm">
                    ₹{grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Balance Due</span>
                  <span className="font-mono font-extrabold text-rose-700 text-sm">
                    ₹{balance.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Advance input and preset buttons */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">
                    Advance Payment Received (INR)
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAdvancePayment(Math.round(grandTotal * 0.3))}
                      className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded text-[10px] font-bold hover:bg-sky-100"
                    >
                      30% (Standard)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdvancePayment(Math.round(grandTotal * 0.5))}
                      className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded text-[10px] font-bold hover:bg-sky-100"
                    >
                      50% Advance
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdvancePayment(grandTotal)}
                      className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold hover:bg-emerald-100"
                    >
                      100% Full Payment
                    </button>
                  </div>
                </div>

                <input
                  type="number"
                  min="0"
                  max={grandTotal}
                  value={advancePayment}
                  onChange={e => setAdvancePayment(Number(e.target.value))}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900"
                />
              </div>

              {/* Payment method & Transaction reference */}
              {advancePayment > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as any)}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="Bank Transfer">Bank Transfer (NEFT / RTGS)</option>
                      <option value="UPI">UPI / Digital Gateway</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">UTR / Reference Number</label>
                    <input
                      type="text"
                      value={referenceNumber}
                      onChange={e => setReferenceNumber(e.target.value)}
                      placeholder="e.g. HDFC987654321"
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Automated Actions Checkboxes */}
            <div className="p-3.5 bg-sky-50 border border-sky-200/80 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-sky-900 uppercase tracking-wider block">
                Automated Pipeline Triggers on Sales Order Generation
              </span>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium text-xs">
                <input
                  type="checkbox"
                  checked={autoGenerateInvoice}
                  onChange={e => setAutoGenerateInvoice(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span className="flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                  Automatically generate initial GST Tax Invoice with payment receipt
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium text-xs">
                <input
                  type="checkbox"
                  checked={autoSendOnboarding}
                  onChange={e => setAutoSendOnboarding(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-sky-600" />
                  Send client onboarding welcome confirmation and factory dispatch schedule
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium text-xs">
                <input
                  type="checkbox"
                  checked={reserveInventory}
                  onChange={e => setReserveInventory(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-indigo-600" />
                  Reserve machinery inventory units to protect against stockouts
                </span>
              </label>
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-semibold text-xs"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-sm transition disabled:opacity-50"
              >
                <ShoppingBag className="w-4 h-4" />
                {submitting ? 'Generating Sales Order...' : 'Generate Confirmed Sales Order'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
