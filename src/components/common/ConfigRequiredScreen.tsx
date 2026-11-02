import React, { useState } from 'react';
import { AlertTriangle, Database, ExternalLink, ShieldCheck, ArrowRight, KeyRound } from 'lucide-react';
import { setStoredSupabaseConfig } from '../../services/supabase.ts';

export const ConfigRequiredScreen: React.FC = () => {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!url.trim().startsWith('http')) {
      setError('Please enter a valid Supabase URL starting with https://');
      return;
    }
    if (!anonKey.trim()) {
      setError('Please enter your Supabase anonymous public key');
      return;
    }
    setStoredSupabaseConfig(url.trim(), anonKey.trim());
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">StockItEase Configuration Required</h1>
            <p className="text-xs text-slate-400 mt-1">Supabase database environment variables are missing</p>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-6">
          StockItEase is a multi-tenant business platform that connects directly to Supabase with strict Row-Level Security (RLS). To launch the application, connect your Supabase project:
        </p>

        {/* Quick Connect Form */}
        <form onSubmit={handleConnect} className="bg-slate-950 border border-slate-800 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold pb-2 border-b border-slate-800/80">
            <KeyRound className="w-4 h-4 text-sky-400" /> Connect Supabase Instance
          </div>
          
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Supabase Project URL (VITE_SUPABASE_URL)
            </label>
            <input
              type="url"
              placeholder="https://xyzcompany.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Supabase Anon Public Key (VITE_SUPABASE_ANON_KEY)
            </label>
            <input
              type="text"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20"
          >
            Connect & Launch App <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-sky-400 mb-6 space-y-2 select-all">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-sans pb-1 border-b border-slate-800/80">
            <Database className="w-3.5 h-3.5 text-sky-400" /> Alternatively, Set in Environment
          </div>
          <div>VITE_SUPABASE_URL=https://your-project.supabase.co</div>
          <div>VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here</div>
        </div>

        <div className="space-y-3 text-xs text-slate-400 bg-slate-900/60 border border-slate-800/60 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200">Cloudflare Pages:</span> Configure both variables in your Cloudflare Pages dashboard under <em className="text-sky-300 not-italic">Settings &gt; Environment Variables</em>, then trigger a deployment.
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <ExternalLink className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200">Local Environment:</span> Add both variables to your <code className="text-sky-300 bg-slate-950 px-1.5 py-0.5 rounded">.env</code> file in the repository root.
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>Security: Fail-closed architecture</span>
          <span>StockItEase · a product of aoihasu</span>
        </div>
      </div>
    </div>
  );
};
