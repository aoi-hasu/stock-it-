import React, { useState } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  Download,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { parseExcelFile, downloadExcelTemplate } from '../utils/excel.ts';
import { api } from '../services/api.ts';

interface ExcelImportModalProps {
  onClose: () => void;
  onImportComplete: () => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ onClose, onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<{ [key: string]: string }>({
    companyName: '',
    contactPerson: '',
    mobile: '',
    whatsapp: '',
    email: '',
    city: '',
    state: '',
    requirement: '',
    productInterested: '',
  });
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update'>('skip');
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'result'>('upload');
  const [importResult, setImportResult] = useState<{
    total: number;
    imported: number;
    duplicates: number;
    errors: string[];
  } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);

    try {
      const { headers, rows } = await parseExcelFile(uploadedFile);

      if (headers && headers.length > 0) {
        setParsedHeaders(headers);
        setParsedData(rows);

        // Auto-guess mapping
        const initialMapping: { [key: string]: string } = {};
        headers.forEach(header => {
          const h = header.toLowerCase();
          if (h.includes('company') || h.includes('firm') || h.includes('buyer')) initialMapping.companyName = header;
          if (h.includes('contact') || h.includes('person') || h.includes('name')) initialMapping.contactPerson = header;
          if (h.includes('mobile') || h.includes('phone') || h.includes('contact no')) initialMapping.mobile = header;
          if (h.includes('whatsapp')) initialMapping.whatsapp = header;
          if (h.includes('email') || h.includes('mail')) initialMapping.email = header;
          if (h.includes('city') || h.includes('location')) initialMapping.city = header;
          if (h.includes('state')) initialMapping.state = header;
          if (h.includes('machine') || h.includes('product')) initialMapping.productInterested = header;
          if (h.includes('requirement') || h.includes('query')) initialMapping.requirement = header;
        });

        setColumnMapping(prev => ({ ...prev, ...initialMapping }));
        setStep('mapping');
      }
    } catch (err: any) {
      console.error('Failed to parse spreadsheet', err);
      alert(err.message || 'Could not parse Excel/CSV file. Please ensure valid formatting.');
    }
  };

  const handleDownloadSample = async () => {
    const sampleHeaders = ['Company Name', 'Contact Person', 'Mobile Number', 'WhatsApp Number', 'Email', 'City', 'State', 'Machine Interested', 'Requirement Notes'];
    const sampleRows = [
      ['Apex Industrial Corp', 'Rajesh Gupta', '9876543210', '9876543210', 'rajesh@apexcorp.test', 'Mumbai', 'Maharashtra', 'Precision Assembly Machine', 'Looking for delivery schedule'],
      ['Pinnacle Technologies', 'Vikram Malhotra', '9812345678', '9812345678', 'vikram@pinnacle.test', 'Bengaluru', 'Karnataka', 'Heavy Industrial Press', 'Requires technical demonstration'],
    ];

    await downloadExcelTemplate('StockItEase_Leads_Template.xlsx', 'Leads Template', sampleHeaders, sampleRows);
  };

  const handleExecuteImport = async () => {
    setStep('importing');
    try {
      // Map rows to lead objects
      const leadsToImport = parsedData.map(row => ({
        companyName: row[columnMapping.companyName] || '',
        contactPerson: row[columnMapping.contactPerson] || '',
        mobile: row[columnMapping.mobile] || '',
        whatsapp: row[columnMapping.whatsapp] || row[columnMapping.mobile] || '',
        email: row[columnMapping.email] || '',
        city: row[columnMapping.city] || '',
        state: row[columnMapping.state] || '',
        country: 'India',
        source: 'IndiaMART',
        status: 'New',
        priority: 'Medium',
        productInterested: row[columnMapping.productInterested] || row[columnMapping.requirement] || '',
        requirement: row[columnMapping.requirement] || '',
      })).filter(l => l.mobile || l.companyName || l.contactPerson);

      const result = await api.importLeads(leadsToImport, duplicateAction);
      setImportResult({
        total: leadsToImport.length,
        imported: result.imported || leadsToImport.length,
        duplicates: result.duplicates || 0,
        errors: result.errors || [],
      });
      setStep('result');
      onImportComplete();
    } catch (err: any) {
      console.error('Import failed', err);
      alert('Error during lead import: ' + (err.message || 'Server error'));
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg">Import Leads from Excel (.xlsx)</h2>
              <p className="text-xs text-slate-300">Bulk upload buyer enquiries with column mapping</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Content */}
        <div className="p-6 text-xs">
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-2xl p-8 text-center bg-slate-50 transition cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h3 className="font-bold text-sm text-slate-800">Choose Excel spreadsheet (.xlsx)</h3>
                <p className="text-slate-500 mt-1">Drag and drop or click here to browse</p>
                <div className="mt-4 inline-block px-3 py-1 bg-white border border-slate-200 rounded-full font-mono text-[11px] text-slate-600">
                  Supports IndiaMART lead exports, TradeIndia & custom files
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-sky-50/70 border border-sky-200 rounded-xl">
                <div className="flex items-center gap-2 text-slate-700">
                  <HelpCircle className="w-5 h-5 text-sky-600 shrink-0" />
                  <span>Need an example template with standard columns?</span>
                </div>
                <button
                  onClick={handleDownloadSample}
                  className="px-3 py-1.5 bg-white text-sky-700 hover:bg-sky-100 border border-sky-200 rounded-lg font-bold flex items-center gap-1.5 shadow-2xs transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Sample Excel
                </button>
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="font-semibold text-slate-800">
                  Found {parsedData.length} records in <span className="font-mono text-sky-600">{file?.name}</span>.
                </p>
                <p className="text-slate-500">Map your file columns to StockItEase fields below:</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto p-1">
                {[
                  { field: 'companyName', label: 'Company / Firm Name', req: true },
                  { field: 'contactPerson', label: 'Contact Person Name', req: false },
                  { field: 'mobile', label: 'Mobile Number', req: true },
                  { field: 'whatsapp', label: 'WhatsApp Number', req: false },
                  { field: 'email', label: 'Email Address', req: false },
                  { field: 'city', label: 'City', req: false },
                  { field: 'state', label: 'State', req: false },
                  { field: 'productInterested', label: 'Machine Interested', req: false },
                  { field: 'requirement', label: 'Requirement Notes', req: false },
                ].map(({ field, label, req }) => (
                  <div key={field} className="p-2.5 bg-white border border-slate-200 rounded-lg">
                    <label className="block font-semibold text-slate-700 mb-1">
                      {label} {req && <span className="text-red-500">*</span>}
                    </label>
                    <select
                      value={columnMapping[field] || ''}
                      onChange={e => setColumnMapping({ ...columnMapping, [field]: e.target.value })}
                      className="w-full px-2.5 py-1.5 border rounded bg-slate-50 font-medium"
                    >
                      <option value="">-- Do Not Import --</option>
                      {parsedHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Duplicate Handling */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                <span className="font-bold text-amber-900 block">Duplicate Handling (Mobile / Email):</span>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="dup"
                      checked={duplicateAction === 'skip'}
                      onChange={() => setDuplicateAction('skip')}
                    />
                    <span>Skip duplicates</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="dup"
                      checked={duplicateAction === 'update'}
                      onChange={() => setDuplicateAction('update')}
                    />
                    <span>Update existing lead</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 border rounded-lg"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('preview')}
                  disabled={!columnMapping.mobile && !columnMapping.companyName}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg disabled:opacity-50"
                >
                  Preview First 3 Rows
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800">Preview Data to be Imported</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="p-2">Company</th>
                      <th className="p-2">Contact</th>
                      <th className="p-2">Mobile</th>
                      <th className="p-2">City</th>
                      <th className="p-2">Machine Requirement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedData.slice(0, 3).map((r, i) => (
                      <tr key={i}>
                        <td className="p-2 font-bold">{r[columnMapping.companyName] || '—'}</td>
                        <td className="p-2">{r[columnMapping.contactPerson] || '—'}</td>
                        <td className="p-2 font-mono text-sky-600">{r[columnMapping.mobile] || '—'}</td>
                        <td className="p-2">{r[columnMapping.city] || '—'}</td>
                        <td className="p-2 truncate max-w-xs">{r[columnMapping.productInterested] || r[columnMapping.requirement] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setStep('mapping')}
                  className="px-4 py-2 border rounded-lg"
                >
                  Adjust Mapping
                </button>
                <button
                  onClick={handleExecuteImport}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Confirm & Import ({parsedData.length} leads)
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-10 h-10 animate-spin text-sky-600 mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">Importing leads into StockItEase...</h3>
              <p className="text-slate-500">Checking for duplicate numbers and saving records.</p>
            </div>
          )}

          {step === 'result' && importResult && (
            <div className="space-y-5 text-center py-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Import Complete!</h3>
                <p className="text-slate-500 mt-1">Processed {importResult.total} leads from your file.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-xl font-bold text-emerald-700 block">{importResult.imported}</span>
                  <span className="text-[11px] text-emerald-800 font-medium">Successfully Added</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-xl font-bold text-slate-700 block">{importResult.duplicates}</span>
                  <span className="text-[11px] text-slate-600 font-medium">Duplicates Handled</span>
                </div>
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="text-left bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs max-h-40 overflow-y-auto">
                  <div className="font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    Row-level notices ({importResult.errors.length}):
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-amber-800 font-mono text-[11px]">
                    {importResult.errors.slice(0, 20).map((err, idx) => (
                      <li key={idx} className="break-words">{err}</li>
                    ))}
                    {importResult.errors.length > 20 && (
                      <li className="italic text-amber-700">...and {importResult.errors.length - 20} additional rows skipped/flagged.</li>
                    )}
                  </ul>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl cursor-pointer"
              >
                Close & View Leads
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
