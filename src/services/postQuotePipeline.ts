import {
  Quotation,
  PostQuoteStage,
  LossReason,
  ObjectionCategory,
  QuoteObjection,
  QuoteVersion,
  QuotationActivityLog,
  QuotationItem,
  Order,
  TaxInvoice,
} from '../types/index.ts';
import { api } from './api.ts';

/**
 * Normalizes or infers the post-quoting pipeline stage for a quotation.
 */
export function normalizeQuoteStage(quote: Quotation): PostQuoteStage {
  if (quote.pipelineStage) return quote.pipelineStage;

  if (quote.status === 'Accepted' || quote.status === 'Converted') {
    return 'closed_won';
  }
  if (quote.status === 'Rejected') {
    return 'closed_lost';
  }
  if (quote.status === 'Negotiation') {
    return 'negotiation';
  }

  // If in Sent or Viewed, check if stalled (> 3 days without response) or has follow-up count
  if (quote.status === 'Sent' || quote.status === 'Viewed') {
    const sentDate = quote.sentAt ? new Date(quote.sentAt).getTime() : new Date(quote.date || quote.createdAt).getTime();
    const daysSinceSent = (Date.now() - sentDate) / (1000 * 60 * 60 * 24);
    if ((quote.followUpCount && quote.followUpCount > 0) || daysSinceSent >= 3) {
      return 'follow_up';
    }
    return 'quote_sent';
  }

  return 'quote_sent';
}

/**
 * Checks if a quote has stalled in post-quoting pipeline (> 3 business days / 72 hours without response/activity).
 */
export function isQuoteStalled(quote: Quotation): boolean {
  const stage = normalizeQuoteStage(quote);
  if (stage === 'closed_won' || stage === 'closed_lost') return false;

  const baselineTime = quote.lastFollowUpAt
    ? new Date(quote.lastFollowUpAt).getTime()
    : quote.sentAt
    ? new Date(quote.sentAt).getTime()
    : new Date(quote.date || quote.createdAt).getTime();

  const diffDays = (Date.now() - baselineTime) / (1000 * 60 * 60 * 24);
  return diffDays >= 3;
}

/**
 * Calculates days elapsed since quote was sent to client.
 */
export function getDaysSinceQuoteSent(quote: Quotation): number {
  const startTime = quote.sentAt
    ? new Date(quote.sentAt).getTime()
    : new Date(quote.date || quote.createdAt).getTime();
  const endTime = quote.closedAt ? new Date(quote.closedAt).getTime() : Date.now();
  const days = Math.max(0, Math.round((endTime - startTime) / (1000 * 60 * 60 * 24)));
  return days;
}

export interface PipelineAnalytics {
  totalQuotes: number;
  openQuotesCount: number;
  wonCount: number;
  lostCount: number;
  winRate: number; // 0-100%
  avgVelocityDays: number;
  wonVelocityDays: number;
  lostVelocityDays: number;
  stalledCount: number;
  totalPipelineValue: number;
  wonPipelineValue: number;
  lostPipelineValue: number;
  stageCounts: Record<PostQuoteStage, number>;
  stageValues: Record<PostQuoteStage, number>;
  lostReasonsBreakdown: {
    reason: LossReason;
    count: number;
    percentage: number;
  }[];
}

/**
 * Calculates velocity, win-rate, and loss reason analytics across all quotes.
 */
export function calculatePipelineAnalytics(quotes: Quotation[]): PipelineAnalytics {
  let wonCount = 0;
  let lostCount = 0;
  let wonVelocityTotal = 0;
  let lostVelocityTotal = 0;
  let stalledCount = 0;
  let totalPipelineValue = 0;
  let wonPipelineValue = 0;
  let lostPipelineValue = 0;

  const stageCounts: Record<PostQuoteStage, number> = {
    quote_sent: 0,
    follow_up: 0,
    negotiation: 0,
    closed_won: 0,
    closed_lost: 0,
  };

  const stageValues: Record<PostQuoteStage, number> = {
    quote_sent: 0,
    follow_up: 0,
    negotiation: 0,
    closed_won: 0,
    closed_lost: 0,
  };

  const lossReasonCounts: Partial<Record<LossReason, number>> = {};

  quotes.forEach(q => {
    const stage = normalizeQuoteStage(q);
    const val = q.grandTotal || 0;
    totalPipelineValue += val;

    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    stageValues[stage] = (stageValues[stage] || 0) + val;

    if (isQuoteStalled(q)) {
      stalledCount++;
    }

    if (stage === 'closed_won') {
      wonCount++;
      wonPipelineValue += val;
      const velocity = getDaysSinceQuoteSent(q);
      wonVelocityTotal += velocity;
    } else if (stage === 'closed_lost') {
      lostCount++;
      lostPipelineValue += val;
      const velocity = getDaysSinceQuoteSent(q);
      lostVelocityTotal += velocity;

      const reason: LossReason = q.lossReason || 'Other';
      lossReasonCounts[reason] = (lossReasonCounts[reason] || 0) + 1;
    }
  });

  const totalClosed = wonCount + lostCount;
  const winRate = totalClosed > 0 ? Math.round((wonCount / totalClosed) * 100) : 0;
  const avgVelocityDays = totalClosed > 0
    ? Number(((wonVelocityTotal + lostVelocityTotal) / totalClosed).toFixed(1))
    : 0;
  const wonVelocityDays = wonCount > 0 ? Number((wonVelocityTotal / wonCount).toFixed(1)) : 0;
  const lostVelocityDays = lostCount > 0 ? Number((lostVelocityTotal / lostCount).toFixed(1)) : 0;

  const defaultReasons: LossReason[] = [
    'Price',
    'Competitor',
    'Timeline',
    'Ghosted',
    'Budget Cancelled',
    'Technical Specifications',
    'Other',
  ];

  const lostReasonsBreakdown = defaultReasons
    .map(reason => {
      const count = lossReasonCounts[reason] || 0;
      const percentage = lostCount > 0 ? Math.round((count / lostCount) * 100) : 0;
      return { reason, count, percentage };
    })
    .filter(item => item.count > 0 || lostCount === 0)
    .sort((a, b) => b.count - a.count);

  return {
    totalQuotes: quotes.length,
    openQuotesCount: quotes.length - totalClosed,
    wonCount,
    lostCount,
    winRate,
    avgVelocityDays,
    wonVelocityDays,
    lostVelocityDays,
    stalledCount,
    totalPipelineValue,
    wonPipelineValue,
    lostPipelineValue,
    stageCounts,
    stageValues,
    lostReasonsBreakdown,
  };
}

/**
 * Pre-formatted Follow-up Email Generator
 */
export function generateFollowUpEmailTemplate(quote: Quotation, salespersonName = 'Sales Representative') {
  const itemsSummary = quote.items && quote.items.length
    ? quote.items.map(it => `${it.productName} (Qty: ${it.quantity})`).join(', ')
    : 'Machinery Equipment & Spares';

  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(quote.grandTotal || 0);

  const subject = `Follow-Up: Quotation Ref #${quote.quotationNumber} — ${quote.customerName || 'Inquiry Review'}`;

  const body = `Dear ${quote.contactPerson || 'Sir/Madam'},

I hope this email finds you well.

I am following up on commercial quotation ref #${quote.quotationNumber} sent on ${quote.date || 'recently'} for:
${itemsSummary}
Total Investment: ${formattedAmount} (incl. GST).

We wanted to verify if you had an opportunity to review the technical specifications, delivery schedule, and payment terms. 

If you require any revisions to line items, customization of specifications, or commercial flexibility, please let us know so we can adjust the proposal to meet your project timeline.

Looking forward to hearing from you.

Warm regards,

${salespersonName}
Technical Sales & Operations
StockItEase Partner`;

  return { subject, body };
}

/**
 * Service API for executing Post-Quoting transitions & automated actions
 */
export const postQuoteService = {
  /**
   * Automatically triggered when a quote is created / sent to client.
   */
  async triggerQuoteSent(quoteId: string, options?: { channel?: 'email' | 'whatsapp' | 'link'; actorName?: string }) {
    const quotations = await api.getQuotations();
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) throw new Error('Quotation not found');

    const now = new Date().toISOString();
    const actor = options?.actorName || quote.salespersonName || 'Sales Representative';
    const channel = options?.channel || 'email';

    const newActivity: QuotationActivityLog = {
      id: `act-${Date.now()}`,
      timestamp: now,
      type: 'sent',
      title: `Quotation Sent via ${channel.toUpperCase()}`,
      description: `Commercial proposal #${quote.quotationNumber} (₹${quote.grandTotal?.toLocaleString('en-IN')}) dispatched to ${quote.email || quote.contactPerson}`,
      actorName: actor,
      metadata: { channel },
    };

    const activities = [...(quote.activities || []), newActivity];

    await api.updateQuotation(quoteId, {
      status: 'Sent',
      pipelineStage: 'quote_sent',
      sentAt: quote.sentAt || now,
      activities,
    });

    // If associated with a Lead, update lead's status to Quotation Sent
    if (quote.leadId) {
      try {
        await api.updateLead(quote.leadId, {
          status: 'Quotation Sent',
          lastContactDate: now.split('T')[0],
        });
      } catch (err) {
        console.warn('Could not auto-advance lead to Quotation Sent', err);
      }
    }

    // Record outbound communication
    try {
      await api.createCommunication({
        entityType: quote.customerId ? 'customer' : 'lead',
        entityId: quote.customerId || quote.leadId || quote.id,
        entityName: quote.customerName,
        userId: actor,
        userName: actor,
        timestamp: new Date().toISOString(),
        type: channel === 'whatsapp' ? 'WhatsApp' : 'Email',
        direction: 'Outbound',
        message: `[Quotation #${quote.quotationNumber} Dispatched] Commercial proposal sent with total ₹${quote.grandTotal?.toLocaleString('en-IN')}`,
      });
    } catch {
      // Non-blocking
    }
  },

  /**
   * Log that client opened/viewed the quotation.
   */
  async triggerQuoteViewed(quoteId: string, actorName = 'Client / Webhook') {
    const quotations = await api.getQuotations();
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) throw new Error('Quotation not found');

    const now = new Date().toISOString();
    const newActivity: QuotationActivityLog = {
      id: `act-${Date.now()}`,
      timestamp: now,
      type: 'viewed',
      title: 'Quotation Viewed by Client',
      description: `Client opened quotation #${quote.quotationNumber} proposal link`,
      actorName,
    };

    const activities = [...(quote.activities || []), newActivity];

    await api.updateQuotation(quoteId, {
      status: quote.status === 'Draft' || quote.status === 'Sent' ? 'Viewed' : quote.status,
      viewedAt: now,
      activities,
    });
  },

  /**
   * Sends follow-up email/message, updates follow-up count, and logs activity.
   */
  async sendFollowUp(
    quoteId: string,
    payload: {
      subject: string;
      message: string;
      channel: 'email' | 'whatsapp';
      actorName?: string;
    }
  ) {
    const quotations = await api.getQuotations();
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) throw new Error('Quotation not found');

    const now = new Date().toISOString();
    const count = (quote.followUpCount || 0) + 1;
    const actor = payload.actorName || quote.salespersonName || 'Sales Representative';

    const newActivity: QuotationActivityLog = {
      id: `act-${Date.now()}`,
      timestamp: now,
      type: 'followed_up',
      title: `Follow-Up #${count} Sent (${payload.channel.toUpperCase()})`,
      description: `Subject: "${payload.subject}" — Follow-up check-in delivered`,
      actorName: actor,
      metadata: { count, channel: payload.channel },
    };

    const activities = [...(quote.activities || []), newActivity];

    await api.updateQuotation(quoteId, {
      pipelineStage: 'follow_up',
      lastFollowUpAt: now,
      followUpCount: count,
      activities,
    });

    // Record communication log
    try {
      await api.createCommunication({
        entityType: quote.customerId ? 'customer' : 'lead',
        entityId: quote.customerId || quote.leadId || quote.id,
        entityName: quote.customerName,
        userId: actor,
        userName: actor,
        timestamp: new Date().toISOString(),
        type: payload.channel === 'whatsapp' ? 'WhatsApp' : 'Email',
        direction: 'Outbound',
        message: `[Follow-Up: ${payload.subject}] ${payload.message}`,
      });
    } catch {
      // Non-blocking
    }
  },

  /**
   * Log Client Objections and/or create a revised quotation version.
   */
  async logNegotiationAndRevision(
    quoteId: string,
    payload: {
      objection?: {
        category: ObjectionCategory;
        description: string;
        resolutionNotes?: string;
      };
      revisedItems?: QuotationItem[];
      changeSummary?: string;
      actorName?: string;
      reSendToClient?: boolean;
    }
  ) {
    const quotations = await api.getQuotations();
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) throw new Error('Quotation not found');

    const now = new Date().toISOString();
    const actor = payload.actorName || quote.salespersonName || 'Sales Representative';
    let currentVersion = quote.version || 1;
    let versionHistory = [...(quote.versionHistory || [])];
    let objections = [...(quote.objections || [])];
    let activities = [...(quote.activities || [])];

    // 1. Log objection if present
    if (payload.objection && payload.objection.description.trim()) {
      const newObjection: QuoteObjection = {
        id: `obj-${Date.now()}`,
        date: now.split('T')[0],
        category: payload.objection.category,
        description: payload.objection.description.trim(),
        loggedBy: actor,
        resolved: Boolean(payload.objection.resolutionNotes),
        resolutionNotes: payload.objection.resolutionNotes,
      };
      objections.push(newObjection);

      activities.push({
        id: `act-${Date.now()}-obj`,
        timestamp: now,
        type: 'objection_logged',
        title: `Client Objection Logged: ${payload.objection.category}`,
        description: payload.objection.description,
        actorName: actor,
        metadata: { category: payload.objection.category },
      });
    }

    // 2. Adjust line items & create version snapshot
    let updatedTotals = {
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      taxableAmount: quote.taxableAmount,
      gstTotal: quote.gstTotal,
      grandTotal: quote.grandTotal,
      items: quote.items,
    };

    if (payload.revisedItems && payload.revisedItems.length > 0) {
      // Archive current version into history
      versionHistory.push({
        version: currentVersion,
        createdAt: quote.updatedAt || quote.createdAt,
        createdBy: actor,
        grandTotal: quote.grandTotal,
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        taxableAmount: quote.taxableAmount,
        gstTotal: quote.gstTotal,
        items: quote.items,
        changeSummary: payload.changeSummary || `Version ${currentVersion} snapshot before revision`,
        objectionNotes: payload.objection?.description,
      });

      // Recalculate totals from revised line items
      let subtotal = 0;
      let discountTotal = 0;
      let taxableAmount = 0;
      let gstTotal = 0;

      const calculatedItems = payload.revisedItems.map(it => {
        const itemSubtotal = it.quantity * it.unitPrice;
        const discountAmt = Math.round((itemSubtotal * (it.discountPercentage || 0)) / 100);
        const taxable = itemSubtotal - discountAmt;
        const gst = Math.round((taxable * (it.gstPercentage || 18)) / 100);
        const total = taxable + gst;

        subtotal += itemSubtotal;
        discountTotal += discountAmt;
        taxableAmount += taxable;
        gstTotal += gst;

        return {
          ...it,
          taxableAmount: taxable,
          gstAmount: gst,
          totalAmount: total,
        };
      });

      const grandTotal = taxableAmount + gstTotal;
      currentVersion += 1;

      updatedTotals = {
        subtotal,
        discountTotal,
        taxableAmount,
        gstTotal,
        grandTotal,
        items: calculatedItems,
      };

      activities.push({
        id: `act-${Date.now()}-ver`,
        timestamp: now,
        type: 'version_updated',
        title: `Quotation Revised to Version ${currentVersion}`,
        description: `${payload.changeSummary || 'Adjusted line items and commercial terms'}. Revised Grand Total: ₹${grandTotal.toLocaleString('en-IN')}`,
        actorName: actor,
        metadata: { newVersion: currentVersion, grandTotal },
      });
    }

    const nextStatus = payload.reSendToClient ? 'Sent' : 'Negotiation';
    const nextStage: PostQuoteStage = 'negotiation';

    await api.updateQuotation(quoteId, {
      ...updatedTotals,
      version: currentVersion,
      versionHistory,
      objections,
      activities,
      status: nextStatus,
      pipelineStage: nextStage,
    });

    // Also update lead status if associated
    if (quote.leadId) {
      try {
        await api.updateLead(quote.leadId, {
          status: 'Negotiation',
          lastContactDate: now.split('T')[0],
        });
      } catch {
        // Non-blocking
      }
    }
  },

  /**
   * Binary Decision Step: Closed-Won
   * Automatically executes the required dual actions:
   * 1. Converts quote to finalized Sales Order / Service Agreement
   * 2. Generates the initial Tax Invoice AND triggers onboarding email
   */
  async closeQuoteWon(
    quoteId: string,
    options?: {
      advancePayment?: number;
      paymentMethod?: string;
      referenceNumber?: string;
      actorName?: string;
      customAgreementTerms?: string;
    }
  ): Promise<{ order: Order; invoice: TaxInvoice; quotation: Quotation }> {
    const quotations = await api.getQuotations();
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) throw new Error('Quotation not found');

    const now = new Date().toISOString();
    const actor = options?.actorName || quote.salespersonName || 'Sales Representative';
    const advance = options?.advancePayment !== undefined
      ? options.advancePayment
      : Math.round((quote.grandTotal || 0) * 0.3); // 30% standard advance

    // 1. Create / Convert to Confirmed Sales Order
    let createdOrder: Order;
    try {
      const conv = await api.convertQuotationToOrder(quoteId, {
        advancePayment: advance,
        paymentMethod: options?.paymentMethod || 'Bank Transfer',
        referenceNumber: options?.referenceNumber || `ADV-${Date.now().toString().slice(-6)}`,
      });
      createdOrder = conv.order;
    } catch {
      // Fallback order generation if RPC is missing
      const orderNum = `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      createdOrder = await api.createOrder({
        orderNumber: orderNum,
        customerId: quote.customerId || `cust-${Date.now()}`,
        customerName: quote.customerName,
        contactPerson: quote.contactPerson,
        mobile: quote.mobile,
        quotationId: quote.id,
        quotationNumber: quote.quotationNumber,
        orderDate: now.split('T')[0],
        salespersonId: quote.salespersonId,
        salespersonName: quote.salespersonName,
        items: quote.items,
        subtotal: quote.subtotal,
        gstTotal: quote.gstTotal,
        totalAmount: quote.grandTotal,
        advancePayment: advance,
        balancePayment: quote.grandTotal - advance,
        deliveryStatus: 'Pending',
        paymentStatus: advance >= quote.grandTotal ? 'Paid' : advance > 0 ? 'Partially Paid' : 'Pending',
        orderStatus: 'Confirmed',
        notes: options?.customAgreementTerms || `Finalized commercial agreement based on quote ${quote.quotationNumber}`,
      });
    }

    // 2. Automatically generate the initial GST Tax Invoice
    const invNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invoiceItems = (quote.items || []).map(it => ({
      id: it.id || `inv-it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: it.productId,
      productName: it.productName,
      modelNumber: it.modelNumber,
      quantity: it.quantity,
      unit: 'Unit',
      unitPrice: it.unitPrice,
      discountPercentage: it.discountPercentage,
      taxableAmount: it.taxableAmount,
      gstPercentage: it.gstPercentage,
      cgstAmount: Math.round(it.gstAmount / 2),
      sgstAmount: Math.round(it.gstAmount / 2),
      igstAmount: 0,
      totalAmount: it.totalAmount,
    }));

    const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const createdInvoice = await api.createTaxInvoice({
      invoiceNumber: invNumber,
      invoiceDate: now.split('T')[0],
      dueDate,
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      quotationId: quote.id,
      quotationNumber: quote.quotationNumber,
      customerId: quote.customerId || createdOrder.customerId,
      customerName: quote.customerName,
      contactPerson: quote.contactPerson,
      mobile: quote.mobile,
      email: quote.email,
      billingAddress: quote.billingAddress,
      shippingAddress: quote.shippingAddress || quote.billingAddress,
      placeOfSupply: 'State Intra-Sale',
      stateCode: '07',
      isInterState: false,
      reverseCharge: false,
      items: invoiceItems,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      taxableAmount: quote.taxableAmount,
      cgstTotal: Math.round(quote.gstTotal / 2),
      sgstTotal: Math.round(quote.gstTotal / 2),
      igstTotal: 0,
      totalTax: quote.gstTotal,
      grandTotal: quote.grandTotal,
      paymentStatus: advance >= quote.grandTotal ? 'Paid' : advance > 0 ? 'Partially Paid' : 'Pending',
      paymentTerms: quote.paymentTerms || '30% Advance with confirmation',
      notes: `Automated Tax Invoice generated upon Closed-Won execution for Quote #${quote.quotationNumber}`,
    });

    // 3. Send Onboarding email trigger & log activity
    const agreementNum = `SA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newActivity: QuotationActivityLog = {
      id: `act-${Date.now()}-won`,
      timestamp: now,
      type: 'closed_won',
      title: 'Deal Closed-Won (Order & Invoice Automated)',
      description: `Quote finalized into Sales Order #${createdOrder.orderNumber} & Tax Invoice #${createdInvoice.invoiceNumber}. Automated onboarding welcome email sent to ${quote.email || quote.contactPerson}.`,
      actorName: actor,
      metadata: {
        orderId: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        invoiceId: createdInvoice.id,
        invoiceNumber: createdInvoice.invoiceNumber,
        agreementNumber: agreementNum,
      },
    };

    const activities = [...(quote.activities || []), newActivity];

    // Update Quotation state
    const updatedQuotation = await api.updateQuotation(quoteId, {
      status: 'Accepted',
      pipelineStage: 'closed_won',
      closedAt: now,
      convertedOrderId: createdOrder.id,
      convertedInvoiceId: createdInvoice.id,
      convertedInvoiceNumber: createdInvoice.invoiceNumber,
      serviceAgreementNumber: agreementNum,
      activities,
    });

    // 4. Update Lead to 'Won' if applicable
    if (quote.leadId) {
      try {
        await api.updateLead(quote.leadId, {
          status: 'Won',
          convertedCustomerId: quote.customerId || createdOrder.customerId,
          lastContactDate: now.split('T')[0],
        });
      } catch (err) {
        console.warn('Could not update lead to Won:', err);
      }
    }

    // 5. Trigger onboarding email communication log
    try {
      await api.createCommunication({
        entityType: 'customer',
        entityId: quote.customerId || createdOrder.customerId,
        entityName: quote.customerName,
        userId: 'system',
        userName: 'Automated Onboarding Dispatcher',
        timestamp: new Date().toISOString(),
        type: 'Email',
        direction: 'Outbound',
        message: `[Onboarding Welcome: Order #${createdOrder.orderNumber} & Tax Invoice #${createdInvoice.invoiceNumber}] Dear ${quote.contactPerson}, Congratulations on finalizing your machinery purchase! Your order #${createdOrder.orderNumber} is confirmed. Tax Invoice #${createdInvoice.invoiceNumber} has been generated.`,
      });
    } catch {
      // Non-blocking
    }

    return {
      order: createdOrder,
      invoice: createdInvoice,
      quotation: updatedQuotation,
    };
  },

  /**
   * Binary Decision Step: Closed-Lost
   * Prompts with mandatory dropdown for "Loss Reason" (e.g. Price, Competitor, Timeline, Ghosted)
   */
  async closeQuoteLost(
    quoteId: string,
    payload: {
      lossReason: LossReason;
      lossNotes?: string;
      competitorName?: string;
      actorName?: string;
    }
  ): Promise<Quotation> {
    if (!payload.lossReason) {
      throw new Error('Mandatory Loss Reason must be selected.');
    }

    const quotations = await api.getQuotations();
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) throw new Error('Quotation not found');

    const now = new Date().toISOString();
    const actor = payload.actorName || quote.salespersonName || 'Sales Representative';

    const newActivity: QuotationActivityLog = {
      id: `act-${Date.now()}-lost`,
      timestamp: now,
      type: 'closed_lost',
      title: `Deal Closed-Lost: [${payload.lossReason}]`,
      description: payload.lossNotes
        ? `Reason: ${payload.lossReason}. Notes: ${payload.lossNotes}${payload.competitorName ? ` (Competitor: ${payload.competitorName})` : ''}`
        : `Reason: ${payload.lossReason}`,
      actorName: actor,
      metadata: {
        lossReason: payload.lossReason,
        lossNotes: payload.lossNotes,
        competitorName: payload.competitorName,
      },
    };

    const activities = [...(quote.activities || []), newActivity];

    const updatedQuotation = await api.updateQuotation(quoteId, {
      status: 'Rejected',
      pipelineStage: 'closed_lost',
      closedAt: now,
      lossReason: payload.lossReason,
      lossNotes: payload.lossNotes,
      activities,
    });

    // Update associated Lead to 'Lost'
    if (quote.leadId) {
      try {
        await api.updateLead(quote.leadId, {
          status: 'Lost',
          lastContactDate: now.split('T')[0],
          notes: `Deal lost on quote #${quote.quotationNumber}. Reason: ${payload.lossReason}. ${payload.lossNotes || ''}`,
        });
      } catch (err) {
        console.warn('Could not update lead to Lost:', err);
      }
    }

    return updatedQuotation;
  },
};
