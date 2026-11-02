import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  RefreshCw,
  IndianRupee,
  Building,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { Payment, Customer, Order } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';

export const PaymentsView: React.FC = () => {
  const { currentUser, canManageAccounts } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    orderId: '',
    orderNumber: '',
    amount: 100000,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Bank Transfer',
    referenceNumber: '',
    bank: 'HDFC Bank',
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [pList, cList, oList] = await Promise.all([
        api.getPayments(),
        api.getCustomers(),
        api.getOrders(),
      ]);
      setPayments(pList);
      setCustomers(cList);
      setOrders(oList);
      if (cList.length > 0 && !form.customerId) {
        setForm(prev => ({
          ...prev,
          customerId: cList[0].id,
          customerName: cList[0].companyName,
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

  const totalCollected = payments.reduce((acc, p) => acc + p.amount, 0);
  const totalOutstanding = orders.reduce((acc, o) => acc + o.balancePayment, 0);

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const c = customers.find(cust => cust.id === form.customerId);
      const o = orders.find(ord => ord.id === form.orderId);
      await api.createPayment({
        ...form,
        customerName: c?.companyName || form.customerName,
        orderNumber: o?.orderNumber || undefined,
        recordedBy: currentUser?.name || 'Accounts Desk',
      });
      setShowAddModal(false);
      setForm({
        customerId: customers[0]?.id || '',
        customerName: customers[0]?.companyName || '',
        orderId: '',
        orderNumber: '',
        amount: 100000,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'Bank Transfer',
        referenceNumber: '',
        bank: 'HDFC Bank',
        notes: '',
      });
      loadData();
    } catch (err: any) {
      alert(`Payment recording error: ${err.message}`);
    }
  };

  const filtered = payments.filter(p => {
    const q = search.toLowerCase();
    return (
      p.customerName.toLowerCase().includes(q) ||
      p.referenceNumber.toLowerCase().includes(q) ||
      (p.orderNumber && p.orderNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-sky-600" />
            Customer Payments & Accounts Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time receipt reconciliation across Bank Transfers (NEFT/RTGS), Cheques, UPI, and order balances
          </p>
        </div>

        {canManageAccounts && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> + Record Customer Payment
          </button>
        )}
      </div>

      {/* KPI Balances */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Collected Payments</span>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">
            ₹{totalCollected.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Total Outstanding Balances</span>
          <p className="text-2xl font-extrabold text-amber-700 mt-1 font-mono">
            ₹{totalOutstanding.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Recorded Receipts</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">
            {payments.length} Transactions
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search customer, UTR / reference, order #..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
          />
        </div>
        <button
          onClick={loadData}
          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Order Number</th>
                <th className="py-3 px-3">Amount (INR)</th>
                <th className="py-3 px-3">Method</th>
                <th className="py-3 px-3">Reference / UTR #</th>
                <th className="py-3 px-3">Bank</th>
                <th className="py-3 px-3">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
                    Loading payment records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <CreditCard className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No payment records found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(pay => (
                  <tr key={pay.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-600">{pay.paymentDate}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">{pay.customerName}</td>
                    <td className="py-3 px-3 font-mono text-purple-700 font-semibold">
                      {pay.orderNumber || '-'}
                    </td>
                    <td className="py-3 px-3 font-mono font-extrabold text-emerald-700 text-sm">
                      ₹{pay.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {pay.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700 font-semibold">
                      {pay.referenceNumber}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{pay.bank || 'HDFC Bank'}</td>
                    <td className="py-3 px-3 text-slate-500">{pay.recordedBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Record Customer Payment</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePayment} className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Customer Account *</label>
                <select
                  value={form.customerId}
                  onChange={e => {
                    const c = customers.find(cust => cust.id === e.target.value);
                    setForm({ ...form, customerId: e.target.value, customerName: c?.companyName || '' });
                  }}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Link to Order (Optional)</label>
                <select
                  value={form.orderId}
                  onChange={e => {
                    const o = orders.find(ord => ord.id === e.target.value);
                    setForm({ ...form, orderId: e.target.value, orderNumber: o?.orderNumber || '' });
                  }}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="">-- No Specific Order / Unlinked Advance --</option>
                  {orders
                    .filter(o => !form.customerId || o.customerId === form.customerId)
                    .map(o => (
                      <option key={o.id} value={o.id}>
                        {o.orderNumber} ({o.customerName}) — Bal: ₹{o.balancePayment.toLocaleString('en-IN')}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Payment Amount (INR) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={form.paymentDate}
                    onChange={e => setForm({ ...form, paymentDate: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Payment Method</label>
                  <select
                    value={form.paymentMethod}
                    onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
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
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Remitted Bank</label>
                  <input
                    type="text"
                    value={form.bank}
                    onChange={e => setForm({ ...form, bank: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Reference / UTR / Cheque Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HDFCR52026100500123"
                  value={form.referenceNumber}
                  onChange={e => setForm({ ...form, referenceNumber: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
