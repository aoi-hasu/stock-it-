import {
  Env,
  timingSafeEqualStr,
  getSupabaseAdmin,
  jsonResponse,
  lookupIntegrationByToken,
  validateEnvironmentConfig,
} from './_utils';

// In-memory rate limiting store for when KV binding is absent
const inMemoryRateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkInMemoryRateLimit(clientIp: string, maxRequests = 20, windowMs = 600000): boolean {
  const now = Date.now();
  const entry = inMemoryRateLimitStore.get(clientIp);

  if (!entry || entry.resetAt <= now) {
    inMemoryRateLimitStore.set(clientIp, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function onRequestOptions({ request, env }: { request: Request; env: Env }) {
  const origin = (request.headers.get('Origin') || '').trim();
  if (!origin) {
    return new Response(null, {
      status: 204,
      headers: {
        'Vary': 'Origin',
      },
    });
  }

  // Look up integration token from query or headers to check allowed origins
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get('token') || url.searchParams.get('key');
  const tokenFromHeader = request.headers.get('x-api-key') || request.headers.get('x-website-token');
  const rawToken = (tokenFromQuery || tokenFromHeader || '').trim();

  let companyAllowedOrigins: string[] = [];

  if (rawToken) {
    try {
      const supabase = getSupabaseAdmin(env);
      const integration = await lookupIntegrationByToken(supabase, 'website', rawToken);
      if (integration?.allowedOrigins) {
        companyAllowedOrigins = integration.allowedOrigins;
      }
    } catch (err) {
      console.error('Error checking integration origins in OPTIONS preflight:', err);
    }
  }

  if (companyAllowedOrigins.length === 0 && env.WEBSITE_LEAD_SECRET && env.DEFAULT_COMPANY_ID) {
    if (rawToken && timingSafeEqualStr(rawToken, env.WEBSITE_LEAD_SECRET)) {
      companyAllowedOrigins = (env.LEAD_ALLOWED_ORIGINS || '')
        .split(',')
        .map(o => o.trim().toLowerCase())
        .filter(Boolean);
    }
  }

  const normalizedOrigin = origin.toLowerCase();
  const isMatch = companyAllowedOrigins.some(o => o.toLowerCase().trim() === normalizedOrigin);

  if (!isMatch) {
    return new Response(null, {
      status: 403,
      headers: {
        'Vary': 'Origin',
      },
    });
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization, X-Website-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const configErr = validateEnvironmentConfig(env);
  if (configErr) return configErr;

  // 1. In-memory & binding rate limiting check
  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
  let rateLimited = false;

  if (env.RATE_LIMIT && typeof env.RATE_LIMIT.get === 'function') {
    try {
      const key = `lead_ratelimit_${clientIp}`;
      const count = Number((await env.RATE_LIMIT.get(key)) || 0);
      if (count >= 20) {
        rateLimited = true;
      } else {
        await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 600 });
      }
    } catch {
      rateLimited = !checkInMemoryRateLimit(clientIp);
    }
  } else {
    console.warn('[Rate Limit] RATE_LIMIT KV binding is not configured. Falling back to in-memory rate limiting.');
    rateLimited = !checkInMemoryRateLimit(clientIp);
  }

  if (rateLimited) {
    return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429, { 'Vary': 'Origin' });
  }

  // 2. Database client
  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin(env);
  } catch (dbErr) {
    console.error('Database connection initialization failed:', dbErr);
    return jsonResponse({ error: 'Database service unconfigured.' }, 503, { 'Vary': 'Origin' });
  }

  // 3. Extract and verify token
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get('token') || url.searchParams.get('key');
  const tokenFromHeader = request.headers.get('x-api-key') || request.headers.get('x-website-token');
  const rawToken = (tokenFromQuery || tokenFromHeader || '').trim();

  let targetCompanyId: string | null = null;
  let companyAllowedOrigins: string[] = [];

  if (rawToken) {
    const integration = await lookupIntegrationByToken(supabase, 'website', rawToken);
    if (integration) {
      targetCompanyId = integration.companyId;
      companyAllowedOrigins = integration.allowedOrigins || [];
    }
  }

  // Fallback to global config if unconfigured
  if (!targetCompanyId && env.WEBSITE_LEAD_SECRET && env.DEFAULT_COMPANY_ID) {
    if (timingSafeEqualStr(rawToken, env.WEBSITE_LEAD_SECRET)) {
      targetCompanyId = env.DEFAULT_COMPANY_ID;
      companyAllowedOrigins = (env.LEAD_ALLOWED_ORIGINS || '')
        .split(',')
        .map(o => o.trim().toLowerCase())
        .filter(Boolean);
    }
  }

  if (!targetCompanyId) {
    return jsonResponse(
      { error: 'Unauthorized: Invalid or unconfigured website integration token.' },
      401,
      { 'Vary': 'Origin' }
    );
  }

  // 4. Require and verify Origin allow-list per company
  if (companyAllowedOrigins.length === 0) {
    const { data: setRow } = await supabase
      .from('company_settings')
      .select('data')
      .eq('company_id', targetCompanyId)
      .single();
    if (setRow?.data?.websiteAllowedOrigins) {
      if (Array.isArray(setRow.data.websiteAllowedOrigins)) {
        companyAllowedOrigins = setRow.data.websiteAllowedOrigins.map((o: string) => o.trim().toLowerCase());
      } else if (typeof setRow.data.websiteAllowedOrigins === 'string') {
        companyAllowedOrigins = setRow.data.websiteAllowedOrigins.split(',').map((o: string) => o.trim().toLowerCase()).filter(Boolean);
      }
    }
  }

  const effectiveAllowedOrigins = companyAllowedOrigins.map(o => o.toLowerCase().trim()).filter(Boolean);
  const originHeader = request.headers.get('Origin');
  const normalizedOrigin = originHeader ? originHeader.trim().toLowerCase() : null;

  const corsHeaders: Record<string, string> = {
    'Vary': 'Origin',
  };

  if (normalizedOrigin) {
    if (effectiveAllowedOrigins.length === 0) {
      return jsonResponse({
        error: 'Forbidden: Website lead capture requires configuring an allowed origins list for browser submissions.',
      }, 403, corsHeaders);
    }

    const originMatched = effectiveAllowedOrigins.includes(normalizedOrigin);
    if (!originMatched) {
      return jsonResponse({
        error: 'Forbidden: Request origin is not permitted.',
      }, 403, corsHeaders);
    }

    corsHeaders['Access-Control-Allow-Origin'] = originHeader!.trim();
  }

  // 5. Check payload size
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 10240) {
    return jsonResponse({ error: 'Payload exceeds maximum allowed size (10 KB).' }, 413, corsHeaders);
  }

  const rawText = await request.text();
  if (rawText.length > 10240) {
    return jsonResponse({ error: 'Payload exceeds maximum allowed size (10 KB).' }, 413, corsHeaders);
  }

  let body: any;
  try {
    body = JSON.parse(rawText);
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload format.' }, 400, corsHeaders);
  }

  const companyName = String(body.companyName || body.company || '').trim().slice(0, 120);
  const contactPerson = String(body.contactPerson || body.name || '').trim().slice(0, 80);
  const rawMobile = String(body.mobile || body.phone || '').trim().slice(0, 25);
  const cleanMobile = rawMobile.replace(/[^0-9]/g, '').slice(-10);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 100);
  const productInterested = String(body.productInterested || body.product || '').trim().slice(0, 120);
  const requirement = String(body.requirement || body.message || '').trim().slice(0, 1000);
  const city = String(body.city || '').trim().slice(0, 60);
  const state = String(body.state || '').trim().slice(0, 60);
  const source = String(body.source || 'Website Form').trim().slice(0, 50);
  const uniqueQueryId = body.uniqueQueryId ? String(body.uniqueQueryId).trim() : undefined;

  if (!companyName || !contactPerson || cleanMobile.length < 10) {
    return jsonResponse({
      error: 'Company Name, Contact Person, and a valid 10-digit Mobile number are required.',
    }, 400, corsHeaders);
  }

  // 6. Deterministic Assignee:
  // Check company setting `defaultLeadAssigneeId`, else earliest-created active sales user (never owner by accident)
  let assigneeId: string | null = null;
  let assigneeName = 'Sales Team';

  const { data: setRow } = await supabase
    .from('company_settings')
    .select('data')
    .eq('company_id', targetCompanyId)
    .single();

  if (setRow?.data?.defaultLeadAssigneeId) {
    const { data: assigneeProfile } = await supabase
      .from('profiles')
      .select('id, name, active')
      .eq('id', setRow.data.defaultLeadAssigneeId)
      .eq('company_id', targetCompanyId)
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
      .eq('company_id', targetCompanyId)
      .eq('active', true)
      .in('role', ['salesperson', 'sales_manager', 'manager'])
      .order('created_at', { ascending: true })
      .limit(1);

    if (salesProfiles && salesProfiles.length > 0) {
      assigneeId = salesProfiles[0].id;
      assigneeName = salesProfiles[0].name;
    }
  }

  // 7. Atomic Ingestion with race-safe deduplication (appends follow-up to existing lead if duplicate phone)
  const leadPayload = {
    uniqueQueryId,
    companyName,
    contactPerson,
    mobile: cleanMobile,
    whatsapp: cleanMobile,
    email,
    city: city || 'Local',
    state: state || '',
    country: 'India',
    source,
    productInterested: productInterested || 'General Inquiry',
    requirement,
    quantity: 1,
    priority: 'Medium',
    assignedSalespersonId: assigneeId,
    assignedSalespersonName: assigneeName,
  };

  const { data: result, error: rpcError } = await supabase.rpc('record_inbound_lead', {
    p_company: targetCompanyId,
    p_payload: leadPayload,
  });

  if (rpcError || !result) {
    console.error('Failed to record inbound website lead into database:', rpcError);
    return jsonResponse({
      error: 'Request failed.',
    }, 500, corsHeaders);
  }

  return jsonResponse({
    success: true,
    message: result.message || 'Lead inquiry captured successfully.',
    leadId: result.leadId,
    status: result.status,
  }, 200, corsHeaders);
}
