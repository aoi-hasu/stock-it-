import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Phone,
  MessageCircle,
  Mail,
  Users,
  FileText,
  X,
  Building,
} from 'lucide-react';
import { Communication, CommunicationType } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';

export const CommunicationsView: React.FC = () => {
  const { currentUser } = useAuth();
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [form, setForm] = useState({
    entityName: '',
    type: 'Phone Call' as CommunicationType,
    direction: 'Outbound' as 'Inbound' | 'Outbound',
    message: '',
    outcome: '',
  });

  const loadCommunications = async () => {
    setLoading(true);
    try {
      const data = await api.getCommunications();
      setCommunications(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommunications();
  }, []);

  const handleCreateComm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCommunication({
        ...form,
        userId: currentUser?.id,
        userName: currentUser?.name || 'Sales Representative',
      });
      setShowAddModal(false);
      setForm({
        entityName: '',
        type: 'Phone Call',
        direction: 'Outbound',
        message: '',
        outcome: '',
      });
      loadCommunications();
    } catch (err: any) {
      alert(`Error logging communication: ${err.message}`);
    }
  };

  const filtered = communications.filter(c => {
    const matchType = typeFilter === 'all' || c.type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch =
      c.entityName.toLowerCase().includes(q) ||
      c.message.toLowerCase().includes(q) ||
      (c.outcome && c.outcome.toLowerCase().includes(q));
    return matchType && matchSearch;
  });

  const getIcon = (type: CommunicationType) => {
    switch (type) {
      case 'Phone Call':
        return <Phone className="w-4 h-4 text-indigo-600" />;
      case 'WhatsApp':
        return <MessageCircle className="w-4 h-4 text-emerald-600" />;
      case 'Email':
        return <Mail className="w-4 h-4 text-sky-600" />;
      case 'Meeting':
        return <Users className="w-4 h-4 text-amber-600" />;
      default:
        return <FileText className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-sky-600" />
            Unified Communication History & Call Logs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Omnichannel conversation timeline covering WhatsApp inquiries, phone calls, site visit meetings, and emails
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> + Log Interaction
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2.5 items-center justify-between">
        <div className="flex flex-wrap gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search contact, company, keywords..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
            />
          </div>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
          >
            <option value="all">All Channels</option>
            <option value="Phone Call">Phone Call</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Email">Email</option>
            <option value="Meeting">Meeting / Site Demo</option>
            <option value="Notes">Internal Notes</option>
          </select>
        </div>

        <button
          onClick={loadCommunications}
          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Timeline List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
            Loading communication log...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <MessageSquare className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">No interaction logs found</p>
          </div>
        ) : (
          filtered.map(comm => (
            <div
              key={comm.id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-sky-300 transition-all flex items-start gap-3.5 text-xs"
            >
              <div className="p-2.5 rounded-xl bg-slate-100 shrink-0">
                {getIcon(comm.type)}
              </div>

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900">{comm.entityName}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      {comm.type}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      comm.direction === 'Inbound'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {comm.direction}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(comm.timestamp).toLocaleString()}
                  </span>
                </div>

                <p className="text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {comm.message}
                </p>

                {comm.outcome && (
                  <p className="text-[11px] text-sky-800 font-semibold">
                    Outcome / Next Action: {comm.outcome}
                  </p>
                )}

                <p className="text-[10px] text-slate-400 pt-0.5">
                  Logged by: <strong className="text-slate-700">{comm.userName}</strong>
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Log Customer Interaction</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateComm} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Customer / Lead Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Calico Leather Crafts"
                  value={form.entityName}
                  onChange={e => setForm({ ...form, entityName: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Channel Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value as any })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="Phone Call">Phone Call</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Email">Email</option>
                    <option value="Meeting">Meeting / Plant Visit</option>
                    <option value="Notes">Internal Note</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Direction</label>
                  <select
                    value={form.direction}
                    onChange={e => setForm({ ...form, direction: e.target.value as any })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="Outbound">Outbound (We initiated)</option>
                    <option value="Inbound">Inbound (Customer called)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Conversation Summary *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Details of discussion..."
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Outcome / Result</label>
                <input
                  type="text"
                  placeholder="e.g. Trial requested, price approved"
                  value={form.outcome}
                  onChange={e => setForm({ ...form, outcome: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Save Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
