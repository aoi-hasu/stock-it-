import React, { useState } from 'react';
import { X, Printer, Download, Receipt, FileText, CheckCircle2, Building, Truck } from 'lucide-react';
import { TaxInvoice, CompanySettings } from '../types/index.ts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numberToIndianWords } from '../utils/formatters.ts';

interface TaxInvoiceModalProps {
  invoice: TaxInvoice;
  companySettings: CompanySettings;
  onClose: () => void;
}

type InvoiceCopy = 'ORIGINAL FOR RECIPIENT' | 'DUPLICATE FOR TRANSPORTER' | 'TRIPLICATE FOR SUPPLIER';

export const TaxInvoiceModal: React.FC<TaxInvoiceModalProps> = ({
  invoice,
  companySettings,
  onClose,
}) => {
  const [invoiceCopy, setInvoiceCopy] = useState<InvoiceCopy>('ORIGINAL FOR RECIPIENT');

  const handlePrint = () => {
    window.print();
  };

  const amountInWords = invoice.amountInWords || numberToIndianWords(invoice.grandTotal);

  const handleDownloadPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Top Header Banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 36, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(companySettings.companyName.toUpperCase(), 14, 14);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(226, 232, 240);
    doc.text(`${companySettings.address}, ${companySettings.city}, ${companySettings.state} - ${companySettings.pincode}`, 14, 20);
    doc.text(`GSTIN: ${companySettings.gstin} | PAN: ${companySettings.pan} | Mobile: ${companySettings.mobile}`, 14, 25);
    doc.text(`Email: ${companySettings.email} | Web: ${companySettings.website}`, 14, 30);

    // Right side banner
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(56, 189, 248); // sky-400
    doc.text('TAX INVOICE', 140, 14);

    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(invoiceCopy, 140, 20);
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, 140, 25);
    doc.text(`Date: ${invoice.invoiceDate} | Due: ${invoice.dueDate}`, 140, 30);

    // Meta Box: Supplier, Buyer & Transport Info
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);

    // Left Column: Billed To
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('BILLED TO (BUYER):', 14, 43);
    doc.setFontSize(9);
    doc.text(invoice.customerName, 14, 48);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`Attn: ${invoice.contactPerson || 'Authorized Representative'}`, 14, 53);
    doc.text(`Address: ${invoice.billingAddress}`, 14, 57, { maxWidth: 90 });
    doc.text(`GSTIN: ${invoice.customerGstin || 'URP (Unregistered)'}`, 14, 66);
    doc.text(`State & Code: ${invoice.placeOfSupply}`, 14, 71);

    // Right Column: Shipping & Transport
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('DISPATCH & TRANSPORT DETAILS:', 115, 43);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`Order Reference: ${invoice.orderNumber || 'Direct Supply'}`, 115, 48);
    doc.text(`Mode of Transport: ${invoice.transportMode || 'Road Transport'}`, 115, 53);
    doc.text(`Vehicle Number: ${invoice.vehicleNumber || 'As per e-Way Bill'}`, 115, 58);
    doc.text(`LR / GR Number: ${invoice.lrNumber || 'N/A'}`, 115, 63);
    doc.text(`Reverse Charge: ${invoice.reverseCharge ? 'YES' : 'NO'}`, 115, 68);
    doc.text(`Place of Supply: ${invoice.placeOfSupply}`, 115, 73);

    // Line Items Table
    const tableData = invoice.items.map((it, idx) => [
      String(idx + 1),
      `${it.productName}${it.modelNumber ? ' [' + it.modelNumber + ']' : ''}`,
      it.hsnCode || companySettings.defaultHsnCode || '-',
      `${it.quantity} ${it.unit}`,
      `₹${it.unitPrice.toLocaleString('en-IN')}`,
      `${it.discountPercentage}%`,
      `₹${it.taxableAmount.toLocaleString('en-IN')}`,
      invoice.isInterState ? `₹${it.igstAmount.toLocaleString('en-IN')}` : `₹${it.cgstAmount.toLocaleString('en-IN')}`,
      invoice.isInterState ? '0' : `₹${it.sgstAmount.toLocaleString('en-IN')}`,
      `₹${it.totalAmount.toLocaleString('en-IN')}`,
    ]);

    autoTable(doc, {
      startY: 78,
      head: [
        [
          '#',
          'Description of Goods',
          'HSN/SAC',
          'Qty',
          'Rate',
          'Disc',
          'Taxable',
          invoice.isInterState ? 'IGST' : 'CGST',
          invoice.isInterState ? '-' : 'SGST',
          'Total (INR)',
        ],
      ],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
      },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' },
        1: { cellWidth: 54 },
        2: { cellWidth: 17, halign: 'center' },
        3: { cellWidth: 13, halign: 'center' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 10, halign: 'center' },
        6: { cellWidth: 20, halign: 'right' },
        7: { cellWidth: 17, halign: 'right' },
        8: { cellWidth: 17, halign: 'right' },
        9: { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 5;

    // Totals Box on Right
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(`Taxable Subtotal:`, 130, finalY);
    doc.text(`₹${invoice.taxableAmount.toLocaleString('en-IN')}`, 196, finalY, { align: 'right' });

    if (invoice.isInterState) {
      doc.text(`Integrated GST (IGST):`, 130, finalY + 5);
      doc.text(`₹${invoice.igstTotal.toLocaleString('en-IN')}`, 196, finalY + 5, { align: 'right' });
    } else {
      doc.text(`Central GST (CGST):`, 130, finalY + 5);
      doc.text(`₹${invoice.cgstTotal.toLocaleString('en-IN')}`, 196, finalY + 5, { align: 'right' });
      doc.text(`State GST (SGST):`, 130, finalY + 10);
      doc.text(`₹${invoice.sgstTotal.toLocaleString('en-IN')}`, 196, finalY + 10, { align: 'right' });
    }

    const grandTotalY = invoice.isInterState ? finalY + 11 : finalY + 16;
    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.5);
    doc.line(130, grandTotalY - 1, 196, grandTotalY - 1);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(2, 132, 199);
    doc.text(`INVOICE TOTAL:`, 130, grandTotalY + 4);
    doc.text(`₹${invoice.grandTotal.toLocaleString('en-IN')}`, 196, grandTotalY + 4, { align: 'right' });

    // Amount in Words
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    doc.text(`(${amountInWords})`, 14, finalY + 22, { maxWidth: 105 });

    // Bank Details on Left
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('ELECTRONIC PAYMENT REMITTANCE (NEFT/RTGS):', 14, finalY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`Bank Name: ${companySettings.bankName} | Branch: ${companySettings.bankBranch}`, 14, finalY + 5);
    doc.text(`Current A/C: ${companySettings.accountNumber} | IFSC Code: ${companySettings.ifscCode}`, 14, finalY + 10);
    doc.text(`Payment Status: ${invoice.paymentStatus.toUpperCase()}`, 14, finalY + 15);

    // Terms and Signatory
    const signY = grandTotalY + 20;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Declaration: Certified that all particulars are true and correct.', 14, signY);
    doc.text('Subject to local jurisdiction. Goods once sold will not be taken back.', 14, signY + 4);

    doc.setDrawColor(203, 213, 225);
    doc.line(140, signY + 10, 196, signY + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`FOR ${companySettings.companyName.toUpperCase()}`, 140, signY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Authorised Signatory', 140, signY + 18);

    doc.save(`${invoice.invoiceNumber.replace(/[\/\\:]/g, '_')}_Tax_Invoice.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
      {/* Print media query styling */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-tax-invoice, #printable-tax-invoice * {
            visibility: visible !important;
          }
          #printable-tax-invoice {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 15mm !important;
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
        {/* Header Controls */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <Receipt className="w-4 h-4 text-emerald-600" />
            <span>GST Tax Invoice: {invoice.invoiceNumber}</span>
          </div>

          {/* Copy Selector */}
          <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-lg text-xs">
            {(
              [
                'ORIGINAL FOR RECIPIENT',
                'DUPLICATE FOR TRANSPORTER',
                'TRIPLICATE FOR SUPPLIER',
              ] as InvoiceCopy[]
            ).map(copy => (
              <button
                key={copy}
                onClick={() => setInvoiceCopy(copy)}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                  invoiceCopy === copy
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {copy.split(' ')[0]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-300 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" /> Print Invoice
            </button>
            <button
              onClick={handleDownloadPDF}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
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

        {/* Printable Tax Invoice Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/60 text-slate-900">
          <div
            id="printable-tax-invoice"
            className="max-w-3xl mx-auto bg-white rounded-xl shadow-md border-2 border-slate-800 p-6 sm:p-8 space-y-4"
          >
            {/* Top Statutory Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                  GST REGISTRATION: {companySettings.gstin}
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight mt-1">
                  {companySettings.companyName.toUpperCase()}
                </h1>
                <p className="text-xs text-slate-600 font-medium">
                  {companySettings.address}, {companySettings.city}, {companySettings.state} - {companySettings.pincode}
                </p>
                <p className="text-xs text-slate-600 font-mono mt-0.5">
                  PAN: <strong>{companySettings.pan}</strong> | Mobile: {companySettings.mobile} | Email: {companySettings.email}
                </p>
              </div>

              <div className="sm:text-right shrink-0">
                <div className="inline-block px-3 py-1 bg-slate-900 text-white font-black text-sm tracking-widest uppercase rounded">
                  TAX INVOICE
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                  ({invoiceCopy})
                </div>
                <p className="text-base font-black text-slate-900 font-mono mt-1">
                  {invoice.invoiceNumber}
                </p>
                <p className="text-xs text-slate-600">Date: <strong className="font-mono">{invoice.invoiceDate}</strong></p>
                <p className="text-xs text-slate-600">Due Date: <strong className="font-mono">{invoice.dueDate}</strong></p>
              </div>
            </div>

            {/* Buyer & Dispatch Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-300 rounded-lg p-3.5 bg-slate-50/50 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  DETAILS OF RECIPIENT (BILLED TO)
                </span>
                <p className="text-sm font-black text-slate-950">{invoice.customerName}</p>
                <p className="text-slate-700 font-medium">Attn: {invoice.contactPerson || 'Authorized Officer'}</p>
                <p className="text-slate-600">Address: {invoice.billingAddress}</p>
                <p className="text-slate-700 font-mono">
                  GSTIN: <strong className="text-slate-900">{invoice.customerGstin || 'Unregistered'}</strong>
                </p>
                <p className="text-slate-600">State: {invoice.placeOfSupply}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  TRANSPORT & SUPPLY METADATA
                </span>
                <p className="text-slate-700">Order Ref: <strong className="font-mono">{invoice.orderNumber || 'Direct Invoice'}</strong></p>
                <p className="text-slate-700">Transport Mode: <strong>{invoice.transportMode || 'Road Transport'}</strong></p>
                <p className="text-slate-700 font-mono">Vehicle No: <strong>{invoice.vehicleNumber || 'As Per e-Way Bill'}</strong></p>
                <p className="text-slate-700 font-mono">LR / GR No: <strong>{invoice.lrNumber || 'N/A'}</strong></p>
                <p className="text-slate-700">Reverse Charge: <strong>{invoice.reverseCharge ? 'YES' : 'NO'}</strong></p>
                <p className="text-slate-700">Place of Supply: <strong>{invoice.placeOfSupply}</strong></p>
              </div>
            </div>

            {/* Line items table */}
            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-2 px-2.5 w-8">#</th>
                    <th className="py-2 px-2.5">Description of Goods</th>
                    <th className="py-2 px-2.5 text-center">HSN/SAC</th>
                    <th className="py-2 px-2.5 text-center">Qty</th>
                    <th className="py-2 px-2.5 text-right">Unit Price</th>
                    <th className="py-2 px-2.5 text-center">Disc</th>
                    <th className="py-2 px-2.5 text-right">Taxable</th>
                    {!invoice.isInterState ? (
                      <>
                        <th className="py-2 px-2.5 text-right">CGST</th>
                        <th className="py-2 px-2.5 text-right">SGST</th>
                      </>
                    ) : (
                      <th className="py-2 px-2.5 text-right">IGST</th>
                    )}
                    <th className="py-2 px-2.5 text-right">Total (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoice.items.map((it, idx) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 text-slate-500 font-mono text-center">{idx + 1}</td>
                      <td className="py-2 px-2.5">
                        <div className="font-bold text-slate-900">{it.productName}</div>
                        {it.modelNumber && (
                          <div className="text-[10px] text-slate-500 font-mono">Model: {it.modelNumber}</div>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono text-slate-700">{it.hsnCode || companySettings.defaultHsnCode || '-'}</td>
                      <td className="py-2 px-2.5 text-center font-bold text-slate-900 font-mono">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-slate-700">₹{it.unitPrice.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-2.5 text-center font-mono text-slate-500">{it.discountPercentage}%</td>
                      <td className="py-2 px-2.5 text-right font-mono font-medium text-slate-900">₹{it.taxableAmount.toLocaleString('en-IN')}</td>
                      {!invoice.isInterState ? (
                        <>
                          <td className="py-2 px-2.5 text-right font-mono text-slate-700">₹{it.cgstAmount.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-2.5 text-right font-mono text-slate-700">₹{it.sgstAmount.toLocaleString('en-IN')}</td>
                        </>
                      ) : (
                        <td className="py-2 px-2.5 text-right font-mono text-slate-700">₹{it.igstAmount.toLocaleString('en-IN')}</td>
                      )}
                      <td className="py-2 px-2.5 text-right font-mono font-black text-slate-950">₹{it.totalAmount.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* HSN Tax Summary Table */}
            <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50 text-[11px]">
              <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500 block mb-1.5">
                TAX SUMMARY BREAKDOWN
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                <div>
                  <span className="text-slate-500 text-[10px] block">HSN / SAC</span>
                  <span className="font-bold text-slate-900">{invoice.items[0]?.hsnCode || companySettings.defaultHsnCode || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Taxable Amount</span>
                  <span className="font-bold text-slate-900">₹{invoice.taxableAmount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">{invoice.isInterState ? 'IGST Output' : 'CGST + SGST Output'}</span>
                  <span className="font-bold text-slate-900">
                    {invoice.isInterState
                      ? `₹${invoice.igstTotal.toLocaleString('en-IN')}`
                      : `₹${invoice.cgstTotal.toLocaleString('en-IN')} + ₹${invoice.sgstTotal.toLocaleString('en-IN')}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Total Tax</span>
                  <span className="font-black text-emerald-700">₹{invoice.totalTax.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Total and Bank Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-900 block mb-1">Total in Words:</span>
                  <p className="font-serif italic text-slate-800">{amountInWords}</p>
                </div>

                <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200 text-slate-700">
                  <span className="font-bold text-emerald-900 block mb-1">Bank Remittance (NEFT / RTGS):</span>
                  <p>Bank: <strong>{companySettings.bankName}</strong> | Branch: {companySettings.bankBranch}</p>
                  <p>Current A/C: <strong className="font-mono">{companySettings.accountNumber}</strong></p>
                  <p>IFSC Code: <strong className="font-mono">{companySettings.ifscCode}</strong></p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="border-2 border-slate-800 rounded-lg p-3 bg-slate-50 space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Subtotal:</span>
                    <span className="font-mono font-bold">₹{invoice.taxableAmount.toLocaleString('en-IN')}</span>
                  </div>
                  {invoice.isInterState ? (
                    <div className="flex justify-between text-slate-600">
                      <span>IGST (18%):</span>
                      <span className="font-mono font-bold">₹{invoice.igstTotal.toLocaleString('en-IN')}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>CGST (9%):</span>
                        <span className="font-mono font-bold">₹{invoice.cgstTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>SGST (9%):</span>
                        <span className="font-mono font-bold">₹{invoice.sgstTotal.toLocaleString('en-IN')}</span>
                      </div>
                    </>
                  )}
                  <div className="border-t-2 border-slate-800 pt-2 flex justify-between font-black text-slate-950 text-base">
                    <span>INVOICE GRAND TOTAL:</span>
                    <span className="font-mono text-emerald-800">₹{invoice.grandTotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="pt-4 text-center sm:text-right">
                  <div className="inline-block text-center border-t border-slate-400 pt-2 min-w-[220px]">
                    <p className="font-bold text-slate-900 text-xs">FOR {companySettings.companyName.toUpperCase()}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Authorised Signatory</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Terms of Sale */}
            <div className="border-t border-slate-200 pt-3 text-[10px] text-slate-500 space-y-0.5">
              <p>1. Certified that all particulars are true and correct, and the amount indicated represents the price actually charged.</p>
              <p>2. Payment due as per agreed commercial terms ({invoice.paymentTerms || 'Within 15 days of invoice'}).</p>
              <p>3. Disputes subject to supplier headquarters jurisdiction.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
