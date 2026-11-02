import React, { useState, useEffect, useRef } from 'react';
import {
  Cog,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Boxes,
  IndianRupee,
  FileText,
  Tag,
  X,
  ExternalLink,
  Layers,
  Trash2,
  AlertTriangle,
  Upload,
  Download,
  ImagePlus,
} from 'lucide-react';
import { Product } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { AdminAuthModal } from '../components/common/AdminAuthModal.tsx';
import { parseExcelFile, exportToExcel, downloadExcelTemplate } from '../utils/excel.ts';
import { fileToSmallImage } from '../utils/image.ts';

const DEFAULT_CATEGORIES = [
  'Cutting Machines',
  'Stitching Machines',
  'Sole Machines',
  'Lasting Machines',
  'Finishing Machines',
  'Injection Machines',
  'Press Machines',
  'Grinding Machines',
  'Buffing Machines',
  'Moulding Machines',
  'Assembly Machines',
  'Testing Machines',
  'Other Footwear Machines',
];

const IMPORT_HEADERS = [
  'Name', 'Model Number', 'Category', 'Brand', 'Price', 'GST %', 'Unit',
  'Stock', 'Min Stock', 'Description', 'Specifications', 'Image URL',
];
const NEW_CATEGORY = '__new__';

interface ProductsViewProps {
  initialProductId?: string;
  onSelectMachineForQuote?: (product: Product) => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  initialProductId,
  onSelectMachineForQuote,
}) => {
  const { activeCompanyId, isSuperAdmin, isAllTenantsView, currentUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Categories = built-in list + every category already used by a product + ones typed by the user
  const [knownCats, setKnownCats] = useState<string[]>(DEFAULT_CATEGORIES);
  const categories = knownCats;
  const [customCategory, setCustomCategory] = useState('');
  const [newImage, setNewImage] = useState<string>('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const addKnownCategory = (names: string[]) => {
    setKnownCats(prev => {
      const set = new Set(prev.map(c => c.toLowerCase()));
      const next = [...prev];
      names.forEach(n => {
        const t = (n || '').trim();
        if (t && !set.has(t.toLowerCase())) {
          set.add(t.toLowerCase());
          next.push(t);
        }
      });
      return next.length === prev.length ? prev : next;
    });
  };

  const [newForm, setNewForm] = useState({
    name: '',
    category: 'Cutting Machines',
    modelNumber: '',
    brand: 'StockItEase',
    price: 350000,
    gstPercentage: 18,
    unit: 'Unit',
    currentStock: 2,
    minStock: 1,
    description: '',
    specificationsStr: 'Cutting Force: 25 Tons\nBed Size: 1000 x 500 mm\nMotor Power: 2.2 kW\nWeight: 950 kg',
    notes: '',
  });

  const [error, setError] = useState<string | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const comp = isSuperAdmin ? (isAllTenantsView ? 'all' : activeCompanyId) : (currentUser?.companyId || 'org-1');
      const list = await api.getProducts({ search, category: categoryFilter, companyId: comp });
      setProducts(list);
      addKnownCategory(list.map(p => p.category));
      if (initialProductId) {
        const found = list.find(p => p.id === initialProductId);
        if (found) setSelectedProduct(found);
      }
    } catch (e: any) {
      console.error('Failed to load products:', e);
      setError(e?.message || 'Failed to load products from database.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      await api.deleteProduct(productToDelete.id);
      if (selectedProduct?.id === productToDelete.id) {
        setSelectedProduct(null);
      }
      setProductToDelete(null);
      loadProducts();
    } catch (err: any) {
      alert(`Error deleting machine: ${err.message}`);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [search, categoryFilter, activeCompanyId, isAllTenantsView]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const specs: Record<string, string> = {};
      newForm.specificationsStr.split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          specs[parts[0].trim()] = parts.slice(1).join(':').trim();
        }
      });

      const finalCategory =
        newForm.category === NEW_CATEGORY ? customCategory.trim() : newForm.category;
      if (!finalCategory) {
        alert('Please type the new category name.');
        return;
      }
      addKnownCategory([finalCategory]);

      await api.createProduct({
        name: newForm.name,
        category: finalCategory,
        images: newImage ? [newImage] : undefined,
        modelNumber: newForm.modelNumber,
        brand: newForm.brand,
        price: Number(newForm.price),
        gstPercentage: Number(newForm.gstPercentage),
        unit: newForm.unit,
        currentStock: Number(newForm.currentStock),
        minStock: Number(newForm.minStock),
        description: newForm.description,
        specifications: specs,
        notes: newForm.notes,
      });

      setShowAddModal(false);
      setNewImage('');
      setCustomCategory('');
      loadProducts();
    } catch (err: any) {
      alert(`Error creating machine: ${err.message}`);
    }
  };

  const specsToText = (specs?: Record<string, string>) =>
    Object.entries(specs || {}).map(([k, v]) => `${k}: ${v}`).join('; ');

  const handleExport = async () => {
    try {
      const list = await api.getProducts();
      await exportToExcel(
        `products-${new Date().toISOString().slice(0, 10)}`,
        'Products',
        IMPORT_HEADERS,
        list.map(p => [
          p.name, p.modelNumber, p.category, p.brand, p.price, p.gstPercentage, p.unit,
          p.currentStock, p.minStock, p.description, specsToText(p.specifications),
          (p.images?.[0] || '').startsWith('http') ? p.images[0] : '',
        ])
      );
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const handleTemplate = () =>
    downloadExcelTemplate('products-import-template', 'Products', IMPORT_HEADERS, [
      ['Sample Cutting Machine', 'MODEL-001', 'Cutting Machines', 'MyBrand', 350000, 18, 'Unit',
       2, 1, 'Short description', 'Cutting Force: 25 Tons; Motor Power: 2.2 kW', ''],
    ]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const { rows } = await parseExcelFile(file);
      const existing = await api.getProducts();
      const have = new Set(existing.map(p => (p.modelNumber || '').trim().toLowerCase()));
      const items: Partial<Product>[] = [];
      let skipped = 0;
      const num = (v: string, d: number) => (v !== '' && !isNaN(Number(v)) ? Number(v) : d);

      for (const r of rows) {
        const name = (r['Name'] || '').trim();
        const model = (r['Model Number'] || '').trim();
        if (!name || !model) { skipped++; continue; }
        const key = model.toLowerCase();
        if (have.has(key)) { skipped++; continue; } // same model already exists
        have.add(key);

        const specs: Record<string, string> = {};
        (r['Specifications'] || '').split(/;|\n/).forEach(part => {
          const i = part.indexOf(':');
          if (i > 0) specs[part.slice(0, i).trim()] = part.slice(i + 1).trim();
        });
        const img = (r['Image URL'] || '').trim();

        items.push({
          name,
          modelNumber: model,
          category: (r['Category'] || '').trim() || 'Other Footwear Machines',
          brand: (r['Brand'] || '').trim() || undefined,
          price: num(r['Price'], 0),
          gstPercentage: num(r['GST %'], 18),
          unit: (r['Unit'] || '').trim() || 'Unit',
          currentStock: num(r['Stock'], 0),
          minStock: num(r['Min Stock'], 1),
          description: r['Description'] || '',
          specifications: specs,
          images: /^https:\/\//i.test(img) ? [img] : undefined,
        });
      }

      if (items.length === 0) {
        setImportMsg(`Nothing imported. ${skipped} row(s) skipped (missing Name/Model Number, or the model already exists).`);
      } else {
        const res = await api.bulkImportInventory(items);
        setImportMsg(`Imported ${res.imported} of ${items.length} machines. ${skipped} row(s) skipped. ${res.failed ? res.failed + ' failed.' : ''}`);
        loadProducts();
      }
    } catch (err: any) {
      setImportMsg(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handlePickNewImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setNewImage(await fileToSmallImage(file));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleChangeImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedProduct) return;
    try {
      const img = await fileToSmallImage(file);
      const updated = await api.updateProduct(selectedProduct.id, { images: [img] });
      setSelectedProduct({ ...selectedProduct, images: updated.images });
      loadProducts();
    } catch (err: any) {
      alert(`Could not save image: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Cog className="w-5 h-5 text-sky-600" />
            Products & Machinery Inventory Catalogue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your client's industrial machinery, equipment specs, inventory levels, and pricing models
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
          <button
            onClick={handleTemplate}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Template
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" /> {importing ? 'Importing...' : 'Import'}
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add New Machine
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="bg-sky-50 border border-sky-200 text-sky-900 text-xs rounded-lg p-3 flex items-start justify-between gap-3">
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg(null)} className="text-sky-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2.5 items-center justify-between">
        <div className="flex flex-wrap gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search machine name, model number, specifications..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
          >
            <option value="all">All Categories ({categories.length})</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={loadProducts}
          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Machines Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
            Loading machinery catalog...
          </div>
        ) : error ? (
          <div className="col-span-full py-16 text-center text-rose-600 bg-rose-50 rounded-xl border border-rose-200 p-6">
            <AlertTriangle className="w-10 h-10 mx-auto text-rose-500 mb-2" />
            <p className="font-semibold">{error}</p>
            <button
              onClick={loadProducts}
              className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 cursor-pointer"
            >
              Retry Loading Catalog
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <Cog className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">No machinery matching criteria</p>
          </div>
        ) : (
          products.map(prod => (
            <div
              key={prod.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-sky-300 hover:shadow-lg transition-all flex flex-col justify-between overflow-hidden"
            >
              <div>
                {/* Photo banner */}
                <div className="relative h-44 bg-slate-900 overflow-hidden">
                  <img
                    src={prod.images?.[0] || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80'}
                    alt={prod.name}
                    className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2.5 left-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-950/80 text-sky-400 backdrop-blur-xs border border-sky-500/30">
                      {prod.category}
                    </span>
                  </div>
                  <div className="absolute top-2.5 right-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-950/80 text-white font-mono">
                      {prod.modelNumber}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-2.5">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 leading-snug line-clamp-2">
                      {prod.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {prod.description}
                    </p>
                  </div>

                  {/* Key specs highlight */}
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
                    {Object.entries(prod.specifications || {}).slice(0, 3).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">{key}:</span>
                        <span className="font-semibold text-slate-700">{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Stock Availability */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500 text-[11px]">Factory Inventory:</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      prod.availableStock <= prod.minStock
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {prod.availableStock} Available ({prod.reservedStock} Reserved)
                    </span>
                  </div>
                </div>
              </div>

              {/* Price & Action Footer */}
              <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Ex-Factory Price</span>
                  <span className="text-sm font-extrabold text-emerald-700 font-mono">
                    ₹{prod.price.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">+18% GST</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSelectedProduct(prod)}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-semibold text-xs transition-colors"
                  >
                    Specs
                  </button>
                  {onSelectMachineForQuote && (
                    <button
                      onClick={() => onSelectMachineForQuote(prod)}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
                    >
                      Quote
                    </button>
                  )}
                  <button
                    onClick={() => setProductToDelete(prod)}
                    title="Delete Machine (Requires Admin Permission)"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Machine Specifications Detailed Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider">
                  {selectedProduct.category}
                </span>
                <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                  {selectedProduct.name} [{selectedProduct.modelNumber}]
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setProductToDelete(selectedProduct)}
                  title="Delete Machine"
                  className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="flex items-center gap-3">
                <img
                  src={selectedProduct.images?.[0] || ''}
                  alt={selectedProduct.name}
                  className="w-24 h-24 object-cover rounded-lg border border-slate-200 bg-slate-100"
                />
                <label className="px-3 py-1.5 border border-slate-200 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
                  <ImagePlus className="w-3.5 h-3.5" /> Change picture
                  <input type="file" accept="image/*" className="hidden" onChange={handleChangeImage} />
                </label>
              </div>
              <p className="text-slate-600 leading-relaxed">{selectedProduct.description}</p>

              <div>
                <h4 className="font-bold text-slate-900 mb-2 border-b border-slate-100 pb-1.5">
                  Technical Specifications
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {Object.entries(selectedProduct.specifications || {}).map(([key, val]) => (
                    <div key={key} className="flex justify-between py-1 border-b border-slate-200/60 text-xs">
                      <span className="text-slate-500 font-medium">{key}</span>
                      <span className="font-bold text-slate-800">{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-100/70 p-3 rounded-xl">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Ex-Works Price</span>
                  <p className="font-bold text-slate-900 font-mono">₹{selectedProduct.price.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">GST Rate</span>
                  <p className="font-bold text-slate-900 font-mono">{selectedProduct.gstPercentage}%</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Current Stock</span>
                  <p className="font-bold text-slate-900">{selectedProduct.currentStock} Units</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Available</span>
                  <p className="font-bold text-emerald-700">{selectedProduct.availableStock} Units</p>
                </div>
              </div>

              {selectedProduct.notes && (
                <div>
                  <h4 className="font-bold text-slate-900 mb-1">Commercial / Assembly Notes</h4>
                  <p className="text-slate-600 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200">
                    {selectedProduct.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add New Machine Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-extrabold text-slate-900 text-base">Add Footwear Machine to Catalogue</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="p-6 overflow-y-auto space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Machine Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 9-Pincer Automatic Computerized Toe Lasting Machine"
                    value={newForm.name}
                    onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Category *</label>
                  <select
                    value={newForm.category}
                    onChange={e => setNewForm({ ...newForm, category: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>+ Create new category...</option>
                  </select>
                  {newForm.category === NEW_CATEGORY && (
                    <input
                      type="text"
                      autoFocus
                      placeholder="Type new category name"
                      value={customCategory}
                      onChange={e => setCustomCategory(e.target.value)}
                      className="w-full mt-1.5 p-2 bg-white border border-sky-300 rounded-lg text-xs"
                    />
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Model Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="AFM-TL-9P"
                    value={newForm.modelNumber}
                    onChange={e => setNewForm({ ...newForm, modelNumber: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Price (INR) *</label>
                  <input
                    type="number"
                    required
                    value={newForm.price}
                    onChange={e => setNewForm({ ...newForm, price: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Initial Stock (Units)</label>
                  <input
                    type="number"
                    value={newForm.currentStock}
                    onChange={e => setNewForm({ ...newForm, currentStock: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Picture (optional)</label>
                <div className="mt-1 flex items-center gap-3">
                  {newImage && <img src={newImage} alt="Preview" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />}
                  <label className="px-3 py-1.5 border border-slate-200 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
                    <ImagePlus className="w-3.5 h-3.5" /> {newImage ? 'Change picture' : 'Choose picture'}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePickNewImage} />
                  </label>
                  {newImage && (
                    <button type="button" onClick={() => setNewImage('')} className="text-rose-600 font-semibold">Remove</button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                <textarea
                  rows={2}
                  value={newForm.description}
                  onChange={e => setNewForm({ ...newForm, description: e.target.value })}
                  placeholder="Summary of machine capabilities..."
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Technical Specs (Key: Value per line)</label>
                <textarea
                  rows={3}
                  value={newForm.specificationsStr}
                  onChange={e => setNewForm({ ...newForm, specificationsStr: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
                  Save Machine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Authorization Deletion Modal */}
      <AdminAuthModal
        isOpen={Boolean(productToDelete)}
        onClose={() => setProductToDelete(null)}
        onConfirm={handleConfirmDeleteProduct}
        title="Delete Machinery Model"
        itemType="Product"
        itemName={productToDelete ? `${productToDelete.name} [${productToDelete.modelNumber}]` : ''}
        warningMessage="Deleting this machinery model removes its specifications from the catalogue."
      />
    </div>
  );
};
