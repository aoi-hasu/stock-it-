import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase.ts';

interface LogRow {
  id: string;
  what: string;
  accessed_at: string;
  company_id: string;
}

export const PlatformActivityView: React.FC = () => {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('platform_access_logs')
        .select('id, what, accessed_at, company_id')
        .order('accessed_at', { ascending: false })
        .limit(200);
      if (err) setError('Could not load the activity log.');
      else setRows((data as LogRow[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Platform Activity</h1>
        <p className="text-xs text-slate-500 mt-0.5">Every time platform staff opened a client's data in Support View or reset a client password (latest 200).</p>
      </div>
      {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {loading && <div className="px-4 py-6 text-xs text-slate-500 text-center">Loading…</div>}
        {!loading && rows.length === 0 && !error && (
          <div className="px-4 py-6 text-xs text-slate-500 text-center">No activity yet.</div>
        )}
        {rows.map(r => (
          <div key={r.id} className="px-4 py-2.5 text-xs flex justify-between gap-4">
            <span className="text-slate-800">{r.what}</span>
            <span className="text-slate-500 whitespace-nowrap">{new Date(r.accessed_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
