import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Truck,
  CreditCard,
  CheckCircle2,
  Clock,
  X,
  IndianRupee,
  Receipt,
  Printer,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Order, Payment, TaxInvoice, CompanySettings, Quotation } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { TaxInvoiceModal } from './TaxInvoiceModal.tsx';
import { AdminAuthModal } from '../components/common/AdminAuthModal.tsx';
import { numberToIndianWords } from '../utils/formatters.ts';

export const OrdersView: React.FC = () => {
  const { canManageAccounts, activeCompanyId, currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<TaxInvoice | null>(null);

  // Permission Guard Delete State
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  // Record Payment Modal
  const [recordingPaymentForOrder, setRecordingPaymentForOrder] = useState<Order | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<any>('Bank Transfer');
  const [payRef, setPayRef] = useState('');
  const [payBank, setPayBank] = useState('HDFC Bank');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Delivery status update modal
  const [updatingDeliveryOrder, setUpdatingDeliveryOrder] = useState<Order | null>(null);
  const [newDeliveryStatus, setNewDeliveryStatus] = useState<any>('Ready for Dispatch');
  const [newOrderStatus, setNewOrderStatus] = useState<any>('Processing');

  // Convert Quotation Modal
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [quotationsList, setQuotationsList] = useState<Quotation[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [advancePayment, setAdvancePayment] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('Bank Transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [converting, setConverting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderData, setts] = await Promise.all([
        api.getOrders(),
        api.getSettings(),
      ]);
      setOrders(orderData);
      setSettings(setts.company);
    } catch (e: any) {
      console.error('Failed to load orders:', e);
      setError(e?.message || 'Failed to load orders from database.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      await api.deleteOrder(orderToDelete.id);
      setOrderToDelete(null);
      loadOrders();
    } catch (err: any) {
      alert(err.message || 'Failed to delete order');
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleOpenTaxInvoice = async (order: Order) => {
    try {
      const existingInvoices = await api.getTaxInvoices();
      const matched = existingInvoices.find(inv => inv.orderId === order.id || inv.orderNumber === order.orderNumber);
      if (matched) {
        setPreviewInvoice(matched);
      } else {
        // Construct Tax Invoice from Order
        const custList = await api.getCustomers();
        const cust = custList.find(c => c.id === order.customerId || c.companyName.toLowerCase() === order.customerName.toLowerCase());
        const custAddress = cust?.address || (cust?.city ? `${cust.city}, ${cust.state || ''}` : 'Factory Premises');
        const custState = (cust?.state || '').trim();
        const compState = (settings?.state || 'Haryana').trim();
        const isInterState = custState ? custState.toLowerCase() !== compState.toLowerCase() : false;
        const placeOfSupply = custState ? `${custState}${isInterState ? ' (Inter-State)' : ' (06)'}` : `${compState} (06)`;

        const processedItems = order.items.map((it, idx) => ({
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
          orderId: order.id,
          orderNumber: order.orderNumber,
          quotationNumber: order.quotationNumber,
          customerId: order.customerId || cust?.id || 'cust-direct',
          customerName: order.customerName,
          contactPerson: order.contactPerson || cust?.contactPerson,
          mobile: order.mobile || cust?.mobile,
          email: cust?.email || '',
          billingAddress: custAddress,
          shippingAddress: custAddress,
          customerGstin: cust?.gstNumber || '',
          customerPan: cust?.pan || '',
          placeOfSupply,
          stateCode: isInterState ? '99' : '06',
          isInterState,
          reverseCharge: false,
          transportMode: 'Surface Logistics Express',
          items: processedItems,
          subtotal: order.subtotal,
          discountTotal: 0,
          taxableAmount: order.subtotal,
          cgstTotal: isInterState ? 0 : (order.gstTotal || 0) / 2,
          sgstTotal: isInterState ? 0 : (order.gstTotal || 0) / 2,
          igstTotal: isInterState ? (order.gstTotal || 0) : 0,
          totalTax: order.gstTotal || 0,
          grandTotal: order.totalAmount,
          amountInWords: numberToIndianWords(order.totalAmount),
          paymentStatus: order.paymentStatus === 'Paid' ? 'Paid' : order.paymentStatus === 'Partially Paid' ? 'Partially Paid' : 'Pending',
          paymentTerms: 'Payment balance due prior to machine delivery / dispatch',
          companyId: order.companyId || activeCompanyId || 'org-1',
          createdById: currentUser?.id,
          createdByName: currentUser?.name,
        };

        const created = await api.createTaxInvoice(newInv);
        setPreviewInvoice(created);
      }
    } catch (e: any) {
      alert(`Error loading tax invoice: ${e.message}`);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordingPaymentForOrder) return;
    setSubmittingPayment(true);
    try {
      await api.createPayment({
        customerId: recordingPaymentForOrder.customerId,
        customerName: recordingPaymentForOrder.customerName,
        orderId: recordingPaymentForOrder.id,
        orderNumber: recordingPaymentForOrder.orderNumber,
        amount: Number(payAmount),
        paymentMethod: payMethod,
        referenceNumber: payRef || `TXN-${Date.now()}`,
        bank: payBank,
        notes: `Payment recorded against ${recordingPaymentForOrder.orderNumber}`,
      });
      setRecordingPaymentForOrder(null);
      loadOrders();
    } catch (err: any) {
      alert(`Payment error: ${err.message}`);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!updatingDeliveryOrder) return;
    try {
      await api.updateOrder(updatingDeliveryOrder.id, {
        deliveryStatus: newDeliveryStatus,
        orderStatus: newOrderStatus,
      });
      setUpdatingDeliveryOrder(null);
      loadOrders();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenConvertModal = async () => {
    try {
      const qList = await api.getQuotations();
      setQuotationsList(qList);
      const unconverted = qList.find(q => !q.convertedOrderId && q.status !== 'Converted');
      if (unconverted) {
        setSelectedQuoteId(unconverted.id);
        setAdvancePayment(Math.round((unconverted.grandTotal || 0) * 0.3));
      } else if (qList.length > 0) {
        setSelectedQuoteId(qList[0].id);
        setAdvancePayment(Math.round((qList[0].grandTotal || 0) * 0.3));
      }
      setShowConvertModal(true);
    } catch (err: any) {
      alert(`Could not load quotations: ${err.message}`);
    }
  };

  const handleExecuteConvert = async () => {
    if (!selectedQuoteId) return;
    setConverting(true);
    try {
      const res = await api.convertQuotationToOrder(selectedQuoteId, {
        advancePayment: Number(advancePayment) || 0,
        paymentMethod,
        referenceNumber,
      });
      setShowConvertModal(false);
      alert(`Successfully generated Sales Order #${res.order.orderNumber} from quote!`);
      loadOrders();
    } catch (err: any) {
      alert(`Failed to convert quotation: ${err.message}`);
    } finally {
      setConverting(false);
    }
  };

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch =
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.mobile.includes(q);
    const matchStatus = statusFilter === 'all' || o.orderStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const selectedQuote = quotationsList.find(q => q.id === selectedQuoteId);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-sky-600" />
            Machine Sales Orders & Factory Dispatch
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Confirmed client orders, advance payments, balance tracking, and dispatch status
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleOpenConvertModal}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            + Convert Quote to Order
          </button>
          <button
            onClick={loadOrders}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
            title="Refresh Orders"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2.5 items-center justify-between">
        <div className="flex flex-wrap gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search order #, customer, mobile..."
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
            <option value="all">All Order Statuses</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Processing">Processing / Assembly</option>
            <option value="Ready for Dispatch">Ready for Dispatch</option>
            <option value="Delivered">Delivered</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-3">Order Number</th>
                <th className="py-3 px-3">Customer & Contact</th>
                <th className="py-3 px-3">Order Date</th>
                <th className="py-3 px-3">Machines Ordered</th>
                <th className="py-3 px-3">Total Value</th>
                <th className="py-3 px-3">Advance Paid</th>
                <th className="py-3 px-3">Balance Due</th>
                <th className="py-3 px-3">Delivery Status</th>
                <th className="py-3 px-3">Payment</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
                    Loading orders...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-rose-600 bg-rose-50/50">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
                    <p className="font-semibold">{error}</p>
                    <button
                      onClick={loadOrders}
                      className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 cursor-pointer"
                    >
                      Retry Loading Orders
                    </button>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <ShoppingBag className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No orders recorded</p>
                  </td>
                </tr>
              ) : (
                filtered.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-slate-900 font-mono text-purple-800">
                          {order.orderNumber}
                        </span>
                        {order.stockWarning && (
                          <span
                            title="Stock Warning: One or more machines had insufficient stock upon conversion"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold"
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> Stock Shortage
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{order.customerName}</div>
                      <div className="text-[10px] text-slate-500">{order.mobile}</div>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-600">{order.orderDate}</td>

                    <td className="py-3 px-3">
                      <div className="space-y-0.5 max-w-[200px] truncate">
                        {order.items.map(it => (
                          <div key={it.id} className="truncate text-slate-700 font-medium">
                            • {it.productName} ({it.quantity}x)
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono font-extrabold text-slate-900">
                      ₹{order.totalAmount.toLocaleString('en-IN')}
                    </td>

                    <td className="py-3 px-3 font-mono text-emerald-700 font-bold">
                      ₹{order.advancePayment.toLocaleString('en-IN')}
                    </td>

                    <td className="py-3 px-3 font-mono text-amber-700 font-bold">
                      ₹{order.balancePayment.toLocaleString('en-IN')}
                    </td>

                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        <Truck className="w-3 h-3 text-slate-400" />
                        {order.deliveryStatus}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        order.paymentStatus === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : order.paymentStatus === 'Partially Paid'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {order.paymentStatus}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenTaxInvoice(order)}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded font-bold text-[11px] flex items-center gap-1 border border-emerald-200"
                          title="Generate or Print GST Tax Invoice"
                        >
                          <Receipt className="w-3 h-3 text-emerald-600" />
                          <span>Invoice</span>
                        </button>
                        <button
                          onClick={() => {
                            setUpdatingDeliveryOrder(order);
                            setNewDeliveryStatus(order.deliveryStatus);
                            setNewOrderStatus(order.orderStatus);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[11px]"
                        >
                          Status
                        </button>
                        {order.balancePayment > 0 && canManageAccounts && (
                          <button
                            onClick={() => {
                              setRecordingPaymentForOrder(order);
                              setPayAmount(order.balancePayment);
                              setPayRef(`RTGS-${Date.now().toString().slice(-6)}`);
                            }}
                            className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded font-bold text-[11px]"
                          >
                            Pay
                          </button>
                        )}
                        <button
                          onClick={() => setOrderToDelete(order)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Delete Order (Requires Admin Permission for non-admins)"
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

      {/* Record Payment Dialog */}
      {recordingPaymentForOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5 text-emerald-700">
                <CreditCard className="w-5 h-5" /> Record Payment for {recordingPaymentForOrder.orderNumber}
              </h3>
              <button onClick={() => setRecordingPaymentForOrder(null)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Payment Amount (INR) *</label>
                <input
                  type="number"
                  required
                  value={payAmount}
                  onChange={e => setPayAmount(Number(e.target.value))}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value as any)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Bank Account</label>
                  <input
                    type="text"
                    value={payBank}
                    onChange={e => setPayBank(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">UTR / Reference Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HDFCR52026092600192"
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRecordingPaymentForOrder(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
                >
                  {submittingPayment ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Order & Delivery Status Modal */}
      {updatingDeliveryOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full space-y-4 text-xs">
            <h3 className="font-extrabold text-slate-900 text-sm">
              Update Status: {updatingDeliveryOrder.orderNumber}
            </h3>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Order Status</label>
              <select
                value={newOrderStatus}
                onChange={e => setNewOrderStatus(e.target.value)}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <option value="Confirmed">Confirmed</option>
                <option value="Processing">Processing / In Assembly</option>
                <option value="Ready for Dispatch">Ready for Dispatch</option>
                <option value="Dispatched">Dispatched from Factory</option>
                <option value="Delivered">Delivered</option>
                <option value="Completed">Completed & Commissioned</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Delivery Status</label>
              <select
                value={newDeliveryStatus}
                onChange={e => setNewDeliveryStatus(e.target.value)}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <option value="Pending">Pending Assembly</option>
                <option value="In Transit">In Transit (Transport)</option>
                <option value="Delivered">Delivered to Factory Site</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setUpdatingDeliveryOrder(null)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStatus}
                className="px-4 py-1.5 bg-sky-600 text-white font-bold rounded-lg"
              >
                Save Status
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Tax Invoice Modal */}
      {previewInvoice && settings && (
        <TaxInvoiceModal
          invoice={previewInvoice}
          companySettings={settings}
          onClose={() => setPreviewInvoice(null)}
        />
      )}

      {/* Permission Guard Modal for Deleting Order */}
      <AdminAuthModal
        isOpen={Boolean(orderToDelete)}
        onClose={() => setOrderToDelete(null)}
        onConfirm={handleConfirmDeleteOrder}
        title="Delete Confirmed Order"
        itemType="Order"
        itemName={orderToDelete ? `${orderToDelete.orderNumber} (${orderToDelete.customerName} - ₹${orderToDelete.totalAmount.toLocaleString('en-IN')})` : ''}
        warningMessage="Deleting a confirmed order permanently cancels manufacturing queue and production ledger entries."
      />

      {/* Convert Quotation to Order Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full flex flex-col max-h-[90vh] overflow-hidden text-xs">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-emerald-300">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Convert Quotation to Sales Order</h3>
                  <p className="text-[11px] text-emerald-200 mt-0.5">
                    Generate an official production order &amp; reserve machinery inventory
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConvertModal(false)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800/40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Select Quotation to Convert
                </label>
                <select
                  value={selectedQuoteId}
                  onChange={e => {
                    const qId = e.target.value;
                    setSelectedQuoteId(qId);
                    const q = quotationsList.find(item => item.id === qId);
                    if (q) {
                      setAdvancePayment(Math.round((q.grandTotal || 0) * 0.3));
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-emerald-600"
                >
                  <option value="">-- Choose a Commercial Quotation --</option>
                  {quotationsList.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.quotationNumber} — {q.customerName} (₹{q.grandTotal?.toLocaleString('en-IN')}) [{q.status}]
                    </option>
                  ))}
                </select>
              </div>

              {selectedQuote ? (
                <div className="space-y-4">
                  {/* Selected Quote Details Summary */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{selectedQuote.customerName}</h4>
                        <p className="text-slate-500 text-[11px]">
                          Contact: {selectedQuote.contactPerson} • {selectedQuote.mobile}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded font-mono font-bold text-[10px] border border-sky-200">
                        {selectedQuote.quotationNumber}
                      </span>
                    </div>

                    <div className="border-t border-slate-200 pt-2">
                      <div className="text-[11px] font-semibold text-slate-600 mb-1">Machinery Line Items:</div>
                      <div className="space-y-1">
                        {selectedQuote.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-slate-700">
                            <span className="truncate max-w-[340px]">
                              • {it.productName} ({it.quantity}x)
                            </span>
                            <span className="font-mono font-bold">₹{it.totalAmount?.toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-sm font-extrabold text-slate-950">
                      <span>Total Quoted Value:</span>
                      <span className="text-emerald-700 font-mono">₹{selectedQuote.grandTotal?.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Advance Payment and Financials */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Advance Payment (INR)
                      </label>
                      <input
                        type="number"
                        value={advancePayment}
                        onChange={e => setAdvancePayment(Number(e.target.value))}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Default 30% advance for manufacturing reservation
                      </span>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Balance Remaining (INR)
                      </label>
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-mono font-bold text-amber-900">
                        ₹{Math.max(0, (selectedQuote.grandTotal || 0) - (advancePayment || 0)).toLocaleString('en-IN')}
                      </div>
                      <span className="text-[10px] text-amber-700/80 mt-0.5 block">
                        Payable prior to final dispatch
                      </span>
                    </div>
                  </div>

                  {/* Payment Method & Reference */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Payment Method
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={e => setPaymentMethod(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                      >
                        <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                        <option value="UPI">UPI</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Cash">Cash</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        UTR / Transaction Ref #
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. UTR12345678 or Cheque 998877"
                        value={referenceNumber}
                        onChange={e => setReferenceNumber(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
                  Please pick a quotation from the dropdown above to inspect line items and convert to order.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowConvertModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteConvert}
                disabled={!selectedQuoteId || converting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs flex items-center gap-2"
              >
                {converting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm &amp; Generate Sales Order
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
