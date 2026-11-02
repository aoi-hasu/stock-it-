import { Order } from '../types/index.ts';

const STORAGE_KEY = 'stockitease_sales_orders_v1';

export const INITIAL_SAMPLE_ORDERS: Order[] = [
  {
    id: 'ord-004',
    orderNumber: 'ORD-2026-004',
    customerId: 'cust-004',
    customerName: 'Paragon Footwear Ltd',
    contactPerson: 'Suresh Patel',
    mobile: '9822334455',
    quotationId: 'qtn-004',
    quotationNumber: 'QTN-2026-004',
    orderDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    salespersonId: 'sp-1',
    salespersonName: 'Amit Kumar',
    items: [
      {
        id: 'item-401',
        productId: 'prod-4',
        productName: 'Automatic Rotary Direct Soling Injection Machine',
        modelNumber: 'DIP-ROTARY-24',
        quantity: 1,
        unitPrice: 1680000,
        discountPercentage: 0,
        taxableAmount: 1680000,
        gstPercentage: 18,
        gstAmount: 302400,
        totalAmount: 1982400,
      },
    ],
    subtotal: 1680000,
    gstTotal: 302400,
    totalAmount: 1982400,
    advancePayment: 600000,
    balancePayment: 1382400,
    deliveryStatus: 'Pending',
    paymentStatus: 'Partially Paid',
    orderStatus: 'Confirmed',
    stockWarning: false,
    notes: 'Converted from QTN-2026-004 with 30% advance via Bank Transfer. Delivery schedule 30 days from confirmation.',
    companyId: 'org-1',
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'ord-002',
    orderNumber: 'ORD-2026-002',
    customerId: 'cust-002',
    customerName: 'Action Shoes Private Limited',
    contactPerson: 'Manish Agarwal',
    mobile: '9844556677',
    quotationId: 'qtn-prev-02',
    quotationNumber: 'QTN-2026-008',
    orderDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    salespersonId: 'sp-2',
    salespersonName: 'Priya Sharma',
    items: [
      {
        id: 'item-201',
        productId: 'prod-2',
        productName: 'Computerized Heavy Duty Pattern Sewing Machine',
        modelNumber: 'SEW-PAT-900',
        quantity: 2,
        unitPrice: 280000,
        discountPercentage: 0,
        taxableAmount: 560000,
        gstPercentage: 18,
        gstAmount: 100800,
        totalAmount: 660800,
      },
    ],
    subtotal: 560000,
    gstTotal: 100800,
    totalAmount: 660800,
    advancePayment: 660800,
    balancePayment: 0,
    deliveryStatus: 'In Transit',
    paymentStatus: 'Paid',
    orderStatus: 'Ready for Dispatch',
    stockWarning: false,
    notes: '100% Payment received. Machinery packaged and cleared for logistics transport.',
    companyId: 'org-1',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const getStoredOrders = (): Order[] => {
  if (typeof window === 'undefined') return INITIAL_SAMPLE_ORDERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SAMPLE_ORDERS));
      return INITIAL_SAMPLE_ORDERS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_SAMPLE_ORDERS;
  } catch {
    return INITIAL_SAMPLE_ORDERS;
  }
};

export const saveStoredOrders = (orders: Order[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch (err) {
    console.error('Failed to save orders to localStorage:', err);
  }
};
