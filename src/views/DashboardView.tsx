import React, { useState, useEffect } from 'react';
import {
  Users2,
  CalendarClock,
  AlertTriangle,
  FileSpreadsheet,
  IndianRupee,
  Boxes,
  TrendingUp,
  RefreshCw,
  Clock,
  ArrowRight,
  CheckCircle2,
  Package,
  ShoppingBag,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { FollowUp, Product, Lead, Quotation } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { QuotePipelineAnalyticsWidget } from '../components/pipeline/QuotePipelineAnalyticsWidget.tsx';
import { FollowUpSequenceModal } from '../components/pipeline/FollowUpSequenceModal.tsx';

interface DashboardViewProps {
  onNavigate: (tab: string, entityId?: string) => void;
  onQuickAction: (action: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onQuickAction }) => {
  const { activeCompanyId, isSuperAdmin, isAllTenantsView, currentUser } = useAuth();
  const [dashboardData, setDashboardData] = useState<{
    metrics: {
      totalLeads: number;
      newLeads: number;
      qualifiedLeads: number;
      followUpsDueToday: number;
      overdueFollowUps: number;
      openQuotations: number;
      ordersCount: number;
      totalSales: number;
      outstandingPayments: number;
      availableStock: number;
    };
    leadSources: Record<string, number>;
    pipeline: Record<string, number>;
  } | null>(null);

  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [activeFollowUpQuote, setActiveFollowUpQuote] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const comp = isSuperAdmin ? (isAllTenantsView ? 'all' : activeCompanyId) : (currentUser?.companyId || 'org-1');
      const [dash, followupsData, productsData, leadsData, quotesData] = await Promise.all([
        api.getDashboardMetrics(comp),
        api.getFollowUps({ status: 'Pending', companyId: comp }),
        api.getProducts({ companyId: comp }),
        api.getLeads({ companyId: comp }),
        api.getQuotations(),
      ]);
      setDashboardData(dash);
      setFollowups(followupsData.slice(0, 5));
      setLowStockProducts(productsData.filter(p => p.currentStock <= p.minStock));
      setRecentLeads(leadsData.slice(0, 5));
      setQuotations(quotesData || []);
    } catch (err: any) {
      console.error('Failed to load dashboard data', err);
      setError(err?.message || 'Failed to load dashboard metrics from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeCompanyId, isAllTenantsView]);

  const formatCurrency = (amt: number = 0) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amt);
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600"></div>
        <p className="text-sm text-slate-500 font-medium">Loading dashboard metrics...</p>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="p-8 bg-rose-50 border border-rose-200 rounded-2xl text-center max-w-xl mx-auto my-12">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-rose-900 mb-1">Failed to Load Dashboard</h3>
        <p className="text-sm text-rose-700 mb-4">{error}</p>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  const m = dashboardData?.metrics;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white p-6 sm:p-8 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-500/20 text-sky-300 border border-sky-400/30 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
            StockItEase CRM & Inventory
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Inventory & Business Management Center
          </h1>
          <p className="text-slate-300 mt-1 text-sm sm:text-base max-w-xl">
            Live pipeline tracking, multi-channel leads sync, stock control, and automated GST quotations engine.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => onQuickAction('new-lead')}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-lg shadow-sky-500/25 transition-all"
          >
            <Users2 className="w-4 h-4" />
            + New Lead
          </button>
          <button
            onClick={() => onQuickAction('new-quotation')}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg font-medium text-sm flex items-center gap-2 transition-all backdrop-blur-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            + Create Quote
          </button>
          <button
            onClick={() => onNavigate('orders')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all"
          >
            <ShoppingBag className="w-4 h-4" />
            Sales Orders
          </button>
          <button
            onClick={loadData}
            title="Refresh statistics"
            className="p-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Leads */}
        <div
          onClick={() => onNavigate('leads')}
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Leads</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
              <Users2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">{m?.totalLeads || 0}</h3>
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" />
              {m?.newLeads || 0} new
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Qualified: <strong className="text-slate-800">{m?.qualifiedLeads || 0}</strong></span>
            <span className="text-sky-600 group-hover:translate-x-0.5 transition flex items-center gap-0.5">
              View <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Pipeline & Open Quotes */}
        <div
          onClick={() => onNavigate('quotations')}
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Open Quotations</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">
              {m?.openQuotations || 0} <span className="text-sm font-normal text-slate-500">active</span>
            </h3>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Total Orders: <strong className="text-slate-800">{m?.ordersCount || 0}</strong></span>
            <span className="text-indigo-600 group-hover:translate-x-0.5 transition flex items-center gap-0.5">
              Quotes <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Total Sales & Outstanding */}
        <div
          onClick={() => onNavigate('orders')}
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sales</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">
              {formatCurrency(m?.totalSales || 0)}
            </h3>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Pending: <strong className="text-rose-600">{formatCurrency(m?.outstandingPayments || 0)}</strong></span>
            <span className="text-emerald-600 group-hover:translate-x-0.5 transition flex items-center gap-0.5">
              Orders <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Inventory Stock & Alerts */}
        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock & Follow-ups</span>
            <div className={`p-2 rounded-lg transition ${
              lowStockProducts.length > 0
                ? 'bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white'
                : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
            }`}>
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">
              {m?.availableStock || 0} <span className="text-sm font-normal text-slate-500">units</span>
            </h3>
            {lowStockProducts.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                <AlertTriangle className="w-3 h-3" />
                {lowStockProducts.length} low
              </span>
            ) : (
              <span className="text-xs text-emerald-600 font-medium">Optimal</span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Follow-ups due today: <strong className="text-slate-800">{m?.followUpsDueToday || 0}</strong></span>
            <span className="text-amber-600 group-hover:translate-x-0.5 transition flex items-center gap-0.5">
              Stock <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Quote Status Badges Strip */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div>
            <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-sky-600" />
              Quote Lifecycle Status Badges ({quotations.length} Active Deals)
            </h3>
            <p className="text-[11px] text-slate-500">
              Clear visual distribution of quotes across the sales pipeline. Click any badge to open in Kanban.
            </p>
          </div>
          <button
            onClick={() => onNavigate('pipeline')}
            className="text-xs text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1 self-start sm:self-auto"
          >
            Open Post-Quoting Pipeline <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            {
              status: 'Draft',
              label: 'Draft Quotes',
              count: quotations.filter(q => q.status === 'Draft').length,
              color: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100',
              badgeColor: 'bg-slate-200 text-slate-700',
            },
            {
              status: 'Sent',
              label: 'Quote Sent',
              count: quotations.filter(q => q.status === 'Sent').length,
              color: 'bg-sky-50 text-sky-900 border-sky-200 hover:bg-sky-100/80',
              badgeColor: 'bg-sky-600 text-white',
            },
            {
              status: 'Viewed',
              label: 'Viewed by Client',
              count: quotations.filter(q => q.status === 'Viewed').length,
              color: 'bg-teal-50 text-teal-900 border-teal-200 hover:bg-teal-100/80',
              badgeColor: 'bg-teal-600 text-white',
            },
            {
              status: 'Negotiation',
              label: 'Negotiation / Review',
              count: quotations.filter(q => q.status === 'Negotiation').length,
              color: 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100/80',
              badgeColor: 'bg-purple-600 text-white',
            },
            {
              status: 'Accepted',
              label: 'Closed-Won',
              count: quotations.filter(q => q.status === 'Accepted' || q.status === 'Converted').length,
              color: 'bg-emerald-50 text-emerald-950 border-emerald-200 hover:bg-emerald-100/80',
              badgeColor: 'bg-emerald-600 text-white',
            },
            {
              status: 'Rejected',
              label: 'Closed-Lost',
              count: quotations.filter(q => q.status === 'Rejected').length,
              color: 'bg-rose-50 text-rose-950 border-rose-200 hover:bg-rose-100/80',
              badgeColor: 'bg-rose-600 text-white',
            },
            {
              status: 'Expired',
              label: 'Expired',
              count: quotations.filter(q => q.status === 'Expired').length,
              color: 'bg-amber-50 text-amber-950 border-amber-200 hover:bg-amber-100/80',
              badgeColor: 'bg-amber-500 text-white',
            },
          ].map(badge => (
            <button
              key={badge.status}
              type="button"
              onClick={() => onNavigate('pipeline')}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${badge.color}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">{badge.status}</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${badge.badgeColor}`}>
                  {badge.count}
                </span>
              </div>
              <span className="text-[11px] font-semibold truncate">{badge.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Post-Quoting Pipeline Velocity & Analytics Widget */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-600" />
            Post-Quoting Sales Pipeline &amp; Close Velocity Analytics
          </h2>
          <button
            onClick={() => onNavigate('pipeline')}
            className="text-xs text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1"
          >
            Kanban Board View <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <QuotePipelineAnalyticsWidget
          quotations={quotations}
          onOpenStalledQuotes={() => onNavigate('pipeline')}
          onOpenFollowUpModal={q => setActiveFollowUpQuote(q)}
        />
      </div>

      {/* Row 2: Follow-ups due & Low stock alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Due Follow-ups Widget */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-sky-600" />
              <h2 className="font-bold text-slate-900">Urgent & Due Follow-ups</h2>
            </div>
            <button
              onClick={() => onNavigate('follow-ups')}
              className="text-xs text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1"
            >
              View All ({m?.followUpsDueToday || 0} due today) <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {followups.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2" />
              <p className="text-sm font-medium text-slate-600">All follow-ups are up to date!</p>
              <p className="text-xs text-slate-400">Great job staying on top of footwear machinery enquiries.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {followups.map((f) => (
                <div key={f.id} className="py-3 flex items-center justify-between gap-4 hover:bg-slate-50 px-2 rounded-lg transition">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700">
                        {f.followUpType}
                      </span>
                      <span className="font-semibold text-slate-900 text-sm truncate">
                        {f.entityName || 'Lead / Customer'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">{f.notes || 'Routine follow-up'}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {f.date} {f.time || ''}
                    </span>
                    <button
                      onClick={() => onNavigate('follow-ups', f.id)}
                      className="px-2.5 py-1 text-xs font-medium text-sky-600 hover:text-sky-700 bg-sky-50 rounded border border-sky-200"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock Warning Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-slate-900">Low Stock Machinery</h2>
            </div>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs text-amber-600 hover:text-amber-700 font-semibold"
            >
              Inventory
            </button>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-slate-400">
              <Package className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-600">Stock levels healthy</p>
              <p className="text-xs text-slate-400">All machines above minimum thresholds</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lowStockProducts.map(p => (
                <div key={p.id} className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-center justify-between">
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 truncate">{p.name}</h4>
                    <p className="text-[11px] text-slate-500 font-mono">Mod: {p.modelNumber}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded">
                      {p.currentStock} in stock
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Min: {p.minStock}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Recent Enquiries & Lead Source Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Inbound Leads */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <Users2 className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900">Recent Machine Enquiries</h2>
            </div>
            <button
              onClick={() => onNavigate('leads')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
            >
              All Leads <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 font-semibold">
                <tr>
                  <th className="pb-2">Company / Buyer</th>
                  <th className="pb-2">Requirement</th>
                  <th className="pb-2">Source</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLeads.map(lead => (
                  <tr key={lead.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5">
                      <div className="font-bold text-slate-900">{lead.companyName || lead.contactPerson}</div>
                      <div className="text-[11px] text-slate-500">{lead.mobile} • {lead.city || 'India'}</div>
                    </td>
                    <td className="py-2.5 max-w-xs">
                      <span className="text-slate-700 font-medium truncate block">
                        {lead.productInterested || lead.requirement || 'General Inquiry'}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        lead.source === 'IndiaMART' ? 'bg-orange-100 text-orange-800' :
                        lead.source === 'WhatsApp' ? 'bg-emerald-100 text-emerald-800' :
                        lead.source === 'Website' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {lead.source}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800">
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => onNavigate('leads', lead.id)}
                        className="px-2 py-1 text-[11px] font-semibold text-sky-600 hover:text-sky-800 bg-sky-50 rounded"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lead Source Breakdown Chart / Summary */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col">
          <h2 className="font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">
            Enquiry Channels
          </h2>

          <div className="space-y-3.5 flex-1">
            {Object.entries(dashboardData?.leadSources || { IndiaMART: 12, Website: 8, WhatsApp: 10, Referral: 4 }).map(([src, count]) => (
              <div key={src} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">{src}</span>
                  <span className="font-bold text-slate-900">{count} leads</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-sky-600 h-2 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(10, ((count as number) / 30) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <span className="text-xs text-slate-500">
              Integrated with automatic duplicate detection & WhatsApp click-to-chat
            </span>
          </div>
        </div>
      </div>

      {activeFollowUpQuote && (
        <FollowUpSequenceModal
          quotation={activeFollowUpQuote}
          onClose={() => setActiveFollowUpQuote(null)}
          onSuccess={() => {
            setActiveFollowUpQuote(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};
