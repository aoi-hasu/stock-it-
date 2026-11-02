import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Plus,
  UserCheck,
  Mail,
  Phone,
  Building,
  CheckCircle2,
  X,
  Lock,
  Edit2,
  Crown,
  AlertTriangle,
  Key,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Activity,
  FileSpreadsheet,
  Boxes,
  ShoppingBag,
  Users2,
  Calendar,
  Layers,
  Search,
  RefreshCw,
} from 'lucide-react';
import { User, UserRole, TenantOrganization } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { AdminAuthModal } from '../components/common/AdminAuthModal.tsx';

export const UsersTeamView: React.FC = () => {
  const {
    currentUser,
    canManageSettings,
    refreshUsers,
    tenants,
    isDeveloper,
    isSuperAdmin,
    isCompanyOwner,
    activeCompanyId,
    transferDeveloperOwnership,
  } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'activity'>('users');
  const [search, setSearch] = useState('');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('all');
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{
    user: { id: string; name: string; email: string; role: string };
    oneTimePassword: string;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  // Developer Master Ownership Transfer Modal
  const [showDevTransferModal, setShowDevTransferModal] = useState(false);
  const [devTransferForm, setDevTransferForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    confirmPassword: '',
  });
  const [transferringDev, setTransferringDev] = useState(false);
  const [devTransferError, setDevTransferError] = useState<string | null>(null);

  // Form State for Adding User
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'salesperson' as UserRole,
    department: 'Sales & Customer Relations',
    companyId: activeCompanyId || 'org-1',
  });

  // Activity Tracker State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [employeeActivities, setEmployeeActivities] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Fetch users with viewerRole.
      // If viewer is not the developer, api.getUsers strictly excludes any role === 'developer'.
      const allUsers = await api.getUsers({
        viewerRole: currentUser?.role,
        excludeSuperAdmin: false,
        companyId: isDeveloper ? (selectedCompanyFilter === 'all' ? undefined : selectedCompanyFilter) : currentUser?.companyId,
        includeAll: isDeveloper,
      });

      // Company users filter
      const filtered = isDeveloper
        ? allUsers
        : allUsers.filter(u => u.companyId === currentUser?.companyId);

      setUsers(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    setLoadingActivity(true);
    try {
      const targetComp = isDeveloper ? (selectedCompanyFilter === 'all' ? undefined : selectedCompanyFilter) : currentUser?.companyId;
      const targetEmp = selectedEmployeeId === 'all' ? undefined : selectedEmployeeId;
      const data = await api.getEmployeeActivity(targetEmp, targetComp);
      
      const filteredActivities = isDeveloper
        ? data
        : data.filter(a => a.user?.companyId === currentUser?.companyId);
      setEmployeeActivities(filteredActivities);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingActivity(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [isDeveloper, activeCompanyId, selectedCompanyFilter]);

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivities();
    }
  }, [activeTab, selectedEmployeeId, selectedCompanyFilter]);

  const availableRoles: { role: UserRole; title: string; desc: string }[] = isDeveloper
    ? [
        { role: 'super_admin', title: 'Super Admin (Company Owner)', desc: 'Highest authority for a client company. Manages all company staff, operations, and settings.' },
        { role: 'admin', title: 'Client Admin', desc: 'Full control over company staff, leads, quotations, inventory, and operations.' },
        { role: 'manager', title: 'General Operations Manager', desc: 'Oversees employee work, lead allocations, quotes, inventory, and tasks.' },
        { role: 'sales_manager', title: 'Sales Manager', desc: 'Monitors sales team, pipeline metrics, quote approvals, and revenue targets.' },
        { role: 'salesperson', title: 'Salesperson / Executive', desc: 'Manages customer inquiries, creates quotations, and conducts follow-ups.' },
        { role: 'inventory_manager', title: 'Inventory & Machinery Manager', desc: 'Enters stock in/out, manages machine assembly, and warehouse reservations.' },
        { role: 'accounts', title: 'Accounts & Billing Officer', desc: 'Issues tax invoices, records customer payments, and manages balances.' },
      ]
    : [
        { role: 'admin', title: 'Admin', desc: 'Full control over company staff, leads, quotations, inventory, and operations.' },
        { role: 'manager', title: 'General Operations Manager', desc: 'Oversees employee work, lead allocations, quotes, inventory, and tasks.' },
        { role: 'sales_manager', title: 'Sales Manager', desc: 'Monitors sales team, pipeline metrics, quote approvals, and revenue targets.' },
        { role: 'salesperson', title: 'Salesperson / Executive', desc: 'Manages customer inquiries, creates quotations, and conducts follow-ups.' },
        { role: 'inventory_manager', title: 'Inventory & Machinery Manager', desc: 'Enters stock in/out, manages machine assembly, and warehouse reservations.' },
        { role: 'accounts', title: 'Accounts & Billing Officer', desc: 'Issues tax invoices, records customer payments, and manages balances.' },
      ];

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        department: form.department.trim(),
        companyId: isDeveloper ? form.companyId : (currentUser?.companyId || 'org-1'),
      });
      setShowAddModal(false);
      setForm({
        name: '',
        email: '',
        phone: '',
        role: 'salesperson',
        department: 'Sales & Customer Relations',
        companyId: activeCompanyId || 'org-1',
      });
      await loadUsers();
      await refreshUsers();
      if (res.oneTimePassword) {
        setCreatedCreds({ user: res, oneTimePassword: res.oneTimePassword });
      }
    } catch (err: any) {
      alert(`Error creating user: ${err.message}`);
    }
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await api.updateUser(editingUser.id, {
        name: editingUser.name,
        email: editingUser.email,
        phone: editingUser.phone,
        department: editingUser.department,
        role: editingUser.role,
        companyId: editingUser.companyId,
      });
      setEditingUser(null);
      await loadUsers();
      await refreshUsers();
      alert('User details updated successfully!');
    } catch (err: any) {
      alert(`Error updating profile: ${err.message}`);
    }
  };

  const handleChangePassword = async (user: User) => {
    if (!confirm(`Generate a new temporary password for ${user.name}?`)) return;
    try {
      const res = await api.changeUserPassword(user.id);
      await loadUsers();
      if (res.oneTimePassword) {
        setCreatedCreds({ user, oneTimePassword: res.oneTimePassword });
      } else {
        alert(`Password reset successfully for ${user.name}!`);
      }
    } catch (err: any) {
      alert(`Error resetting password: ${err.message}`);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await api.deleteUser(userToDelete.id);
      setUserToDelete(null);
      await loadUsers();
      await refreshUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    }
  };

  const handleTransferDeveloperOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devTransferForm.email.trim() || !devTransferForm.name.trim()) {
      setDevTransferError('Developer Name and Email are required.');
      return;
    }
    if (devTransferForm.password && devTransferForm.password !== devTransferForm.confirmPassword) {
      setDevTransferError('New Master Passwords do not match.');
      return;
    }
    setTransferringDev(true);
    setDevTransferError(null);
    try {
      await transferDeveloperOwnership({
        name: devTransferForm.name.trim(),
        email: devTransferForm.email.trim(),
        password: devTransferForm.password.trim() || undefined,
        phone: devTransferForm.phone.trim() || undefined,
      });
      setShowDevTransferModal(false);
      alert(`Master Software Developer authority successfully transferred to ${devTransferForm.name} (${devTransferForm.email})!`);
      await loadUsers();
    } catch (err: any) {
      setDevTransferError(err.message || 'Failed to transfer ownership');
    } finally {
      setTransferringDev(false);
    }
  };

  // Filtered Users for Grid View
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch =
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.department && u.department.toLowerCase().includes(q));

    const matchCompany =
      selectedCompanyFilter === 'all' || u.companyId === selectedCompanyFilter;

    return matchSearch && matchCompany;
  });

  return (
    <div className="space-y-6">
      {/* Top Superior Authority Banner - ONLY VISIBLE TO THE SOFTWARE DEVELOPER */}
      {isDeveloper && (
        <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 p-4 rounded-2xl border border-purple-700/50 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-300 shrink-0">
              <Crown className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base text-white">
                  Software Developer (Master Superior Authority)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40 uppercase tracking-wider">
                  Invisible to Company Owner
                </span>
              </div>
              <p className="text-xs text-purple-200/80 mt-0.5">
                Logged in as <strong className="text-white">{currentUser?.name}</strong> ({currentUser?.email}). The Company Owner (Super Admin) and all client employees cannot see, modify, or delete your developer account.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDevTransferForm({
                name: currentUser?.name || '',
                email: currentUser?.email || '',
                password: '',
                confirmPassword: '',
                phone: currentUser?.phone || '',
              });
              setDevTransferError(null);
              setShowDevTransferModal(true);
            }}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-900/40 flex items-center justify-center gap-2 transition-all shrink-0 self-start md:self-auto"
          >
            <Key className="w-4 h-4" /> Transfer Developer Ownership
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-600" />
            Users, Credentials & Work Oversight
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create user IDs and passwords for employees, manage roles, and monitor team activities.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canManageSettings && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" /> + Add Team Member
            </button>
          )}

          <button
            onClick={loadUsers}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'users'
              ? 'border-sky-600 text-sky-700 bg-sky-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <UserCheck className="w-4 h-4" /> Team Members & Credentials ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'activity'
              ? 'border-sky-600 text-sky-700 bg-sky-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity className="w-4 h-4 text-emerald-600" />
          Manager Work & Accountability Tracker
        </button>
      </div>

      {/* TAB 1: USERS & CREDENTIALS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2.5 items-center justify-between">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by User ID, name, email, or role..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
              />
            </div>

            {isSuperAdmin && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Filter Client:</span>
                <select
                  value={selectedCompanyFilter}
                  onChange={e => setSelectedCompanyFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
                >
                  <option value="all">All Client Companies</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Users Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map(user => {
              const userOrg = tenants.find(t => t.id === user.companyId);
              const canEditThisUser =
                isDeveloper ||
                isSuperAdmin ||
                (currentUser?.role === 'admin' && user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'owner');

              return (
                <div
                  key={user.id}
                  className={`bg-white rounded-xl border p-4 shadow-xs space-y-3.5 relative transition-all ${
                    user.role === 'super_admin' || user.role === 'owner'
                      ? 'border-amber-300 ring-1 ring-amber-200 bg-amber-50/20'
                      : user.role === 'admin'
                      ? 'border-slate-300'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Top Line */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-extrabold flex items-center justify-center text-sm">
                        {user.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                          <span>{user.name}</span>
                          {(user.role === 'super_admin' || user.role === 'owner') && (
                            <span title="Company Owner">
                              <Crown className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">ID: {user.id}</div>
                      </div>
                    </div>

                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        user.role === 'super_admin' || user.role === 'owner'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : user.role === 'admin'
                          ? 'bg-slate-900 text-white'
                          : user.role.includes('manager')
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {user.role === 'super_admin' || user.role === 'owner' ? 'Company Owner' : user.role.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Contact & Company Info */}
                  <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    {user.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{user.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {userOrg?.name || 'Assigned Workspace'} ({user.department || 'Operations'})
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {canEditThisUser && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                      <button
                        type="button"
                        onClick={() => handleChangePassword(user)}
                        className="text-sky-600 hover:text-sky-800 font-semibold flex items-center gap-1 text-[11px]"
                      >
                        <Key className="w-3 h-3" /> Reset Password
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100"
                          title="Edit Profile & ID"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {user.id !== currentUser?.id && (
                          isDeveloper || (isSuperAdmin && user.role !== 'super_admin' && user.role !== 'owner') || (currentUser?.role === 'admin' && user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'owner')
                        ) && (
                          <button
                            onClick={() => setUserToDelete(user)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                            title={user.role === 'super_admin' ? 'Remove Company Owner (Admin Permission)' : 'Remove User (Requires Admin Permission)'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: MANAGER WORK & ACTIVITY TRACKER */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Select Employee to Watch:</span>
              <select
                value={selectedEmployeeId}
                onChange={e => setSelectedEmployeeId(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-800"
              >
                <option value="all">All Employees (Complete Oversight)</option>
                {users
                  .filter(u => u.role !== 'super_admin')
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role.replace('_', ' ')})
                    </option>
                  ))}
              </select>
            </div>

            <button
              onClick={loadActivities}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Activities
            </button>
          </div>

          {/* Activity Overview Cards */}
          {loadingActivity ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Loading employee activities and data tracking...
            </div>
          ) : employeeActivities.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
              No activity records found for this employee selection.
            </div>
          ) : (
            employeeActivities.map(item => (
              <div
                key={item.user.id}
                className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4"
              >
                {/* Employee Header & Metrics */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-sky-600 text-white font-black flex items-center justify-center text-base shadow-sm">
                      {item.user.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                        <span>{item.user.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 capitalize">
                          {item.user.role.replace('_', ' ')}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        {item.user.email} • ID: <strong className="font-mono">{item.user.id}</strong> • Department: {item.user.department || 'Operations'}
                      </p>
                    </div>
                  </div>

                  {/* Summary Metric Pills */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <div className="bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-lg">
                      <span className="text-[10px] text-sky-600 font-bold block">Leads Managed</span>
                      <strong className="text-sky-900 font-mono text-sm">{item.metrics.totalLeads}</strong>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                      <span className="text-[10px] text-emerald-600 font-bold block">Quotes Sent</span>
                      <strong className="text-emerald-900 font-mono text-sm">
                        {item.metrics.totalQuotations} (₹{item.metrics.totalQuotationValue.toLocaleString('en-IN')})
                      </strong>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                      <span className="text-[10px] text-amber-600 font-bold block">Stock Entries</span>
                      <strong className="text-amber-900 font-mono text-sm">{item.metrics.stockEntriesCount}</strong>
                    </div>

                    <div className="bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
                      <span className="text-[10px] text-purple-600 font-bold block">Orders Closed</span>
                      <strong className="text-purple-900 font-mono text-sm">
                        {item.metrics.totalOrders} (₹{item.metrics.totalOrderRevenue.toLocaleString('en-IN')})
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Breakdown Sections */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                  {/* Column 1: Leads Handled */}
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between text-slate-700 font-bold">
                      <span className="flex items-center gap-1.5 text-sky-800">
                        <Users2 className="w-3.5 h-3.5 text-sky-600" /> Leads Managed ({item.leads.length})
                      </span>
                    </div>
                    {item.leads.length === 0 ? (
                      <p className="text-slate-400 italic text-[11px]">No leads assigned</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {item.leads.map((l: any) => (
                          <div key={l.id} className="p-2 bg-white rounded border border-slate-200 shadow-2xs text-[11px]">
                            <div className="font-bold text-slate-900 truncate">{l.companyName}</div>
                            <div className="text-slate-500 text-[10px]">Req: {l.productInterested}</div>
                            <div className="flex items-center justify-between mt-1 text-[10px]">
                              <span className="text-slate-400">{l.city}</span>
                              <span className="font-bold text-sky-700 px-1.5 py-0.2 rounded bg-sky-50 border border-sky-200">
                                {l.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Column 2: Quotations Sent */}
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between text-slate-700 font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-800">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Quotations Sent ({item.quotations.length})
                      </span>
                    </div>
                    {item.quotations.length === 0 ? (
                      <p className="text-slate-400 italic text-[11px]">No quotations created</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {item.quotations.map((q: any) => (
                          <div key={q.id} className="p-2 bg-white rounded border border-slate-200 shadow-2xs text-[11px]">
                            <div className="flex items-center justify-between font-mono font-bold text-slate-900">
                              <span>{q.quotationNumber}</span>
                              <span className="text-emerald-700">₹{q.grandTotal.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="text-slate-600 truncate text-[10px]">To: {q.customerName}</div>
                            <div className="text-slate-400 text-[10px] mt-0.5">Date: {q.date} • {q.status}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Column 3: Stock Entries */}
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between text-slate-700 font-bold">
                      <span className="flex items-center gap-1.5 text-amber-800">
                        <Boxes className="w-3.5 h-3.5 text-amber-600" /> Stock Data Entered ({item.stockTransactions.length})
                      </span>
                    </div>
                    {item.stockTransactions.length === 0 ? (
                      <p className="text-slate-400 italic text-[11px]">No inventory entries logged</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {item.stockTransactions.map((tx: any) => (
                          <div key={tx.id} className="p-2 bg-white rounded border border-slate-200 shadow-2xs text-[11px]">
                            <div className="font-bold text-slate-900 truncate">{tx.productName}</div>
                            <div className="flex items-center justify-between mt-1 text-[10px]">
                              <span className="font-bold text-amber-700">
                                {tx.transactionType} ({tx.quantity} units)
                              </span>
                              <span className="text-slate-400 font-mono">{tx.date}</span>
                            </div>
                            {tx.notes && <p className="text-[10px] text-slate-500 mt-0.5 italic">{tx.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal: Create User ID & Password */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-sky-600" /> Create New User ID & Password
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              {/* Client Organization (Selectable by Developer) */}
              {isDeveloper && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Target Client Company *</label>
                  <select
                    value={form.companyId}
                    onChange={e => setForm({ ...form, companyId: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  >
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Name & Email */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Role & Department */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Role Permission *</label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  >
                    {availableRoles.map(r => (
                      <option key={r.role} value={r.role}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Department</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={e => setForm({ ...form, department: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Phone</label>
                <input
                  type="text"
                  placeholder="+91 98110 12345"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Create User Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Temporary Password Display Modal */}
      {createdCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-600" /> Temporary Credentials Generated
              </h3>
              <button onClick={() => setCreatedCreds(null)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-800 text-sm">{createdCreds.user.name}</p>
              <p className="text-slate-500">{createdCreds.user.email} • {createdCreds.user.role}</p>
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
                  {createdCreds.oneTimePassword}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdCreds.oneTimePassword)}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {copiedPassword ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Password
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                The user will be required to establish their confidential password upon first login.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setCreatedCreds(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Profile & ID */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-sky-600" /> Edit Employee Credentials
              </h3>
              <button onClick={() => setEditingUser(null)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Email / User ID *</label>
                <input
                  type="email"
                  required
                  value={editingUser.email}
                  onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Role *</label>
                  <select
                    value={editingUser.role}
                    onChange={e => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  >
                    {availableRoles.map(r => (
                      <option key={r.role} value={r.role}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Department</label>
                  <input
                    type="text"
                    value={editingUser.department || ''}
                    onChange={e => setEditingUser({ ...editingUser, department: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Developer Master Ownership (Exclusive to Software Developer) */}
      {showDevTransferModal && isDeveloper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-purple-700/60 max-w-md w-full p-6 space-y-4 text-xs text-white">
            <div className="flex items-center justify-between border-b border-purple-800/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-600/30 text-purple-300">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Transfer Master Developer Authority</h3>
                  <p className="text-[10px] text-purple-300">Irreversible platform ownership transfer</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDevTransferModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-purple-950/60 border border-purple-800/40 rounded-xl text-[11px] text-purple-200 leading-relaxed">
              ⚠️ <strong>Developer Notice:</strong> You are transferring the supreme platform authority. The new developer will hold master access. The Company Owner (Super Admin) will never be notified or see this account.
            </div>

            {devTransferError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                {devTransferError}
              </div>
            )}

            <form onSubmit={handleTransferDeveloperOwnership} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase">New Developer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lead Architect"
                  value={devTransferForm.name}
                  onChange={e => setDevTransferForm({ ...devTransferForm, name: e.target.value })}
                  className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase">New Developer Official Email *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. dev@yourdomain.com"
                  value={devTransferForm.email}
                  onChange={e => setDevTransferForm({ ...devTransferForm, email: e.target.value })}
                  className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase">Phone / Mobile (Optional)</label>
                <input
                  type="text"
                  placeholder="+91..."
                  value={devTransferForm.phone}
                  onChange={e => setDevTransferForm({ ...devTransferForm, phone: e.target.value })}
                  className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-300 uppercase">New Master Password *</label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={devTransferForm.password}
                    onChange={e => setDevTransferForm({ ...devTransferForm, password: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-300 uppercase">Confirm Password *</label>
                  <input
                    type="password"
                    placeholder="Repeat password"
                    value={devTransferForm.confirmPassword}
                    onChange={e => setDevTransferForm({ ...devTransferForm, confirmPassword: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-purple-800/40">
                <button
                  type="button"
                  onClick={() => setShowDevTransferModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferringDev}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/50 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Crown className="w-3.5 h-3.5" />
                  {transferringDev ? 'Transferring Authority...' : 'Confirm Ownership Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permission Guard Modal for Deleting User Account */}
      <AdminAuthModal
        isOpen={Boolean(userToDelete)}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleConfirmDeleteUser}
        title="Delete User Account"
        itemType="User Account"
        itemName={userToDelete ? `${userToDelete.name} [ID: ${userToDelete.id}] (${userToDelete.email || userToDelete.role})` : ''}
        warningMessage="Deleting a user account permanently removes their login credentials, assigned permissions, and active session."
      />
    </div>
  );
};
