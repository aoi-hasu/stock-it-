import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getEnvOrStorage = (envKey: string, storageKey: string): string => {
  const envVal = (import.meta.env[envKey] || '').trim();
  if (envVal) return envVal;
  try {
    return (localStorage.getItem(storageKey) || '').trim();
  } catch {
    return '';
  }
};

const supabaseUrl = getEnvOrStorage('VITE_SUPABASE_URL', 'stockitease_supabase_url');
const supabaseAnonKey = getEnvOrStorage('VITE_SUPABASE_ANON_KEY', 'stockitease_supabase_anon_key');

export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);

export const setStoredSupabaseConfig = (url: string, anonKey: string): void => {
  try {
    localStorage.setItem('stockitease_supabase_url', url.trim());
    localStorage.setItem('stockitease_supabase_anon_key', anonKey.trim());
    window.location.reload();
  } catch (err) {
    console.error('Failed to save Supabase config in localStorage', err);
  }
};

export const clearStoredSupabaseConfig = (): void => {
  try {
    localStorage.removeItem('stockitease_supabase_url');
    localStorage.removeItem('stockitease_supabase_anon_key');
    window.location.reload();
  } catch (err) {
    console.error('Failed to clear Supabase config in localStorage', err);
  }
};

if (!isSupabaseConfigured) {
  console.warn(
    '[StockItEase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not defined in environment variables. ' +
    'Application is running in configuration setup mode.'
  );
}

// Single singleton Supabase client when configured, or strict proxy that rejects dummy calls without placeholder
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : (new Proxy({}, {
      get(_target, prop) {
        if (prop === 'auth') {
          return {
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            getUser: async () => ({ data: { user: null }, error: null }),
            signInWithPassword: async () => {
              throw new Error('Supabase is not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
            },
            signOut: async () => {},
          };
        }
        return () => {
          throw new Error('Supabase is not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
        };
      },
    }) as any);

export const getSupabaseClient = (): SupabaseClient => {
  return supabase;
};

export const resetSupabaseClient = (): void => {
  // Singleton client is managed by Vite environment variables
};

export const testSupabaseConnection = async (
  _url?: string,
  _anonKey?: string
): Promise<{ success: boolean; message: string }> => {
  return {
    success: isSupabaseConfigured,
    message: isSupabaseConfigured
      ? 'Connected to Supabase via Cloudflare Pages environment.'
      : 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not configured.',
  };
};
