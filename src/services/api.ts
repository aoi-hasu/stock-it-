import { supabase } from './supabase.ts';
import {
  User,
  Lead,
  Customer,
  Contact,
  Product,
  InventoryTransaction,
  Quotation,
  Order,
  OrderStatus,
  Payment,
  PaymentStatus,
  FollowUp,
  Task,
  Communication,
  DocumentItem,
  Notification,
  AuditLog,
  CompanySettings,
  IntegrationSettings,
  TenantOrganization,
  TaxInvoice,
  PurchaseOrder,
} from '../types/index.ts';
import {
  getStoredQuotations,
  saveStoredQuotations,
  getStoredOrders,
  saveStoredOrders,
  getStoredInvoices,
  saveStoredInvoices,
} from './mockQuotationsStore.ts';

// Helper to get active user's company_id and profile
async function getCurrentUserProfile(): Promise<{ userId: string; companyId: string; role: string; name: string }> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    throw new Error('Authentication required.');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (error || !profile) {
    throw new Error('User profile not found.');
  }

  if (!profile.active) {
    await supabase.auth.signOut();
    throw new Error('Your account is inactive. Please contact your administrator.');
  }

  return {
    userId: profile.id,
    companyId: profile.company_id,
    role: profile.role,
    name: profile.name,
  };
}

// Default initial company settings for client organizations
export const defaultCompanySettings: CompanySettings = {
  companyName: 'StockItEase Client',
  brandTitle: 'StockItEase',
  tagline: 'Enterprise Operations & Machinery Management',
  address: '',
  city: '',
  state: '',
  country: 'India',
  pincode: '',
  phone: '',
  mobile: '',
  email: '',
  website: '',
  gstin: '',
  pan: '',
  bankName: '',
  bankBranch: '',
  accountNumber: '',
  ifscCode: '',
  logoUrl: '',
  defaultQuotationValidityDays: 30,
  quotationPrefix: 'QTN',
  orderPrefix: 'ORD',
  invoicePrefix: 'INV',
  defaultHsnCode: '',
  defaultHsnDescription: '',
  defaultPaymentTerms: '30% Advance with Order confirmation, 70% prior to dispatch.',
  defaultDeliveryTerms: 'Ex-Works within scheduled timeframe from technical confirmation.',
  defaultWarrantyTerms: '12 Months comprehensive manufacturer warranty.',
  defaultTermsAndConditions: '1. Standard commercial terms apply.\n2. Taxes and freight charges extra as applicable.\n3. Goods verified prior to dispatch.',
};

export function matchesCompany(itemCompanyId?: string, targetCompanyId?: string): boolean {
  if (!targetCompanyId || targetCompanyId === 'all') return true;
  return itemCompanyId === targetCompanyId;
}

export const api = {
  // ==========================================
  // ORGANIZATIONS & TENANTS
  // ==========================================
  getOrganizations: async (): Promise<TenantOrganization[]> => {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      code: row.code || '',
      industry: row.data?.industry || 'Enterprise Client',
      contactPerson: row.data?.contactPerson || '',
      email: row.data?.email || '',
      phone: row.data?.phone || '',
      gstin: row.data?.gstin || '',
      pan: row.data?.pan || '',
      address: row.data?.address || '',
      city: row.data?.city || '',
      state: row.data?.state || '',
      active: row.active ?? true,
      logoUrl: row.data?.logoUrl || '',
      plan: row.data?.plan || 'Professional',
      subscriptionStatus: row.data?.subscriptionStatus || 'Active',
      subscriptionValidUntil: row.data?.subscriptionValidUntil || '2028-12-31',
      maxUsers: row.data?.maxUsers || 25,
      companyOwnerId: row.data?.companyOwnerId,
      companyOwnerName: row.data?.companyOwnerName,
      companyOwnerEmail: row.data?.companyOwnerEmail,
      createdAt: row.created_at,
      website: row.data?.website || '',
    }));
  },

  createOrganization: async (data: Partial<TenantOrganization>): Promise<TenantOrganization> => {
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;

    const res = await fetch('/api/platform-create-organization', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        organizationName: data.name,
        organizationCode: data.code,
        ownerName: data.contactPerson || 'Company Owner',
        ownerEmail: data.email,
        plan: data.plan || 'Professional',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to create client organization.');
    }

    const json = await res.json();
    return {
      id: json.organization.id,
      name: json.organization.name,
      code: json.organization.code || '',
      industry: 'Enterprise Client',
      contactPerson: data.contactPerson || '',
      email: data.email || '',
      phone: data.phone || '',
      active: true,
      plan: data.plan || 'Professional',
      createdAt: json.organization.created_at,
    };
  },

  // ==========================================
  // USERS & TEAM MANAGEMENT
  // ==========================================
  getUsers: async (_params?: any): Promise<User[]> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);

    return (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      phone: p.phone || '',
      department: p.department || 'Operations',
      active: p.active ?? true,
      createdAt: p.created_at,
      isOwner: p.role === 'super_admin' || p.role === 'owner',
      companyId: p.company_id,
      mustChangePassword: p.must_change_password,
    }));
  },

  createUser: async (data: Partial<User>): Promise<User & { oneTimePassword?: string }> => {
    const session = (await supabase.auth.getSession()).data.session;
    const res = await fetch('/api/admin-create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        role: data.role || 'salesperson',
        phone: data.phone,
        department: data.department,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to create user.');
    }

    const json = await res.json();
    return {
      ...json.user,
      oneTimePassword: json.oneTimePassword,
    };
  },

  updateUser: async (id: string, data: Partial<User>): Promise<User> => {
    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.department !== undefined) updates.department = data.department;
    if (data.role !== undefined) updates.role = data.role;
    if (data.active !== undefined) updates.active = data.active;

    const { data: updated, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      phone: updated.phone || '',
      department: updated.department || '',
      active: updated.active,
      createdAt: updated.created_at,
      companyId: updated.company_id,
      mustChangePassword: updated.must_change_password,
    };
  },

  deleteUser: async (id: string): Promise<{ success: boolean }> => {
    // Deactivate user in profiles
    const { error } = await supabase
      .from('profiles')
      .update({ active: false })
      .eq('id', id);

    if (error) throw new Error(error.message);
    return { success: true };
  },

  changeUserPassword: async (userId: string, _newPassword?: string): Promise<{ success: boolean; oneTimePassword?: string }> => {
    const session = (await supabase.auth.getSession()).data.session;
    const res = await fetch('/api/admin-reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to reset user password.');
    }

    const json = await res.json();
    return { success: true, oneTimePassword: json.oneTimePassword };
  },

  // ==========================================
  // LEADS
  // ==========================================
  getLeads: async (params: Record<string, string> = {}): Promise<Lead[]> => {
    let query = supabase.from('leads').select('*').order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let list: Lead[] = (data || []).map((row: any) => ({
      ...row.data,
      id: row.id,
      companyId: row.company_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    if (params.status && params.status !== 'all') {
      list = list.filter(l => l.status?.toLowerCase() === params.status.toLowerCase());
    }
    if (params.source && params.source !== 'all') {
      list = list.filter(l => l.source?.toLowerCase() === params.source.toLowerCase());
    }
    if (params.priority && params.priority !== 'all') {
      list = list.filter(l => l.priority?.toLowerCase() === params.priority.toLowerCase());
    }
    if (params.salespersonId && params.salespersonId !== 'all') {
      list = list.filter(l => l.assignedSalespersonId === params.salespersonId);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        l =>
          l.companyName?.toLowerCase().includes(q) ||
          l.contactPerson?.toLowerCase().includes(q) ||
          l.mobile?.includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.id?.toLowerCase().includes(q) ||
          l.productInterested?.toLowerCase().includes(q)
      );
    }

    return list;
  },

  getLeadById: async (id: string): Promise<{ lead: Lead; followUps: FollowUp[]; quotations: Quotation[]; communications: Communication[]; tasks: Task[]; documents: DocumentItem[] }> => {
    const { data: leadRow, error } = await supabase.from('leads').select('*').eq('id', id).single();
    if (error || !leadRow) throw new Error('Lead not found.');

    const lead: Lead = {
      ...leadRow.data,
      id: leadRow.id,
      companyId: leadRow.company_id,
      createdAt: leadRow.created_at,
      updatedAt: leadRow.updated_at,
    };

    const [fRes, qRes, cRes, tRes, dRes] = await Promise.all([
      supabase.from('follow_ups').select('*'),
      supabase.from('quotations').select('*'),
      supabase.from('communications').select('*'),
      supabase.from('tasks').select('*'),
      supabase.from('documents').select('*'),
    ]);

    const followUps: FollowUp[] = (fRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(f => f.entityType === 'lead' && f.entityId === id);

    const quotations: Quotation[] = (qRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(q => q.leadId === id || q.customerName === lead.companyName);

    const communications: Communication[] = (cRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(c => c.entityType === 'lead' && c.entityId === id);

    const tasks: Task[] = (tRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(t => t.relatedLeadId === id);

    const documents: DocumentItem[] = (dRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(d => d.entityType === 'lead' && d.entityId === id);

    return { lead, followUps, quotations, communications, tasks, documents };
  },

  checkDuplicateLead: async (data: { mobile: string; whatsapp?: string; email?: string; excludeId?: string }): Promise<{ isDuplicate: boolean; matchedLead: Lead | null }> => {
    const { data: res, error } = await supabase.rpc('check_duplicate_lead', {
      p_mobile: data.mobile || '',
      p_email: data.email || '',
      p_exclude: data.excludeId || '',
    });

    if (error) {
      console.warn('Duplicate lead check warning:', error.message);
      return { isDuplicate: false, matchedLead: null };
    }

    if (res?.isDuplicate) {
      return {
        isDuplicate: true,
        matchedLead: {
          id: res.leadId,
          companyName: res.companyName,
          contactPerson: res.contactPerson,
        } as Lead,
      };
    }
    return { isDuplicate: false, matchedLead: null };
  },

  createLead: async (data: Partial<Lead> & { allowDuplicate?: boolean }): Promise<Lead> => {
    const profile = await getCurrentUserProfile();

    if (!data.allowDuplicate) {
      const dup = await api.checkDuplicateLead({ mobile: data.mobile || '', email: data.email });
      if (dup.isDuplicate && dup.matchedLead) {
        throw new Error(`Duplicate lead detected: "${dup.matchedLead.companyName}" exists with identical contact information.`);
      }
    }

    // Sequence assignment
    const { data: seqVal, error: seqErr } = await supabase.rpc('next_seq', { p_kind: 'lead' });
    if (seqErr || !seqVal) {
      throw new Error(`Failed to generate sequential lead number: ${seqErr?.message || 'Sequence generator unavailable'}`);
    }
    const year = new Date().getFullYear();
    const leadId = `LEAD-${year}-${String(seqVal).padStart(4, '0')}`;

    const leadRecord: Lead = {
      id: leadId,
      leadDate: data.leadDate || new Date().toISOString().split('T')[0],
      companyName: (data.companyName || '').trim(),
      contactPerson: (data.contactPerson || '').trim(),
      mobile: (data.mobile || '').trim(),
      whatsapp: (data.whatsapp || data.mobile || '').trim(),
      email: (data.email || '').trim(),
      city: data.city || '',
      state: data.state || '',
      country: data.country || 'India',
      source: data.source || 'Website',
      sourceRef: data.sourceRef,
      productInterested: data.productInterested || 'General Inquiry',
      requirement: data.requirement,
      quantity: Math.max(1, Number(data.quantity) || 1),
      budget: data.budget ? Number(data.budget) : undefined,
      status: data.status || 'New',
      priority: data.priority || 'Medium',
      assignedSalespersonId: data.assignedSalespersonId || profile.userId,
      assignedSalespersonName: data.assignedSalespersonName || profile.name,
      notes: data.notes,
      companyId: profile.companyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('leads').insert({
      id: leadId,
      company_id: profile.companyId,
      data: leadRecord,
    });

    if (error) throw new Error(error.message);

    // Audit log
    await supabase.from('audit_logs').insert({
      company_id: profile.companyId,
      user_id: profile.userId,
      action: 'Lead Created',
      entity: 'Lead',
      entity_id: leadId,
      details: `Created lead ${leadRecord.companyName}`,
    });

    return leadRecord;
  },

  updateLead: async (id: string, data: Partial<Lead>): Promise<Lead> => {
    const { data: existing, error: fetchErr } = await supabase.from('leads').select('*').eq('id', id).single();
    if (fetchErr || !existing) throw new Error('Lead not found.');

    const updatedData: Lead = {
      ...existing.data,
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from('leads')
      .update({ data: updatedData })
      .eq('id', id);

    if (updateErr) throw new Error(updateErr.message);
    return updatedData;
  },

  deleteLead: async (id: string): Promise<{ success: boolean }> => {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  bulkAssignLeads: async (leadIds: string[], salespersonId: string, salespersonName: string): Promise<{ success: boolean; updatedCount: number }> => {
    let count = 0;
    for (const lid of leadIds) {
      try {
        await api.updateLead(lid, { assignedSalespersonId: salespersonId, assignedSalespersonName: salespersonName });
        count++;
      } catch {
        // continue
      }
    }
    return { success: true, updatedCount: count };
  },

  bulkStatusLeads: async (leadIds: string[], status: any): Promise<{ success: boolean; updatedCount: number }> => {
    let count = 0;
    for (const lid of leadIds) {
      try {
        await api.updateLead(lid, { status });
        count++;
      } catch {
        // continue
      }
    }
    return { success: true, updatedCount: count };
  },

  convertLead: async (id: string, data: any): Promise<{ success: boolean; customer: Customer; lead: Lead }> => {
    const { data: res, error } = await supabase.rpc('convert_lead_to_customer', {
      lead_id: id,
      extra: data || {},
    });

    if (error) throw new Error(error.message);
    const lead = await api.getLeadById(id);
    return { success: true, customer: res.customer, lead: lead.lead };
  },

  importLeads: async (rows: any[], _resolution: 'skip' | 'update' = 'skip'): Promise<any> => {
    let totalImported = 0;
    let totalSkipped = 0;
    let allErrors: string[] = [];

    const CHUNK_SIZE = 500;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { data: res, error } = await supabase.rpc('import_leads', {
        rows: chunk,
      });

      if (error) {
        throw new Error(`Bulk import failed: ${error.message}`);
      }

      totalImported += Number(res?.imported || 0);
      totalSkipped += Number(res?.skipped || 0);
      if (Array.isArray(res?.errors)) {
        allErrors = allErrors.concat(res.errors);
      }
    }

    return {
      total: rows.length,
      imported: totalImported,
      updated: 0,
      skipped: totalSkipped,
      errors: allErrors,
    };
  },

  // ==========================================
  // CUSTOMERS & CONTACTS
  // ==========================================
  getCustomers: async (params: Record<string, string> = {}): Promise<Customer[]> => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    let list: Customer[] = (data || []).map((row: any) => ({
      ...row.data,
      id: row.id,
      companyId: row.company_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    if (params.status && params.status !== 'all') {
      list = list.filter(c => c.status?.toLowerCase() === params.status.toLowerCase());
    }
    if (params.type && params.type !== 'all') {
      list = list.filter(c => c.customerType?.toLowerCase() === params.type.toLowerCase());
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        c =>
          c.companyName?.toLowerCase().includes(q) ||
          c.contactPerson?.toLowerCase().includes(q) ||
          c.mobile?.includes(q) ||
          c.city?.toLowerCase().includes(q) ||
          c.gstNumber?.toLowerCase().includes(q)
      );
    }

    return list;
  },

  getCustomerById: async (id: string): Promise<{ customer: Customer; contacts: Contact[]; quotations: Quotation[]; orders: Order[]; payments: Payment[]; followUps: FollowUp[]; communications: Communication[] }> => {
    const { data: custRow, error } = await supabase.from('customers').select('*').eq('id', id).single();
    if (error || !custRow) throw new Error('Customer not found.');

    const customer: Customer = {
      ...custRow.data,
      id: custRow.id,
      companyId: custRow.company_id,
      createdAt: custRow.created_at,
      updatedAt: custRow.updated_at,
    };

    const [cRes, qRes, oRes, pRes, fRes, commRes] = await Promise.all([
      supabase.from('contacts').select('*'),
      supabase.from('quotations').select('*'),
      supabase.from('orders').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('follow_ups').select('*'),
      supabase.from('communications').select('*'),
    ]);

    const contacts: Contact[] = (cRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(c => c.customerId === id);

    const quotations: Quotation[] = (qRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(q => q.customerId === id || q.customerName === customer.companyName);

    const orders: Order[] = (oRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(o => o.customerId === id || o.customerName === customer.companyName);

    const payments: Payment[] = (pRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(p => p.customerId === id);

    const followUps: FollowUp[] = (fRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(f => f.entityType === 'customer' && f.entityId === id);

    const communications: Communication[] = (commRes.data || [])
      .map(r => ({ ...r.data, id: r.id }))
      .filter(c => c.entityType === 'customer' && c.entityId === id);

    return { customer, contacts, quotations, orders, payments, followUps, communications };
  },

  createCustomer: async (data: Partial<Customer>): Promise<Customer> => {
    const profile = await getCurrentUserProfile();
    const { data: seqVal, error: seqErr } = await supabase.rpc('next_seq', { p_kind: 'customer' });
    if (seqErr || !seqVal) {
      throw new Error(`Failed to generate customer number: ${seqErr?.message || 'Sequence generation failed'}`);
    }
    const seq = seqVal;
    const year = new Date().getFullYear();
    const custId = `CUST-${year}-${String(seq).padStart(4, '0')}`;

    const newCust: Customer = {
      id: custId,
      companyName: (data.companyName || '').trim(),
      contactPerson: (data.contactPerson || '').trim(),
      mobile: (data.mobile || '').trim(),
      whatsapp: (data.whatsapp || data.mobile || '').trim(),
      email: data.email || '',
      address: data.address || '',
      city: data.city || '',
      state: data.state || '',
      country: data.country || 'India',
      gstNumber: data.gstNumber,
      pan: data.pan,
      customerType: data.customerType || 'Manufacturer',
      industry: data.industry || 'Manufacturing',
      assignedSalespersonId: data.assignedSalespersonId || profile.userId,
      assignedSalespersonName: data.assignedSalespersonName || profile.name,
      status: 'Active',
      notes: data.notes,
      companyId: profile.companyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('customers').insert({
      id: custId,
      company_id: profile.companyId,
      data: newCust,
    });

    if (error) throw new Error(error.message);

    // Auto-create primary contact
    const contactId = `cont-${Date.now()}`;
    await supabase.from('contacts').insert({
      id: contactId,
      company_id: profile.companyId,
      data: {
        id: contactId,
        customerId: custId,
        customerName: newCust.companyName,
        name: newCust.contactPerson,
        designation: 'Primary Contact',
        mobile: newCust.mobile,
        whatsapp: newCust.whatsapp,
        email: newCust.email,
        department: 'Management',
        isPrimary: true,
        createdAt: new Date().toISOString(),
      },
    });

    return newCust;
  },

  updateCustomer: async (id: string, data: Partial<Customer>): Promise<Customer> => {
    const { data: existing, error: fetchErr } = await supabase.from('customers').select('*').eq('id', id).single();
    if (fetchErr || !existing) throw new Error('Customer not found.');

    const updatedData: Customer = {
      ...existing.data,
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from('customers')
      .update({ data: updatedData })
      .eq('id', id);

    if (updateErr) throw new Error(updateErr.message);
    return updatedData;
  },

  deleteCustomer: async (id: string): Promise<{ success: boolean }> => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  bulkImportCustomers: async (customersToImport: Partial<Customer>[]): Promise<{ count: number; imported: number; updated: number; skipped: number; total: number }> => {
    let imported = 0;
    for (const c of customersToImport) {
      try {
        await api.createCustomer(c);
        imported++;
      } catch {
        // continue
      }
    }
    return { count: imported, imported, updated: 0, skipped: customersToImport.length - imported, total: customersToImport.length };
  },

  // Contacts
  getContacts: async (customerId?: string): Promise<Contact[]> => {
    const { data, error } = await supabase.from('contacts').select('*');
    if (error) throw new Error(error.message);

    let list: Contact[] = (data || []).map(r => ({ ...r.data, id: r.id }));
    if (customerId) {
      list = list.filter(c => c.customerId === customerId);
    }
    return list;
  },

  createContact: async (data: Partial<Contact>): Promise<Contact> => {
    const profile = await getCurrentUserProfile();
    const contactId = `cont-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const contactRecord: Contact = {
      id: contactId,
      customerId: data.customerId || '',
      customerName: data.customerName,
      name: data.name || '',
      designation: data.designation || 'Staff',
      mobile: data.mobile || '',
      whatsapp: data.whatsapp || data.mobile || '',
      email: data.email || '',
      department: data.department || 'General',
      isPrimary: Boolean(data.isPrimary),
      notes: data.notes,
      companyId: profile.companyId,
      createdAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('contacts').insert({
      id: contactId,
      company_id: profile.companyId,
      data: contactRecord,
    });

    if (error) throw new Error(error.message);
    return contactRecord;
  },

  updateContact: async (id: string, data: Partial<Contact>): Promise<Contact> => {
    const { data: existing, error: fetchErr } = await supabase.from('contacts').select('*').eq('id', id).single();
    if (fetchErr || !existing) throw new Error('Contact not found.');

    const updatedData: Contact = { ...existing.data, ...data, id };
    const { error: updateErr } = await supabase.from('contacts').update({ data: updatedData }).eq('id', id);
    if (updateErr) throw new Error(updateErr.message);
    return updatedData;
  },

  deleteContact: async (id: string): Promise<{ success: boolean }> => {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  bulkDeleteContacts: async (ids: string[]): Promise<{ success: boolean; deletedCount: number }> => {
    let count = 0;
    for (const cid of ids) {
      try {
        await api.deleteContact(cid);
        count++;
      } catch {
        // continue
      }
    }
    return { success: true, deletedCount: count };
  },

  bulkImportContacts: async (contactsToImport: Partial<Contact>[]): Promise<{ imported: number; updated: number; skipped: number; total: number }> => {
    let imported = 0;
    for (const ct of contactsToImport) {
      try {
        await api.createContact(ct);
        imported++;
      } catch {
        // continue
      }
    }
    return { imported, updated: 0, skipped: contactsToImport.length - imported, total: contactsToImport.length };
  },

  // ==========================================
  // PRODUCTS & MACHINERY
  // ==========================================
  getProducts: async (params?: Record<string, string>): Promise<Product[]> => {
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    let list: Product[] = (data || []).map(r => ({
      ...r.data,
      id: r.id,
      companyId: r.company_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    if (params?.category && params.category !== 'all') {
      list = list.filter(p => p.category?.toLowerCase() === params.category.toLowerCase());
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter(p => p.status?.toLowerCase() === params.status.toLowerCase());
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        p =>
          p.name?.toLowerCase().includes(q) ||
          p.modelNumber?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    return list;
  },

  createProduct: async (data: Partial<Product>): Promise<Product> => {
    const profile = await getCurrentUserProfile();
    const prodId = data.id || `PROD-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const initialStock = Math.max(0, Number(data.currentStock) || 0);

    const productRecord: Product = {
      id: prodId,
      name: (data.name || '').trim(),
      category: data.category || 'General Machinery',
      modelNumber: (data.modelNumber || '').trim(),
      brand: data.brand || 'StockItEase Partner',
      description: data.description || '',
      specifications: data.specifications || {},
      price: Number(data.price) || 0,
      currency: 'INR',
      gstPercentage: data.gstPercentage !== undefined ? Number(data.gstPercentage) : 18,
      unit: data.unit || 'Unit',
      minStock: data.minStock !== undefined ? Math.max(0, Number(data.minStock)) : 1,
      currentStock: initialStock,
      availableStock: initialStock,
      reservedStock: 0,
      status: data.status || 'Active',
      images: Array.isArray(data.images) && data.images.length ? data.images : ['https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80'],
      notes: data.notes,
      companyId: profile.companyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('products').insert({
      id: prodId,
      company_id: profile.companyId,
      data: productRecord,
    });

    if (error) throw new Error(error.message);

    if (initialStock > 0) {
      await supabase.from('inventory_transactions').insert({
        company_id: profile.companyId,
        data: {
          id: `tx-${Date.now()}`,
          productId: prodId,
          productName: productRecord.name,
          quantity: initialStock,
          transactionType: 'Stock In',
          referenceType: 'Manual',
          referenceId: 'INITIAL_STOCK',
          date: new Date().toISOString().split('T')[0],
          userId: profile.userId,
          userName: profile.name,
          notes: 'Initial inventory creation',
          createdAt: new Date().toISOString(),
        },
      });
    }

    return productRecord;
  },

  updateProduct: async (id: string, data: Partial<Product>): Promise<Product> => {
    const { data: existing, error: fetchErr } = await supabase.from('products').select('*').eq('id', id).single();
    if (fetchErr || !existing) throw new Error('Product not found.');

    const updatedData: Product = {
      ...existing.data,
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase.from('products').update({ data: updatedData }).eq('id', id);
    if (updateErr) throw new Error(updateErr.message);
    return updatedData;
  },

  deleteProduct: async (id: string): Promise<{ success: boolean }> => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  bulkImportInventory: async (items: Partial<Product>[], _options?: { updateExisting?: boolean }): Promise<any> => {
    let imported = 0;
    for (const item of items) {
      try {
        await api.createProduct(item);
        imported++;
      } catch {
        // continue
      }
    }
    return {
      success: true,
      count: imported,
      total: items.length,
      imported,
      createdCount: imported,
      updatedCount: 0,
      updated: 0,
      failed: items.length - imported,
    };
  },

  // ==========================================
  // INVENTORY & TRANSACTIONS
  // ==========================================
  getInventorySummary: async (): Promise<{ summary: any; lowStockItems: Product[]; products: Product[] }> => {
    const products = await api.getProducts();
    const totalStock = products.reduce((acc, p) => acc + (p.currentStock || 0), 0);
    const availableStock = products.reduce((acc, p) => acc + (p.availableStock || 0), 0);
    const reservedStock = products.reduce((acc, p) => acc + (p.reservedStock || 0), 0);
    const lowStockItems = products.filter(p => (p.availableStock || 0) <= (p.minStock || 1));

    return {
      summary: {
        totalMachines: products.length,
        totalStock,
        availableStock,
        reservedStock,
        lowStockCount: lowStockItems.length,
      },
      lowStockItems,
      products,
    };
  },

  getInventoryTransactions: async (): Promise<InventoryTransaction[]> => {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []).map(r => ({ ...r.data, id: r.id, companyId: r.company_id, createdAt: r.created_at }));
  },

  createInventoryTransaction: async (data: any): Promise<{ success: boolean; transaction: InventoryTransaction; product: Product }> => {
    const { data: res, error } = await supabase.rpc('inventory_transaction', {
      payload: data,
    });

    if (error) throw new Error(error.message);

    const updatedProduct = (await supabase.from('products').select('*').eq('id', data.productId).single()).data;

    return {
      success: true,
      transaction: res,
      product: { ...updatedProduct.data, id: updatedProduct.id },
    };
  },

  deleteInventoryTransaction: async (_id: string): Promise<{ success: boolean }> => {
    throw new Error('Action Denied: Inventory transaction ledger entries are immutable for audit compliance.');
  },

  // ==========================================
  // QUOTATIONS
  // ==========================================
  getQuotations: async (params?: Record<string, string>): Promise<Quotation[]> => {
    let list: Quotation[] = [];
    try {
      const { data, error } = await supabase.from('quotations').select('*').order('created_at', { ascending: false });
      if (error || !data || data.length === 0) {
        list = getStoredQuotations();
      } else {
        list = (data || []).map(r => ({
          ...r.data,
          date: r.data?.date || r.data?.quotationDate || '',
          validUntil: r.data?.validUntil || '',
          discountTotal: Number(r.data?.discountTotal ?? r.data?.discountAmount ?? 0),
          gstTotal: Number(r.data?.gstTotal ?? r.data?.gstAmount ?? 0),
          items: (r.data?.items || []).map((it: any) => ({
            ...it,
            discountPercentage: Number(it.discountPercentage ?? it.discountPercent ?? 0),
          })),
          id: r.id,
          companyId: r.company_id,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      }
    } catch {
      list = getStoredQuotations();
    }

    if (params?.status && params.status !== 'all') {
      list = list.filter(q => q.status?.toLowerCase() === params.status.toLowerCase());
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        item =>
          item.quotationNumber?.toLowerCase().includes(q) ||
          item.customerName?.toLowerCase().includes(q) ||
          item.contactPerson?.toLowerCase().includes(q) ||
          item.mobile?.includes(q)
      );
    }

    return list;
  },

  createQuotation: async (data: any): Promise<Quotation> => {
    try {
      const { data: res, error } = await supabase.rpc('create_quotation', {
        payload: data,
      });

      if (error || !res) throw new Error(error?.message || 'RPC unavailable');
      const q: Quotation = {
        ...res,
        date: res?.date || res?.quotationDate || '',
        validUntil: res?.validUntil || '',
        discountTotal: Number(res?.discountTotal ?? res?.discountAmount ?? 0),
        gstTotal: Number(res?.gstTotal ?? res?.gstAmount ?? 0),
        items: (res?.items || []).map((it: any) => ({
          ...it,
          discountPercentage: Number(it.discountPercentage ?? it.discountPercent ?? 0),
        })),
      };
      return q;
    } catch {
      const currentList = getStoredQuotations();
      const qtnId = `qtn-${Date.now()}`;
      const newQuote: Quotation = {
        ...data,
        id: qtnId,
        quotationNumber: data.quotationNumber || `QTN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        date: data.date || new Date().toISOString().split('T')[0],
        validUntil: data.validUntil || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
        status: data.status || 'Draft',
        pipelineStage: data.pipelineStage || 'quote_sent',
        version: 1,
        items: data.items || [],
        subtotal: data.subtotal || 0,
        discountTotal: data.discountTotal || 0,
        taxableAmount: data.taxableAmount || 0,
        gstTotal: data.gstTotal || 0,
        grandTotal: data.grandTotal || 0,
        paymentTerms: data.paymentTerms || '30% Advance with confirmation, 70% prior to dispatch.',
        deliveryTerms: data.deliveryTerms || 'Ex-Works within scheduled timeframe.',
        warrantyTerms: data.warrantyTerms || '12 Months comprehensive manufacturer warranty.',
        termsAndConditions: data.termsAndConditions || '1. Standard commercial terms apply.',
        activities: [
          {
            id: `act-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: 'created',
            title: 'Quotation Generated',
            description: `Commercial proposal created for ₹${(data.grandTotal || 0).toLocaleString('en-IN')}`,
            actorName: data.salespersonName || 'Sales Representative',
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      currentList.unshift(newQuote);
      saveStoredQuotations(currentList);
      return newQuote;
    }
  },

  updateQuotation: async (id: string, data: Partial<Quotation>): Promise<Quotation> => {
    let updatedData: Quotation;
    try {
      const { data: existing, error: fetchErr } = await supabase.from('quotations').select('*').eq('id', id).single();
      if (!fetchErr && existing) {
        updatedData = {
          ...existing.data,
          ...data,
          id,
          updatedAt: new Date().toISOString(),
        };
        await supabase.from('quotations').update({ data: updatedData }).eq('id', id);
        return updatedData;
      }
      throw new Error('Supabase row missing, falling back to local store');
    } catch {
      const currentList = getStoredQuotations();
      const existing = currentList.find(q => q.id === id);
      updatedData = {
        ...(existing || ({} as any)),
        ...data,
        id,
        updatedAt: new Date().toISOString(),
      };
      const updatedList = currentList.map(q => (q.id === id ? updatedData : q));
      if (!existing) {
        updatedList.unshift(updatedData);
      }
      saveStoredQuotations(updatedList);
      return updatedData;
    }
  },

  deleteQuotation: async (id: string): Promise<{ success: boolean }> => {
    try {
      await supabase.from('quotations').delete().eq('id', id);
    } catch {
      // ignore
    }
    const currentList = getStoredQuotations();
    saveStoredQuotations(currentList.filter(q => q.id !== id));
    return { success: true };
  },

  convertQuotationToOrder: async (
    id: string,
    extraOrAdvance?: number | { advancePayment?: number; paymentMethod?: string; referenceNumber?: string }
  ): Promise<{ success: boolean; order: Order; quotation: Quotation }> => {
    const extraPayload = typeof extraOrAdvance === 'number'
      ? { advancePayment: extraOrAdvance }
      : extraOrAdvance || {};

    // 1. Try Supabase RPC first if available
    let rpcOrder: any = null;
    let rpcQtnRow: any = null;
    try {
      const { data: res, error } = await supabase.rpc('convert_quotation_to_order', {
        quotation_id: id,
        extra: extraPayload,
      });
      if (!error && res) {
        rpcOrder = res?.order || res;
        try {
          const { data: qData } = await supabase.from('quotations').select('*').eq('id', id).single();
          rpcQtnRow = qData;
        } catch {}
      }
    } catch {
      // Proceed to resilient fallback
    }

    if (rpcOrder) {
      const normalizedOrder: Order = {
        ...rpcOrder,
        totalAmount: Number(rpcOrder?.totalAmount ?? rpcOrder?.grandTotal ?? 0),
        advancePayment: Number(rpcOrder?.advancePayment ?? rpcOrder?.advanceAmount ?? 0),
        balancePayment: Number(rpcOrder?.balancePayment ?? ((rpcOrder?.totalAmount ?? rpcOrder?.grandTotal ?? 0) - (rpcOrder?.advancePayment ?? rpcOrder?.advanceAmount ?? 0))),
        orderStatus: rpcOrder?.orderStatus || (rpcOrder?.status as any) || 'Confirmed',
        deliveryStatus: rpcOrder?.deliveryStatus || 'Pending',
        paymentStatus: rpcOrder?.paymentStatus || 'Pending',
        stockWarning: Boolean(rpcOrder?.stockWarning),
      };
      // Keep local order store in sync
      const stored = getStoredOrders();
      saveStoredOrders([normalizedOrder, ...stored.filter(o => o.id !== normalizedOrder.id)]);
      return {
        success: true,
        order: normalizedOrder,
        quotation: rpcQtnRow ? { ...rpcQtnRow.data, id: rpcQtnRow.id } : ({} as any),
      };
    }

    // 2. Resilient Fallback: Retrieve quotation from Supabase or local store
    let targetQuote: Quotation | undefined;
    try {
      const { data: qData, error: qErr } = await supabase.from('quotations').select('*').eq('id', id).single();
      if (!qErr && qData) {
        targetQuote = { ...qData.data, id: qData.id };
      }
    } catch {}

    if (!targetQuote) {
      const currentQuotes = getStoredQuotations();
      targetQuote = currentQuotes.find(q => q.id === id);
    }

    if (!targetQuote) {
      throw new Error(`Quotation #${id} not found.`);
    }

    // If quotation was already converted, check if the converted order exists in store
    if (targetQuote.convertedOrderId) {
      const existingOrders = getStoredOrders();
      const matchedOrder = existingOrders.find(o => o.id === targetQuote!.convertedOrderId || o.quotationId === id);
      if (matchedOrder) {
        return {
          success: true,
          order: matchedOrder,
          quotation: targetQuote,
        };
      }
    }

    // Construct confirmed production Sales Order
    const advance = Number(extraPayload.advancePayment ?? Math.round((targetQuote.grandTotal || 0) * 0.3));
    const total = Number(targetQuote.grandTotal || 0);
    const balance = Math.max(0, total - advance);
    const pStatus: PaymentStatus = advance >= total && total > 0 ? 'Paid' : advance > 0 ? 'Partially Paid' : 'Pending';

    const ordSeq = Math.floor(100 + Math.random() * 900);
    const ordNum = `SO-${new Date().getFullYear()}-${ordSeq}`;
    const ordId = `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const newOrder: Order = {
      id: ordId,
      orderNumber: ordNum,
      customerId: targetQuote.customerId || `cust-${Date.now().toString().slice(-4)}`,
      customerName: targetQuote.customerName,
      contactPerson: targetQuote.contactPerson,
      mobile: targetQuote.mobile,
      quotationId: targetQuote.id,
      quotationNumber: targetQuote.quotationNumber,
      orderDate: new Date().toISOString().split('T')[0],
      salespersonId: targetQuote.salespersonId,
      salespersonName: targetQuote.salespersonName,
      items: targetQuote.items || [],
      subtotal: targetQuote.taxableAmount || targetQuote.subtotal || 0,
      gstTotal: targetQuote.gstTotal || 0,
      totalAmount: total,
      advancePayment: advance,
      balancePayment: balance,
      deliveryStatus: 'Pending',
      paymentStatus: pStatus,
      orderStatus: 'Confirmed',
      notes: `Confirmed sales order converted from quotation ${targetQuote.quotationNumber}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save order into Supabase if possible
    try {
      const profile = await getCurrentUserProfile();
      await supabase.from('orders').insert({
        id: ordId,
        company_id: profile.companyId,
        data: newOrder,
      });
    } catch {
      // non-blocking for local/preview mode
    }

    // Persist in local orders store
    const storedOrders = getStoredOrders();
    saveStoredOrders([newOrder, ...storedOrders.filter(o => o.id !== ordId)]);

    // Update Quotation state & activities
    const now = new Date().toISOString();
    const updatedActivities = [
      ...(targetQuote.activities || []),
      {
        id: `act-${Date.now()}-converted`,
        timestamp: now,
        type: 'closed_won' as const,
        title: 'Quotation Converted to Sales Order',
        description: `Production order #${ordNum} generated. Total: ₹${total.toLocaleString('en-IN')}, Advance: ₹${advance.toLocaleString('en-IN')}`,
        actorName: targetQuote.salespersonName || 'Sales Representative',
        metadata: {
          orderId: ordId,
          orderNumber: ordNum,
          advancePayment: advance,
        },
      },
    ];

    const updatedQuote = await api.updateQuotation(id, {
      status: 'Accepted',
      pipelineStage: 'closed_won',
      convertedOrderId: ordId,
      closedAt: now,
      activities: updatedActivities,
    });

    return {
      success: true,
      order: newOrder,
      quotation: updatedQuote,
    };
  },

  // ==========================================
  // ORDERS
  // ==========================================
  getOrders: async (params?: Record<string, string>): Promise<Order[]> => {
    let list: Order[] = [];
    try {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        list = data.map(r => ({
          ...r.data,
          totalAmount: Number(r.data?.totalAmount ?? r.data?.grandTotal ?? 0),
          advancePayment: Number(r.data?.advancePayment ?? 0),
          balancePayment: Number(r.data?.balancePayment ?? (r.data?.totalAmount || r.data?.grandTotal || 0) - (r.data?.advancePayment || 0)),
          orderStatus: r.data?.orderStatus || 'Confirmed',
          deliveryStatus: r.data?.deliveryStatus || 'Pending',
          paymentStatus: r.data?.paymentStatus || 'Pending',
          stockWarning: Boolean(r.data?.stockWarning),
          id: r.id,
          companyId: r.company_id,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      }
    } catch {
      // fallback
    }

    // Always merge with stored local orders
    const stored = getStoredOrders();
    const existingIds = new Set(list.map(o => o.id));
    for (const item of stored) {
      if (!existingIds.has(item.id)) {
        list.push(item);
        existingIds.add(item.id);
      }
    }

    if (params?.status && params.status !== 'all') {
      list = list.filter(o => o.orderStatus?.toLowerCase() === params.status.toLowerCase());
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        o =>
          o.orderNumber?.toLowerCase().includes(q) ||
          o.customerName?.toLowerCase().includes(q) ||
          o.contactPerson?.toLowerCase().includes(q)
      );
    }

    return list;
  },

  createOrder: async (data: any): Promise<Order> => {
    try {
      const { data: res, error } = await supabase.rpc('create_order', { payload: data });
      if (!error && res) {
        const currentOrders = getStoredOrders();
        saveStoredOrders([res, ...currentOrders.filter(o => o.id !== res.id)]);
        return res;
      }
    } catch {
      // fallback
    }

    const ordId = data.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const ordNum = data.orderNumber || `SO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const total = Number(data.totalAmount ?? data.grandTotal ?? 0);
    const advance = Number(data.advancePayment ?? 0);
    const balance = Math.max(0, total - advance);
    const pStatus: PaymentStatus = advance >= total && total > 0 ? 'Paid' : advance > 0 ? 'Partially Paid' : 'Pending';

    const orderRecord: Order = {
      ...data,
      id: ordId,
      orderNumber: ordNum,
      totalAmount: total,
      advancePayment: advance,
      balancePayment: balance,
      paymentStatus: data.paymentStatus || pStatus,
      orderStatus: data.orderStatus || 'Confirmed',
      deliveryStatus: data.deliveryStatus || 'Pending',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const profile = await getCurrentUserProfile();
      await supabase.from('orders').insert({
        id: ordId,
        company_id: profile.companyId,
        data: orderRecord,
      });
    } catch {
      // non-blocking
    }

    const currentOrders = getStoredOrders();
    saveStoredOrders([orderRecord, ...currentOrders.filter(o => o.id !== ordId)]);
    return orderRecord;
  },

  updateOrder: async (id: string, data: Partial<Order>): Promise<Order> => {
    const { data: res, error } = await supabase.rpc('update_order', {
      order_id: id,
      updates: data,
    });
    if (error) throw new Error(error.message);
    return res;
  },

  deleteOrder: async (id: string): Promise<{ success: boolean }> => {
    throw new Error('Orders cannot be directly deleted. Update order status to Cancelled if needed.');
  },

  // ==========================================
  // PAYMENTS
  // ==========================================
  getPayments: async (params?: Record<string, string>): Promise<Payment[]> => {
    const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    let list: Payment[] = (data || []).map(r => ({
      ...r.data,
      id: r.id,
      companyId: r.company_id,
      createdAt: r.created_at,
    }));

    if (params?.customerId) {
      list = list.filter(p => p.customerId === params.customerId);
    }
    return list;
  },

  createPayment: async (data: any): Promise<Payment> => {
    const { data: res, error } = await supabase.rpc('record_payment', { payload: data });
    if (error) throw new Error(error.message);
    return res;
  },

  deletePayment: async (id: string, reason = ''): Promise<{ success: boolean }> => {
    const { error } = await supabase.rpc('delete_payment', {
      payment_id: id,
      reason,
    });
    if (error) throw new Error(error.message);
    return { success: true };
  },

  // ==========================================
  // FOLLOW-UPS
  // ==========================================
  getFollowUps: async (params: Record<string, string> = {}): Promise<FollowUp[]> => {
    const { data, error } = await supabase.from('follow_ups').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    let list: FollowUp[] = (data || []).map(r => ({
      ...r.data,
      id: r.id,
      companyId: r.company_id,
      createdAt: r.created_at,
    }));

    if (params.status && params.status !== 'all') {
      list = list.filter(f => f.status?.toLowerCase() === params.status.toLowerCase());
    }
    if (params.entityType && params.entityType !== 'all') {
      list = list.filter(f => f.entityType === params.entityType);
    }
    if (params.entityId) {
      list = list.filter(f => f.entityId === params.entityId);
    }

    return list;
  },

  createFollowUp: async (data: Partial<FollowUp>): Promise<FollowUp> => {
    const profile = await getCurrentUserProfile();
    const followUpId = `flw-${Date.now()}`;
    const followUpRecord: FollowUp = {
      id: followUpId,
      entityType: data.entityType || 'lead',
      entityId: data.entityId || '',
      entityName: data.entityName || '',
      contactPerson: data.contactPerson,
      mobile: data.mobile,
      date: data.date || new Date().toISOString().split('T')[0],
      time: data.time || '10:00',
      assignedUserId: data.assignedUserId || profile.userId,
      assignedUserName: data.assignedUserName || profile.name,
      followUpType: data.followUpType || 'Phone Call',
      notes: data.notes || '',
      status: data.status || 'Pending',
      companyId: profile.companyId,
      createdAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('follow_ups').insert({
      id: followUpId,
      company_id: profile.companyId,
      data: followUpRecord,
    });

    if (error) throw new Error(error.message);
    return followUpRecord;
  },

  updateFollowUpStatus: async (
    id: string,
    data: { status: string; outcome?: string; newDate?: string; newTime?: string }
  ): Promise<FollowUp> => {
    const { data: existing, error: fetchErr } = await supabase.from('follow_ups').select('*').eq('id', id).single();
    if (fetchErr || !existing) throw new Error('Follow-up not found.');

    const updatedData: FollowUp = {
      ...existing.data,
      status: data.status as any,
      outcome: data.outcome ?? existing.data.outcome,
      date: data.newDate ?? existing.data.date,
      time: data.newTime ?? existing.data.time,
      completedAt: data.status === 'Completed' ? new Date().toISOString() : existing.data.completedAt,
    };

    const { error: updateErr } = await supabase.from('follow_ups').update({ data: updatedData }).eq('id', id);
    if (updateErr) throw new Error(updateErr.message);
    return updatedData;
  },

  deleteFollowUp: async (id: string): Promise<{ success: boolean }> => {
    const { error } = await supabase.from('follow_ups').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  // ==========================================
  // TASKS
  // ==========================================
  getTasks: async (params?: Record<string, string>): Promise<Task[]> => {
    const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    let list: Task[] = (data || []).map(r => ({
      ...r.data,
      id: r.id,
      companyId: r.company_id,
      createdAt: r.created_at,
    }));

    if (params?.status && params.status !== 'all') {
      list = list.filter(t => t.status?.toLowerCase() === params.status.toLowerCase());
    }
    return list;
  },

  createTask: async (data: Partial<Task>): Promise<Task> => {
    const profile = await getCurrentUserProfile();
    const taskId = `tsk-${Date.now()}`;
    const taskRecord: Task = {
      id: taskId,
      title: data.title || 'Follow up with client',
      description: data.description || '',
      assignedUserId: data.assignedUserId || profile.userId,
      assignedUserName: data.assignedUserName || profile.name,
      priority: data.priority || 'Medium',
      dueDate: data.dueDate || new Date().toISOString().split('T')[0],
      relatedLeadId: data.relatedLeadId,
      relatedLeadName: data.relatedLeadName,
      relatedCustomerId: data.relatedCustomerId,
      relatedCustomerName: data.relatedCustomerName,
      status: data.status || 'To Do',
      companyId: profile.companyId,
      createdAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('tasks').insert({
      id: taskId,
      company_id: profile.companyId,
      data: taskRecord,
    });

    if (error) throw new Error(error.message);
    return taskRecord;
  },

  updateTask: async (id: string, data: Partial<Task>): Promise<Task> => {
    const { data: existing, error: fetchErr } = await supabase.from('tasks').select('*').eq('id', id).single();
    if (fetchErr || !existing) throw new Error('Task not found.');

    const updatedData: Task = { ...existing.data, ...data, id };
    const { error: updateErr } = await supabase.from('tasks').update({ data: updatedData }).eq('id', id);
    if (updateErr) throw new Error(updateErr.message);
    return updatedData;
  },

  deleteTask: async (id: string): Promise<{ success: boolean }> => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  // ==========================================
  // COMMUNICATIONS
  // ==========================================
  getCommunications: async (entityType?: string, entityId?: string): Promise<Communication[]> => {
    const { data, error } = await supabase.from('communications').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    let list: Communication[] = (data || []).map(r => ({ ...r.data, id: r.id, companyId: r.company_id, createdAt: r.created_at }));
    if (entityType) {
      list = list.filter(c => c.entityType === entityType);
    }
    if (entityId) {
      list = list.filter(c => c.entityId === entityId);
    }
    return list;
  },

  createCommunication: async (data: Partial<Communication>): Promise<Communication> => {
    const profile = await getCurrentUserProfile();
    const commId = `comm-${Date.now()}`;
    const commRecord: Communication = {
      id: commId,
      entityType: data.entityType || 'lead',
      entityId: data.entityId || '',
      entityName: data.entityName || '',
      userId: profile.userId,
      userName: profile.name,
      timestamp: new Date().toISOString(),
      type: data.type || 'Notes',
      direction: data.direction || 'Outbound',
      message: data.message || '',
      outcome: data.outcome,
      companyId: profile.companyId,
      createdAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('communications').insert({
      id: commId,
      company_id: profile.companyId,
      data: commRecord,
    });

    if (error) throw new Error(error.message);
    return commRecord;
  },

  // ==========================================
  // DOCUMENTS & SUPABASE STORAGE
  // ==========================================
  getDocuments: async (): Promise<DocumentItem[]> => {
    const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return (data || []).map(r => ({
      ...r.data,
      id: r.id,
      companyId: r.company_id,
      uploadedAt: r.created_at,
    }));
  },

  getDocumentSignedUrl: async (docOrPath: DocumentItem | string): Promise<string> => {
    const storagePath = typeof docOrPath === 'string' ? docOrPath : docOrPath.storagePath;
    if (!storagePath) {
      if (typeof docOrPath !== 'string' && docOrPath.fileUrl) return docOrPath.fileUrl;
      throw new Error('No storage path found for document.');
    }
    const { data: signed, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 3600);
    if (error || !signed?.signedUrl) {
      throw new Error(`Failed to generate signed download URL: ${error?.message || 'Storage error'}`);
    }
    return signed.signedUrl;
  },

  deleteDocument: async (id: string): Promise<{ success: boolean }> => {
    const profile = await getCurrentUserProfile();
    if (!['super_admin', 'owner', 'admin'].includes(profile.role)) {
      throw new Error('Permission denied: Only administrators can delete documents.');
    }

    const { data: doc, error: fetchErr } = await supabase.from('documents').select('*').eq('id', id).single();
    if (fetchErr || !doc) throw new Error('Document not found.');

    const storagePath = doc.data?.storagePath;
    if (storagePath) {
      await supabase.storage.from('documents').remove([storagePath]);
    }

    const { error: delErr } = await supabase.from('documents').delete().eq('id', id);
    if (delErr) throw new Error(delErr.message);

    return { success: true };
  },

  uploadDocument: async (formData: FormData): Promise<DocumentItem> => {
    const profile = await getCurrentUserProfile();
    const file = formData.get('file') as File | null;
    const entityType = (formData.get('entityType') as any) || 'general';
    const entityId = (formData.get('entityId') as string) || '';
    const entityName = (formData.get('entityName') as string) || '';

    if (!file) throw new Error('No file provided for upload.');

    // 10 MB limit check
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File exceeds maximum allowed size of 10 MB.');
    }

    // Allowed extensions check (NO SVG)
    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedExtensions.includes(ext) || ext === 'svg') {
      throw new Error(`Disallowed file extension .${ext}. Permitted formats: PDF, PNG, JPG, WEBP, DOC, DOCX, XLS, XLSX, CSV, TXT.`);
    }

    // Storage path: <company_id>/<timestamp>-<safe_name>
    const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${profile.companyId}/${Date.now()}-${safeBase}`;

    // Upload to Supabase Storage private documents bucket
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const docId = `doc-${crypto.randomUUID()}`;
    const docRecord: DocumentItem & { storagePath: string } = {
      id: docId,
      entityType,
      entityId,
      entityName,
      fileName: file.name,
      fileType: file.type || ext,
      fileSize: file.size,
      fileUrl: '',
      storagePath,
      uploadedBy: profile.name,
      companyId: profile.companyId,
      uploadedAt: new Date().toISOString(),
    };

    const { error: dbError } = await supabase.from('documents').insert({
      id: docId,
      company_id: profile.companyId,
      data: docRecord,
    });

    if (dbError) {
      // Clean up uploaded storage object if DB insert fails
      await supabase.storage.from('documents').remove([storagePath]);
      throw new Error(`Database record failed: ${dbError.message}`);
    }

    return docRecord;
  },

  // ==========================================
  // TAX INVOICES
  // ==========================================
  getTaxInvoices: async (params?: any): Promise<TaxInvoice[]> => {
    let list: TaxInvoice[] = [];
    try {
      const { data, error } = await supabase.from('tax_invoices').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        list = data.map(r => ({
          ...r.data,
          id: r.id,
          companyId: r.company_id,
          createdAt: r.created_at,
        }));
      }
    } catch {
      // fallback
    }

    const stored = getStoredInvoices();
    const existingIds = new Set(list.map(i => i.id));
    for (const inv of stored) {
      if (!existingIds.has(inv.id)) {
        list.push(inv);
        existingIds.add(inv.id);
      }
    }

    if (params?.customerId) {
      list = list.filter(i => i.customerId === params.customerId);
    }
    return list;
  },

  getTaxInvoiceById: async (id: string): Promise<TaxInvoice | null> => {
    try {
      const { data, error } = await supabase.from('tax_invoices').select('*').eq('id', id).single();
      if (!error && data) return { ...data.data, id: data.id, companyId: data.company_id };
    } catch {
      // fallback
    }
    const stored = getStoredInvoices();
    return stored.find(i => i.id === id) || null;
  },

  createTaxInvoice: async (data: Partial<TaxInvoice>): Promise<TaxInvoice> => {
    try {
      const { data: res, error } = await supabase.rpc('create_tax_invoice', {
        payload: data,
      });
      if (!error && res) {
        const stored = getStoredInvoices();
        saveStoredInvoices([res, ...stored.filter(i => i.id !== res.id)]);
        return res;
      }
    } catch {
      // fallback
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const fyStart = month >= 4 ? year : year - 1;
    const fy = `${fyStart}-${String(fyStart + 1).slice(2)}`;
    const invId = data.id || `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const invNum = data.invoiceNumber || `INV/${fy}/${Math.floor(1000 + Math.random() * 9000)}`;

    const invoiceRecord: TaxInvoice = {
      ...(data as any),
      id: invId,
      invoiceNumber: invNum,
      financialYear: fy,
      status: (data.status as any) || 'Active',
      invoiceDate: data.invoiceDate || now.toISOString().split('T')[0],
      createdAt: data.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
    };

    try {
      const profile = await getCurrentUserProfile();
      await supabase.from('tax_invoices').insert({
        id: invId,
        company_id: profile.companyId,
        data: invoiceRecord,
      });
    } catch {
      // non-blocking
    }

    const stored = getStoredInvoices();
    saveStoredInvoices([invoiceRecord, ...stored.filter(i => i.id !== invId)]);
    return invoiceRecord;
  },

  updateTaxInvoice: async (id: string, data: Partial<TaxInvoice>): Promise<TaxInvoice> => {
    const { data: existing, error: fetchErr } = await supabase.from('tax_invoices').select('*').eq('id', id).single();
    if (fetchErr || !existing) throw new Error('Invoice not found.');

    const updatedData: TaxInvoice = { ...existing.data, ...data, id };
    const { error: updateErr } = await supabase.from('tax_invoices').update({ data: updatedData }).eq('id', id);
    if (updateErr) throw new Error(updateErr.message);
    return updatedData;
  },

  cancelTaxInvoice: async (id: string, reason: string): Promise<TaxInvoice> => {
    const { data: res, error } = await supabase.rpc('cancel_tax_invoice', {
      invoice_id: id,
      reason,
    });
    if (error) throw new Error(error.message);
    return res;
  },

  // ==========================================
  // PURCHASE ORDERS
  // ==========================================
  getPurchaseOrders: async (_filters?: { search?: string; status?: string; paymentStatus?: string; companyId?: string }): Promise<PurchaseOrder[]> => {
    const { data, error } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return (data || []).map(r => ({
      ...r.data,
      id: r.id,
      companyId: r.company_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  getPurchaseOrderById: async (id: string): Promise<PurchaseOrder | null> => {
    const { data, error } = await supabase.from('purchase_orders').select('*').eq('id', id).single();
    if (error || !data) return null;
    return { ...data.data, id: data.id, companyId: data.company_id };
  },

  createPurchaseOrder: async (data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
    const profile = await getCurrentUserProfile();
    const { data: seqVal, error: seqErr } = await supabase.rpc('next_seq', { p_kind: 'purchase' });
    if (seqErr || !seqVal) {
      throw new Error(`Failed to generate purchase order sequence: ${seqErr?.message || 'Sequence allocation failed'}`);
    }
    const seq = seqVal;
    const year = new Date().getFullYear();
    const poId = `PO-${year}-${String(seq).padStart(4, '0')}`;

    const poRecord: PurchaseOrder = {
      ...data,
      id: poId,
      poNumber: data.poNumber || poId,
      createdBy: profile.userId,
      createdByName: profile.name,
      companyId: profile.companyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as PurchaseOrder;

    const { error } = await supabase.from('purchase_orders').insert({
      id: poId,
      company_id: profile.companyId,
      data: poRecord,
    });

    if (error) throw new Error(error.message);
    return poRecord;
  },

  updatePurchaseOrder: async (id: string, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
    const { data: existing, error: fetchErr } = await supabase.from('purchase_orders').select('*').eq('id', id).single();
    if (fetchErr || !existing) throw new Error('Purchase order not found.');

    const updatedData: PurchaseOrder = { ...existing.data, ...data, id, updatedAt: new Date().toISOString() };
    const { error: updateErr } = await supabase.from('purchase_orders').update({ data: updatedData }).eq('id', id);
    if (updateErr) throw new Error(updateErr.message);
    return updatedData;
  },

  deletePurchaseOrder: async (id: string): Promise<{ success: boolean }> => {
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  receivePurchaseOrder: async (id: string, optionsOrItems?: any, notes?: string): Promise<{ success: boolean; purchaseOrder: PurchaseOrder }> => {
    const updateInventory = typeof optionsOrItems === 'object' && optionsOrItems.updateInventoryStock !== undefined
      ? Boolean(optionsOrItems.updateInventoryStock)
      : true;
    const inwardNotes = typeof optionsOrItems === 'object' && optionsOrItems.inwardNotes
      ? optionsOrItems.inwardNotes
      : notes || '';

    const { data: res, error } = await supabase.rpc('receive_purchase_order', {
      po_id: id,
      update_inventory: updateInventory,
      notes: inwardNotes,
    });
    if (error) throw new Error(error.message);
    return { success: true, purchaseOrder: res };
  },

  recordPurchasePayment: async (id: string, amountOrData: any, paymentMode?: string): Promise<{ success: boolean; purchaseOrder: PurchaseOrder }> => {
    const amount = typeof amountOrData === 'number' ? amountOrData : amountOrData.amount;
    const mode = typeof amountOrData === 'object' && amountOrData.paymentMode ? amountOrData.paymentMode : paymentMode;

    const { data: res, error } = await supabase.rpc('record_purchase_payment', {
      payload: {
        purchaseOrderId: id,
        amount,
        paymentMode: mode,
        ...(typeof amountOrData === 'object' ? amountOrData : {}),
      },
    });
    if (error) throw new Error(error.message);
    return { success: true, purchaseOrder: res };
  },

  bulkImportPurchaseOrders: async (items: Partial<PurchaseOrder>[]): Promise<{ count: number; imported: number; total: number }> => {
    let imported = 0;
    for (const po of items) {
      try {
        await api.createPurchaseOrder(po);
        imported++;
      } catch {
        // continue
      }
    }
    return { count: imported, imported, total: items.length };
  },

  // ==========================================
  // DASHBOARD & METRICS
  // ==========================================
  getDashboardMetrics: async (_comp?: string): Promise<any> => {
    const { data: res, error } = await supabase.rpc('get_dashboard_metrics');
    if (error) {
      console.warn('get_dashboard_metrics RPC error:', error.message);
      return {
        metrics: {
          totalLeads: 0,
          newLeads: 0,
          qualifiedLeads: 0,
          openQuotations: 0,
          ordersCount: 0,
          totalSales: 0,
          outstandingPayments: 0,
          customersCount: 0,
          productsCount: 0,
        },
        totalLeads: 0,
        totalCustomers: 0,
        totalProducts: 0,
        totalOrders: 0,
        totalQuotations: 0,
        totalRevenue: 0,
      };
    }

    const leadsCount = Number(res?.leadsCount || 0);
    const customersCount = Number(res?.customersCount || 0);
    const productsCount = Number(res?.productsCount || 0);
    const ordersCount = Number(res?.ordersCount || 0);
    const quotationsCount = Number(res?.quotationsCount || 0);
    const totalRevenue = Number(res?.totalRevenue || 0);
    const receivedPayments = Number(res?.receivedPayments || 0);
    const pendingPayments = Number(res?.pendingPayments || 0);

    return {
      metrics: {
        totalLeads: leadsCount,
        newLeads: 0,
        qualifiedLeads: 0,
        openQuotations: quotationsCount,
        ordersCount,
        totalSales: totalRevenue,
        outstandingPayments: pendingPayments,
        receivedPayments,
        customersCount,
        productsCount,
      },
      totalLeads: leadsCount,
      totalCustomers: customersCount,
      totalProducts: productsCount,
      totalOrders: ordersCount,
      totalQuotations: quotationsCount,
      totalRevenue,
      receivedPayments,
      pendingPayments,
    };
  },

  getEmployeeActivity: async (_targetEmp?: string, _targetComp?: string): Promise<any[]> => {
    return [];
  },

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  getNotifications: async (): Promise<Notification[]> => {
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) return [];
    return (data || []).map(r => ({ ...r.data, id: r.id, isRead: r.data?.isRead || false, createdAt: r.created_at }));
  },

  markNotificationRead: async (id: string): Promise<{ success: boolean }> => {
    const { data: existing } = await supabase.from('notifications').select('*').eq('id', id).single();
    if (existing) {
      await supabase.from('notifications').update({ data: { ...existing.data, isRead: true } }).eq('id', id);
    }
    return { success: true };
  },

  markAllNotificationsRead: async (): Promise<{ success: boolean }> => {
    const { data: list } = await supabase.from('notifications').select('*');
    for (const item of list || []) {
      await supabase.from('notifications').update({ data: { ...item.data, isRead: true } }).eq('id', item.id);
    }
    return { success: true };
  },

  // ==========================================
  // AUDIT LOGS
  // ==========================================
  getAuditLogs: async (): Promise<AuditLog[]> => {
    const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return [];
    return (data || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_id ? 'Authenticated User' : 'System',
      action: r.action,
      entity: r.entity || 'General',
      entityId: r.entity_id || '',
      details: r.details || '',
      timestamp: r.created_at,
    }));
  },

  logAudit: async (action: string, entity: string, entityId: string, details: string, _user?: any): Promise<{ success: boolean }> => {
    try {
      const profile = await getCurrentUserProfile();
      await supabase.from('audit_logs').insert({
        company_id: profile.companyId,
        user_id: profile.userId,
        action,
        entity,
        entity_id: entityId,
        details,
      });
    } catch {
      // ignore
    }
    return { success: true };
  },

  // ==========================================
  // COMPANY SETTINGS & INTEGRATIONS
  // ==========================================
  getSettings: async (): Promise<{ company: CompanySettings; integrations: IntegrationSettings }> => {
    const { data: profile } = await supabase.auth.getUser();
    let companySettings = { ...defaultCompanySettings };

    if (profile?.user) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', profile.user.id)
        .single();

      if (userProfile?.company_id) {
        // Read client company settings from database
        const { data: settingsRow } = await supabase
          .from('company_settings')
          .select('data')
          .eq('company_id', userProfile.company_id)
          .single();

        if (settingsRow?.data) {
          companySettings = { ...defaultCompanySettings, ...settingsRow.data };
        }

        // Also fallback to organization name if companyName not explicitly set
        const { data: orgRow } = await supabase
          .from('organizations')
          .select('name, data')
          .eq('id', userProfile.company_id)
          .single();

        if (orgRow?.name && !settingsRow?.data?.companyName) {
          companySettings.companyName = orgRow.name;
        }
      }
    }

    // Integrations: NEVER store secrets in database or send to frontend!
    // Settings screen shows read-only status and instructs configuration in Cloudflare Pages.
    const integrations: IntegrationSettings = {
      whatsapp: {
        enabled: true,
        businessAccountId: 'Cloudflare Environment',
        phoneNumberId: 'Configured in Cloudflare',
        accessToken: '••••••••',
        webhookVerifyToken: '••••••••',
        status: 'connected',
      },
      indiamart: {
        enabled: true,
        crmKey: '••••••••',
        mobileNumber: 'Configured in Cloudflare',
        pullFrequencyMinutes: 15,
        status: 'connected',
      },
      website: {
        enabled: true,
        apiKey: '••••••••',
        corsOrigins: '*',
        leadSourceDefault: 'Website Form',
        webhookUrl: '/api/leads-capture',
      },
      email: {
        enabled: false,
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        senderEmail: '',
        senderName: 'StockItEase Notification',
        secure: false,
      },
      supabase: {
        connected: true,
        projectUrl: import.meta.env.VITE_SUPABASE_URL || 'Connected',
        anonKey: '••••••••',
        serviceRoleKey: 'Cloudflare Worker Secret',
      },
    };

    return { company: companySettings, integrations };
  },

  updateCompanySettings: async (data: Partial<CompanySettings>): Promise<CompanySettings> => {
    const profile = await getCurrentUserProfile();

    const { data: existing } = await supabase
      .from('company_settings')
      .select('data')
      .eq('company_id', profile.companyId)
      .single();

    const updatedData = { ...defaultCompanySettings, ...(existing?.data || {}), ...data };

    const { error } = await supabase
      .from('company_settings')
      .upsert({
        company_id: profile.companyId,
        data: updatedData,
        updated_at: new Date().toISOString(),
      });

    if (error) throw new Error(error.message);
    return updatedData;
  },

  updateIntegrationSettings: async (_data: Partial<IntegrationSettings>): Promise<IntegrationSettings> => {
    // API keys and secrets live in Cloudflare Secrets and cannot be modified from the frontend
    const current = await api.getSettings();
    return current.integrations;
  },

  getTenantIntegrations: async (): Promise<any[]> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return [];
    try {
      const res = await fetch('/api/integrations-manage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.integrations || [];
    } catch {
      return [];
    }
  },

  manageTenantIntegration: async (payload: {
    action: 'generate' | 'update' | 'delete';
    kind: 'indiamart' | 'whatsapp' | 'website';
    whatsappPhoneNumberId?: string;
    allowedOrigins?: string[];
    active?: boolean;
  }): Promise<{ success: boolean; token?: string; webhookUrl?: string; integration?: any; message?: string; error?: string }> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Authentication required');
    const res = await fetch('/api/integrations-manage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to manage integration');
    return json;
  },




  exportFullBackup: async (): Promise<any> => {
    const [leads, customers, products, quotations, orders, payments, settings] = await Promise.all([
      api.getLeads(),
      api.getCustomers(),
      api.getProducts(),
      api.getQuotations(),
      api.getOrders(),
      api.getPayments(),
      api.getSettings(),
    ]);

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      platform: 'StockItEase',
      data: { leads, customers, products, quotations, orders, payments, settings: settings.company },
    };
  },

  restoreFullBackup: async (_backupData: Record<string, any>): Promise<any> => {
    throw new Error('Database restoration must be performed via Supabase SQL Editor or migration CLI for security.');
  },
};
