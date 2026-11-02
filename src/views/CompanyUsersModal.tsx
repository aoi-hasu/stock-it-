import React, { useEffect, useState } from 'react';
import { X, KeyRound, Copy, Check } from 'lucide-react';
import { platformFetch } from './platformApi';

interface CompanyUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
}

export const CompanyUsersModal: React.FC<{
  org: { id: string; name: string };
  onClose: () => void;
}> = ({ org, onClose }) => {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const json = await platformFetch<{ users: CompanyUser[] }>(
          `/api/platform-company-users?companyId=${encodeURIComponent(org.id)}`
        );
        setUsers(json.users || []);
      } catch (e: any) {
        setError(e?.message || 'Could not load users.');
      } finally {
        setLoading(false);
      }
    })();
  }, [org.id]);

  const resetPassword = async (u: CompanyUser) => {
    if (!window.confirm(`Reset the password for ${u.name} (${u.email})? Their old password stops working immediately.`)) return;
    setBusyId(u.id);
    setError(null);
    try {
      const json = await platformFetch<{ oneTimePassword: string }>('/api/platform-company-users', {
        method: 'POST',
        body: JSON.stringify({ companyId: org.id, userId: u.id }),
      });
      setIssued({ email: u.email, password: json.oneTimePassword });
      setCopied(false);
    } catch (e: any) {
      setError(e?.message || 'Reset failed.');
    } finally {
      setBusyId(null);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Users of {org.name}</h2>
            <p className="text-[11px] text-slate-500">Only names, roles and logins are shown. No business data.</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

          {issued && (
            <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 space-y-1.5">
              <div className="font-semibold text-emerald-900">One-time password for {issued.email}</div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-white border border-emerald-200 rounded font-mono text-slate-900">{issued.password}</code>
                <button onClick={() => copy(issued.password)} className="p-1 text-emerald-800 hover:bg-emerald-100 rounded cursor-pointer" title="Copy">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-emerald-800">Share it privately. They must change it at next login. It will not be shown again.</div>
            </div>
          )}

          {loading ? (
            <div className="text-xs text-slate-500 py-6 text-center">Loading users…</div>
          ) : users.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">This company has no users.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Email</th>
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 text-right font-semibold">Password</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">{u.name}</td>
                    <td className="py-2 pr-3 text-slate-600">{u.email}</td>
                    <td className="py-2 pr-3 text-slate-600">{u.role}</td>
                    <td className="py-2 pr-3">
                      <span className={u.active ? 'text-emerald-700' : 'text-rose-700'}>{u.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => resetPassword(u)}
                        disabled={busyId === u.id}
                        className="px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <KeyRound className="w-3 h-3" />
                        {busyId === u.id ? 'Working…' : 'Reset'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
