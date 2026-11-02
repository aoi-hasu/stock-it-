import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building,
  Globe,
  Code2,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Download,
  AlertCircle,
  Copy,
  Key,
  ShieldAlert,
  Lock,
  Smartphone,
  Sparkles,
  Check,
} from 'lucide-react';
import { CompanySettings, IntegrationSettings } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface IntegrationRecord {
  id: string;
  company_id: string;
  kind: 'indiamart' | 'whatsapp' | 'website';
  whatsapp_phone_number_id?: string;
  allowed_origins?: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  webhookUrlTemplate?: string;
}

const TenantIntegrationsManager: React.FC = () => {
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newlyGenerated, setNewlyGenerated] = useState<{
    kind: string;
    token: string;
    webhookUrl: string;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  // Form states per kind
  const [waPhoneId, setWaPhoneId] = useState('');
  const [webOrigins, setWebOrigins] = useState('');

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const data = await api.getTenantIntegrations();
      setIntegrations(data);
      const wa = data.find(i => i.kind === 'whatsapp');
      if (wa?.whatsapp_phone_number_id) setWaPhoneId(wa.whatsapp_phone_number_id);
      const web = data.find(i => i.kind === 'website');
      if (web?.allowed_origins) setWebOrigins(web.allowed_origins.join(', '));
    } catch (err) {
      console.error('Failed to load integrations', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const handleGenerateToken = async (kind: 'indiamart' | 'whatsapp' | 'website') => {
    setActionLoading(kind);
    try {
      const allowedOrigins = kind === 'website'
        ? webOrigins.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : undefined;

      const res = await api.manageTenantIntegration({
        action: 'generate',
        kind,
        whatsappPhoneNumberId: kind === 'whatsapp' ? waPhoneId.trim() : undefined,
        allowedOrigins,
      });

      if (res.token && res.webhookUrl) {
        setNewlyGenerated({
          kind,
          token: res.token,
          webhookUrl: res.webhookUrl,
        });
        await loadIntegrations();
      }
    } catch (err: any) {
      alert(`Failed to generate token: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveConfig = async (kind: 'whatsapp' | 'website') => {
    setActionLoading(`save-${kind}`);
    try {
      const allowedOrigins = kind === 'website'
        ? webOrigins.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : undefined;

      await api.manageTenantIntegration({
        action: 'update',
        kind,
        whatsappPhoneNumberId: kind === 'whatsapp' ? waPhoneId.trim() : undefined,
        allowedOrigins,
      });
      alert('Configuration updated successfully.');
      await loadIntegrations();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const origin = window.location.origin;

  const indiamartRecord = integrations.find(i => i.kind === 'indiamart');
  const whatsappRecord = integrations.find(i => i.kind === 'whatsapp');
  const websiteRecord = integrations.find(i => i.kind === 'website');

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
            <Lock className="w-4 h-4 text-sky-600" />
            Multi-Tenant Webhook Credentials & Inbound Integrations
          </h3>
          <p className="text-slate-500 mt-1">
            Generate and rotate cryptographically secure tokens for IndiaMART, WhatsApp, and your company website.
            Each token is hashed using SHA-256 before storage — the raw token is shown only once upon generation.
          </p>
        </div>
        <button
          onClick={loadIntegrations}
          disabled={loading}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg flex items-center gap-1.5 cursor-pointer text-xs shrink-0 self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Status
        </button>
      </div>

      {/* Token Reveal Modal */}
      {newlyGenerated && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-slate-800 space-y-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-extrabold text-amber-900 text-sm">
                New {newlyGenerated.kind.toUpperCase()} Secret Token Generated (Shown Once Only)
              </h4>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                Copy and securely save this token now. For zero-trust multi-tenant isolation, only the SHA-256 hash is stored on our servers. Once this window is closed or refreshed, the token cannot be retrieved.
              </p>
            </div>
          </div>

          <div className="space-y-3 bg-white p-4 rounded-xl border border-amber-200">
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Secret Token</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  readOnly
                  value={newlyGenerated.token}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold select-all text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(newlyGenerated.token);
                    setCopiedToken(true);
                    setTimeout(() => setCopiedToken(false), 2000);
                  }}
                  className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedToken ? 'Copied' : 'Copy Token'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Your Complete Webhook URL</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  readOnly
                  value={newlyGenerated.webhookUrl}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono select-all text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(newlyGenerated.webhookUrl);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 2000);
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setNewlyGenerated(null)}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg cursor-pointer text-xs"
            >
              I Have Saved My Secret Token
            </button>
          </div>
        </div>
      )}

      {/* 3 Integrations Cards */}
      <div className="grid grid-cols-1 gap-6">
        {/* 1. IndiaMART */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 font-extrabold flex items-center justify-center text-sm">
                IM
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">IndiaMART Push API Webhook</h4>
                <p className="text-[11px] text-slate-500">
                  Receives buyer enquiries directly from IndiaMART Push API in real-time with automatic duplicate enquiry tracking.
                </p>
              </div>
            </div>
            <div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                  indiamartRecord?.active
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {indiamartRecord?.active ? 'Active & Configured' : 'Token Not Generated'}
              </span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">Webhook Endpoint URL</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${origin}/api/webhooks-indiamart?token=YOUR_TOKEN`);
                  setCopiedEndpoint('im');
                  setTimeout(() => setCopiedEndpoint(null), 2000);
                }}
                className="text-[10px] font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer"
              >
                {copiedEndpoint === 'im' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copiedEndpoint === 'im' ? 'Copied' : 'Copy Endpoint'}
              </button>
            </div>
            <code className="block p-2 bg-slate-50 rounded-lg text-[11px] text-slate-800 font-mono select-all break-all">
              {origin}/api/webhooks-indiamart?token=&lt;YOUR_SECRET_TOKEN&gt;
            </code>
            <p className="text-[10px] text-slate-400">
              Paste this URL into your IndiaMART seller dashboard under Lead Manager &gt; CRM Integration.
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500">
              {indiamartRecord ? `Token active (SHA-256 hash verified)` : 'Generate a secret token to activate this endpoint'}
            </span>
            <button
              type="button"
              disabled={actionLoading === 'indiamart'}
              onClick={() => handleGenerateToken('indiamart')}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-50"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{indiamartRecord ? 'Rotate Token' : 'Generate Secret Token'}</span>
            </button>
          </div>
        </div>

        {/* 2. Meta WhatsApp Cloud API */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">Meta WhatsApp Cloud API Webhook</h4>
                <p className="text-[11px] text-slate-500">
                  Maps incoming WhatsApp chats to your company, auto-creates leads for new numbers, and links communications.
                </p>
              </div>
            </div>
            <div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                  whatsappRecord?.active
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {whatsappRecord?.active ? 'Active & Configured' : 'Token Not Generated'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">
                WhatsApp Phone Number ID (From Meta Developer Portal)
              </label>
              <input
                type="text"
                placeholder="e.g. 104829104810294"
                value={waPhoneId}
                onChange={e => setWaPhoneId(e.target.value)}
                className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Webhook Verification URL</label>
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="text"
                  readOnly
                  value={`${origin}/api/webhooks-whatsapp?token=<YOUR_TOKEN>`}
                  className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono select-all text-slate-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${origin}/api/webhooks-whatsapp?token=YOUR_TOKEN`);
                    setCopiedEndpoint('wa');
                    setTimeout(() => setCopiedEndpoint(null), 2000);
                  }}
                  className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                >
                  {copiedEndpoint === 'wa' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={actionLoading === 'save-whatsapp'}
              onClick={() => handleSaveConfig('whatsapp')}
              className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl cursor-pointer text-xs"
            >
              Save Phone Number ID
            </button>
            <button
              type="button"
              disabled={actionLoading === 'whatsapp'}
              onClick={() => handleGenerateToken('whatsapp')}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-50"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{whatsappRecord ? 'Rotate Token' : 'Generate Secret Token'}</span>
            </button>
          </div>
        </div>

        {/* 3. Website Form Lead Capture */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center text-sm">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">Company Website Lead Capture Form</h4>
                <p className="text-[11px] text-slate-500">
                  Accepts inquiries submitted from your marketing website with Origin protection and automatic salesperson assignment.
                </p>
              </div>
            </div>
            <div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                  websiteRecord?.active
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {websiteRecord?.active ? 'Active & Configured' : 'Token Not Generated'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">
                Allowed Website Origins (Required for CORS security, comma-separated)
              </label>
              <input
                type="text"
                placeholder="https://yourcompany.com, https://www.yourcompany.com"
                value={webOrigins}
                onChange={e => setWebOrigins(e.target.value)}
                className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Submissions from domains not listed here will be blocked immediately (HTTP 403).
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Target Endpoint</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${origin}/api/leads-capture?token=YOUR_TOKEN`);
                    setCopiedEndpoint('web');
                    setTimeout(() => setCopiedEndpoint(null), 2000);
                  }}
                  className="text-[10px] font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer"
                >
                  {copiedEndpoint === 'web' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedEndpoint === 'web' ? 'Copied' : 'Copy Endpoint'}
                </button>
              </div>
              <code className="block p-2 bg-slate-50 rounded-lg text-[11px] text-slate-800 font-mono select-all break-all">
                {origin}/api/leads-capture?token=&lt;YOUR_SECRET_TOKEN&gt;
              </code>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={actionLoading === 'save-website'}
              onClick={() => handleSaveConfig('website')}
              className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl cursor-pointer text-xs"
            >
              Save Allowed Origins
            </button>
            <button
              type="button"
              disabled={actionLoading === 'website'}
              onClick={() => handleGenerateToken('website')}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-50"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{websiteRecord ? 'Rotate Token' : 'Generate Secret Token'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const { currentTenant } = useAuth();
  const [activeTab, setActiveTab] = useState<'company' | 'integrations' | 'embed' | 'backup'>('company');
  const [companyForm, setCompanyForm] = useState<CompanySettings | null>(null);
  const [integrationsForm, setIntegrationsForm] = useState<IntegrationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Test simulation states
  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.getSettings();
      setCompanyForm(res.company);
      setIntegrationsForm(res.integrations);
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [currentTenant?.id]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm) return;
    setSaving(true);
    try {
      await api.updateCompanySettings(companyForm);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`Error saving company details: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadFullBackup = async () => {
    try {
      const backup = await api.exportFullBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `StockItEase_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Backup failed: ${err.message}`);
    }
  };

  if (loading || !companyForm || !integrationsForm) {
    return (
      <div className="py-20 text-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-600 mb-2" />
        Loading system configuration...
      </div>
    );
  }

  const websiteEmbedSnippet = `curl -X POST "${window.location.origin}/api/leads-capture" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_WEBSITE_LEAD_SECRET" \\
  -d '{
    "companyName": "Acme Industries",
    "contactPerson": "Jane Smith",
    "mobile": "9876543210",
    "email": "jane@acme.test",
    "productInterested": "Machinery",
    "requirement": "Inquiry specifications"
  }'`;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-600" />
            Company Settings & System Configuration
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure your company profile, quotation and invoice terms, banking information, and integration status.
          </p>
        </div>

        {saveSuccess && (
          <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" /> Settings Saved Successfully
          </span>
        )}
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('company')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'company'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building className="w-4 h-4" /> Company & Bank Profile
        </button>

        <button
          onClick={() => setActiveTab('integrations')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'integrations'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Globe className="w-4 h-4" /> Integrations Status
        </button>

        <button
          onClick={() => setActiveTab('embed')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'embed'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Code2 className="w-4 h-4" /> Website Lead Capture
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'backup'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> Data Snapshot & Backup
        </button>
      </div>

      {/* Tab 1: Company Profile & Bank Details */}
      {activeTab === 'company' && (
        <form onSubmit={handleSaveCompany} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5 text-xs">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">Company Business Information</h3>
            <p className="text-slate-500">Appears on official quotation PDFs, tax invoices, orders, and documents.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Legal Entity Name</label>
              <input
                type="text"
                required
                value={companyForm.companyName}
                onChange={e => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Brand Tagline / Specialty</label>
              <input
                type="text"
                value={companyForm.tagline}
                onChange={e => setCompanyForm({ ...companyForm, tagline: e.target.value })}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Registered Address</label>
              <input
                type="text"
                value={companyForm.address}
                onChange={e => setCompanyForm({ ...companyForm, address: e.target.value })}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">City & State</label>
              <input
                type="text"
                value={`${companyForm.city}${companyForm.state ? ', ' + companyForm.state : ''}`}
                onChange={e => {
                  const parts = e.target.value.split(',');
                  setCompanyForm({ ...companyForm, city: parts[0]?.trim() || '', state: parts[1]?.trim() || '' });
                }}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Pincode</label>
              <input
                type="text"
                value={companyForm.pincode}
                onChange={e => setCompanyForm({ ...companyForm, pincode: e.target.value })}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">GSTIN</label>
              <input
                type="text"
                value={companyForm.gstin}
                onChange={e => setCompanyForm({ ...companyForm, gstin: e.target.value.toUpperCase() })}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">PAN</label>
              <input
                type="text"
                value={companyForm.pan}
                onChange={e => setCompanyForm({ ...companyForm, pan: e.target.value.toUpperCase() })}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Phone</label>
              <input
                type="text"
                value={companyForm.phone}
                onChange={e => setCompanyForm({ ...companyForm, phone: e.target.value })}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Official Email</label>
              <input
                type="email"
                value={companyForm.email}
                onChange={e => setCompanyForm({ ...companyForm, email: e.target.value })}
                className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="font-extrabold text-slate-900 text-sm mb-1">Bank Account (for Invoice & Quotation PDFs)</h3>
            <p className="text-slate-500 mb-3">Printed on generated customer documents for RTGS/NEFT payments.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Bank Name</label>
                <input
                  type="text"
                  value={companyForm.bankName}
                  onChange={e => setCompanyForm({ ...companyForm, bankName: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Branch Name</label>
                <input
                  type="text"
                  value={companyForm.bankBranch}
                  onChange={e => setCompanyForm({ ...companyForm, bankBranch: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Account Number</label>
                <input
                  type="text"
                  value={companyForm.accountNumber}
                  onChange={e => setCompanyForm({ ...companyForm, accountNumber: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">IFSC Code</label>
                <input
                  type="text"
                  value={companyForm.ifscCode}
                  onChange={e => setCompanyForm({ ...companyForm, ifscCode: e.target.value.toUpperCase() })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="font-extrabold text-slate-900 text-sm mb-1">Tax Classification (HSN / SAC)</h3>
            <p className="text-slate-500 mb-3">Default code printed on quotations and tax invoices for your products.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Default HSN / SAC Code</label>
                <input
                  type="text"
                  value={companyForm.defaultHsnCode || ''}
                  onChange={e => setCompanyForm({ ...companyForm, defaultHsnCode: e.target.value.trim() })}
                  placeholder="e.g. 84532000"
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Description (optional)</label>
                <input
                  type="text"
                  value={companyForm.defaultHsnDescription || ''}
                  onChange={e => setCompanyForm({ ...companyForm, defaultHsnDescription: e.target.value })}
                  placeholder="e.g. Machinery for making or repairing footwear"
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="font-extrabold text-slate-900 text-sm mb-1">Prefixes & Commercial Terms</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Quotation Prefix</label>
                <input
                  type="text"
                  value={companyForm.quotationPrefix}
                  onChange={e => setCompanyForm({ ...companyForm, quotationPrefix: e.target.value.toUpperCase() })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Order Prefix</label>
                <input
                  type="text"
                  value={companyForm.orderPrefix}
                  onChange={e => setCompanyForm({ ...companyForm, orderPrefix: e.target.value.toUpperCase() })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Invoice Prefix</label>
                <input
                  type="text"
                  value={companyForm.invoicePrefix || 'INV'}
                  onChange={e => setCompanyForm({ ...companyForm, invoicePrefix: e.target.value.toUpperCase() })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Default Payment Terms</label>
                <textarea
                  rows={2}
                  value={companyForm.defaultPaymentTerms}
                  onChange={e => setCompanyForm({ ...companyForm, defaultPaymentTerms: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Default Delivery Terms</label>
                <textarea
                  rows={2}
                  value={companyForm.defaultDeliveryTerms}
                  onChange={e => setCompanyForm({ ...companyForm, defaultDeliveryTerms: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Default Warranty Terms</label>
                <textarea
                  rows={2}
                  value={companyForm.defaultWarrantyTerms}
                  onChange={e => setCompanyForm({ ...companyForm, defaultWarrantyTerms: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving Changes...' : 'Save Company Details'}
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Integrations Status & Token Management */}
      {activeTab === 'integrations' && (
        <TenantIntegrationsManager />
      )}

      {/* Tab 3: Website Lead Capture Embed */}
      {activeTab === 'embed' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5 text-xs">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">Website Lead Capture Server Integration</h3>
            <p className="text-slate-500">
              Forward inquiries from your website backend or form handler directly to StockItEase using this secure cURL payload.
            </p>
          </div>

          <div className="relative bg-slate-900 p-4 rounded-xl text-slate-200 font-mono text-xs overflow-x-auto">
            <button
              onClick={() => {
                navigator.clipboard.writeText(websiteEmbedSnippet);
                setCopiedSnippet(true);
                setTimeout(() => setCopiedSnippet(false), 2000);
              }}
              className="absolute top-3 right-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center gap-1.5 cursor-pointer text-xs"
            >
              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSnippet ? 'Copied' : 'Copy HTML'}</span>
            </button>
            <pre className="pr-24">{websiteEmbedSnippet}</pre>
          </div>

          <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-3 text-slate-300">
            <h4 className="font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Server-to-Server Webhook Dispatch (cURL)
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Because browsers cannot safely store secrets, lead submissions must be dispatched directly from your secure backend server or marketing form handler using your secret <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded">WEBSITE_LEAD_SECRET</code>.
            </p>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-sky-400 overflow-x-auto select-all">
              curl -X POST "https://your-domain.pages.dev/api/leads-capture" \<br />
              &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
              &nbsp;&nbsp;-H "X-API-Key: YOUR_WEBSITE_LEAD_SECRET" \<br />
              &nbsp;&nbsp;-d '&#123;<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"companyName": "Acme Industries",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"contactPerson": "Jane Smith",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"mobile": "9876543210",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"email": "jane@acme.test",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"productInterested": "Machinery Unit",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"requirement": "Pricing and availability requested"<br />
              &nbsp;&nbsp;&#125;'
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Backup */}
      {activeTab === 'backup' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 text-xs">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">Data Snapshot & Export</h3>
            <p className="text-slate-500">
              Download a complete JSON export of your company records (leads, customers, products, quotations, orders, payments) for offline auditing.
            </p>
          </div>

          <div className="p-4 bg-sky-50 rounded-xl border border-sky-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-sky-900">Encrypted Snapshot Download</p>
              <p className="text-sky-700 text-[11px]">Exports all structured records visible to your account.</p>
            </div>
            <button
              onClick={handleDownloadFullBackup}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Export JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
