import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Download,
  RefreshCw,
  TrendingUp,
  PieChart,
  Users,
  Boxes,
  CreditCard,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { exportToExcel } from '../utils/excel.ts';
import { useAuth } from '../context/AuthContext.tsx';

export const ReportsView: React.FC = () => {
  const { currentTenant } = useAuth();
  const [reportTab, setReportTab] = useState<'leads' | 'sales' | 'inventory' | 'payments'>('leads');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    leads: any[];
    customers: any[];
    products: any[];
    quotations: any[];
    orders: any[];
    payments: any[];
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [leads, customers, products, quotations, orders, payments] = await Promise.all([
        api.getLeads(),
        api.getCustomers(),
        api.getProducts(),
        api.getQuotations(),
        api.getOrders(),
        api.getPayments(),
      ]);
      setData({ leads, customers, products, quotations, orders, payments });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exportCurrentReport = async () => {
    if (!data) return;
    let headers: string[] = [];
    let dataRows: any[][] = [];
    let sheetName = 'Report';

    if (reportTab === 'leads') {
      sheetName = 'Leads Performance';
      headers = [
        'Lead ID',
        'Company',
        'Contact',
        'Mobile',
        'Source',
        'Machine',
        'Status',
        'Priority',
        'Budget',
        'Salesperson',
      ];
      dataRows = data.leads.map(l => [
        l.id,
        l.companyName,
        l.contactPerson,
        l.mobile,
        l.source,
        l.productInterested,
        l.status,
        l.priority,
        l.budget,
        l.assignedSalespersonName,
      ]);
    } else if (reportTab === 'sales') {
      sheetName = 'Sales Orders';
      headers = [
        'Order #',
        'Customer',
        'Date',
        'Total Amount',
        'Advance Received',
        'Balance Due',
        'Delivery Status',
        'Payment Status',
      ];
      dataRows = data.orders.map(o => [
        o.orderNumber,
        o.customerName,
        o.orderDate,
        o.totalAmount,
        o.advancePayment,
        o.balancePayment,
        o.deliveryStatus,
        o.paymentStatus,
      ]);
    } else if (reportTab === 'inventory') {
      sheetName = 'Factory Inventory';
      headers = [
        'Machine Name',
        'Model Number',
        'Category',
        'Ex-Factory Price',
        'Physical Stock',
        'Reserved Stock',
        'Available Stock',
        'Min Threshold',
      ];
      dataRows = data.products.map(p => [
        p.name,
        p.modelNumber,
        p.category,
        p.price,
        p.currentStock,
        p.reservedStock,
        p.availableStock,
        p.minStock,
      ]);
    } else if (reportTab === 'payments') {
      sheetName = 'Collections & Receivables';
      headers = [
        'Payment Date',
        'Customer',
        'Order #',
        'Amount',
        'Method',
        'UTR / Ref',
        'Bank',
      ];
      dataRows = data.payments.map(p => [
        p.paymentDate,
        p.customerName,
        p.orderNumber,
        p.amount,
        p.paymentMethod,
        p.referenceNumber,
        p.bank,
      ]);
    }

    const companyName = currentTenant?.name || 'StockItEase';
    const cleanPrefix = companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
    await exportToExcel(
      `${cleanPrefix}_${sheetName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`,
      sheetName,
      headers,
      dataRows
    );
  };

  if (loading || !data) {
    return (
      <div className="py-20 text-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-600 mb-2" />
        Generating operational analytics...
      </div>
    );
  }

  // Lead Analytics
  const leadsBySource: Record<string, number> = {};
  data.leads.forEach(l => {
    leadsBySource[l.source] = (leadsBySource[l.source] || 0) + 1;
  });

  // Sales Analytics (excluding cancelled orders)
  const activeOrders = data.orders.filter(o => o.orderStatus !== 'Cancelled');
  const totalSales = activeOrders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
  const totalBalance = activeOrders.reduce((acc, o) => acc + (Number(o.balancePayment) || 0), 0);
  const totalCollected = data.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  // Machinery breakdown
  const salesByMachine: Record<string, number> = {};
  activeOrders.forEach(o => {
    o.items?.forEach((it: any) => {
      const machineName = it.productName || it.product_name || 'Machinery';
      salesByMachine[machineName] = (salesByMachine[machineName] || 0) + (it.totalAmount || it.total_amount || 0);
    });
  });

  const acceptedQuotations = data.quotations.filter(q => q.status === 'Accepted' || q.status === 'Converted' || Boolean(q.convertedOrderId)).length;
  const totalQuotations = data.quotations.length;
  const quotationConversionRate = totalQuotations > 0 ? Math.round((acceptedQuotations / totalQuotations) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-600" />
            Executive Reports & Business Intelligence
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time reports across Inquiry acquisition, machinery revenue, inventory valuation, and cash receipts
          </p>
        </div>

        <button
          onClick={exportCurrentReport}
          className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Download className="w-4 h-4" /> Download Report (.xlsx)
        </button>
      </div>

      {/* Report Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setReportTab('leads')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            reportTab === 'leads'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Lead Conversion Report
        </button>
        <button
          onClick={() => setReportTab('sales')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            reportTab === 'sales'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PieChart className="w-4 h-4" /> Machinery Sales Revenue
        </button>
        <button
          onClick={() => setReportTab('inventory')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            reportTab === 'inventory'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" /> Stock Valuation
        </button>
        <button
          onClick={() => setReportTab('payments')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            reportTab === 'payments'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" /> Collections & Receivables
        </button>
      </div>

      {/* Tab 1: Leads Report */}
      {reportTab === 'leads' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Lead Generation by Channel</h3>
              <div className="space-y-2 text-xs">
                {Object.entries(leadsBySource).map(([src, count]) => {
                  const pct = Math.round((count / (data.leads.length || 1)) * 100);
                  return (
                    <div key={src}>
                      <div className="flex justify-between mb-1">
                        <span className="font-semibold text-slate-700">{src}</span>
                        <span className="font-mono text-slate-500">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-sky-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Quotations Conversion Rate</h3>
              <div className="p-4 bg-sky-50 rounded-xl border border-sky-200 text-center space-y-1">
                <span className="text-3xl font-black text-sky-700">
                  {quotationConversionRate}%
                </span>
                <p className="text-xs text-sky-900 font-bold">Quotation-to-Order Conversion Rate</p>
                <p className="text-[11px] text-sky-700">
                  {acceptedQuotations} accepted out of {data.quotations.length} proposals
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Sales Report */}
      {reportTab === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Total Machinery Revenue</span>
              <p className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">
                ₹{totalSales.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-emerald-600 uppercase">Advance Collected</span>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">
                ₹{totalCollected.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-amber-600 uppercase">Outstanding Receivables</span>
              <p className="text-2xl font-extrabold text-amber-700 mt-1 font-mono">
                ₹{totalBalance.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Revenue Contribution by Footwear Machine</h3>
            <div className="space-y-2 text-xs">
              {Object.entries(salesByMachine).map(([machine, val]) => (
                <div key={machine} className="flex justify-between py-2 border-b border-slate-100">
                  <span className="font-bold text-slate-800">{machine}</span>
                  <span className="font-mono font-extrabold text-emerald-700">₹{val.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Inventory Valuation */}
      {reportTab === 'inventory' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Warehouse Stock Valuation</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                    <th className="p-2.5">Machine</th>
                    <th className="p-2.5">Unit Price</th>
                    <th className="p-2.5">Physical Stock</th>
                    <th className="p-2.5">Available</th>
                    <th className="p-2.5">Stock Asset Value (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.products.map(p => (
                    <tr key={p.id}>
                      <td className="p-2.5 font-bold text-slate-900">{p.name}</td>
                      <td className="p-2.5 font-mono">₹{p.price.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 font-bold">{p.currentStock} Units</td>
                      <td className="p-2.5 text-emerald-700 font-bold">{p.availableStock} Units</td>
                      <td className="p-2.5 font-mono font-extrabold text-slate-900">
                        ₹{(p.currentStock * p.price).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Payments Report */}
      {reportTab === 'payments' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <h3 className="font-bold text-slate-900 text-sm">Payment Collections by Bank Method</h3>
          <div className="space-y-2 text-xs">
            {data.payments.map(p => (
              <div key={p.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900">{p.customerName}</span>
                  <span className="text-[11px] text-slate-400 ml-2">[{p.referenceNumber}]</span>
                  <p className="text-[10px] text-slate-500">{p.paymentDate} via {p.paymentMethod} ({p.bank})</p>
                </div>
                <span className="font-mono font-extrabold text-emerald-700 text-sm">
                  ₹{p.amount.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
