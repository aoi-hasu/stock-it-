import React, { useState, useEffect } from 'react';
import { CompanyUsersModal } from './CompanyUsersModal';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  AlertCircle,
  Shield,
  Key,
  RefreshCw,
  X,
  Lock,
  Users,
  Calendar,
  Edit3,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { supabase } from '../services/supabase.ts';

interface ClientOrg {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  data?: {
    plan?: string;
    maxUsers?: number;
    subscriptionStatus?: string;
    subscriptionValidUntil?: string;
  };
  plan?: string;
  maxUsers?: number;
  subscriptionStatus?: string;
  subscriptionValidUntil?: string;
  userCount?: number;
  lastActivity?: string;
  lastActivityDesc?: string;
  created_at: string;
}

export const ClientsView: React.FC = () => {
  const { currentUser, enterSupportMode, platformRole } = useAuth();
  // support staff: view companies + users only. manager/owner: create, suspend, plans, read-only Support View.
  const canManageCompanies = platformRole !== 'support';
  const canOpenSupportView = platformRole === 'owner' || platformRole === 'manager';
  const [usersOrg, setUsersOrg] = useState<ClientOrg | null>(null);
  const [organizations, setOrganizations] = useState<ClientOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState<boolean | null>(null);
  const [search, setSearch] = useState('');

  // Edit subscription modal state
  const [editingOrg, setEditingOrg] = useState<ClientOrg | null>(null);
  const [editForm, setEditForm] = useState({
    plan: 'Professional',
    maxUsers: 15,
    subscriptionStatus: 'active',
    subscriptionValidUntil: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [enteringSupportId, setEnteringSupportId] = useState<string | null>(null);

  // Add client modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState({
    name: '',
    code: '',
    ownerName: '',
    ownerEmail: '',
    plan: 'Professional',
  });
  const [addingOrg, setAddingOrg] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    organization: ClientOrg;
    oneTimePassword: string;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const fetchOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/platform-list-organizations', {
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });

      if (res.status === 403) {
        setIsPlatformOwner(false);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to retrieve organizations.');
      }

      const json = await res.json();
      setOrganizations(json.organizations || []);
      setIsPlatformOwner(true);
    } catch (err: any) {
      setError(err?.message || 'Error communicating with platform admin service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingOrg(true);
    setError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/platform-create-organization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          organizationName: newOrgForm.name.trim(),
          organizationCode: newOrgForm.code.trim().toUpperCase() || undefined,
          ownerName: newOrgForm.ownerName.trim(),
          ownerEmail: newOrgForm.ownerEmail.trim().toLowerCase(),
          plan: newOrgForm.plan,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to create organization.');
      }

      const json = await res.json();
      setCreatedResult({
        organization: json.organization,
        oneTimePassword: json.oneTimePassword,
      });
      await fetchOrganizations();
    } catch (err: any) {
      setError(err?.message || 'Failed to create organization.');
    } finally {
      setAddingOrg(false);
    }
  };

  const handleToggleActive = async (orgId: string, currentActive: boolean) => {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/platform-set-organization-active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          organizationId: orgId,
          active: !currentActive,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        alert(`Error: ${err.error || 'Failed to update status'}`);
        return;
      }

      await fetchOrganizations();
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    }
  };

  const handleOpenEdit = (org: ClientOrg) => {
    setEditingOrg(org);
    setEditForm({
      plan: org.plan || org.data?.plan || 'Professional',
      maxUsers: org.maxUsers || org.data?.maxUsers || (org.plan === 'Enterprise' ? 50 : org.plan === 'Professional' ? 15 : 5),
      subscriptionStatus: org.subscriptionStatus || org.data?.subscriptionStatus || (org.active ? 'active' : 'suspended'),
      subscriptionValidUntil: org.subscriptionValidUntil || org.data?.subscriptionValidUntil || '',
    });
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;
    setSavingEdit(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/platform-update-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          organizationId: editingOrg.id,
          plan: editForm.plan,
          maxUsers: Number(editForm.maxUsers),
          subscriptionStatus: editForm.subscriptionStatus,
          subscriptionValidUntil: editForm.subscriptionValidUntil || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to update subscription.');
      }

      setEditingOrg(null);
      await fetchOrganizations();
    } catch (err: any) {
      alert(`Error updating subscription: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEnterSupport = async (org: ClientOrg) => {
    setEnteringSupportId(org.id);
    try {
      await enterSupportMode({
        id: org.id,
        name: org.name,
        code: org.code || '',
        active: org.active,
        plan: (org.plan || org.data?.plan || 'Professional') as any,
        createdAt: org.created_at,
      });
    } catch (err: any) {
      alert(`Failed to enter support view: ${err.message}`);
    } finally {
      setEnteringSupportId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2500);
  };

  if (isPlatformOwner === false) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center max-w-md mx-auto space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-base font-extrabold text-slate-900">Platform Owner Authority Required</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          The Clients management portal is restricted to verified <strong>aoihasu</strong> platform administrators configured in Cloudflare environment secrets.
        </p>
      </div>
    );
  }

  const filteredOrgs = organizations.filter(
    o =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.code && o.code.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Building2 className="w-5 h-5 text-sky-600" />
              Client Organizations (Platform Admin)
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 uppercase tracking-wider">
              aoihasu Staff
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Provision client companies and initialize their respective Company Owner logins. Client business data remains strictly isolated by Supabase Row-Level Security.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrganizations}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Refresh organizations list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManageCompanies && (
          <button
            onClick={() => {
              setCreatedResult(null);
              setNewOrgForm({
                name: '',
                code: '',
                ownerName: '',
                ownerEmail: '',
                plan: 'Professional',
              });
              setShowAddModal(true);
            }}
            className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add New Client Company
          </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search organizations by name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Total Clients: <strong className="text-slate-900">{organizations.length}</strong>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Client Company</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Subscription & Seats</th>
                <th className="py-3 px-4">Status & Validity</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading && organizations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading client organizations...
                  </td>
                </tr>
              ) : filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No client organizations found.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map(org => {
                  const planName = org.plan || org.data?.plan || 'Professional';
                  const maxSeats = org.maxUsers || (planName === 'Enterprise' ? 50 : planName === 'Professional' ? 15 : 5);
                  const activeSeats = org.userCount || 0;
                  const validUntil = org.subscriptionValidUntil || org.data?.subscriptionValidUntil;
                  const isExpired = validUntil && new Date(validUntil) < new Date();

                  return (
                    <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{org.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{org.id}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-600">
                        {org.code || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200 w-fit">
                            {planName}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-400" />
                            <strong>{activeSeats}</strong> / {maxSeats} active seats
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          {org.active && !isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 w-fit">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Active
                            </span>
                          ) : isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 w-fit">
                              <AlertCircle className="w-3 h-3 text-amber-600" /> Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 w-fit">
                              <XCircle className="w-3 h-3 text-rose-600" /> Suspended
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {validUntil ? `Valid: ${validUntil}` : 'Continuous / Lifetime'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        <div className="text-[11px] font-medium text-slate-700">
                          {org.lastActivity ? new Date(org.lastActivity).toLocaleDateString() : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {org.lastActivityDesc || 'Created'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setUsersOrg(org)}
                            className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold rounded-lg border border-sky-200 transition-colors cursor-pointer text-xs"
                            title="View this company's users and reset a password"
                          >
                            Users
                          </button>
                          {canOpenSupportView && (
                          <button
                            onClick={() => handleEnterSupport(org)}
                            disabled={enteringSupportId === org.id}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg border border-amber-200 transition-colors cursor-pointer text-xs flex items-center gap-1"
                            title="Open Audited Support View for this client"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {enteringSupportId === org.id ? 'Connecting...' : 'Support View'}
                          </button>
                          )}
                          {canManageCompanies && (
                            <>
                          <button
                            onClick={() => handleOpenEdit(org)}
                            className="p-1 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                            title="Edit Plan and User Seats"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(org.id, org.active)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                              org.active
                                ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {org.active ? 'Suspend' : 'Reactivate'}
                          </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Subscription Modal */}
      {editingOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-sky-600" />
                  Manage Plan & Seats
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Update subscription tier, user seat allocation, and validity for <strong>{editingOrg.name}</strong>.
                </p>
              </div>
              <button
                onClick={() => setEditingOrg(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubscription} className="space-y-4">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Subscription Plan</label>
                <select
                  value={editForm.plan}
                  onChange={e => {
                    const nextPlan = e.target.value;
                    const defaultSeats = nextPlan === 'Enterprise' ? 50 : nextPlan === 'Professional' ? 15 : 5;
                    setEditForm({ ...editForm, plan: nextPlan, maxUsers: defaultSeats });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="Starter">Starter Plan (5 Seats)</option>
                  <option value="Professional">Professional Plan (15 Seats)</option>
                  <option value="Enterprise">Enterprise Plan (50 Seats)</option>
                  <option value="Custom">Custom Enterprise Plan</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Max Active User Seats</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  required
                  value={editForm.maxUsers}
                  onChange={e => setEditForm({ ...editForm, maxUsers: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Enforces database constraint on profile creation and activation.
                </span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Subscription Status</label>
                <select
                  value={editForm.subscriptionStatus}
                  onChange={e => setEditForm({ ...editForm, subscriptionStatus: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspended</option>
                  <option value="past_due">Past Due</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Valid Until Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={editForm.subscriptionValidUntil}
                  onChange={e => setEditForm({ ...editForm, subscriptionValidUntil: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Leave blank for continuous / lifetime billing. Includes 7-day statutory grace period.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOrg(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Plan Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-sky-600" />
                  Onboard New Client Organization
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Provisions client tenant and generates one-time initial credentials for the Company Owner.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdResult ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Client Successfully Onboarded!
                  </div>
                  <p className="text-xs text-emerald-700">
                    Organization <strong>{createdResult.organization.name}</strong> is ready. Please copy and provide the one-time temporary password below to the client owner.
                  </p>
                </div>

                <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-amber-400" /> One-Time Temporary Password
                    </span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded">
                      Shown Only Once
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <code className="text-sm font-mono font-bold text-amber-400 tracking-wider">
                      {createdResult.oneTimePassword}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdResult.oneTimePassword)}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {copiedPassword ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Password
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    The client owner will be required to establish their confidential password upon first login.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-5 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 cursor-pointer"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateOrganization} className="space-y-4">
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Company Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Company Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Apex Footwear Mfg."
                        value={newOrgForm.name}
                        onChange={e => setNewOrgForm({ ...newOrgForm, name: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Company Code</label>
                      <input
                        type="text"
                        placeholder="e.g. APEX"
                        value={newOrgForm.code}
                        onChange={e => setNewOrgForm({ ...newOrgForm, code: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase focus:ring-1 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Subscription Plan</label>
                    <select
                      value={newOrgForm.plan}
                      onChange={e => setNewOrgForm({ ...newOrgForm, plan: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sky-500 focus:outline-none"
                    >
                      <option value="Starter">Starter Plan</option>
                      <option value="Professional">Professional Plan</option>
                      <option value="Enterprise">Enterprise Plan</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-purple-600" />
                    First Owner Credentials
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Owner Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sunil Mehra"
                        value={newOrgForm.ownerName}
                        onChange={e => setNewOrgForm({ ...newOrgForm, ownerName: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Owner Work Email *</label>
                      <input
                        type="email"
                        required
                        placeholder="owner@company.com"
                        value={newOrgForm.ownerEmail}
                        onChange={e => setNewOrgForm({ ...newOrgForm, ownerEmail: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingOrg}
                    className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {addingOrg ? 'Provisioning...' : 'Provision Client Organization'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {usersOrg && <CompanyUsersModal org={usersOrg} onClose={() => setUsersOrg(null)} />}
    </div>
  );
};
