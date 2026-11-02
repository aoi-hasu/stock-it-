import {
  Env,
  timingSafeEqualStr,
  getSupabaseAdmin,
  jsonResponse,
  lookupIntegrationByToken,
  lookupCompanyByWhatsAppPhoneId,
  validateEnvironmentConfig,
} from './_utils';

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  const configErr = validateEnvironmentConfig(env);
  if (configErr) return configErr;

  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const queryToken = url.searchParams.get('token');

  if (mode !== 'subscribe') {
    return new Response('Forbidden: Verification failed', { status: 403 });
  }

  // 1. Check if token matches multi-tenant integration token hash
  const effectiveToken = token || queryToken;
  if (effectiveToken) {
    try {
      const supabase = getSupabaseAdmin(env);
      const integration = await lookupIntegrationByToken(supabase, 'whatsapp', effectiveToken);
      if (integration) {
        return new Response(challenge || 'VERIFIED', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    } catch {
      // proceed to global fallback
    }
  }

  // 2. Fallback to global verify token if configured
  if (env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && timingSafeEqualStr(effectiveToken, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(challenge || 'VERIFIED', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new Response('Forbidden: Verification failed', { status: 403 });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const configErr = validateEnvironmentConfig(env);
  if (configErr) return configErr;

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin(env);
  } catch {
    return jsonResponse({ error: 'Database service unconfigured' }, 503);
  }

  const rawBody = await request.text();

  // 1. Verify Meta HMAC-SHA256 signature (fail closed: requires secret and valid signature)
  if (!env.WHATSAPP_APP_SECRET) {
    console.error('WHATSAPP_APP_SECRET is not configured on server.');
    return jsonResponse({ error: 'Service Unavailable: Webhook secret not configured.' }, 503);
  }

  const signatureHeader = request.headers.get('x-hub-signature-256') || '';
  if (!signatureHeader.startsWith('sha256=')) {
    return jsonResponse({ error: 'Unauthorized: Invalid signature.' }, 401);
  }
  const clientSignature = signatureHeader.slice(7);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(env.WHATSAPP_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (!timingSafeEqualStr(clientSignature, expectedSignature)) {
    return jsonResponse({ error: 'Unauthorized: Invalid signature.' }, 401);
  }

  // Parse webhook events
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');

  // Multi-tenant company mapping: URL token or phone_number_id from payload
  let fallbackCompanyId: string | null = null;
  if (queryToken) {
    const integration = await lookupIntegrationByToken(supabase, 'whatsapp', queryToken);
    if (integration) fallbackCompanyId = integration.companyId;
  }
  if (!fallbackCompanyId && env.DEFAULT_COMPANY_ID) {
    fallbackCompanyId = env.DEFAULT_COMPANY_ID;
  }

  const entries = payload.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;

      let companyId = fallbackCompanyId;
      if (phoneNumberId) {
        const mapped = await lookupCompanyByWhatsAppPhoneId(supabase, phoneNumberId);
        if (mapped) companyId = mapped.companyId;
      }

      if (!companyId) {
        console.warn('Skipping message: unmapped WhatsApp phone_number_id', phoneNumberId);
        continue;
      }

      const contacts = value.contacts || [];
      const contactProfileMap: Record<string, string> = {};
      for (const c of contacts) {
        if (c.wa_id && c.profile?.name) {
          contactProfileMap[c.wa_id] = c.profile.name;
        }
      }

      const messages = value.messages || [];
      for (const msg of messages) {
        const from = String(msg.from || '');
        const cleanMobile = from.replace(/[^0-9]/g, '').slice(-10);
        const contactName = contactProfileMap[from] || `WhatsApp Inquirer (${cleanMobile})`;
        const text = msg.text?.body || msg.caption || '[Attachment/Media received]';
        const timestamp = new Date().toISOString();

        if (!cleanMobile) continue;

        // Check if phone number is known in this company's leads or customers
        let linkedLeadId: string | null = null;
        let linkedCustomerId: string | null = null;

        // Check customers
        const { data: customerRow } = await supabase
          .from('customers')
          .select('id')
          .eq('company_id', companyId)
          .or(`data->>mobile.eq.${cleanMobile},data->>whatsapp.eq.${cleanMobile}`)
          .limit(1)
          .single();

        if (customerRow) {
          linkedCustomerId = customerRow.id;
        } else {
          // Check leads
          const { data: leadRow } = await supabase
            .from('leads')
            .select('id')
            .eq('company_id', companyId)
            .or(`data->>mobile.eq.${cleanMobile},data->>whatsapp.eq.${cleanMobile}`)
            .limit(1)
            .single();

          if (leadRow) {
            linkedLeadId = leadRow.id;
          } else {
            // Unknown number: Create fresh lead for unknown numbers
            const { data: leadResult, error: leadErr } = await supabase.rpc('record_inbound_lead', {
              p_company: companyId,
              p_payload: {
                companyName: contactName,
                contactPerson: contactName,
                mobile: cleanMobile,
                whatsapp: cleanMobile,
                source: 'WhatsApp',
                productInterested: 'WhatsApp Inbound Message',
                requirement: text,
                priority: 'High',
              },
            });

            if (leadErr) {
              console.error('Failed to record inbound WhatsApp lead:', leadErr);
            } else if (leadResult?.leadId) {
              linkedLeadId = leadResult.leadId;
            }
          }
        }

        // Record incoming message in communications table and link to lead/customer
        const commId = `wa-${crypto.randomUUID()}`;
        const { error: commErr } = await supabase.from('communications').insert({
          id: commId,
          company_id: companyId,
          data: {
            id: commId,
            channel: 'WhatsApp',
            direction: 'Inbound',
            recipientPhone: from,
            content: text,
            status: 'Delivered',
            timestamp,
            leadId: linkedLeadId || undefined,
            customerId: linkedCustomerId || undefined,
            notes: 'Received via Meta Cloud API Webhook',
          },
        });
        if (commErr) {
          console.error('Failed to log WhatsApp communication:', commErr);
        }
      }
    }
  }

  return jsonResponse({ status: 'ok' });
}
