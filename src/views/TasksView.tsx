import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  X,
} from 'lucide-react';
import { Task, TaskPriority, TaskStatus } from '../types/index.ts';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';

export const TasksView: React.FC = () => {
  const { currentUser, users } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    assignedUserId: currentUser?.id || '',
    priority: 'Medium' as TaskPriority,
    dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
  });

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await api.getTasks();
      setTasks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sp = users.find(u => u.id === form.assignedUserId);
      await api.createTask({
        ...form,
        assignedUserName: sp?.name || 'Administrator',
      });
      setShowAddModal(false);
      setForm({
        title: '',
        description: '',
        assignedUserId: currentUser?.id || '',
        priority: 'Medium',
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
      });
      loadTasks();
    } catch (err: any) {
      alert(`Error creating task: ${err.message}`);
    }
  };

  const handleUpdateStatus = async (id: string, status: TaskStatus) => {
    try {
      await api.updateTask(id, { status });
      loadTasks();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filtered = tasks.filter(t => {
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    return matchStatus && matchPriority;
  });

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-sky-600" />
            Internal Tasks & Action Items
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational action items for plant technicians, dispatch logistics, and sales follow-ups
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> + Create Task
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2.5 items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
          >
            <option value="all">All Statuses</option>
            <option value="To Do">To Do</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
          >
            <option value="all">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <button
          onClick={loadTasks}
          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tasks List */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
            Loading task records...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <CheckCircle2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">No tasks found</p>
          </div>
        ) : (
          filtered.map(t => (
            <div
              key={t.id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-sky-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className={`font-bold text-sm ${t.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                    {t.title}
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    t.priority === 'Urgent'
                      ? 'bg-rose-100 text-rose-800'
                      : t.priority === 'High'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {t.priority}
                  </span>
                </div>
                {t.description && <p className="text-slate-600">{t.description}</p>}
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <span>Assigned to: <strong className="text-slate-700">{t.assignedUserName}</strong></span> •
                  <span>Due: <strong className="text-slate-700 font-mono">{t.dueDate}</strong></span>
                  {t.relatedLeadName && <span>• Related: <strong className="text-sky-700">{t.relatedLeadName}</strong></span>}
                </div>
              </div>

              {/* Status Switcher */}
              <div className="flex items-center gap-1.5 shrink-0">
                {(['To Do', 'In Progress', 'Completed'] as TaskStatus[]).map(st => (
                  <button
                    key={st}
                    onClick={() => handleUpdateStatus(t.id, st)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                      t.status === st
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Create New Operational Task</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Test pincer hydraulic pressure for Calico order"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value as any })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={form.dueDate}
                    onChange={e => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Assigned User</label>
                <select
                  value={form.assignedUserId}
                  onChange={e => setForm({ ...form, assignedUserId: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
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
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
