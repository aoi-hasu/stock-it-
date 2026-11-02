import { supabase } from '../services/supabase.ts';

/** Calls one of the platform endpoints with the logged-in user's token. */
export async function platformFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init.headers || {}),
    },
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // ignore
  }
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status}).`);
  return json as T;
}
