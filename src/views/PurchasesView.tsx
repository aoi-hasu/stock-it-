import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  RefreshCw,
  Building,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Upload,
  Trash2,
  Eye,
  Check,
  X,
  CreditCard,
  PackageCheck,
  ArrowDownRight,
  Printer,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { exportToExcel, parseExcelFile, downloadExcelTemplate } from '../utils/excel.ts';
import { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, PurchaseOrderPaymentStatus, Product } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { formatINR } from '../utils/formatters.ts';
import { AdminAuthModal } from '../components/common/AdminAuthModal.tsx';

export const PurchasesView: React.FC = () => {
  const { currentUser, activeCompanyId, isSuperAdmin, isAllTenantsView, currentTenant } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  const [showInwardModal, setShowInwardModal] = useState(false);
  const [inwardPO, setInwardPO] = useState<PurchaseOrder | null>(null);
  const [inwardDate, setInwardDate] = useState(new Date().toISOString().split('T')[0]);
  const [inwardNotes, setInwardNotes] = useState('');
  const [inwardItemsQty, setInwardItemsQty] = useState<{ [itemId: string]: number }>({});
  const [updateStockCheck, setUpdateStockCheck] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentPO, setPaymentPO] = useState<PurchaseOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState('NEFT / Bank Transfer');
  const [paymentRef, setPaymentRef] = useState('');

  // Excel Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedPOs, setParsedPOs] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  // Admin Delete Protection
  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null);

  // Create Form State
  const [form, setForm] = useState<{
    poNumber: string;
    date: string;
    expectedDeliveryDate: string;
    supplierName: string;
    supplierGstin: string;
    supplierContact: string;
    supplierPhone: string;
    supplierEmail: string;
    supplierAddress: string;
    supplierCity: string;
    supplierState: string;
    status: PurchaseOrderStatus;
    notes: string;
    items: {
      productId?: string;
      itemName: string;
      itemCode: string;
      category: string;
      hsnCode: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      discountPercentage: number;
      gstPercentage: number;
    }[];
  }>({
    poNumber: '',
    date: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
    supplierName: '',
    supplierGstin: '',
    supplierContact: '',
    supplierPhone: '',
    supplierEmail: '',
    supplierAddress: '',
    supplierCity: 'Faridabad',
    supplierState: 'Haryana',
    status: 'Ordered',
    notes: '',
    items: [
      {
        itemName: '',
        itemCode: '',
        category: 'Spares & Components',
        hsnCode: '848079',
        quantity: 1,
        unit: 'Units',
        unitPrice: 0,
        discountPercentage: 0,
        gstPercentage: 18,
      },
    ],
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const comp = isSuperAdmin ? (isAllTenantsView ? 'all' : activeCompanyId) : (currentUser?.companyId || 'org-1');
      const [poList, prodList] = await Promise.all([
        api.getPurchaseOrders({ search, status: statusFilter, paymentStatus: paymentFilter, companyId: comp }),
        api.getProducts({ companyId: comp }),
      ]);
      setPurchaseOrders(poList);
      setProducts(prodList);
    } catch (e) {
      console.error('Error loading purchase orders:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, statusFilter, paymentFilter, activeCompanyId, isAllTenantsView]);

  // Form Calculations
  const calculatedItems = form.items.map(it => {
    const rawTotal = (it.quantity || 0) * (it.unitPrice || 0);
    const discAmount = (rawTotal * (it.discountPercentage || 0)) / 100;
    const taxable = rawTotal - discAmount;
    const gstAmount = (taxable * (it.gstPercentage || 0)) / 100;
    const total = taxable + gstAmount;
    return {
      ...it,
      taxableAmount: taxable,
      gstAmount,
      totalAmount: total,
    };
  });

  const formSubtotal = calculatedItems.reduce((acc, i) => acc + i.taxableAmount, 0);
  const formGstTotal = calculatedItems.reduce((acc, i) => acc + i.gstAmount, 0);
  const formGrandTotal = formSubtotal + formGstTotal;

  const handleAddItemRow = () => {
    setForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          itemName: '',
          itemCode: '',
          category: 'Spares & Components',
          hsnCode: '848079',
          quantity: 1,
          unit: 'Units',
          unitPrice: 0,
          discountPercentage: 0,
          gstPercentage: 18,
        },
      ],
    }));
  };

  const handleRemoveItemRow = (idx: number) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const handleSelectExistingProduct = (idx: number, productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    setForm(prev => {
      const newItems = [...prev.items];
      newItems[idx] = {
        ...newItems[idx],
        productId: prod.id,
        itemName: prod.name,
        itemCode: prod.modelNumber,
        category: prod.category,
        unit: prod.unit || 'Units',
        unitPrice: prod.price,
        gstPercentage: prod.gstPercentage || 18,
      };
      return { ...prev, items: newItems };
    });
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newPO = await api.createPurchaseOrder({
        poNumber: form.poNumber.trim() || undefined,
        date: form.date,
        expectedDeliveryDate: form.expectedDeliveryDate,
        supplierName: form.supplierName,
        supplierGstin: form.supplierGstin,
        supplierContact: form.supplierContact,
        supplierPhone: form.supplierPhone,
        supplierEmail: form.supplierEmail,
        supplierAddress: form.supplierAddress,
        supplierCity: form.supplierCity,
        supplierState: form.supplierState,
        status: form.status,
        notes: form.notes,
        subtotal: formSubtotal,
        taxableAmount: formSubtotal,
        gstTotal: formGstTotal,
        grandTotal: formGrandTotal,
        createdBy: currentUser?.id || 'usr-1',
        createdByName: currentUser?.name || 'Staff',
        companyId: currentUser?.companyId || 'org-1',
        items: calculatedItems as any,
      });

      setShowCreateModal(false);
      // Reset form
      setForm({
        poNumber: '',
        date: new Date().toISOString().split('T')[0],
        expectedDeliveryDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
        supplierName: '',
        supplierGstin: '',
        supplierContact: '',
        supplierPhone: '',
        supplierEmail: '',
        supplierAddress: '',
        supplierCity: 'Faridabad',
        supplierState: 'Haryana',
        status: 'Ordered',
        notes: '',
        items: [
          {
            itemName: '',
            itemCode: '',
            category: 'Spares & Components',
            hsnCode: '848079',
            quantity: 1,
            unit: 'Units',
            unitPrice: 0,
            discountPercentage: 0,
            gstPercentage: 18,
          },
        ],
      });
      loadData();
    } catch (err: any) {
      alert(`Error creating Purchase Order: ${err.message}`);
    }
  };

  // Inward Goods & Stock update
  const handleOpenInward = (po: PurchaseOrder) => {
    setInwardPO(po);
    setInwardDate(new Date().toISOString().split('T')[0]);
    setInwardNotes(po.inwardNotes || '');
    const initialQtys: { [key: string]: number } = {};
    po.items.forEach(it => {
      initialQtys[it.id] = it.receivedQuantity && it.receivedQuantity > 0 ? it.receivedQuantity : it.quantity;
    });
    setInwardItemsQty(initialQtys);
    setUpdateStockCheck(true);
    setShowInwardModal(true);
  };

  const handleExecuteInward = async () => {
    if (!inwardPO) return;
    try {
      const itemsReceived = Object.entries(inwardItemsQty).map(([itemId, receivedQuantity]) => ({
        itemId,
        receivedQuantity: Number(receivedQuantity),
      }));

      await api.receivePurchaseOrder(inwardPO.id, {
        receivedDate: inwardDate,
        inwardNotes,
        updateInventoryStock: updateStockCheck,
        itemsReceived,
        receivedByUserId: currentUser?.id,
        receivedByUserName: currentUser?.name,
      });

      setShowInwardModal(false);
      setInwardPO(null);
      loadData();
    } catch (err: any) {
      alert(`Inward error: ${err.message}`);
    }
  };

  // Record Payment
  const handleOpenPayment = (po: PurchaseOrder) => {
    setPaymentPO(po);
    const balance = po.grandTotal - (po.paidAmount || 0);
    setPaymentAmount(Math.max(0, balance));
    setPaymentMode('NEFT / Bank Transfer');
    setPaymentRef('');
    setShowPaymentModal(true);
  };

  const handleExecutePayment = async () => {
    if (!paymentPO) return;
    try {
      await api.recordPurchasePayment(paymentPO.id, {
        amount: Number(paymentAmount),
        paymentMode,
        referenceNumber: paymentRef,
      });
      setShowPaymentModal(false);
      setPaymentPO(null);
      loadData();
    } catch (err: any) {
      alert(`Payment error: ${err.message}`);
    }
  };

  // Delete PO Confirmation
  const handleConfirmDeletePO = async () => {
    if (!poToDelete) return;
    try {
      await api.deletePurchaseOrder(poToDelete.id);
      setPoToDelete(null);
      if (selectedPO?.id === poToDelete.id) {
        setSelectedPO(null);
        setShowDetailModal(false);
      }
      loadData();
    } catch (err: any) {
      alert(`Error deleting Purchase Order: ${err.message}`);
    }
  };

  // Export to Excel
  const handleExportToExcel = async () => {
    try {
      const companyName = currentTenant?.name || 'StockItEase';
      const cleanPrefix = companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const headers = [
        'PO Number',
        'Date',
        'Expected Delivery',
        'Received Date',
        'Supplier Name',
        'Supplier GSTIN',
        'Contact Person',
        'Phone',
        'City / State',
        'Item Count',
        'Taxable Amount (INR)',
        'GST Total (INR)',
        'Grand Total (INR)',
        'PO Status',
        'Payment Status',
        'Paid Amount (INR)',
        'Created By',
        'Notes',
      ];
      const data = purchaseOrders.map(p => [
        p.poNumber,
        p.date,
        p.expectedDeliveryDate || 'N/A',
        p.receivedDate || 'N/A',
        p.supplierName,
        p.supplierGstin || '',
        p.supplierContact || '',
        p.supplierPhone || '',
        `${p.supplierCity || ''}, ${p.supplierState || ''}`,
        p.items.length,
        p.taxableAmount,
        p.gstTotal,
        p.grandTotal,
        p.status,
        p.paymentStatus,
        p.paidAmount || 0,
        p.createdByName || '',
        p.notes || '',
      ]);

      await exportToExcel(`${cleanPrefix}_Purchase_Orders_${new Date().toISOString().split('T')[0]}.xlsx`, 'Purchase Orders', headers, data);
    } catch (err) {
      console.error('Error exporting purchases:', err);
      alert('Could not export purchase orders to Excel.');
    }
  };

  // Import from Excel
  const handleDownloadSamplePOExcel = async () => {
    const headers = [
      'PO Number',
      'Date',
      'Expected Delivery',
      'Supplier Name',
      'Supplier GSTIN',
      'Supplier Phone',
      'City',
      'State',
      'Subtotal',
      'GST Amount',
      'Grand Total',
      'Status',
      'Payment Status',
      'Notes',
    ];
    const sample = [
      [
        'PO-2026-088',
        '2026-03-25',
        '2026-04-05',
        'Pneumatic Valves & Seals India Ltd',
        '06AAACP4455E1ZT',
        '+91 98110 99881',
        'Faridabad',
        'Haryana',
        180000,
        32400,
        212400,
        'Ordered',
        'Unpaid',
        'High-pressure hydraulic valves batch',
      ],
    ];
    await downloadExcelTemplate('sample_purchase_orders.xlsx', 'Sample POs', headers, sample);
  };

  const handlePOFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportSuccessMsg(null);

    try {
      const { rows } = await parseExcelFile(file);
      const mapped = rows.map(row => {
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
          poNumber: getVal(['po number', 'po', 'order no']),
          supplierName: getVal(['supplier', 'vendor', 'party']) || 'Vendor Company',
          supplierGstin: getVal(['gstin', 'gst']),
          supplierPhone: getVal(['phone', 'mobile']),
          supplierCity: getVal(['city']) || 'Faridabad',
          supplierState: getVal(['state']) || 'Haryana',
          subtotal: getNum(['subtotal', 'taxable'], 100000),
          gstTotal: getNum(['gst', 'tax'], 18000),
          grandTotal: getNum(['total', 'grand total', 'amount'], 118000),
          status: (getVal(['status']) || 'Ordered') as PurchaseOrderStatus,
          paymentStatus: (getVal(['payment']) || 'Unpaid') as PurchaseOrderPaymentStatus,
          notes: getVal(['note', 'remark']),
        };
      }).filter(item => item.supplierName);

      setParsedPOs(mapped);
    } catch (err: any) {
      console.error('Failed to parse excel file', err);
      alert(err.message || 'Could not parse the selected Excel file.');
    }
  };

  const handleExecutePOImport = async () => {
    if (parsedPOs.length === 0) return;
    setImporting(true);
    try {
      const res = await api.bulkImportPurchaseOrders(parsedPOs);
      setImportSuccessMsg(`Imported ${res.count} purchase orders successfully!`);
      setTimeout(() => {
        setShowImportModal(false);
        setImportFile(null);
        setParsedPOs([]);
        setImportSuccessMsg(null);
        loadData();
      }, 1200);
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Metrics
  const totalPurchasesAmount = purchaseOrders.reduce((acc, p) => acc + p.grandTotal, 0);
  const totalPaidAmount = purchaseOrders.reduce((acc, p) => acc + (p.paidAmount || 0), 0);
  const pendingInwardsCount = purchaseOrders.filter(p => p.status === 'Ordered' || p.status === 'Partially Received').length;
  const receivedCount = purchaseOrders.filter(p => p.status === 'Received').length;

  return (
    <div className="space-y-4">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-sky-600" />
            Purchases & Inward Machinery Spares
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Procurement of machine components, foundry castings, raw materials & automated stock inwarding
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export to Excel */}
          <button
            onClick={handleExportToExcel}
            className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors border border-slate-200"
            title="Export purchase orders to Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" /> Export Excel
          </button>

          {/* Import from Excel */}
          <button
            onClick={() => {
              setImportFile(null);
              setParsedPOs([]);
              setImportSuccessMsg(null);
              setShowImportModal(true);
            }}
            className="px-3 py-2 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors border border-emerald-200"
            title="Import purchase orders from Excel"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-600" /> Import Excel
          </button>

          {/* Create Purchase Order (Employees can add freely) */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" /> + Create Purchase Order
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Purchases</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{formatINR(totalPurchasesAmount)}</p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">{purchaseOrders.length} Purchase Orders</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Pending Inwards</span>
          <p className="text-2xl font-extrabold text-amber-700 mt-1">{pendingInwardsCount} Orders</p>
          <span className="text-[10px] text-amber-700/80 mt-0.5 block">Awaiting delivery at dock</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Inwarded & Received</span>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1">{receivedCount} Completed</p>
          <span className="text-[10px] text-emerald-700/80 mt-0.5 block">Stock added to inventory</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Vendor Dues Outstanding</span>
          <p className="text-2xl font-extrabold text-purple-700 mt-1">{formatINR(Math.max(0, totalPurchasesAmount - totalPaidAmount))}</p>
          <span className="text-[10px] text-purple-700/80 mt-0.5 block">Paid: {formatINR(totalPaidAmount)}</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search PO #, supplier name, GSTIN, item code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
        >
          <option value="all">All Inward Statuses</option>
          <option value="Ordered">Ordered</option>
          <option value="Partially Received">Partially Received</option>
          <option value="Received">Received / Inwarded</option>
          <option value="Draft">Draft</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <select
          value={paymentFilter}
          onChange={e => setPaymentFilter(e.target.value)}
          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
        >
          <option value="all">All Payment Statuses</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Paid">Paid</option>
        </select>

        <button
          onClick={loadData}
          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Purchase Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-3">PO Number & Date</th>
                <th className="py-3 px-3">Supplier / Vendor</th>
                <th className="py-3 px-3">Items Summary</th>
                <th className="py-3 px-3">Grand Total (₹)</th>
                <th className="py-3 px-3">Inward Status</th>
                <th className="py-3 px-3">Payment Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
                    Loading purchase orders...
                  </td>
                </tr>
              ) : purchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <ShoppingCart className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No purchase orders found</p>
                  </td>
                </tr>
              ) : (
                purchaseOrders.map(po => {
                  const isReceived = po.status === 'Received';
                  const isPartiallyReceived = po.status === 'Partially Received';

                  return (
                    <tr key={po.id} className="hover:bg-slate-50/70 transition-colors group">
                      <td className="py-3 px-3">
                        <span className="font-extrabold text-slate-900 font-mono text-sm block">{po.poNumber}</span>
                        <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" /> {po.date}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800">{po.supplierName}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                          {po.supplierGstin ? <span className="font-mono text-slate-600">{po.supplierGstin}</span> : null}
                          <span>• {po.supplierCity}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 max-w-xs">
                        <div className="font-medium text-slate-700 truncate">
                          {po.items.map(it => `${it.itemName} (${it.quantity} ${it.unit})`).join(', ')}
                        </div>
                        <span className="text-[10px] text-slate-400">{po.items.length} item line{po.items.length > 1 ? 's' : ''}</span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-extrabold text-slate-900 font-mono text-sm block">
                          {formatINR(po.grandTotal)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          GST: {formatINR(po.gstTotal)}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isReceived
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPartiallyReceived
                              ? 'bg-amber-100 text-amber-800'
                              : po.status === 'Ordered'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isReceived ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {po.status}
                        </span>
                        {po.receivedDate && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Rec: {po.receivedDate}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            po.paymentStatus === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : po.paymentStatus === 'Partially Paid'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {po.paymentStatus}
                        </span>
                        {po.paidAmount && po.paidAmount > 0 ? (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Paid: {formatINR(po.paidAmount)}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inward Button */}
                          {!isReceived && (
                            <button
                              onClick={() => handleOpenInward(po)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-bold text-[11px] flex items-center gap-1 transition-colors border border-emerald-200"
                              title="Receive Goods & Inward to Inventory"
                            >
                              <PackageCheck className="w-3 h-3" /> Inward
                            </button>
                          )}

                          {/* Record Payment */}
                          {po.paymentStatus !== 'Paid' && (
                            <button
                              onClick={() => handleOpenPayment(po)}
                              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded font-semibold text-[11px] flex items-center gap-1 transition-colors border border-purple-200"
                              title="Record payment made to supplier"
                            >
                              <CreditCard className="w-3 h-3" /> Pay
                            </button>
                          )}

                          {/* View PO */}
                          <button
                            onClick={() => {
                              setSelectedPO(po);
                              setShowDetailModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                            title="View Purchase Order Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete PO with Admin Permission Guard */}
                          <button
                            onClick={() => setPoToDelete(po)}
                            title="Delete Purchase Order (Requires Admin Permission for employees)"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
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

      {/* CREATE PURCHASE ORDER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-100 text-sky-700">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Generate Purchase Order (PO)</h3>
                  <p className="text-[11px] text-slate-500">Record supplier purchase of machinery spares & raw materials</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="p-6 space-y-5 text-xs overflow-y-auto">
              {/* Supplier Info */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">1. Supplier & Vendor Information</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Supplier / Vendor Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. HydroPneumatics Spares Co."
                      value={form.supplierName}
                      onChange={e => setForm({ ...form, supplierName: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Supplier GSTIN</label>
                    <input
                      type="text"
                      placeholder="07AAACH1234F1Z8"
                      value={form.supplierGstin}
                      onChange={e => setForm({ ...form, supplierGstin: e.target.value.toUpperCase() })}
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Contact Person</label>
                    <input
                      type="text"
                      placeholder="e.g. Rakesh Singhal"
                      value={form.supplierContact}
                      onChange={e => setForm({ ...form, supplierContact: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Phone / Mobile</label>
                    <input
                      type="text"
                      placeholder="+91 98110 55443"
                      value={form.supplierPhone}
                      onChange={e => setForm({ ...form, supplierPhone: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Email</label>
                    <input
                      type="email"
                      placeholder="supplier@spares.com"
                      value={form.supplierEmail}
                      onChange={e => setForm({ ...form, supplierEmail: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">City & State</label>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <input
                        type="text"
                        placeholder="City"
                        value={form.supplierCity}
                        onChange={e => setForm({ ...form, supplierCity: e.target.value })}
                        className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        placeholder="State"
                        value={form.supplierState}
                        onChange={e => setForm({ ...form, supplierState: e.target.value })}
                        className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Dates & Custom PO */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">2. Order Details</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">PO Number (Leave blank for auto)</label>
                    <input
                      type="text"
                      placeholder="e.g. PO-2026-004"
                      value={form.poNumber}
                      onChange={e => setForm({ ...form, poNumber: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Order Date *</label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={e => setForm({ ...form, date: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Expected Delivery Date</label>
                    <input
                      type="date"
                      value={form.expectedDeliveryDate}
                      onChange={e => setForm({ ...form, expectedDeliveryDate: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Items Line Items */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">3. Purchase Items & Spares</span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-2.5 py-1 bg-sky-50 text-sky-700 font-bold rounded-md hover:bg-sky-100 border border-sky-200 text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Another Item
                  </button>
                </div>

                <div className="space-y-3">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-700 text-[11px]">Item #{idx + 1}</span>
                        {products.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">Autofill from Catalog:</span>
                            <select
                              onChange={e => {
                                if (e.target.value) handleSelectExistingProduct(idx, e.target.value);
                              }}
                              className="text-[11px] bg-white border border-slate-200 rounded px-2 py-0.5"
                            >
                              <option value="">-- Choose Machine / Spare --</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.modelNumber})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-500">Item / Spare Part Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Hydraulic High Pressure Pump 3HP"
                            value={it.itemName}
                            onChange={e => {
                              const newItems = [...form.items];
                              newItems[idx].itemName = e.target.value;
                              setForm({ ...form, items: newItems });
                            }}
                            className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500">SKU / Part Code</label>
                          <input
                            type="text"
                            placeholder="HYD-PUMP-3HP"
                            value={it.itemCode}
                            onChange={e => {
                              const newItems = [...form.items];
                              newItems[idx].itemCode = e.target.value;
                              setForm({ ...form, items: newItems });
                            }}
                            className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500">Quantity *</label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={it.quantity}
                            onChange={e => {
                              const newItems = [...form.items];
                              newItems[idx].quantity = Number(e.target.value);
                              setForm({ ...form, items: newItems });
                            }}
                            className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded text-xs font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500">Unit Price (₹) *</label>
                          <input
                            type="number"
                            min="0"
                            required
                            value={it.unitPrice}
                            onChange={e => {
                              const newItems = [...form.items];
                              newItems[idx].unitPrice = Number(e.target.value);
                              setForm({ ...form, items: newItems });
                            }}
                            className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded text-xs font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500">GST %</label>
                          <select
                            value={it.gstPercentage}
                            onChange={e => {
                              const newItems = [...form.items];
                              newItems[idx].gstPercentage = Number(e.target.value);
                              setForm({ ...form, items: newItems });
                            }}
                            className="w-full mt-1 p-1.5 bg-white border border-slate-200 rounded text-xs font-bold"
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Calculation Card */}
              <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Purchase Calculation</span>
                  <div className="flex items-center gap-4 mt-1 text-xs">
                    <span>Taxable: <strong className="font-mono">{formatINR(formSubtotal)}</strong></span>
                    <span>GST (18% avg): <strong className="font-mono">{formatINR(formGstTotal)}</strong></span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-sky-400">PO Grand Total</span>
                  <p className="text-2xl font-black font-mono text-white">{formatINR(formGrandTotal)}</p>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Terms & Inward Notes</label>
                <textarea
                  rows={2}
                  placeholder="Delivery location, warranty terms, dispatch instructions..."
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Confirm & Dispatch PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INWARD GOODS MODAL */}
      {showInwardModal && inwardPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Inward Goods to Inventory</h3>
                  <p className="text-[11px] text-slate-500">Record receipt of items for {inwardPO.poNumber}</p>
                </div>
              </div>
              <button onClick={() => setShowInwardModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Supplier:</span>
                <p className="font-extrabold text-slate-800">{inwardPO.supplierName}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Received Date:</span>
                <input
                  type="date"
                  value={inwardDate}
                  onChange={e => setInwardDate(e.target.value)}
                  className="w-full mt-0.5 p-1 bg-white border border-slate-200 rounded text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-700 text-[11px]">Verify Received Quantities:</span>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {inwardPO.items.map(it => (
                  <div key={it.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{it.itemName}</p>
                      <span className="text-slate-400 text-[10px] font-mono">
                        Ordered: {it.quantity} {it.unit}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-[11px]">Received:</span>
                      <input
                        type="number"
                        min="0"
                        max={it.quantity * 2}
                        value={inwardItemsQty[it.id] ?? it.quantity}
                        onChange={e =>
                          setInwardItemsQty({
                            ...inwardItemsQty,
                            [it.id]: Number(e.target.value),
                          })
                        }
                        className="w-20 p-1.5 bg-slate-50 border border-slate-200 rounded font-mono font-bold text-right"
                      />
                      <span className="text-slate-500 text-[11px]">{it.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <input
                type="checkbox"
                id="updateInvStock"
                checked={updateStockCheck}
                onChange={e => setUpdateStockCheck(e.target.checked)}
                className="rounded text-emerald-600"
              />
              <label htmlFor="updateInvStock" className="text-xs text-emerald-900 font-semibold cursor-pointer">
                Automatically increase available stock in Inventory and log "Stock In" transaction
              </label>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Warehouse Inspection / Quality Notes</label>
              <textarea
                rows={2}
                placeholder="Inspected by shopfloor quality engineer, rack allocation..."
                value={inwardNotes}
                onChange={e => setInwardNotes(e.target.value)}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowInwardModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteInward}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5"
              >
                <PackageCheck className="w-4 h-4" /> Commit Goods Inward
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {showPaymentModal && paymentPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Record Vendor Payment</h3>
                  <p className="text-[11px] text-slate-500">For {paymentPO.poNumber} ({paymentPO.supplierName})</p>
                </div>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">PO Grand Total:</span>
                <span className="font-mono font-bold text-slate-800">{formatINR(paymentPO.grandTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Already Paid:</span>
                <span className="font-mono font-bold text-emerald-700">{formatINR(paymentPO.paidAmount || 0)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                <span className="text-slate-800">Remaining Balance:</span>
                <span className="font-mono text-purple-700">
                  {formatINR(Math.max(0, paymentPO.grandTotal - (paymentPO.paidAmount || 0)))}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Payment Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(Number(e.target.value))}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Payment Method</label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                >
                  <option value="NEFT / Bank Transfer">NEFT / Bank Transfer</option>
                  <option value="RTGS Advance">RTGS</option>
                  <option value="Cheque">Cheque</option>
                  <option value="UPI">UPI / Net Banking</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Transaction / UTR / Cheque Ref #</label>
                <input
                  type="text"
                  placeholder="e.g. UTR-HDFC-9918237"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePayment}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-sm"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PO DETAIL & PRINT VIEW MODAL */}
      {showDetailModal && selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">{selectedPO.poNumber}</h3>
                  <p className="text-[11px] text-slate-500">Date: {selectedPO.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold flex items-center gap-1.5 hover:bg-slate-50"
                >
                  <Printer className="w-3.5 h-3.5" /> Print PO
                </button>
                <button onClick={() => setShowDetailModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Vendor / Supplier</span>
                  <p className="font-extrabold text-slate-900 text-sm mt-0.5">{selectedPO.supplierName}</p>
                  <p className="text-slate-600 mt-0.5">{selectedPO.supplierContact}</p>
                  <p className="font-mono text-slate-600">{selectedPO.supplierPhone}</p>
                  <p className="text-slate-500">{selectedPO.supplierCity}, {selectedPO.supplierState}</p>
                  {selectedPO.supplierGstin && (
                    <p className="font-mono text-slate-700 font-bold mt-1">GSTIN: {selectedPO.supplierGstin}</p>
                  )}
                </div>

                <div className="space-y-1 text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Ship To Delivery Unit</span>
                  <p className="font-bold text-slate-800">{currentTenant?.name || 'StockItEase'}</p>
                  <p className="text-slate-600">Plot 12, Sector 24 Industrial Area</p>
                  <p className="text-slate-600">Faridabad, Haryana - 121005</p>
                  <p className="font-mono text-slate-600">GSTIN: 06AABCA1234F1Z8</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase">
                    <tr>
                      <th className="p-2.5">Item & Description</th>
                      <th className="p-2.5 text-center">HSN</th>
                      <th className="p-2.5 text-right">Qty</th>
                      <th className="p-2.5 text-right">Unit Price</th>
                      <th className="p-2.5 text-right">Taxable</th>
                      <th className="p-2.5 text-right">GST %</th>
                      <th className="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPO.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-bold text-slate-800">
                          {it.itemName}
                          {it.itemCode && <span className="block font-mono text-[10px] text-slate-400">{it.itemCode}</span>}
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-600">{it.hsnCode || '—'}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-800">{it.quantity} {it.unit}</td>
                        <td className="p-2.5 text-right font-mono">{formatINR(it.unitPrice)}</td>
                        <td className="p-2.5 text-right font-mono">{formatINR(it.taxableAmount)}</td>
                        <td className="p-2.5 text-right font-mono">{it.gstPercentage}%</td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">{formatINR(it.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Taxable Subtotal:</span>
                    <span className="font-mono font-bold text-slate-800">{formatINR(selectedPO.taxableAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total GST:</span>
                    <span className="font-mono font-bold text-slate-800">{formatINR(selectedPO.gstTotal)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-extrabold text-sm text-slate-900">
                    <span>Grand Total:</span>
                    <span className="font-mono text-sky-700">{formatINR(selectedPO.grandTotal)}</span>
                  </div>
                </div>
              </div>

              {selectedPO.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Order Notes:</span>
                  <p className="text-slate-700 mt-0.5">{selectedPO.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IMPORT PURCHASE ORDERS MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Import Purchase Orders from Excel</h3>
                  <p className="text-[11px] text-slate-500">Bulk upload inward supplier purchase records</p>
                </div>
              </div>
              <button onClick={() => setShowImportModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template download */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-800">PO Import Template</p>
                <p className="text-[11px] text-slate-500">Columns: PO Number, Date, Supplier Name, GSTIN, Total Amount, Status</p>
              </div>
              <button
                onClick={handleDownloadSamplePOExcel}
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
                id="poExcelUpload"
                className="hidden"
                onChange={handlePOFileChange}
              />
              <label htmlFor="poExcelUpload" className="cursor-pointer space-y-2 block">
                <Upload className="w-8 h-8 mx-auto text-emerald-600" />
                <div>
                  <span className="font-bold text-emerald-700 hover:underline">Choose Excel file</span> or drag & drop here
                </div>
                <p className="text-[10px] text-slate-400">Supported formats: .xlsx, .xls</p>
                {importFile && (
                  <p className="text-xs font-bold text-slate-800 bg-white inline-block px-3 py-1 rounded-full border border-slate-200 mt-2">
                    Selected: {importFile.name} ({parsedPOs.length} PO rows recognized)
                  </p>
                )}
              </label>
            </div>

            {/* Preview of Parsed POs */}
            {parsedPOs.length > 0 && (
              <div className="space-y-2">
                <span className="font-bold text-slate-700">Preview ({parsedPOs.length} orders ready):</span>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {parsedPOs.slice(0, 5).map((p, i) => (
                    <div key={i} className="p-2 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-bold text-slate-800">{p.supplierName}</span>
                        <div className="text-slate-400 font-mono">{p.poNumber} • {p.supplierCity}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-900">{formatINR(p.grandTotal)}</span>
                        <div className="text-[10px] text-slate-500">{p.status}</div>
                      </div>
                    </div>
                  ))}
                  {parsedPOs.length > 5 && (
                    <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50">
                      + {parsedPOs.length - 5} more purchase orders
                    </div>
                  )}
                </div>
              </div>
            )}

            {importSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold">{importSuccessMsg}</span>
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
                disabled={parsedPOs.length === 0 || importing}
                onClick={handleExecutePOImport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5"
              >
                {importing ? 'Processing...' : `Import ${parsedPOs.length} Purchase Orders`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Authorization Deletion Modal */}
      <AdminAuthModal
        isOpen={Boolean(poToDelete)}
        onClose={() => setPoToDelete(null)}
        onConfirm={handleConfirmDeletePO}
        title="Delete Purchase Order"
        itemType="Purchase Order"
        itemName={poToDelete ? `${poToDelete.poNumber} (${poToDelete.supplierName} - ${formatINR(poToDelete.grandTotal)})` : ''}
        warningMessage="Deleting a Purchase Order removes supplier procurement records and audit references."
      />
    </div>
  );
};
