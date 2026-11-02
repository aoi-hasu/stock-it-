import {
  Env,
  timingSafeEqualStr,
  getSupabaseAdmin,
  jsonResponse,
  lookupIntegrationByToken,
  validateEnvironmentConfig,
} from './_utils';

export async function onRequestGet({ request }: { request: Request }) {
  // Health check endpoint for IndiaMART verification
  return jsonResponse({
    STATUS: 'SUCCESS',
    MESSAGE: 'IndiaMART Webhook Gateway is active. Use POST with token to push leads.',
  });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const configErr = validateEnvironmentConfig(env);
  if (configErr) return configErr;

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin(env);
  } catch {
    return jsonResponse({ STATUS: 'FAILURE', MESSAGE: 'Database service unconfigured.' }, 503);
  }

  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get('token') || url.searchParams.get('crm_key') || url.searchParams.get('key');
  const authHeader = request.headers.get('Authorization') || '';
  const tokenFromBearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const tokenFromHeader = request.headers.get('x-api-key') || request.headers.get('x-indiamart-crm-key') || tokenFromBearer;

  let rawBodyText = '';
  let body: any = {};
  try {
    rawBodyText = await request.text();
    body = JSON.parse(rawBodyText);
  } catch {
    body = {};
  }

  const tokenFromBody = body.GLUSR_CRM_KEY || body.crm_key || body.token;
  const providedToken = (tokenFromHeader || tokenFromQuery || tokenFromBody || '').trim();

  let companyId: string | null = null;

  // 1. Multi-tenant lookup: find company by hashed token
  if (providedToken) {
    const integration = await lookupIntegrationByToken(supabase, 'indiamart', providedToken);
    if (integration) {
      companyId = integration.companyId;
    }
  }

  // Fallback: legacy global secret if configured
  if (!companyId && env.INDIAMART_CRM_KEY && env.DEFAULT_COMPANY_ID) {
    if (timingSafeEqualStr(providedToken, env.INDIAMART_CRM_KEY)) {
      companyId = env.DEFAULT_COMPANY_ID;
    }
  }

  if (!companyId) {
    return jsonResponse(
      { STATUS: 'FAILURE', MESSAGE: 'Invalid or missing IndiaMART CRM integration token.' },
      401
    );
  }

  // 2. Parse IndiaMART payload: Support both nested `RESPONSE` shape and flat shape
  let enquiry: any = body;
  if (body.RESPONSE) {
    if (Array.isArray(body.RESPONSE) && body.RESPONSE.length > 0) {
      enquiry = body.RESPONSE[0];
    } else if (typeof body.RESPONSE === 'object') {
      enquiry = body.RESPONSE;
    }
  }

  const uniqueQueryId = String(
    enquiry.UNIQUE_QUERY_ID || enquiry.QUERY_ID || body.UNIQUE_QUERY_ID || body.QUERY_ID || ''
  ).trim();

  const senderName = String(
    enquiry.SENDER_NAME || enquiry.senderName || body.SENDER_NAME || 'IndiaMART Inquirer'
  ).trim().slice(0, 80);

  const senderCompany = String(
    enquiry.SENDER_COMPANY || enquiry.senderCompany || body.SENDER_COMPANY || senderName
  ).trim().slice(0, 120);

  const rawMobile = String(
    enquiry.SENDER_MOBILE || enquiry.senderMobile || body.SENDER_MOBILE || body.MOBILE || ''
  );
  const senderMobile = rawMobile.replace(/[^0-9]/g, '').slice(-10);

  const senderEmail = String(
    enquiry.SENDER_EMAIL || enquiry.senderEmail || body.SENDER_EMAIL || ''
  ).trim().toLowerCase().slice(0, 100);

  const productName = String(
    enquiry.QUERY_PRODUCT_NAME || enquiry.PRODUCT_NAME || enquiry.productName || body.PRODUCT_NAME || 'Industrial Machinery Inquiry'
  ).trim().slice(0, 120);

  const queryMessage = String(
    enquiry.QUERY_MESSAGE || enquiry.queryMessage || body.QUERY_MESSAGE || ''
  ).trim().slice(0, 1000);

  const city = String(
    enquiry.SENDER_CITY || enquiry.city || body.SENDER_CITY || ''
  ).trim().slice(0, 60);

  const state = String(
    enquiry.SENDER_STATE || enquiry.state || body.SENDER_STATE || ''
  ).trim().slice(0, 60);

  if (!senderMobile || senderMobile.length < 10) {
    return jsonResponse(
      { STATUS: 'FAILURE', MESSAGE: 'Valid 10-digit sender mobile number required' },
      400
    );
  }

  // 3. Deterministic Assignee: defaultLeadAssigneeId in company settings or earliest active sales user
  let assigneeId: string | null = null;
  let assigneeName = 'Sales Team';

  const { data: settingsRow } = await supabase
    .from('company_settings')
    .select('data')
    .eq('company_id', companyId)
    .single();

  if (settingsRow?.data?.defaultLeadAssigneeId) {
    const { data: assigneeProfile } = await supabase
      .from('profiles')
      .select('id, name, active')
      .eq('id', settingsRow.data.defaultLeadAssigneeId)
      .eq('company_id', companyId)
      .eq('active', true)
      .single();

    if (assigneeProfile) {
      assigneeId = assigneeProfile.id;
      assigneeName = assigneeProfile.name;
    }
  }

  if (!assigneeId) {
    const { data: salesProfiles } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('active', true)
      .in('role', ['salesperson', 'sales_manager', 'manager'])
      .order('created_at', { ascending: true })
      .limit(1);

    if (salesProfiles && salesProfiles.length > 0) {
      assigneeId = salesProfiles[0].id;
      assigneeName = salesProfiles[0].name;
    }
  }

  // 4. Ingest lead using atomic race-safe RPC
  const leadPayload = {
    uniqueQueryId: uniqueQueryId || undefined,
    companyName: senderCompany,
    contactPerson: senderName,
    mobile: senderMobile,
    whatsapp: senderMobile,
    email: senderEmail,
    city,
    state,
    country: 'India',
    source: 'IndiaMART',
    productInterested: productName,
    requirement: queryMessage,
    quantity: 1,
    priority: 'High',
    assignedSalespersonId: assigneeId,
    assignedSalespersonName: assigneeName,
  };

  const { data: result, error: rpcError } = await supabase.rpc('record_inbound_lead', {
    p_company: companyId,
    p_payload: leadPayload,
  });

  if (rpcError || !result) {
    console.error('Failed to record inbound IndiaMART lead into database:', rpcError);
    return jsonResponse(
      { STATUS: 'FAILURE', MESSAGE: 'Request failed.' },
      500
    );
  }

  return jsonResponse({
    CODE: 200,
    STATUS: 'SUCCESS',
    MESSAGE: result.message || 'IndiaMART inquiry captured successfully',
    LEAD_ID: result.leadId,
    RESULT_STATUS: result.status,
  });
}
