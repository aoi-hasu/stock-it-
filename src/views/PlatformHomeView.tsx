import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, PauseCircle, Clock, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { platformFetch } from './platformApi';

interface Org {
  id: string;
  name: string;
  active: boolean;
  subscriptionStatus?: string;
  subscriptionValidUntil?: string;
  userCount?: number;
  lastActivity?: string;
  lastActivityDesc?: string;
}

const daysUntil = (d?: string): number | null => {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return null;
  return Math.ceil((new Date(d.slice(0, 10)).getTime() - Date.now()) / 86400000);
};

export const PlatformHomeView: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const { currentUser, platformRole } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const json = await platformFetch<{ organizations: Org[] }>('/api/platform-list-organizations');
        setOrgs(json.organizations || []);
      } catch (e: any) {
        setError(e?.message || 'Could not load companies.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const active = orgs.filter(o => o.active).length;
  const suspended = orgs.length - active;
  const expiring = orgs.filter(o => {
    const d = daysUntil(o.subscriptionValidUntil);
    return o.active && d !== null && d <= 30;
  });
  const totalUsers = orgs.reduce((n, o) => n + (o.userCount || 0), 0);

  const tiles = [
    { label: 'Client companies', value: orgs.length, icon: Building2 },
    { label: 'Active', value: active, icon: CheckCircle2 },
    { label: 'Suspended', value: suspended, icon: PauseCircle },
    { label: 'Expiring in 30 days', value: expiring.length, icon: Clock },
    { label: 'Active users (all clients)', value: totalUsers, icon: Users },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Welcome, {currentUser?.name}</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          StockItEase platform console · your role: <strong className="capitalize">{platformRole || 'owner'}</strong>
        </p>
      </div>

      {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <t.icon className="w-4 h-4 text-sky-600 mb-2" />
            <div className="text-2xl font-bold text-slate-900">{loading ? '–' : t.value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Needs attention</h2>
          <button onClick={() => onNavigate('clients')} className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer">
            Open Client Companies
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {orgs.filter(o => !o.active).map(o => (
            <div key={o.id} className="px-4 py-2.5 text-xs flex justify-between">
              <span className="font-medium text-slate-800">{o.name}</span>
              <span className="text-rose-700">Suspended</span>
            </div>
          ))}
          {expiring.map(o => {
            const d = daysUntil(o.subscriptionValidUntil) as number;
            return (
              <div key={o.id} className="px-4 py-2.5 text-xs flex justify-between">
                <span className="font-medium text-slate-800">{o.name}</span>
                <span className="text-amber-700">{d < 0 ? `Expired ${-d} day(s) ago` : `Expires in ${d} day(s)`}</span>
              </div>
            );
          })}
          {!loading && suspended === 0 && expiring.length === 0 && (
            <div className="px-4 py-6 text-xs text-slate-500 text-center">Nothing needs attention.</div>
          )}
        </div>
      </div>
    </div>
  );
};
