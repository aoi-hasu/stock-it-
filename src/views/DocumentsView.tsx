import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Upload,
  RefreshCw,
  Search,
  FileText,
  FileImage,
  FileSpreadsheet,
  Download,
  Trash2,
  X,
} from 'lucide-react';
import { DocumentItem } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';

export const DocumentsView: React.FC = () => {
  const { currentUser } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [entityType, setEntityType] = useState<'lead' | 'customer' | 'quotation' | 'order' | 'product' | 'general'>('general');
  const [entityName, setEntityName] = useState('');
  const [uploading, setUploading] = useState(false);

  const isAdmin = ['super_admin', 'owner', 'admin'].includes(currentUser?.role || '');

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await api.getDocuments();
      setDocuments(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleDownload = async (doc: DocumentItem) => {
    try {
      const url = await api.getDocumentSignedUrl(doc);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Failed to retrieve download link: ${err.message}`);
    }
  };

  const handleDelete = async (doc: DocumentItem) => {
    if (!window.confirm(`Are you sure you want to delete "${doc.fileName}"? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(doc.id);
      loadDocs();
    } catch (err: any) {
      alert(`Failed to delete document: ${err.message}`);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('entityType', entityType);
    formData.append('entityName', entityName || 'General');
    formData.append('uploadedBy', currentUser?.name || 'Administrator');

    try {
      await api.uploadDocument(formData);
      setShowUploadModal(false);
      setUploadFile(null);
      setEntityName('');
      loadDocs();
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const filtered = documents.filter(d => {
    const q = search.toLowerCase();
    return d.fileName.toLowerCase().includes(q) || (d.entityName && d.entityName.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-sky-600" />
            Documents & Machinery Technical Files Repository
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Brochures, plant layouts, customer purchase orders, GST certificates, and inspection trial sheets
          </p>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Upload className="w-4 h-4" /> + Upload Document
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search document name or client..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
          />
        </div>
        <button
          onClick={loadDocs}
          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
            Loading documents repository...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <FolderOpen className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">No documents found</p>
          </div>
        ) : (
          filtered.map(doc => (
            <div
              key={doc.id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-sky-300 transition-all flex items-start justify-between gap-3 text-xs"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-sky-50 text-sky-600 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 truncate max-w-[180px]">{doc.fileName}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {doc.entityName} • <span className="capitalize">{doc.entityType}</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {(doc.fileSize / 1024).toFixed(1)} KB • By {doc.uploadedBy} on {new Date(doc.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  className="p-2 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  title="Download file"
                >
                  <Download className="w-4 h-4" />
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                    title="Delete document (Admin)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Upload Document</h3>
              <button onClick={() => setShowUploadModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Select File *</label>
                <input
                  type="file"
                  required
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Associate Category</label>
                <select
                  value={entityType}
                  onChange={e => setEntityType(e.target.value as any)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="general">General Plant Document</option>
                  <option value="lead">Sales Lead</option>
                  <option value="customer">Customer PO / GST</option>
                  <option value="quotation">Quotation Specs</option>
                  <option value="order">Order Dispatch Challan</option>
                  <option value="product">Machine Technical Manual</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Entity / Customer Name</label>
                <input
                  type="text"
                  placeholder="e.g. Lancer Footwear PO"
                  value={entityName}
                  onChange={e => setEntityName(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
                >
                  {uploading ? 'Uploading...' : 'Confirm Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
