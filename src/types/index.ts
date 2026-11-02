export type UserRole =
  | 'super_admin'
  | 'owner'
  | 'admin'
  | 'manager'
  | 'sales_manager'
  | 'salesperson'
  | 'inventory_manager'
  | 'accounts';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  department?: string;
  avatar?: string;
  active: boolean;
  createdAt: string;
  isOwner?: boolean;
  companyId?: string;
  mustChangePassword?: boolean;
}

export type LeadSource =
  | 'IndiaMART'
  | 'Website'
  | 'WhatsApp'
  | 'Phone'
  | 'Email'
  | 'Facebook'
  | 'Instagram'
  | 'Google'
  | 'Referral'
  | 'Exhibition'
  | 'Existing Customer'
  | 'Other';

export type LeadStatus =
  | 'New'
  | 'Contacted'
  | 'Qualified'
  | 'Requirement Confirmed'
  | 'Quotation Sent'
  | 'Negotiation'
  | 'Won'
  | 'Lost'
  | 'On Hold';

export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface Lead {
  id: string;
  leadDate: string;
  companyName: string;
  contactPerson: string;
  mobile: string;
  whatsapp: string;
  email: string;
  altPhone?: string;
  address?: string;
  city: string;
  state: string;
  country: string;
  pincode?: string;
  source: LeadSource;
  sourceRef?: string;
  productInterested: string;
  requirement?: string;
  quantity?: number;
  budget?: number;
  status: LeadStatus;
  priority: Priority;
  assignedSalespersonId?: string;
  assignedSalespersonName?: string;
  expectedPurchaseDate?: string;
  lastContactDate?: string;
  nextFollowUpDate?: string;
  nextFollowUpTime?: string;
  notes?: string;
  convertedCustomerId?: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
}

export type CustomerType =
  | 'Manufacturer'
  | 'Dealer'
  | 'Distributor'
  | 'Trader'
  | 'Exporter'
  | 'Service Provider'
  | 'Other';

export type CustomerStatus = 'Prospect' | 'Active' | 'Inactive';

export interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  mobile: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  country: string;
  gstNumber?: string;
  pan?: string;
  customerType: CustomerType;
  industry: string;
  assignedSalespersonId?: string;
  assignedSalespersonName?: string;
  status: CustomerStatus;
  notes?: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  customerId: string;
  customerName?: string;
  name: string;
  designation: string;
  mobile: string;
  whatsapp: string;
  email: string;
  department: string;
  isPrimary: boolean;
  notes?: string;
  companyId?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  modelNumber: string;
  brand: string;
  description: string;
  specifications: Record<string, string>;
  price: number;
  currency: string;
  gstPercentage: number;
  unit: string;
  minStock: number;
  currentStock: number;
  availableStock: number;
  reservedStock: number;
  status: 'Active' | 'Discontinued' | 'Coming Soon';
  images: string[];
  brochureUrl?: string;
  technicalDocUrl?: string;
  videoUrl?: string;
  notes?: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
}

export type InventoryTransactionType =
  | 'Stock In'
  | 'Stock Out'
  | 'Reservation'
  | 'Sale'
  | 'Return'
  | 'Adjustment'
  | 'Damage';

export interface InventoryTransaction {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  transactionType: InventoryTransactionType;
  referenceType?: 'Order' | 'Purchase' | 'Adjustment' | 'Damage Log' | 'Manual';
  referenceId?: string;
  date: string;
  userId: string;
  userName: string;
  notes?: string;
  companyId?: string;
  createdAt: string;
}

export interface QuotationItem {
  id: string;
  productId: string;
  productName: string;
  modelNumber: string;
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
  taxableAmount: number;
  gstPercentage: number;
  gstAmount: number;
  totalAmount: number;
}

export type QuotationStatus =
  | 'Draft'
  | 'Sent'
  | 'Viewed'
  | 'Negotiation'
  | 'Accepted'
  | 'Rejected'
  | 'Expired'
  | 'Converted';

export type PostQuoteStage =
  | 'quote_sent'
  | 'follow_up'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export type LossReason =
  | 'Price'
  | 'Competitor'
  | 'Timeline'
  | 'Ghosted'
  | 'Budget Cancelled'
  | 'Technical Specifications'
  | 'Other';

export type ObjectionCategory =
  | 'Price'
  | 'Delivery Timeline'
  | 'Payment Terms'
  | 'Competitor Match'
  | 'Warranty / Service'
  | 'Technical Specifications'
  | 'Other';

export interface QuoteObjection {
  id: string;
  date: string;
  category: ObjectionCategory;
  description: string;
  loggedBy: string;
  resolved?: boolean;
  resolutionNotes?: string;
}

export interface QuoteVersion {
  version: number;
  createdAt: string;
  createdBy: string;
  grandTotal: number;
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  gstTotal: number;
  items: QuotationItem[];
  changeSummary: string;
  objectionNotes?: string;
}

export interface QuotationActivityLog {
  id: string;
  timestamp: string;
  type:
    | 'created'
    | 'sent'
    | 'viewed'
    | 'followed_up'
    | 'objection_logged'
    | 'version_updated'
    | 'closed_won'
    | 'closed_lost'
    | 'note';
  title: string;
  description?: string;
  actorName: string;
  metadata?: Record<string, any>;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  date: string;
  validUntil: string;
  customerId?: string;
  customerName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  billingAddress: string;
  shippingAddress: string;
  salespersonId?: string;
  salespersonName?: string;
  leadId?: string;
  items: QuotationItem[];
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  gstTotal: number;
  grandTotal: number;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
  termsAndConditions: string;
  notes?: string;
  status: QuotationStatus;
  pipelineStage?: PostQuoteStage;
  version?: number;
  versionHistory?: QuoteVersion[];
  objections?: QuoteObjection[];
  activities?: QuotationActivityLog[];
  sentAt?: string;
  viewedAt?: string;
  lastFollowUpAt?: string;
  followUpCount?: number;
  closedAt?: string;
  lossReason?: LossReason;
  lossNotes?: string;
  convertedOrderId?: string;
  convertedInvoiceId?: string;
  convertedInvoiceNumber?: string;
  serviceAgreementNumber?: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus =
  | 'Confirmed'
  | 'Processing'
  | 'Ready for Dispatch'
  | 'Dispatched'
  | 'Delivered'
  | 'Completed'
  | 'Cancelled';

export type PaymentStatus = 'Pending' | 'Partially Paid' | 'Paid' | 'Overdue';

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  contactPerson: string;
  mobile: string;
  quotationId?: string;
  quotationNumber?: string;
  orderDate: string;
  salespersonId?: string;
  salespersonName?: string;
  items: QuotationItem[];
  subtotal: number;
  gstTotal: number;
  totalAmount: number;
  advancePayment: number;
  balancePayment: number;
  deliveryStatus: 'Pending' | 'In Transit' | 'Delivered' | 'Returned';
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  stockWarning?: boolean;
  notes?: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod =
  | 'Bank Transfer'
  | 'UPI'
  | 'Cash'
  | 'Cheque'
  | 'Card'
  | 'Other';

export interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  orderId?: string;
  orderNumber?: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  bank?: string;
  notes?: string;
  recordedBy: string;
  companyId?: string;
  createdAt: string;
}

export type FollowUpType =
  | 'Phone Call'
  | 'WhatsApp'
  | 'Email'
  | 'Meeting'
  | 'Site Visit'
  | 'Demo'
  | 'Other';

export type FollowUpStatus = 'Pending' | 'Completed' | 'Rescheduled' | 'Cancelled';

export interface FollowUp {
  id: string;
  entityType: 'lead' | 'customer';
  entityId: string;
  entityName: string;
  contactPerson?: string;
  mobile?: string;
  date: string;
  time: string;
  assignedUserId: string;
  assignedUserName: string;
  followUpType: FollowUpType;
  notes: string;
  status: FollowUpStatus;
  outcome?: string;
  completedAt?: string;
  companyId?: string;
  createdAt: string;
}

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskStatus = 'To Do' | 'In Progress' | 'Completed' | 'Cancelled';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedUserId: string;
  assignedUserName: string;
  priority: TaskPriority;
  dueDate: string;
  relatedLeadId?: string;
  relatedLeadName?: string;
  relatedCustomerId?: string;
  relatedCustomerName?: string;
  status: TaskStatus;
  companyId?: string;
  createdAt: string;
}

export type CommunicationType =
  | 'Phone Call'
  | 'WhatsApp'
  | 'Email'
  | 'Meeting'
  | 'Notes'
  | 'SMS';

export interface Communication {
  id: string;
  entityType: 'lead' | 'customer';
  entityId: string;
  entityName: string;
  userId: string;
  userName: string;
  timestamp: string;
  type: CommunicationType;
  direction: 'Inbound' | 'Outbound';
  message: string;
  outcome?: string;
  companyId?: string;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  entityType: 'lead' | 'customer' | 'quotation' | 'order' | 'product' | 'general';
  entityId?: string;
  entityName?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  storagePath?: string;
  uploadedBy: string;
  companyId?: string;
  uploadedAt: string;
}

export interface Notification {
  id: string;
  recipientUserId?: string;
  title: string;
  message: string;
  type: 'lead' | 'followup' | 'quotation' | 'order' | 'payment' | 'stock' | 'task';
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export interface TenantIntegration {
  id: string;
  company_id: string;
  kind: 'indiamart' | 'whatsapp' | 'website';
  whatsapp_phone_number_id?: string;
  allowed_origins?: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  webhookUrlTemplate?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export interface CompanySettings {
  companyName: string;
  brandTitle: string;
  tagline: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  bankName: string;
  bankBranch: string;
  accountNumber: string;
  ifscCode: string;
  logoUrl?: string;
  defaultQuotationValidityDays: number;
  quotationPrefix: string;
  orderPrefix: string;
  invoicePrefix?: string;
  // Default HSN/SAC code printed on quotations and invoices (each company sets its own).
  defaultHsnCode?: string;
  defaultHsnDescription?: string;
  defaultPaymentTerms: string;
  defaultDeliveryTerms: string;
  defaultWarrantyTerms: string;
  defaultTermsAndConditions: string;
}

export interface IntegrationSettings {
  whatsapp: {
    enabled: boolean;
    businessAccountId: string;
    phoneNumberId: string;
    accessToken: string;
    webhookVerifyToken: string;
    status: 'connected' | 'unconfigured' | 'error';
  };
  indiamart: {
    enabled: boolean;
    crmKey: string;
    mobileNumber: string;
    pullFrequencyMinutes: number;
    lastSyncTime?: string;
    status: 'connected' | 'unconfigured' | 'error';
  };
  website: {
    enabled: boolean;
    apiKey: string;
    corsOrigins: string;
    leadSourceDefault: string;
    webhookUrl: string;
  };
  email: {
    enabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    senderEmail: string;
    senderName: string;
    secure: boolean;
  };
  supabase: {
    connected: boolean;
    projectUrl: string;
    anonKey: string;
    serviceRoleKey: string;
    lastTested?: string;
  };
}

export interface TenantOrganization {
  id: string;
  name: string;
  code: string;
  industry?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  active: boolean;
  logoUrl?: string;
  plan: 'Starter' | 'Professional' | 'Enterprise';
  subscriptionStatus?: 'Active' | 'Trial' | 'Expired' | 'Suspended';
  subscriptionValidUntil?: string;
  maxUsers?: number;
  companyOwnerId?: string;
  companyOwnerName?: string;
  companyOwnerEmail?: string;
  createdAt: string;
  website?: string;
}

export interface TaxInvoiceItem {
  id: string;
  productId?: string;
  productName: string;
  modelNumber?: string;
  hsnCode?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercentage: number;
  taxableAmount: number;
  gstPercentage: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}

export interface TaxInvoice {
  id: string;
  invoiceNumber: string;
  financialYear?: string;
  invoiceDate: string;
  dueDate: string;
  orderId?: string;
  orderNumber?: string;
  quotationId?: string;
  quotationNumber?: string;
  customerId: string;
  customerName: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  billingAddress: string;
  shippingAddress: string;
  customerGstin?: string;
  customerPan?: string;
  placeOfSupply: string;
  stateCode: string;
  isInterState: boolean;
  reverseCharge: boolean;
  transportMode?: string;
  vehicleNumber?: string;
  lrNumber?: string;
  items: TaxInvoiceItem[];
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  totalTax: number;
  grandTotal: number;
  amountInWords?: string;
  paymentStatus: 'Pending' | 'Partially Paid' | 'Paid';
  paymentTerms?: string;
  notes?: string;
  status?: 'Active' | 'Cancelled';
  cancelled?: boolean;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  companyId?: string;
  createdById?: string;
  createdByName?: string;
  createdAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  gstNumber?: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  category?: string;
  paymentTerms?: string;
  notes?: string;
  companyId?: string;
  createdAt: string;
}

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Ordered'
  | 'Partially Received'
  | 'Received'
  | 'Cancelled';

export type PurchaseOrderPaymentStatus =
  | 'Unpaid'
  | 'Partially Paid'
  | 'Paid';

export interface PurchaseOrderItem {
  id: string;
  productId?: string;
  itemName: string;
  itemCode?: string;
  category?: string;
  hsnCode?: string;
  quantity: number;
  receivedQuantity?: number;
  unit: string;
  unitPrice: number;
  discountPercentage: number;
  taxableAmount: number;
  gstPercentage: number;
  gstAmount: number;
  totalAmount: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  date: string;
  expectedDeliveryDate?: string;
  receivedDate?: string;
  vendorId?: string;
  supplierName: string;
  supplierGstin?: string;
  supplierContact?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  supplierAddress?: string;
  supplierCity?: string;
  supplierState?: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxableAmount: number;
  gstTotal: number;
  grandTotal: number;
  status: PurchaseOrderStatus;
  paymentStatus: PurchaseOrderPaymentStatus;
  paidAmount?: number;
  paymentMode?: string;
  notes?: string;
  inwardNotes?: string;
  createdBy: string;
  createdByName?: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
}


