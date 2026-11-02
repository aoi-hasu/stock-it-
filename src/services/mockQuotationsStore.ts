import { Quotation, Order, TaxInvoice } from '../types/index.ts';

const STORAGE_KEY = 'stockitease_pipeline_quotations_v1';
const ORDERS_STORAGE_KEY = 'stockitease_pipeline_orders_v1';
const INVOICES_STORAGE_KEY = 'stockitease_pipeline_invoices_v1';

export const INITIAL_SAMPLE_QUOTATIONS: Quotation[] = [
  {
    id: 'qtn-001',
    quotationNumber: 'QTN-2026-001',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customerName: 'Relaxo Footwear Components',
    contactPerson: 'Ramesh Sharma',
    mobile: '9811223344',
    email: 'ramesh.sharma@relaxo.com',
    billingAddress: 'Sector 18, Industrial Area, Gurugram, Haryana',
    shippingAddress: 'Plot 42, Udyog Vihar Phase 4, Gurugram',
    salespersonId: 'sp-1',
    salespersonName: 'Amit Kumar',
    status: 'Sent',
    pipelineStage: 'quote_sent',
    version: 1,
    sentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      {
        id: 'item-101',
        productId: 'prod-1',
        productName: 'High-Speed Rotary Sole Cutting Press (50T)',
        modelNumber: 'HRC-50-PRO',
        quantity: 1,
        unitPrice: 1228814,
        discountPercentage: 0,
        taxableAmount: 1228814,
        gstPercentage: 18,
        gstAmount: 221186,
        totalAmount: 1450000,
      },
    ],
    subtotal: 1228814,
    discountTotal: 0,
    taxableAmount: 1228814,
    gstTotal: 221186,
    grandTotal: 1450000,
    paymentTerms: '30% Advance with confirmation, 70% prior to dispatch.',
    deliveryTerms: 'Ex-Works within 3 weeks from receipt of technical clearance.',
    warrantyTerms: '12 Months comprehensive manufacturer warranty with on-site support.',
    termsAndConditions: '1. Quotation valid for 30 calendar days.\n2. Taxes and transit insurance extra.\n3. Inspection welcome prior to dispatch.',
    activities: [
      {
        id: 'act-1',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'created',
        title: 'Quotation Generated',
        description: 'Commercial proposal QTN-2026-001 created for ₹14,50,000',
        actorName: 'Amit Kumar',
      },
      {
        id: 'act-2',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'sent',
        title: 'Quotation Sent via Email',
        description: 'Emailed official proposal to ramesh.sharma@relaxo.com',
        actorName: 'Amit Kumar',
        metadata: { channel: 'email' },
      },
    ],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'qtn-002',
    quotationNumber: 'QTN-2026-002',
    date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customerName: 'VKC Footwear Industries',
    contactPerson: 'K. Narayanan',
    mobile: '9845112233',
    email: 'knarayanan@vkcgroup.com',
    billingAddress: 'Industrial Development Area, Kozhikode, Kerala',
    shippingAddress: 'Plot 12, KINFRA Park, Kozhikode',
    salespersonId: 'sp-2',
    salespersonName: 'Priya Patel',
    status: 'Sent',
    pipelineStage: 'follow_up',
    version: 1,
    sentAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    followUpCount: 0,
    items: [
      {
        id: 'item-102',
        productId: 'prod-2',
        productName: 'Hydraulic Double-Station Sole Vulcanizing Machine',
        modelNumber: 'HDS-200-DUO',
        quantity: 2,
        unitPrice: 966102,
        discountPercentage: 0,
        taxableAmount: 1932204,
        gstPercentage: 18,
        gstAmount: 347796,
        totalAmount: 2280000,
      },
    ],
    subtotal: 1932204,
    discountTotal: 0,
    taxableAmount: 1932204,
    gstTotal: 347796,
    grandTotal: 2280000,
    paymentTerms: '30% Advance with confirmation, 70% prior to dispatch.',
    deliveryTerms: 'Ex-Works within 4 weeks from technical sign-off.',
    warrantyTerms: '12 Months comprehensive manufacturer warranty with on-site engineer visit.',
    termsAndConditions: '1. Quotation valid for 30 calendar days.\n2. State freight extra at actuals.',
    activities: [
      {
        id: 'act-3',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'created',
        title: 'Quotation Generated',
        description: 'Proposal created for 2x Vulcanizing Machines (₹22,80,000)',
        actorName: 'Priya Patel',
      },
      {
        id: 'act-4',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'sent',
        title: 'Quotation Sent via Email',
        description: 'Dispatched to knarayanan@vkcgroup.com (4 days ago without response)',
        actorName: 'Priya Patel',
      },
    ],
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'qtn-003',
    quotationNumber: 'QTN-2026-003',
    date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 24 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customerName: 'Liberty Shoes Ancillary Ltd',
    contactPerson: 'Vikram Malhotra',
    mobile: '9812345678',
    email: 'vikram@libertyshoes.com',
    billingAddress: 'Liberty Enclave, GT Road, Karnal, Haryana',
    shippingAddress: 'Liberty Footwear Complex, Karnal',
    salespersonId: 'sp-1',
    salespersonName: 'Amit Kumar',
    status: 'Negotiation',
    pipelineStage: 'negotiation',
    version: 2,
    sentAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    followUpCount: 1,
    lastFollowUpAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    objections: [
      {
        id: 'obj-301',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        category: 'Price',
        description: 'Client requesting 5% price revision to match competing Taiwanese quote. Also requested 40-60 payment term.',
        loggedBy: 'Amit Kumar',
        resolved: true,
        resolutionNotes: 'Approved 5% discount on machine unit with 30-70 terms retained.',
      },
      {
        id: 'obj-302',
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        category: 'Delivery Timeline',
        description: 'Client requested dispatch in 18 days instead of standard 4 weeks.',
        loggedBy: 'Amit Kumar',
        resolved: false,
      },
    ],
    versionHistory: [
      {
        version: 1,
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: 'Amit Kumar',
        grandTotal: 3750000,
        subtotal: 3177966,
        discountTotal: 0,
        taxableAmount: 3177966,
        gstTotal: 572034,
        items: [
          {
            id: 'item-301',
            productId: 'prod-3',
            productName: 'Direct Injection Polyurethane Sole Molding Plant',
            modelNumber: 'DIP-36-STATION',
            quantity: 1,
            unitPrice: 3177966,
            discountPercentage: 0,
            taxableAmount: 3177966,
            gstPercentage: 18,
            gstAmount: 572034,
            totalAmount: 3750000,
          },
        ],
        changeSummary: 'Original proposal v1 (list price without extra discount)',
      },
    ],
    items: [
      {
        id: 'item-302',
        productId: 'prod-3',
        productName: 'Direct Injection Polyurethane Sole Molding Plant',
        modelNumber: 'DIP-36-STATION',
        quantity: 1,
        unitPrice: 3177966,
        discountPercentage: 5,
        taxableAmount: 3000000,
        gstPercentage: 18,
        gstAmount: 540000,
        totalAmount: 3540000,
      },
    ],
    subtotal: 3177966,
    discountTotal: 177966,
    taxableAmount: 3000000,
    gstTotal: 540000,
    grandTotal: 3540000,
    paymentTerms: '30% Advance with confirmation, 70% prior to dispatch.',
    deliveryTerms: 'Ex-Works within 21 days from receipt of technical clearance.',
    warrantyTerms: '18 Months comprehensive warranty with 2 free quarterly servicing visits.',
    termsAndConditions: '1. Revised commercial terms subject to confirmation by end of month.',
    activities: [
      {
        id: 'act-5',
        timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'created',
        title: 'Original Quote Generated (v1)',
        description: 'Proposal created for ₹37,50,000',
        actorName: 'Amit Kumar',
      },
      {
        id: 'act-6',
        timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'sent',
        title: 'Quote Sent to Vikram Malhotra',
        description: 'Dispatched via email',
        actorName: 'Amit Kumar',
      },
      {
        id: 'act-7',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'viewed',
        title: 'Quote Link Opened by Client',
        description: 'Client viewed commercial proposal',
        actorName: 'Client System',
      },
      {
        id: 'act-8',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'objection_logged',
        title: 'Client Objection: Price & Terms',
        description: 'Requested 5% discount and expedited timeline',
        actorName: 'Amit Kumar',
      },
      {
        id: 'act-9',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'version_updated',
        title: 'Revised to Version 2',
        description: 'Applied 5% discount. Revised Grand Total: ₹35,40,000',
        actorName: 'Amit Kumar',
      },
    ],
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'qtn-004',
    quotationNumber: 'QTN-2026-004',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customerName: 'Paragon Polymers Pvt Ltd',
    contactPerson: 'Sunil Verma',
    mobile: '9823456789',
    email: 'sunil.verma@paragonfootwear.com',
    billingAddress: 'Kottayam Industrial Complex, Kerala',
    shippingAddress: 'Paragon Compound, Kottayam',
    salespersonId: 'sp-2',
    salespersonName: 'Priya Patel',
    status: 'Accepted',
    pipelineStage: 'closed_won',
    version: 1,
    sentAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    closedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    convertedOrderId: 'ord-104',
    convertedInvoiceId: 'inv-104',
    convertedInvoiceNumber: 'INV-2026-005',
    serviceAgreementNumber: 'SA-2026-018',
    items: [
      {
        id: 'item-104',
        productId: 'prod-4',
        productName: 'EVA Sheet Hot & Cold Compression Press Line',
        modelNumber: 'EVA-PRESS-600',
        quantity: 1,
        unitPrice: 1601695,
        discountPercentage: 0,
        taxableAmount: 1601695,
        gstPercentage: 18,
        gstAmount: 288305,
        totalAmount: 1890000,
      },
    ],
    subtotal: 1601695,
    discountTotal: 0,
    taxableAmount: 1601695,
    gstTotal: 288305,
    grandTotal: 1890000,
    paymentTerms: '30% Advance with confirmation, 70% prior to dispatch.',
    deliveryTerms: 'Ex-Works within 3 weeks.',
    warrantyTerms: '12 Months comprehensive manufacturer warranty.',
    termsAndConditions: '1. Standard warranty and factory test certificate included.',
    activities: [
      {
        id: 'act-10',
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'created',
        title: 'Quotation Generated',
        description: 'Proposal created for ₹18,90,000',
        actorName: 'Priya Patel',
      },
      {
        id: 'act-11',
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'sent',
        title: 'Quotation Sent',
        description: 'Dispatched to sunil.verma@paragonfootwear.com',
        actorName: 'Priya Patel',
      },
      {
        id: 'act-12',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'closed_won',
        title: 'Deal Closed-Won (Automated Execution)',
        description: 'Converted to Confirmed Sales Order #ORD-2026-008 & Tax Invoice #INV-2026-005. Automated onboarding email delivered.',
        actorName: 'Priya Patel',
      },
    ],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'qtn-005',
    quotationNumber: 'QTN-2026-005',
    date: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customerName: 'Metro Footwear Works',
    contactPerson: 'Anil Kapoor',
    mobile: '9876543210',
    email: 'anil@metrofootwear.com',
    billingAddress: 'Leather Complex, Jalandhar, Punjab',
    shippingAddress: 'Metro Factory, Jalandhar',
    salespersonId: 'sp-1',
    salespersonName: 'Amit Kumar',
    status: 'Rejected',
    pipelineStage: 'closed_lost',
    version: 1,
    sentAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    closedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    lossReason: 'Price',
    lossNotes: 'Client chose local unbranded manufacturer quoting 18% lower upfront cost despite inferior warranty.',
    items: [
      {
        id: 'item-105',
        productId: 'prod-5',
        productName: 'Upper Stitching & Folding Automation Unit',
        modelNumber: 'UFA-80-AUTO',
        quantity: 2,
        unitPrice: 686440,
        discountPercentage: 0,
        taxableAmount: 1372881,
        gstPercentage: 18,
        gstAmount: 247119,
        totalAmount: 1620000,
      },
    ],
    subtotal: 1372881,
    discountTotal: 0,
    taxableAmount: 1372881,
    gstTotal: 247119,
    grandTotal: 1620000,
    paymentTerms: '30% Advance, 70% prior to dispatch.',
    deliveryTerms: 'Ex-Works within 2 weeks.',
    warrantyTerms: '12 Months comprehensive warranty.',
    termsAndConditions: 'Standard commercial conditions.',
    activities: [
      {
        id: 'act-13',
        timestamp: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'created',
        title: 'Quotation Generated',
        description: 'Proposal created for ₹16,20,000',
        actorName: 'Amit Kumar',
      },
      {
        id: 'act-14',
        timestamp: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'sent',
        title: 'Quotation Sent via Email',
        description: 'Dispatched to anil@metrofootwear.com',
        actorName: 'Amit Kumar',
      },
      {
        id: 'act-15',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'closed_lost',
        title: 'Deal Closed-Lost: [Price]',
        description: 'Client chose local unbranded machinery to save capital.',
        actorName: 'Amit Kumar',
      },
    ],
    createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'qtn-006',
    quotationNumber: 'QTN-2026-006',
    date: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 19 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customerName: 'Super Tannery Footwear Division',
    contactPerson: 'Mohd. Zeeshan',
    mobile: '9833445566',
    email: 'm.zeeshan@supertannery.com',
    billingAddress: 'Jajmau, Kanpur, Uttar Pradesh',
    shippingAddress: 'Tannery Campus, Jajmau, Kanpur',
    salespersonId: 'sp-2',
    salespersonName: 'Priya Patel',
    status: 'Rejected',
    pipelineStage: 'closed_lost',
    version: 1,
    sentAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(),
    closedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    lossReason: 'Competitor',
    lossNotes: 'Competitor had existing service technician stationed inside the customer factory premises.',
    items: [
      {
        id: 'item-106',
        productId: 'prod-6',
        productName: 'Computerized Pattern Eyeleting & Punching Machine',
        modelNumber: 'CPE-12-SPEED',
        quantity: 2,
        unitPrice: 415254,
        discountPercentage: 0,
        taxableAmount: 830508,
        gstPercentage: 18,
        gstAmount: 149492,
        totalAmount: 980000,
      },
    ],
    subtotal: 830508,
    discountTotal: 0,
    taxableAmount: 830508,
    gstTotal: 149492,
    grandTotal: 980000,
    paymentTerms: '30% Advance, 70% prior to dispatch.',
    deliveryTerms: 'Ex-Works within 10 days.',
    warrantyTerms: '12 Months comprehensive warranty.',
    termsAndConditions: 'Standard terms.',
    activities: [
      {
        id: 'act-16',
        timestamp: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'created',
        title: 'Quotation Generated',
        description: 'Proposal created for ₹9,80,000',
        actorName: 'Priya Patel',
      },
      {
        id: 'act-17',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'closed_lost',
        title: 'Deal Closed-Lost: [Competitor]',
        description: 'Lost to competitor due to resident factory technician presence.',
        actorName: 'Priya Patel',
      },
    ],
    createdAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function getStoredQuotations(): Quotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  saveStoredQuotations(INITIAL_SAMPLE_QUOTATIONS);
  return INITIAL_SAMPLE_QUOTATIONS;
}

export function saveStoredQuotations(list: Quotation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Could not save quotations to localStorage', err);
  }
}

export const INITIAL_SAMPLE_ORDERS: Order[] = [
  {
    id: 'ord-won-4',
    orderNumber: 'SO-2026-008',
    customerId: 'cust-paragon',
    customerName: 'Paragon Polymer Products',
    contactPerson: 'Sunil Verma',
    mobile: '9822334455',
    quotationId: 'qtn-004',
    quotationNumber: 'QTN-2026-004',
    orderDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    salespersonId: 'sp-2',
    salespersonName: 'Priya Patel',
    items: [
      {
        id: 'item-104',
        productId: 'prod-4',
        productName: 'Automatic EVA Foam Sheet Vulcanizing Hydraulic Press',
        modelNumber: 'EVA-VULC-400',
        quantity: 1,
        unitPrice: 1601695,
        discountPercentage: 0,
        taxableAmount: 1601695,
        gstPercentage: 18,
        gstAmount: 288305,
        totalAmount: 1890000,
      },
    ],
    subtotal: 1601695,
    gstTotal: 288305,
    totalAmount: 1890000,
    advancePayment: 567000,
    balancePayment: 1323000,
    deliveryStatus: 'Pending',
    paymentStatus: 'Partially Paid',
    orderStatus: 'Confirmed',
    notes: 'Commercial footwear machinery supply agreement generated from quotation QTN-2026-004',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function getStoredOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  saveStoredOrders(INITIAL_SAMPLE_ORDERS);
  return INITIAL_SAMPLE_ORDERS;
}

export function saveStoredOrders(list: Order[]): void {
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Could not save orders to localStorage', err);
  }
}

export const INITIAL_SAMPLE_INVOICES: TaxInvoice[] = [
  {
    id: 'inv-won-4',
    invoiceNumber: 'INV/2026-27/0005',
    financialYear: '2026-27',
    invoiceDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    orderId: 'ord-won-4',
    orderNumber: 'SO-2026-008',
    quotationId: 'qtn-004',
    quotationNumber: 'QTN-2026-004',
    customerId: 'cust-paragon',
    customerName: 'Paragon Polymer Products',
    contactPerson: 'Sunil Verma',
    mobile: '9822334455',
    email: 'sunil.verma@paragonfootwear.com',
    billingAddress: 'MIDC Industrial Area, Bhosari, Pune, Maharashtra',
    shippingAddress: 'MIDC Industrial Area, Bhosari, Pune, Maharashtra',
    placeOfSupply: 'Maharashtra (27)',
    stateCode: '27',
    isInterState: true,
    reverseCharge: false,
    items: [
      {
        id: 'inv-it-4',
        productId: 'prod-4',
        productName: 'Automatic EVA Foam Sheet Vulcanizing Hydraulic Press',
        modelNumber: 'EVA-VULC-400',
        hsnCode: '8477',
        quantity: 1,
        unit: 'Unit',
        unitPrice: 1601695,
        discountPercentage: 0,
        taxableAmount: 1601695,
        gstPercentage: 18,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 288305,
        totalAmount: 1890000,
      },
    ],
    subtotal: 1601695,
    discountTotal: 0,
    taxableAmount: 1601695,
    cgstTotal: 0,
    sgstTotal: 0,
    igstTotal: 288305,
    totalTax: 288305,
    grandTotal: 1890000,
    amountInWords: 'Eighteen Lakh Ninety Thousand Rupees Only',
    paymentStatus: 'Partially Paid',
    paymentTerms: '30% Advance with confirmation, 70% prior to dispatch.',
    notes: 'Automated Tax Invoice generated upon Closed-Won execution for Quote #QTN-2026-004',
    status: 'Active',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function getStoredInvoices(): TaxInvoice[] {
  try {
    const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  saveStoredInvoices(INITIAL_SAMPLE_INVOICES);
  return INITIAL_SAMPLE_INVOICES;
}

export function saveStoredInvoices(list: TaxInvoice[]): void {
  try {
    localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Could not save invoices to localStorage', err);
  }
}
