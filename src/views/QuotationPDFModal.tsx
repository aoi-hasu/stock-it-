import React, { useState, useEffect } from 'react';
import { X, Printer, Download, FileText, Factory, ShieldCheck, CheckCircle2, Building, Sparkles, Mail, Send } from 'lucide-react';
import { Quotation, CompanySettings } from '../types/index.ts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numberToIndianWords } from '../utils/formatters.ts';
import { api } from '../services/api.ts';
import { postQuoteService } from '../services/postQuotePipeline.ts';

interface QuotationPDFModalProps {
  quotation: Quotation;
  companySettings: CompanySettings;
  onClose: () => void;
}

type TemplateTheme = 'modern' | 'industrial' | 'classic';

export const QuotationPDFModal: React.FC<QuotationPDFModalProps> = ({
  quotation,
  companySettings,
  onClose,
}) => {
  const [templateTheme, setTemplateTheme] = useState<TemplateTheme>('modern');

  // Product pictures (only uploaded ones, stored as data: text) shown next to each line
  const [itemImages, setItemImages] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    api.getProducts().then(list => {
      if (!alive) return;
      const map: Record<string, string> = {};
      list.forEach(p => {
        const img = p.images?.[0];
        if (img && img.startsWith('data:image/jpeg')) map[p.id] = img;
      });
      setItemImages(map);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const amountInWords = numberToIndianWords(quotation.grandTotal);

  const handleDownloadPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const isIndustrial = templateTheme === 'industrial';

    // Header Color Banner
    if (isIndustrial) {
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 38, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text(companySettings.companyName.toUpperCase(), 14, 16);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(186, 230, 253);
      doc.text(companySettings.tagline, 14, 22);
      doc.setTextColor(226, 232, 240);
      doc.text(`${companySettings.address}, ${companySettings.city}, ${companySettings.state} - ${companySettings.pincode}`, 14, 27);
      doc.text(`GSTIN: ${companySettings.gstin} | PAN: ${companySettings.pan} | Phone: ${companySettings.phone}`, 14, 32);

      // Title badge
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(56, 189, 248);
      doc.text('COMMERCIAL QUOTATION', 135, 16);
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(`Ref: ${quotation.quotationNumber}`, 135, 22);
      doc.text(`Date: ${quotation.date}`, 135, 27);
      doc.text(`Valid Until: ${quotation.validUntil}`, 135, 32);
    } else {
      // Modern / Classic
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text(companySettings.companyName.toUpperCase(), 14, 18);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(companySettings.tagline, 14, 23);
      doc.text(`${companySettings.address}, ${companySettings.city}, ${companySettings.state} - ${companySettings.pincode}`, 14, 28);
      doc.text(`Phone: ${companySettings.phone} | Email: ${companySettings.email}`, 14, 33);
      doc.text(`GSTIN: ${companySettings.gstin} | PAN: ${companySettings.pan} | Web: ${companySettings.website}`, 14, 38);

      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.8);
      doc.line(14, 41, 196, 41);

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(2, 132, 199);
      doc.text('COMMERCIAL QUOTATION', 14, 48);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(`Quotation #: ${quotation.quotationNumber}`, 130, 48);
      doc.text(`Date of Issue: ${quotation.date}`, 130, 53);
      doc.text(`Validity: Valid until ${quotation.validUntil}`, 130, 58);
    }

    const startMetaY = isIndustrial ? 44 : 54;

    // Buyer Information
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('BUYER / CLIENT DETAILS:', 14, startMetaY);
    doc.setFontSize(9.5);
    doc.text(quotation.customerName, 14, startMetaY + 5);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`Attn: ${quotation.contactPerson}`, 14, startMetaY + 10);
    doc.text(`Mobile: ${quotation.mobile} | Email: ${quotation.email || 'N/A'}`, 14, startMetaY + 15);
    doc.text(`Delivery Location: ${quotation.shippingAddress || quotation.billingAddress || 'As per order'}`, 14, startMetaY + 20, { maxWidth: 110 });

    // Quotation Details
    doc.setFont('helvetica', 'bold');
    doc.text('ORDER & SALES DETAILS:', 130, startMetaY);
    doc.setFont('helvetica', 'normal');
    doc.text(`Sales Officer: ${quotation.salespersonName || 'Direct Technical Sales'}`, 130, startMetaY + 5);
    doc.text(`Status: ${quotation.status.toUpperCase()}`, 130, startMetaY + 10);
    doc.text(`HSN / SAC: ${companySettings.defaultHsnCode || '-'}`, 130, startMetaY + 15);
    doc.text(`Payment: ${quotation.paymentTerms}`, 130, startMetaY + 20, { maxWidth: 70 });

    // Line Items Table
    const tableData = quotation.items.map((item, idx) => [
      String(idx + 1),
      `${item.productName}\nModel: ${item.modelNumber}`,
      `${item.quantity}`,
      `₹${item.unitPrice.toLocaleString('en-IN')}`,
      `${item.discountPercentage}%`,
      `₹${item.taxableAmount.toLocaleString('en-IN')}`,
      `${item.gstPercentage}%`,
      `₹${item.totalAmount.toLocaleString('en-IN')}`,
    ]);

    const tableStartY = startMetaY + 26;

    autoTable(doc, {
      startY: tableStartY,
      head: [['#', 'Footwear Machine & Specifications', 'Qty', 'Unit Price', 'Disc', 'Taxable', 'GST', 'Total (INR)']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: isIndustrial ? [30, 41, 59] : [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
      },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 1) {
          const pid = quotation.items[data.row.index]?.productId;
          if (itemImages[pid]) {
            data.cell.styles.cellPadding = { top: 2, bottom: 2, left: 20, right: 2 };
            data.cell.styles.minCellHeight = 18;
          }
        }
      },
      didDrawCell: data => {
        if (data.section === 'body' && data.column.index === 1) {
          const pid = quotation.items[data.row.index]?.productId;
          const img = itemImages[pid];
          if (img) {
            try {
              doc.addImage(img, 'JPEG', data.cell.x + 2, data.cell.y + 2, 15, 14);
            } catch { /* skip picture if it cannot be drawn */ }
          }
        }
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 64 },
        2: { cellWidth: 12, halign: 'center' },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 14, halign: 'center' },
        7: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;

    // Totals Block on Right
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`Subtotal:`, 130, finalY);
    doc.text(`₹${quotation.subtotal.toLocaleString('en-IN')}`, 194, finalY, { align: 'right' });

    doc.text(`Discount Total:`, 130, finalY + 5);
    doc.text(`- ₹${quotation.discountTotal.toLocaleString('en-IN')}`, 194, finalY + 5, { align: 'right' });

    doc.text(`Taxable Amount:`, 130, finalY + 10);
    doc.text(`₹${quotation.taxableAmount.toLocaleString('en-IN')}`, 194, finalY + 10, { align: 'right' });

    doc.text(`GST Total:`, 130, finalY + 15);
    doc.text(`₹${quotation.gstTotal.toLocaleString('en-IN')}`, 194, finalY + 15, { align: 'right' });

    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.5);
    doc.line(130, finalY + 18, 194, finalY + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(2, 132, 199);
    doc.text(`GRAND TOTAL:`, 130, finalY + 23);
    doc.text(`₹${quotation.grandTotal.toLocaleString('en-IN')}`, 194, finalY + 23, { align: 'right' });

    // Amount in Words
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    doc.text(`(${amountInWords})`, 130, finalY + 28, { maxWidth: 66 });

    // Terms & Conditions Block on Left
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('TERMS & COMMERCIAL CONDITIONS:', 14, finalY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`• Payment: ${quotation.paymentTerms}`, 14, finalY + 5, { maxWidth: 110 });
    doc.text(`• Delivery: ${quotation.deliveryTerms}`, 14, finalY + 11, { maxWidth: 110 });
    doc.text(`• Warranty: ${quotation.warrantyTerms}`, 14, finalY + 17, { maxWidth: 110 });

    // Bank Information
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('BANK DETAILS FOR REMITTANCE:', 14, finalY + 26);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`Bank: ${companySettings.bankName} | Branch: ${companySettings.bankBranch}`, 14, finalY + 31);
    doc.text(`A/C: ${companySettings.accountNumber} | IFSC: ${companySettings.ifscCode}`, 14, finalY + 36);

    // Signature Line
    doc.setDrawColor(203, 213, 225);
    doc.line(130, finalY + 48, 190, finalY + 48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`FOR ${companySettings.companyName.toUpperCase()}`, 130, finalY + 52);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Authorized Technical Signatory', 130, finalY + 56);

    doc.save(`${quotation.quotationNumber}_${quotation.customerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    // Automatically trigger Quote Sent state on PDF download/generation
    postQuoteService.triggerQuoteSent(quotation.id, { channel: 'link' }).catch(() => {});
  };

  const [emailing, setEmailing] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const handleEmailQuote = async () => {
    setEmailing(true);
    try {
      await postQuoteService.triggerQuoteSent(quotation.id, { channel: 'email' });
      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to trigger quote sent', err);
    } finally {
      setEmailing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
      {/* Print-specific style tag */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-quotation, #printable-quotation * {
            visibility: visible !important;
          }
          #printable-quotation {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 20mm !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white w-full max-w-4xl max-h-[96vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Modal Controls Header */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <FileText className="w-4 h-4 text-sky-600" />
            <span>Quotation Template: {quotation.quotationNumber}</span>
          </div>

          {/* Template Style Selector */}
          <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-lg text-xs">
            <button
              onClick={() => setTemplateTheme('modern')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                templateTheme === 'modern'
                  ? 'bg-white text-sky-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Modern Executive
            </button>
            <button
              onClick={() => setTemplateTheme('industrial')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                templateTheme === 'industrial'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Industrial Heavy
            </button>
            <button
              onClick={() => setTemplateTheme('classic')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                templateTheme === 'classic'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Classic GST
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-300 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" /> Print
            </button>
            <button
              onClick={handleEmailQuote}
              disabled={emailing || emailSuccess}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs ${
                emailSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
              title="Automatically trigger Quote Sent state and dispatch to lead"
            >
              {emailSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Emailed &amp; Sent!
                </>
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5" /> {emailing ? 'Dispatching...' : 'Email to Lead'}
                </>
              )}
            </button>
            <button
              onClick={handleDownloadPDF}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Quotation Sheet Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/60 text-slate-900">
          <div
            id="printable-quotation"
            className={`max-w-3xl mx-auto bg-white rounded-xl shadow-md border ${
              templateTheme === 'industrial'
                ? 'border-slate-800'
                : templateTheme === 'classic'
                ? 'border-slate-400'
                : 'border-slate-200'
            } overflow-hidden`}
          >
            {/* TEMPLATE VARIANT 1: MODERN EXECUTIVE */}
            {templateTheme === 'modern' && (
              <div className="p-8 sm:p-10 space-y-6">
                {/* Header */}
                <div className="border-b-2 border-sky-600 pb-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-sky-500 text-white font-black flex items-center justify-center shadow-md shadow-sky-600/30">
                          <Factory className="w-5 h-5" />
                        </div>
                        <div>
                          <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                            {companySettings.companyName.toUpperCase()}
                          </h1>
                          <p className="text-[11px] font-bold text-sky-700 tracking-wide">
                            {companySettings.tagline}
                          </p>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-2 space-y-0.5">
                        <p>{companySettings.address}, {companySettings.city}, {companySettings.state} - {companySettings.pincode}</p>
                        <p>Phone: {companySettings.phone} | Mobile: {companySettings.mobile} | Email: {companySettings.email}</p>
                        <p>
                          GSTIN: <strong className="font-mono text-slate-800 font-bold">{companySettings.gstin}</strong> | PAN: <strong className="font-mono text-slate-800 font-bold">{companySettings.pan}</strong> | Web: {companySettings.website}
                        </p>
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <span className="inline-block px-3 py-1 rounded-full bg-sky-100 text-sky-800 font-extrabold text-[10px] tracking-wider uppercase border border-sky-300">
                        Official Commercial Quotation
                      </span>
                      <p className="text-xl font-black text-slate-900 font-mono mt-2">
                        {quotation.quotationNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">Date: {quotation.date}</p>
                      <p className="text-[11px] text-rose-600 font-bold">Valid Until: {quotation.validUntil}</p>
                    </div>
                  </div>
                </div>

                {/* Meta details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Customer / Client Details
                    </span>
                    <p className="text-sm font-extrabold text-slate-950 mt-0.5">{quotation.customerName}</p>
                    <p className="text-slate-600 font-medium">Attn: {quotation.contactPerson}</p>
                    <p className="text-slate-600 font-mono">Mobile: {quotation.mobile}</p>
                    {quotation.email && <p className="text-slate-600">Email: {quotation.email}</p>}
                    <p className="text-slate-600 mt-1">Delivery Address: {quotation.shippingAddress || quotation.billingAddress || 'At factory site'}</p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Technical Sales & Specifications
                    </span>
                    <p className="text-slate-800 font-semibold mt-0.5">
                      Prepared By: {quotation.salespersonName || 'Direct Technical Sales'}
                    </p>
                    <p className="text-slate-600">Status: <strong className="text-sky-700">{quotation.status}</strong></p>
                    <p className="text-slate-600 mt-1 font-mono text-[11px]">
                      HSN / SAC Code: {companySettings.defaultHsnCode || '-'}{companySettings.defaultHsnDescription ? ` (${companySettings.defaultHsnDescription})` : ''}
                    </p>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-3 w-8">#</th>
                        <th className="py-2.5 px-3">Machinery & Specifications</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-center">Disc %</th>
                        <th className="py-2.5 px-3 text-right">Taxable</th>
                        <th className="py-2.5 px-3 text-center">GST %</th>
                        <th className="py-2.5 px-3 text-right">Total (INR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {quotation.items.map((it, idx) => (
                        <tr key={it.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 text-slate-500 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              {itemImages[it.productId] && (
                                <img src={itemImages[it.productId]} alt="" className="w-12 h-10 object-cover rounded border border-slate-200" />
                              )}
                              <div>
                                <div className="font-extrabold text-slate-900">{it.productName}</div>
                                <div className="text-[10px] text-slate-500 font-mono">Model: {it.modelNumber}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-800 font-mono">{it.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">₹{it.unitPrice.toLocaleString('en-IN')}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">{it.discountPercentage}%</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800 font-medium">₹{it.taxableAmount.toLocaleString('en-IN')}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">{it.gstPercentage}%</td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-950">₹{it.totalAmount.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary & Totals */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-3 text-xs text-slate-600">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-800 block mb-1">Commercial Terms:</span>
                      <p>• <strong>Payment:</strong> {quotation.paymentTerms}</p>
                      <p>• <strong>Delivery:</strong> {quotation.deliveryTerms}</p>
                      <p>• <strong>Warranty:</strong> {quotation.warrantyTerms}</p>
                    </div>

                    <div className="p-3 bg-sky-50/70 rounded-lg border border-sky-200">
                      <span className="font-bold text-sky-900 block mb-1">Bank Remittance Details:</span>
                      <p>Bank: <strong>{companySettings.bankName}</strong> | Branch: {companySettings.bankBranch}</p>
                      <p>A/C No: <strong className="font-mono">{companySettings.accountNumber}</strong></p>
                      <p>IFSC Code: <strong className="font-mono">{companySettings.ifscCode}</strong></p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal:</span>
                        <span className="font-mono font-semibold">₹{quotation.subtotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Discount:</span>
                        <span className="font-mono font-semibold text-rose-600">-₹{quotation.discountTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Taxable Value:</span>
                        <span className="font-mono font-semibold">₹{quotation.taxableAmount.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>GST Total:</span>
                        <span className="font-mono font-semibold">₹{quotation.gstTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="border-t border-slate-300 pt-2 flex justify-between text-sm font-black text-sky-900">
                        <span>Grand Total:</span>
                        <span className="font-mono text-base text-sky-700">₹{quotation.grandTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 italic mt-1">
                        Amount in words: {amountInWords}
                      </div>
                    </div>

                    <div className="pt-4 text-center sm:text-right">
                      <div className="inline-block text-center border-t border-slate-300 pt-2 min-w-[200px]">
                        <p className="font-bold text-slate-900 text-xs">FOR {companySettings.companyName.toUpperCase()}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Authorized Technical Signatory</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TEMPLATE VARIANT 2: INDUSTRIAL HEAVY-DUTY */}
            {templateTheme === 'industrial' && (
              <div className="space-y-6">
                {/* Heavy Dark Banner */}
                <div className="bg-slate-950 text-white p-6 sm:p-8 border-b-4 border-amber-500">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                          ENGINEERING SPECIFICATION & QUOTE
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">ISO 9001:2015 CERTIFIED</span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
                        {companySettings.companyName.toUpperCase()}
                      </h1>
                      <p className="text-xs text-slate-300 font-mono mt-0.5">
                        {companySettings.address}, {companySettings.city}, {companySettings.state} | GSTIN: {companySettings.gstin}
                      </p>
                    </div>

                    <div className="sm:text-right bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Quotation Reference</div>
                      <div className="text-lg font-black text-amber-400 font-mono">{quotation.quotationNumber}</div>
                      <div className="text-[11px] text-slate-300 mt-0.5">Date: {quotation.date}</div>
                      <div className="text-[11px] text-amber-300 font-bold">Valid: {quotation.validUntil}</div>
                    </div>
                  </div>
                </div>

                <div className="p-6 sm:p-8 pt-0 space-y-6">
                  {/* Two Column Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="border border-slate-300 rounded-lg p-3.5 bg-slate-50">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">RECIPIENT PLANT / BUYER</div>
                      <div className="text-sm font-extrabold text-slate-900 mt-1">{quotation.customerName}</div>
                      <div className="text-slate-700">Attn: {quotation.contactPerson}</div>
                      <div className="text-slate-600 font-mono">Phone: {quotation.mobile}</div>
                      <div className="text-slate-600 mt-1">Plant Delivery: {quotation.shippingAddress || quotation.billingAddress}</div>
                    </div>

                    <div className="border border-slate-300 rounded-lg p-3.5 bg-slate-50">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">TECHNICAL SPECIFICATIONS</div>
                      <div className="text-slate-800 mt-1">Technical Officer: <strong>{quotation.salespersonName || 'Direct Sales'}</strong></div>
                      <div className="text-slate-700 font-mono text-[11px]">HSN: {companySettings.defaultHsnCode || '-'}{companySettings.defaultHsnDescription ? ` (${companySettings.defaultHsnDescription})` : ''}</div>
                      <div className="text-slate-700 mt-1">Status: <strong className="text-emerald-700">{quotation.status}</strong></div>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border-2 border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-800 text-white font-bold uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 px-3">Item #</th>
                          <th className="py-2.5 px-3">Machinery Model & Description</th>
                          <th className="py-2.5 px-3 text-center">Qty</th>
                          <th className="py-2.5 px-3 text-right">Base Rate</th>
                          <th className="py-2.5 px-3 text-center">Disc</th>
                          <th className="py-2.5 px-3 text-right">Taxable</th>
                          <th className="py-2.5 px-3 text-center">GST</th>
                          <th className="py-2.5 px-3 text-right">Total (INR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300">
                        {quotation.items.map((it, idx) => (
                          <tr key={it.id} className="hover:bg-amber-50/30">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <span className="font-black text-slate-900">{it.productName}</span>
                              <span className="ml-2 font-mono text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                {it.modelNumber}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-900 font-mono">{it.quantity}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800">₹{it.unitPrice.toLocaleString('en-IN')}</td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-600">{it.discountPercentage}%</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800">₹{it.taxableAmount.toLocaleString('en-IN')}</td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-600">{it.gstPercentage}%</td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-slate-950">₹{it.totalAmount.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Industrial Totals and Terms */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-slate-300 rounded-lg p-3.5 space-y-2 text-xs">
                      <div className="font-bold text-slate-900 uppercase text-[10px]">Warranty & Commissioning Policy:</div>
                      <p className="text-slate-600">• {quotation.warrantyTerms}</p>
                      <p className="text-slate-600">• {quotation.deliveryTerms}</p>
                      <p className="text-slate-600">• {quotation.paymentTerms}</p>
                      <div className="pt-2 border-t border-slate-200 text-[11px] font-mono text-slate-700">
                        NEFT/RTGS: {companySettings.bankName} | A/C: {companySettings.accountNumber} | IFSC: {companySettings.ifscCode}
                      </div>
                    </div>

                    <div className="border-2 border-slate-800 rounded-lg p-3.5 bg-slate-50 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Machinery Subtotal:</span>
                        <span className="font-mono font-bold">₹{quotation.subtotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Commercial Discount:</span>
                        <span className="font-mono font-bold text-rose-600">-₹{quotation.discountTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Net Taxable Value:</span>
                        <span className="font-mono font-bold">₹{quotation.taxableAmount.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Integrated GST (18%):</span>
                        <span className="font-mono font-bold">₹{quotation.gstTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="border-t-2 border-slate-800 pt-2 flex justify-between font-black text-slate-950 text-sm">
                        <span>NET PAYABLE TOTAL:</span>
                        <span className="font-mono text-base text-amber-700">₹{quotation.grandTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 italic">
                        {amountInWords}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TEMPLATE VARIANT 3: CLASSIC GST */}
            {templateTheme === 'classic' && (
              <div className="p-8 sm:p-10 space-y-4">
                <div className="text-center border-b-2 border-slate-900 pb-3">
                  <h1 className="text-2xl font-black text-slate-950 tracking-wide font-serif">
                    {companySettings.companyName.toUpperCase()}
                  </h1>
                  <p className="text-xs text-slate-600">
                    {companySettings.address}, {companySettings.city}, {companySettings.state} - {companySettings.pincode}
                  </p>
                  <p className="text-xs text-slate-600 font-mono">
                    GSTIN: {companySettings.gstin} | PAN: {companySettings.pan} | Mobile: {companySettings.mobile}
                  </p>
                  <div className="mt-2 inline-block px-4 py-0.5 border border-slate-900 font-bold text-xs uppercase tracking-widest">
                    QUOTATION / PROFORMA ESTIMATE
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border border-slate-300 p-3 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">M/S: {quotation.customerName}</p>
                    <p className="text-slate-700">Attn: {quotation.contactPerson}</p>
                    <p className="text-slate-700">Phone: {quotation.mobile}</p>
                    <p className="text-slate-700">Address: {quotation.billingAddress}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900 font-mono">Quote Ref: {quotation.quotationNumber}</p>
                    <p className="text-slate-700 font-mono">Date: {quotation.date}</p>
                    <p className="text-slate-700 font-mono">Valid Until: {quotation.validUntil}</p>
                    <p className="text-slate-700">Sales Exec: {quotation.salespersonName}</p>
                  </div>
                </div>

                <table className="w-full text-left border border-slate-400 text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-400 font-bold">
                      <th className="p-2 border-r border-slate-300 w-8">S.N.</th>
                      <th className="p-2 border-r border-slate-300">Description of Goods</th>
                      <th className="p-2 border-r border-slate-300 text-center">Qty</th>
                      <th className="p-2 border-r border-slate-300 text-right">Rate</th>
                      <th className="p-2 border-r border-slate-300 text-center">Disc%</th>
                      <th className="p-2 border-r border-slate-300 text-right">Taxable</th>
                      <th className="p-2 border-r border-slate-300 text-center">GST%</th>
                      <th className="p-2 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotation.items.map((it, idx) => (
                      <tr key={it.id} className="border-b border-slate-300">
                        <td className="p-2 border-r border-slate-300 text-center font-mono">{idx + 1}</td>
                        <td className="p-2 border-r border-slate-300">
                          <span className="font-bold">{it.productName}</span> (Model: {it.modelNumber})
                        </td>
                        <td className="p-2 border-r border-slate-300 text-center font-mono">{it.quantity}</td>
                        <td className="p-2 border-r border-slate-300 text-right font-mono">₹{it.unitPrice.toLocaleString('en-IN')}</td>
                        <td className="p-2 border-r border-slate-300 text-center font-mono">{it.discountPercentage}%</td>
                        <td className="p-2 border-r border-slate-300 text-right font-mono">₹{it.taxableAmount.toLocaleString('en-IN')}</td>
                        <td className="p-2 border-r border-slate-300 text-center font-mono">{it.gstPercentage}%</td>
                        <td className="p-2 text-right font-mono font-bold">₹{it.totalAmount.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold border-t border-slate-400">
                      <td colSpan={5} className="p-2 border-r border-slate-300 text-right">Taxable Subtotal:</td>
                      <td className="p-2 border-r border-slate-300 text-right font-mono">₹{quotation.taxableAmount.toLocaleString('en-IN')}</td>
                      <td className="p-2 border-r border-slate-300 text-center font-mono">18%</td>
                      <td className="p-2 text-right font-mono">₹{quotation.grandTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  </tfoot>
                </table>

                <div className="border border-slate-300 p-3 bg-slate-50 text-xs">
                  <p className="font-bold">Amount in Words: <span className="font-normal italic">{amountInWords}</span></p>
                  <p className="mt-1">Bank Name: {companySettings.bankName} | A/C: {companySettings.accountNumber} | IFSC: {companySettings.ifscCode}</p>
                </div>

                <div className="flex justify-between items-end pt-6 text-xs">
                  <div>
                    <p className="font-bold">Terms of Sale:</p>
                    <p>1. {quotation.paymentTerms}</p>
                    <p>2. {quotation.deliveryTerms}</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold">For {companySettings.companyName}</p>
                    <div className="h-10"></div>
                    <p className="border-t border-slate-400 pt-1 text-[11px]">Authorized Signatory</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
