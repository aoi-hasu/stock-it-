import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  RefreshCw,
  Search,
  History,
  ShieldCheck,
  CheckCircle2,
  X,
  FileText,
  Download,
  Upload,
  FileSpreadsheet,
  Trash2,
} from 'lucide-react';
import { exportToExcel, parseExcelFile, downloadExcelTemplate } from '../utils/excel.ts';
import { Product, InventoryTransaction, InventoryTransactionType } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { AdminAuthModal } from '../components/common/AdminAuthModal.tsx';

export const InventoryView: React.FC = () => {
  const { currentUser, currentTenant } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stock' | 'transactions'>('stock');
  const [search, setSearch] = useState('');

  // Transaction Modal
  const [showTxModal, setShowTxModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [txType, setTxType] = useState<InventoryTransactionType>('Stock In');
  const [txQuantity, setTxQuantity] = useState(1);
  const [txReferenceType, setTxReferenceType] = useState<'Purchase' | 'Order' | 'Adjustment' | 'Damage Log' | 'Manual'>('Manual');
  const [txReferenceId, setTxReferenceId] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [allowNegativeOverride, setAllowNegativeOverride] = useState(false);
  const [submittingTx, setSubmittingTx] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Excel Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedInventory, setParsedInventory] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [updateExistingStock, setUpdateExistingStock] = useState(true);

  // Deletion Protection State
  const [txToDelete, setTxToDelete] = useState<InventoryTransaction | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invData, txList] = await Promise.all([
        api.getInventorySummary(),
        api.getInventoryTransactions(),
      ]);
      setSummary(invData.summary);
      setProducts(invData.products);
      setTransactions(txList);
      if (invData.products.length > 0 && !selectedProductId) {
        setSelectedProductId(invData.products[0].id);
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

  const handleOpenTransaction = (productId?: string, defaultType: InventoryTransactionType = 'Stock In') => {
    if (productId) setSelectedProductId(productId);
    setTxType(defaultType);
    setTxQuantity(1);
    setTxNotes('');
    setTxReferenceId('');
    setTxError(null);
    setAllowNegativeOverride(false);
    setShowTxModal(true);
  };

  const handleExecuteTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setSubmittingTx(true);

    try {
      await api.createInventoryTransaction({
        productId: selectedProductId,
        quantity: Number(txQuantity),
        transactionType: txType,
        referenceType: txReferenceType,
        referenceId: txReferenceId,
        notes: txNotes,
        userId: currentUser?.id,
        userName: currentUser?.name,
        allowNegative: allowNegativeOverride,
      });

      setShowTxModal(false);
      loadData();
    } catch (err: any) {
      setTxError(err.message);
    } finally {
      setSubmittingTx(false);
    }
  };

  // EXPORT INVENTORY TO EXCEL
  const handleExportToExcel = async () => {
    try {
      const companyName = currentTenant?.name || 'StockItEase';
      const cleanPrefix = companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const headers = [
        'Model Number / SKU',
        'Machine Name',
        'Category',
        'Brand',
        'Physical Stock (Units)',
        'Reserved Stock (Units)',
        'Available for Sale (Units)',
        'Min Alert Level',
        'Unit',
        'Unit Price (INR)',
        'Stock Valuation (INR)',
        'GST Rate (%)',
        'Status',
      ];
      const data = products.map(p => [
        p.modelNumber,
        p.name,
        p.category,
        p.brand || companyName,
        p.currentStock,
        p.reservedStock,
        p.availableStock,
        p.minStock,
        p.unit || 'Unit',
        p.price,
        p.price * p.currentStock,
        p.gstPercentage,
        p.status,
      ]);
      await exportToExcel(`${cleanPrefix}_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`, 'Stock Status', headers, data);
    } catch (err) {
      console.error('Failed to export inventory', err);
      alert('Error exporting inventory to Excel.');
    }
  };

  // IMPORT INVENTORY FROM EXCEL
  const handleDownloadSampleInventory = async () => {
    const headers = [
      'Model Number',
      'Machine Name',
      'Category',
      'Stock Quantity',
      'Min Alert Level',
      'Unit Price',
      'Unit',
      'GST %',
    ];
    const sample = [
      ['IND-PR-40', 'Hydraulic Compression Press 40-Ton', 'Presses', 4, 2, 145000, 'Unit', 18],
      ['IND-RT-12', 'Rotary Assembly Station Heavy Duty', 'Assembly', 6, 1, 195000, 'Unit', 18],
      ['IND-FL-80', 'Automatic Precision Feeder Unit', 'Feeders', 3, 1, 380000, 'Unit', 18],
    ];
    await downloadExcelTemplate('sample_inventory_template.xlsx', 'Sample Inventory', headers, sample);
  };

  const handleInventoryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportSuccessMessage(null);

    try {
      const { rows } = await parseExcelFile(file);
      const mapped = rows.map((row, idx) => {
        const getVal = (keywords: string[]) => {
          const foundKey = Object.keys(row).find(k =>
            keywords.some(kw => k.toLowerCase().includes(kw))
          );
          return foundKey ? String(row[foundKey]).trim() : '';
        };

        const getNum = (keywords: string[], fallback = 0) => {
          const val = getVal(keywords);
          const num = parseFloat(val);
          return isNaN(num) ? fallback : num;
        };

        return {
          modelNumber: getVal(['model', 'sku', 'code', 'part']) || `SKU-${Date.now().toString(36).toUpperCase()}-${idx + 1}`,
          name: getVal(['machine', 'product', 'name', 'item']) || 'Product Item',
          category: getVal(['category', 'type']) || 'Machinery',
          currentStock: getNum(['stock', 'quantity', 'qty', 'count', 'units'], 1),
          minStock: getNum(['min', 'alert', 'threshold'], 1),
          price: getNum(['price', 'rate', 'cost'], 50000),
          unit: getVal(['unit']) || 'Unit',
          gstPercentage: getNum(['gst', 'tax'], 18),
        };
      }).filter(item => item.name || item.modelNumber);

      setParsedInventory(mapped);
    } catch (err: any) {
      console.error('Failed to parse excel file', err);
      alert(err.message || 'Could not parse the selected Excel spreadsheet.');
    }
  };

  const handleExecuteInventoryImport = async () => {
    if (parsedInventory.length === 0) return;
    setImporting(true);
    try {
      const res = await api.bulkImportInventory(parsedInventory, { updateExisting: updateExistingStock });
      setImportSuccessMessage(`Processed ${res.total} machines (${res.updatedCount} updated, ${res.createdCount} new created)!`);
      setTimeout(() => {
        setShowImportModal(false);
        setImportFile(null);
        setParsedInventory([]);
        setImportSuccessMessage(null);
        loadData();
      }, 1300);
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmDeleteTx = async () => {
    if (!txToDelete) return;
    try {
      await api.deleteInventoryTransaction(txToDelete.id);
      setTxToDelete(null);
      loadData();
    } catch (err: any) {
      alert(`Error deleting transaction: ${err.message}`);
    }
  };

  const filteredProducts = products.filter(p => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.modelNumber.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Boxes className="w-5 h-5 text-sky-600" />
            Inventory & Machinery Stock Control
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict stock tracking, reserved machines against accepted quotations, and Excel import/export management
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export to Excel */}
          <button
            onClick={handleExportToExcel}
            className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors border border-slate-200"
            title="Export stock and movement ledger to Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" /> Export Excel
          </button>

          {/* Import from Excel */}
          <button
            onClick={() => {
              setImportFile(null);
              setParsedInventory([]);
              setImportSuccessMessage(null);
              setShowImportModal(true);
            }}
            className="px-3 py-2 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors border border-emerald-200"
            title="Import inventory & stock levels from Excel"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-600" /> Import Excel
          </button>

          {/* Record Stock Movement (all staff can record) */}
          <button
            onClick={() => handleOpenTransaction(undefined, 'Stock In')}
            className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" /> Record Movement
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Catalogued Machinery</span>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{summary.totalMachines} Models</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Warehouse Stock</span>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{summary.totalStock} Units</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Available for Sale</span>
            <p className="text-2xl font-extrabold text-emerald-700 mt-1">{summary.availableStock} Units</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Reserved (Orders)</span>
            <p className="text-2xl font-extrabold text-purple-700 mt-1">{summary.reservedStock} Units</p>
          </div>
        </div>
      )}

      {/* Low Stock Warning Banner */}
      {summary?.lowStockCount > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold">
                Low Stock Threshold Alert ({summary.lowStockCount} machine models near zero):
              </span>
              <p className="text-amber-800 text-[11px] mt-0.5">
                Certain machines have reached or dipped below minimum assembly threshold.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleOpenTransaction(undefined, 'Stock In')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-xs shrink-0"
          >
            Add Assembly Stock In
          </button>
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('stock')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'stock'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" /> Machine Stock Positions ({products.length})
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'transactions'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" /> Movement Ledger & Audit Logs ({transactions.length})
        </button>
      </div>

      {/* Tab 1: Current Stock Table */}
      {activeTab === 'stock' && (
        <div className="space-y-3">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search machine name or model number..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <button
              onClick={loadData}
              className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-3">Machine & Model</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Physical Stock</th>
                    <th className="py-3 px-3">Reserved Stock</th>
                    <th className="py-3 px-3">Available for Sale</th>
                    <th className="py-3 px-3">Min Threshold</th>
                    <th className="py-3 px-3">Stock Health</th>
                    <th className="py-3 px-3 text-right">Quick Stock In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map(prod => {
                    const isLow = prod.availableStock <= prod.minStock;
                    return (
                      <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <span className="font-extrabold text-slate-900">{prod.name}</span>
                          <span className="text-slate-400 text-[10px] font-mono ml-2">[{prod.modelNumber}]</span>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{prod.category}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-800">{prod.currentStock} Units</td>
                        <td className="py-3 px-3 font-mono font-bold text-purple-700">{prod.reservedStock} Units</td>
                        <td className="py-3 px-3 font-mono font-extrabold text-emerald-700 text-sm">
                          {prod.availableStock} Units
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500">{prod.minStock} Units</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              isLow
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isLow ? 'Low Stock' : 'Healthy'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleOpenTransaction(prod.id, 'Stock In')}
                            className="px-2.5 py-1 text-[11px] font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-md border border-sky-200 transition-colors"
                          >
                            + Stock In
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Movement Ledger */}
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Product Name</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Quantity</th>
                  <th className="py-3 px-3">Reference</th>
                  <th className="py-3 px-3">Logged By</th>
                  <th className="py-3 px-3">Notes</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map(t => {
                  const isIn = t.transactionType === 'Stock In' || t.transactionType === 'Return';
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors group">
                      <td className="py-3 px-3 font-mono text-slate-600">{t.date}</td>
                      <td className="py-3 px-3 font-bold text-slate-800">{t.productName}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isIn ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isIn ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {t.transactionType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">{t.quantity} Units</td>
                      <td className="py-3 px-3 text-slate-500">
                        {t.referenceType} {t.referenceId && `(${t.referenceId})`}
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-medium">{t.userName}</td>
                      <td className="py-3 px-3 text-slate-500 max-w-xs truncate">{t.notes || '—'}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setTxToDelete(t)}
                          title="Delete Ledger Entry (Requires Admin Permission for non-admins)"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-70 group-hover:opacity-100"
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
        </div>
      )}

      {/* Record Stock Transaction Modal */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-extrabold text-slate-900 text-base">Record Stock Transaction</h3>
              <button onClick={() => setShowTxModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteTransaction} className="p-6 space-y-4 text-xs">
              {txError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">{txError}</span>
                    <label className="flex items-center gap-1.5 mt-2 cursor-pointer text-[11px] text-rose-900 font-semibold">
                      <input
                        type="checkbox"
                        checked={allowNegativeOverride}
                        onChange={e => setAllowNegativeOverride(e.target.checked)}
                      />
                      Admin override: Authorize negative inventory temporarily
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Select Machine Model *</label>
                <select
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.modelNumber}) — Available: {p.availableStock}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Transaction Type *</label>
                  <select
                    value={txType}
                    onChange={e => setTxType(e.target.value as any)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  >
                    <option value="Stock In">Stock In (Factory Assembly / Receipt)</option>
                    <option value="Stock Out">Stock Out</option>
                    <option value="Reservation">Reservation (Hold for Deal)</option>
                    <option value="Sale">Sale (Dispatch to Customer)</option>
                    <option value="Return">Customer Return</option>
                    <option value="Damage">Damaged in Transit / Shopfloor</option>
                    <option value="Adjustment">Physical Audit Adjustment</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Quantity (Units) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={txQuantity}
                    onChange={e => setTxQuantity(Number(e.target.value))}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Reference Document Type</label>
                  <select
                    value={txReferenceType}
                    onChange={e => setTxReferenceType(e.target.value as any)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="Purchase">Purchase Order / Batch</option>
                    <option value="Order">Sales Order</option>
                    <option value="Adjustment">Physical Count Audit</option>
                    <option value="Damage Log">Damage Log</option>
                    <option value="Manual">Manual Entry</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Reference ID / PO / Batch #</label>
                  <input
                    type="text"
                    placeholder="e.g. PO-AFM-2026-92"
                    value={txReferenceId}
                    onChange={e => setTxReferenceId(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Audit Reason / Shopfloor Notes *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Reason for movement, technician name, customer name..."
                  value={txNotes}
                  onChange={e => setTxNotes(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTxModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTx}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
                >
                  {submittingTx ? 'Executing...' : 'Commit Movement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Inventory from Excel Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Import Inventory from Excel</h3>
                  <p className="text-[11px] text-slate-500">Update stock quantities & upload machine catalogues</p>
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
                <p className="font-bold text-slate-800">Inventory Stock Template</p>
                <p className="text-[11px] text-slate-500">Columns: Model Number, Machine Name, Category, Stock Quantity, Price</p>
              </div>
              <button
                onClick={handleDownloadSampleInventory}
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
                id="inventoryExcelUpload"
                className="hidden"
                onChange={handleInventoryFileChange}
              />
              <label htmlFor="inventoryExcelUpload" className="cursor-pointer space-y-2 block">
                <Upload className="w-8 h-8 mx-auto text-emerald-600" />
                <div>
                  <span className="font-bold text-emerald-700 hover:underline">Choose Excel file</span> or drag & drop here
                </div>
                <p className="text-[10px] text-slate-400">Supported formats: .xlsx, .xls</p>
                {importFile && (
                  <p className="text-xs font-bold text-slate-800 bg-white inline-block px-3 py-1 rounded-full border border-slate-200 mt-2">
                    Selected: {importFile.name} ({parsedInventory.length} rows recognized)
                  </p>
                )}
              </label>
            </div>

            {/* Import Options */}
            <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                id="updateStockOpt"
                checked={updateExistingStock}
                onChange={e => setUpdateExistingStock(e.target.checked)}
                className="rounded text-emerald-600"
              />
              <label htmlFor="updateStockOpt" className="text-xs text-slate-700 font-semibold cursor-pointer">
                Add imported quantity to existing inventory stock (uncheck to overwrite price only)
              </label>
            </div>

            {/* Preview of Parsed Inventory */}
            {parsedInventory.length > 0 && (
              <div className="space-y-2">
                <span className="font-bold text-slate-700">Preview ({parsedInventory.length} items ready to commit):</span>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {parsedInventory.slice(0, 5).map((m, i) => (
                    <div key={i} className="p-2 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-bold text-slate-800">{m.name}</span>
                        <span className="text-slate-400 font-mono ml-2">[{m.modelNumber}]</span>
                        <div className="text-slate-500">{m.category}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-700">+{m.currentStock} Units</span>
                        <div className="text-slate-500">₹{m.price.toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                  {parsedInventory.length > 5 && (
                    <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50">
                      + {parsedInventory.length - 5} more machines
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
                disabled={parsedInventory.length === 0 || importing}
                onClick={handleExecuteInventoryImport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5"
              >
                {importing ? 'Processing...' : `Commit ${parsedInventory.length} Machine Items`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Authorization Deletion Modal */}
      <AdminAuthModal
        isOpen={Boolean(txToDelete)}
        onClose={() => setTxToDelete(null)}
        onConfirm={handleConfirmDeleteTx}
        title="Delete Movement Ledger Entry"
        itemType="Inventory Transaction"
        itemName={txToDelete ? `${txToDelete.transactionType} of ${txToDelete.productName} (${txToDelete.quantity} Units)` : ''}
        warningMessage="Deleting an inventory ledger movement cannot be undone and affects audit traceability."
      />
    </div>
  );
};
