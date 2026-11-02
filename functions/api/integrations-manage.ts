import {
  Env,
  authenticateCaller,
  jsonResponse,
  generateIntegrationToken,
  sha256Hex,
} from './_utils';

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  const authResult = await authenticateCaller(request, env);
  if ('error' in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status);
  }

  const { profile: callerProfile, supabase } = authResult;

  if (!['super_admin', 'owner', 'admin'].includes(callerProfile.role)) {
    return jsonResponse({ error: 'Permission denied: Only administrators can view integration settings.' }, 403);
  }

  const { data: rows, error } = await supabase
    .from('integrations')
    .select('id, company_id, kind, whatsapp_phone_number_id, allowed_origins, active, created_at, updated_at')
    .eq('company_id', callerProfile.company_id);

  if (error) {
    console.error('Failed to fetch integrations:', error);
    return jsonResponse({ error: 'Request failed.' }, 500);
  }

  const url = new URL(request.url);
  const origin = url.origin;

  const integrationsWithEndpoints = (rows || []).map(r => {
    let webhookPath = '';
    if (r.kind === 'indiamart') webhookPath = `${origin}/api/webhooks-indiamart?token=`;
    else if (r.kind === 'whatsapp') webhookPath = `${origin}/api/webhooks-whatsapp?token=`;
    else if (r.kind === 'website') webhookPath = `${origin}/api/leads-capture?token=`;

    return {
      ...r,
      webhookUrlTemplate: webhookPath,
    };
  });

  return jsonResponse({ integrations: integrationsWithEndpoints });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const authResult = await authenticateCaller(request, env);
  if ('error' in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status);
  }

  const { profile: callerProfile, supabase } = authResult;

  if (!['super_admin', 'owner', 'admin'].includes(callerProfile.role)) {
    return jsonResponse({ error: 'Permission denied: Only administrators can manage integrations.' }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request format.' }, 400);
  }

  const kind = String(body.kind || '').trim().toLowerCase();
  if (!['indiamart', 'whatsapp', 'website'].includes(kind)) {
    return jsonResponse({ error: 'Invalid integration kind. Must be indiamart, whatsapp, or website.' }, 400);
  }

  const action = String(body.action || 'generate').trim().toLowerCase();
  const whatsappPhoneNumberId = body.whatsappPhoneNumberId ? String(body.whatsappPhoneNumberId).trim() : null;
  const allowedOrigins = Array.isArray(body.allowedOrigins)
    ? body.allowedOrigins.map((o: any) => String(o).trim().toLowerCase()).filter(Boolean)
    : [];

  const url = new URL(request.url);
  const origin = url.origin;

  if (action === 'generate') {
    // Generate new raw token and store its SHA-256 hash
    const rawToken = generateIntegrationToken();
    const tokenHash = await sha256Hex(rawToken);

    const { data: upserted, error: upsertErr } = await supabase
      .from('integrations')
      .upsert(
        {
          company_id: callerProfile.company_id,
          kind,
          token_hash: tokenHash,
          whatsapp_phone_number_id: whatsappPhoneNumberId,
          allowed_origins: allowedOrigins,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,kind' }
      )
      .select('id, company_id, kind, whatsapp_phone_number_id, allowed_origins, active, created_at, updated_at')
      .single();

    if (upsertErr) {
      console.error('Failed to save integration:', upsertErr);
      return jsonResponse({ error: 'Request failed.' }, 500);
    }

    let webhookPath = '';
    if (kind === 'indiamart') webhookPath = `${origin}/api/webhooks-indiamart?token=${rawToken}`;
    else if (kind === 'whatsapp') webhookPath = `${origin}/api/webhooks-whatsapp?token=${rawToken}`;
    else if (kind === 'website') webhookPath = `${origin}/api/leads-capture?token=${rawToken}`;

    return jsonResponse({
      success: true,
      token: rawToken,
      webhookUrl: webhookPath,
      integration: upserted,
      message: 'Token generated successfully. Copy and store this token now — it will never be displayed again.',
    });
  }

  if (action === 'update') {
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.active !== undefined) updates.active = Boolean(body.active);
    if (whatsappPhoneNumberId !== undefined) updates.whatsapp_phone_number_id = whatsappPhoneNumberId;
    if (body.allowedOrigins !== undefined) updates.allowed_origins = allowedOrigins;

    const { data: updated, error: updateErr } = await supabase
      .from('integrations')
      .update(updates)
      .eq('company_id', callerProfile.company_id)
      .eq('kind', kind)
      .select('id, company_id, kind, whatsapp_phone_number_id, allowed_origins, active, created_at, updated_at')
      .single();

    if (updateErr) {
      console.error('Failed to update integration:', updateErr);
      return jsonResponse({ error: 'Request failed.' }, 500);
    }

    return jsonResponse({ success: true, integration: updated });
  }

  if (action === 'delete') {
    const { error: delErr } = await supabase
      .from('integrations')
      .delete()
      .eq('company_id', callerProfile.company_id)
      .eq('kind', kind);

    if (delErr) {
      console.error('Failed to delete integration:', delErr);
      return jsonResponse({ error: 'Request failed.' }, 500);
    }

    return jsonResponse({ success: true, message: 'Integration removed successfully.' });
  }

  return jsonResponse({ error: 'Unknown action' }, 400);
}
