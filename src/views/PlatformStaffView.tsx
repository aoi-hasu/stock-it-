import React, { useEffect, useState } from 'react';
import { UserPlus, Copy, Check, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { platformFetch } from './platformApi';

interface Staff {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'support';
  active: boolean;
}

const ROLE_HELP: Record<string, string> = {
  owner: 'Everything, including managing platform staff.',
  manager: 'Create/suspend companies, plans and users. Read-only Support View of client data (every view is logged).',
  support: 'See companies and their users, reset a client password. Cannot see leads, quotations or other business data.',
};

export const PlatformStaffView: React.FC = () => {
  const { currentUser, platformRole } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'support' });
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const json = await platformFetch<{ staff: Staff[] }>('/api/platform-staff');
      setStaff(json.staff || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (platformRole !== 'owner') {
    return <div className="text-sm text-slate-600">Only the platform owner can manage platform staff.</div>;
  }

  const post = async (body: object) => platformFetch<any>('/api/platform-staff', { method: 'POST', body: JSON.stringify(body) });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const json = await post({ action: 'create', ...form });
      setIssued({ email: form.email.trim().toLowerCase(), password: json.oneTimePassword });
      setForm({ name: '', email: '', role: 'support' });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not add staff.');
    } finally {
      setSaving(false);
    }
  };

  const change = async (s: Staff, patch: object, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setError(null);
    try {
      await post({ action: 'update', userId: s.userId, ...patch });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Update failed.');
    }
  };

  const resetPw = async (s: Staff) => {
    if (!window.confirm(`Reset the password for ${s.name}?`)) return;
    try {
      const json = await post({ action: 'reset-password', userId: s.userId });
      setIssued({ email: s.email, password: json.oneTimePassword });
    } catch (err: any) {
      setError(err?.message || 'Reset failed.');
    }
  };

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Platform Staff</h1>
        <p className="text-xs text-slate-500 mt-0.5">The people who run StockItEase for you. They never appear inside a client company.</p>
      </div>

      {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      {issued && (
        <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 space-y-1.5">
          <div className="font-semibold text-emerald-900">One-time password for {issued.email}</div>
          <div className="flex items-center gap-2">
            <code className="px-2 py-1 bg-white border border-emerald-200 rounded font-mono text-slate-900">{issued.password}</code>
            <button onClick={() => copy(issued.password)} className="p-1 text-emerald-800 hover:bg-emerald-100 rounded cursor-pointer">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="text-emerald-800">Share it privately. They must change it at first login. It will not be shown again.</div>
        </div>
      )}

      <form onSubmit={create} className="bg-white border border-slate-200 rounded-xl p-4 grid gap-3 md:grid-cols-4 items-end">
        <label className="text-xs font-semibold text-slate-700">
          Name
          <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Email
          <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Role
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal bg-white">
            <option value="support">Support</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <button disabled={saving} className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
          <UserPlus className="w-3.5 h-3.5" />
          {saving ? 'Adding…' : 'Add staff member'}
        </button>
        <p className="md:col-span-4 text-[11px] text-slate-500">{ROLE_HELP[form.role]}</p>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2.5 px-4 font-semibold">Name</th>
              <th className="py-2.5 px-4 font-semibold">Email</th>
              <th className="py-2.5 px-4 font-semibold">Role</th>
              <th className="py-2.5 px-4 font-semibold">Status</th>
              <th className="py-2.5 px-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-500">Loading…</td></tr>
            )}
            {staff.map(s => {
              const isMe = s.userId === currentUser?.id;
              return (
                <tr key={s.userId} className="border-b border-slate-100">
                  <td className="py-2.5 px-4 font-medium text-slate-800">{s.name || '—'}{isMe && ' (you)'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{s.email || '—'}</td>
                  <td className="py-2.5 px-4">
                    {s.role === 'owner' || isMe ? (
                      <span className="capitalize">{s.role}</span>
                    ) : (
                      <select value={s.role} onChange={e => change(s, { role: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1 bg-white">
                        <option value="support">Support</option>
                        <option value="manager">Manager</option>
                      </select>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={s.active ? 'text-emerald-700' : 'text-rose-700'}>{s.active ? 'Active' : 'Disabled'}</span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {!isMe && s.role !== 'owner' && (
                      <div className="inline-flex gap-1.5">
                        <button onClick={() => resetPw(s)} className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer">
                          <KeyRound className="w-3 h-3" /> Reset password
                        </button>
                        <button
                          onClick={() => change(s, { active: !s.active }, s.active ? `Disable ${s.name}? They will lose platform access immediately.` : undefined)}
                          className={`px-2 py-1 rounded-lg border cursor-pointer ${s.active ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
                        >
                          {s.active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
