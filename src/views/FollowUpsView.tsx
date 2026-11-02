import React, { useState, useEffect } from 'react';
import {
  CalendarClock,
  Plus,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Clock,
  Phone,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  X,
  Search,
} from 'lucide-react';
import { FollowUp, FollowUpType, FollowUpStatus } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';

export const FollowUpsView: React.FC = () => {
  const { currentUser, users } = useAuth();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'today' | 'overdue' | 'upcoming' | 'completed'>('today');

  // Complete modal
  const [completingFollowUp, setCompletingFollowUp] = useState<FollowUp | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');

  // Reschedule modal
  const [reschedulingFollowUp, setReschedulingFollowUp] = useState<FollowUp | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('11:00');

  // Add Follow-up modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFu, setNewFu] = useState({
    entityName: '',
    contactPerson: '',
    mobile: '',
    followUpDate: new Date().toISOString().split('T')[0],
    followUpTime: '11:00',
    assignedUserId: currentUser?.id || '',
    followUpType: 'Phone Call' as FollowUpType,
    notes: '',
  });

  const loadFollowUps = async () => {
    setLoading(true);
    try {
      const data = await api.getFollowUps();
      setFollowUps(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFollowUps();
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  const todayList = followUps.filter(f => f.date === todayStr && f.status === 'Pending');
  const overdueList = followUps.filter(f => f.date < todayStr && f.status === 'Pending');
  const upcomingList = followUps.filter(f => f.date > todayStr && f.status === 'Pending');
  const completedList = followUps.filter(f => f.status === 'Completed');

  const getActiveList = () => {
    switch (tab) {
      case 'today':
        return todayList;
      case 'overdue':
        return overdueList;
      case 'upcoming':
        return upcomingList;
      case 'completed':
        return completedList;
      default:
        return todayList;
    }
  };

  const handleMarkComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingFollowUp) return;
    try {
      await api.updateFollowUpStatus(completingFollowUp.id, {
        status: 'Completed',
        outcome: outcomeNote || 'Completed successfully',
      });
      setCompletingFollowUp(null);
      setOutcomeNote('');
      loadFollowUps();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingFollowUp || !newDate) return;
    try {
      await api.updateFollowUpStatus(reschedulingFollowUp.id, {
        status: 'Rescheduled',
        newDate,
        newTime,
      });
      setReschedulingFollowUp(null);
      loadFollowUps();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sp = users.find(u => u.id === newFu.assignedUserId);
      await api.createFollowUp({
        ...newFu,
        assignedUserName: sp?.name || 'Assigned Officer',
      });
      setShowAddModal(false);
      setNewFu({
        entityName: '',
        contactPerson: '',
        mobile: '',
        followUpDate: new Date().toISOString().split('T')[0],
        followUpTime: '11:00',
        assignedUserId: currentUser?.id || '',
        followUpType: 'Phone Call',
        notes: '',
      });
      loadFollowUps();
    } catch (err: any) {
      alert(`Error scheduling follow-up: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-sky-600" />
            Daily Follow-ups & Customer Interactions
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Never miss an inquiry callback, quotation follow-up, or machinery trial demo
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> + Schedule Follow-up
        </button>
      </div>

      {/* Tabs Filter */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setTab('today')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'today'
              ? 'border-emerald-600 text-emerald-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Today's Calls ({todayList.length})</span>
        </button>

        <button
          onClick={() => setTab('overdue')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'overdue'
              ? 'border-rose-600 text-rose-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Overdue ({overdueList.length})
          </span>
        </button>

        <button
          onClick={() => setTab('upcoming')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'upcoming'
              ? 'border-sky-600 text-sky-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Upcoming Schedule ({upcomingList.length})</span>
        </button>

        <button
          onClick={() => setTab('completed')}
          className={`py-2.5 px-4 border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'completed'
              ? 'border-slate-800 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Completed History ({completedList.length})</span>
        </button>
      </div>

      {/* Follow-ups List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
            Loading follow-up schedules...
          </div>
        ) : getActiveList().length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
            <p className="font-semibold text-slate-700">All caught up! No follow-ups in this queue.</p>
          </div>
        ) : (
          getActiveList().map(fu => (
            <div
              key={fu.id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-sky-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-extrabold text-sm text-slate-900">{fu.entityName}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">
                    {fu.followUpType}
                  </span>
                  <span className="text-slate-500 font-mono text-[11px]">
                    Scheduled: <strong>{fu.date}</strong> at <strong>{fu.time}</strong>
                  </span>
                </div>

                <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {fu.notes}
                </p>

                {fu.outcome && (
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    Outcome: {fu.outcome}
                  </p>
                )}

                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <span>Assigned to: <strong className="text-slate-700">{fu.assignedUserName}</strong></span>
                  {fu.mobile && (
                    <>
                      • <span>Mobile: <strong className="text-slate-700 font-mono">{fu.mobile}</strong></span>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {fu.mobile && (
                  <>
                    <a
                      href={`tel:${fu.mobile}`}
                      className="p-2 rounded-lg bg-slate-100 hover:bg-sky-100 text-slate-700 hover:text-sky-700 transition-colors"
                      title="Call Phone"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                    <a
                      href={`https://wa.me/${fu.mobile.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                      title="Open WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </>
                )}

                {fu.status !== 'Completed' && (
                  <>
                    <button
                      onClick={() => setReschedulingFollowUp(fu)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs transition-colors"
                    >
                      Reschedule
                    </button>
                    <button
                      onClick={() => setCompletingFollowUp(fu)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
                    >
                      Mark Complete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Complete Outcome Modal */}
      {completingFollowUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-4 text-xs">
            <h3 className="font-extrabold text-slate-900 text-base">Complete Follow-up</h3>
            <p className="text-slate-600">
              Record the outcome of your call with <strong className="text-slate-900">{completingFollowUp.entityName}</strong>:
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Discussed clicker press stroke depth, buyer approved price, sent quotation..."
              value={outcomeNote}
              onChange={e => setOutcomeNote(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setCompletingFollowUp(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkComplete}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
              >
                Save & Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingFollowUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-4 text-xs">
            <h3 className="font-extrabold text-slate-900 text-base">Reschedule Follow-up</h3>
            <p className="text-slate-600">
              Select new date and time for <strong className="text-slate-900">{reschedulingFollowUp.entityName}</strong>:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">New Date</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">New Time</label>
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setReschedulingFollowUp(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
              >
                Confirm Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Follow-up Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Schedule New Follow-up</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFollowUp} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Entity / Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Footwear Solutions"
                  value={newFu.entityName}
                  onChange={e => setNewFu({ ...newFu, entityName: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Person</label>
                  <input
                    type="text"
                    value={newFu.contactPerson}
                    onChange={e => setNewFu({ ...newFu, contactPerson: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Mobile Number</label>
                  <input
                    type="text"
                    value={newFu.mobile}
                    onChange={e => setNewFu({ ...newFu, mobile: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Date *</label>
                  <input
                    type="date"
                    required
                    value={newFu.followUpDate}
                    onChange={e => setNewFu({ ...newFu, followUpDate: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Time</label>
                  <input
                    type="time"
                    value={newFu.followUpTime}
                    onChange={e => setNewFu({ ...newFu, followUpTime: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Channel</label>
                  <select
                    value={newFu.followUpType}
                    onChange={e => setNewFu({ ...newFu, followUpType: e.target.value as any })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="Phone Call">Phone Call</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Email">Email</option>
                    <option value="Meeting">Meeting</option>
                    <option value="Site Visit">Site Visit</option>
                    <option value="Demo">Demo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Assigned User</label>
                <select
                  value={newFu.assignedUserId}
                  onChange={e => setNewFu({ ...newFu, assignedUserId: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Agenda / Notes *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Discussion points..."
                  value={newFu.notes}
                  onChange={e => setNewFu({ ...newFu, notes: e.target.value })}
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
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
