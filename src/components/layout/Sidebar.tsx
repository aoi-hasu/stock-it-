import React from 'react';
import {
  LayoutDashboard,
  Users2,
  Building2,
  Contact,
  Cog,
  Boxes,
  FileSpreadsheet,
  ShoppingBag,
  CreditCard,
  CalendarClock,
  CheckSquare,
  MessageSquare,
  FolderOpen,
  BarChart3,
  GitBranch,
  ShieldCheck,
  Settings,
  ScrollText,
  X,
  Receipt,
  ShoppingCart,
  LogOut,
  Home,
  UserCog,
  History,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, isOpen, onClose }) => {
  const { currentUser, isPlatformAdmin, platformRole, supportCompany, logout } = useAuth();
  // A platform staff login has no company of its own: it sees only the platform console.
  const platformMode = isPlatformAdmin && !currentUser?.companyId;

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'leads', label: 'Leads & Enquiries', icon: Users2 },
    { id: 'pipeline', label: 'Sales Pipeline', icon: GitBranch },
    { id: 'customers', label: 'Customers', icon: Building2 },
    { id: 'contacts', label: 'Contacts Directory', icon: Contact },
    { id: 'products', label: 'Catalogue & Products', icon: Cog },
    { id: 'inventory', label: 'Inventory & Stock', icon: Boxes },
    { id: 'purchases', label: 'Purchases & Inwards', icon: ShoppingCart },
    { id: 'quotations', label: 'Quotations', icon: FileSpreadsheet },
    { id: 'invoices', label: 'Tax Invoices', icon: Receipt },
    { id: 'orders', label: 'Orders & Dispatch', icon: ShoppingBag },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'follow-ups', label: 'Follow-ups', icon: CalendarClock },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'communications', label: 'Communications', icon: MessageSquare },
    { id: 'documents', label: 'Documents', icon: FolderOpen },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'users', label: 'Users & Team', icon: ShieldCheck },
    { id: 'settings', label: 'Settings & Integrations', icon: Settings },
    { id: 'audit-logs', label: 'Audit Logs', icon: ScrollText },
  ];

  const platformItems = [
    { id: 'platform-home', label: 'Platform Home', icon: Home },
    { id: 'clients', label: 'Client Companies', icon: Building2 },
    ...(platformRole === 'owner' ? [{ id: 'platform-staff', label: 'Platform Staff', icon: UserCog }] : []),
    ...(platformRole === 'owner' || platformRole === 'manager'
      ? [{ id: 'platform-activity', label: 'Platform Activity', icon: History }]
      : []),
  ];

  // Platform staff: console only. While in an audited Support View, the client's screens are added below it.
  const navItems = platformMode
    ? supportCompany
      ? [...platformItems, ...allNavItems]
      : platformItems
    : allNavItems;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-64 bg-slate-950 text-slate-300 border-r border-slate-800 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800/80 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-sky-600 text-white font-bold shadow-md shadow-sky-600/30">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-wide text-white">
                StockItEase
              </div>
              <div className="text-[10px] uppercase font-semibold tracking-wider text-sky-400">
                Business Management
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2.5 bg-slate-900/50 border-b border-slate-800/60 flex items-center justify-between text-xs">
          <div className="truncate pr-2">
            <p className="font-semibold text-slate-200 truncate">{currentUser?.name || 'StockItEase User'}</p>
            <p className="text-[11px] text-slate-400 capitalize">{currentUser?.role?.replace('_', ' ') || 'Staff'}</p>
          </div>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            ONLINE
          </span>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className={`flex items-center justify-between w-full px-3 py-2 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-sky-600 text-white font-semibold shadow-sm shadow-sky-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {currentUser && (
          <div className="p-2.5 mx-2 mb-2 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
            <div className="truncate min-w-0 pr-2">
              <p className="font-bold text-slate-200 truncate">{currentUser.name}</p>
              <p className="text-[10px] text-sky-400 capitalize truncate">{currentUser.role.replace('_', ' ')}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sign Out to Login Screen"
              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors shrink-0 flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        )}

        <div className="p-3 border-t border-slate-800/80 bg-slate-950/80 text-[11px] text-slate-400">
          <div className="flex items-center justify-between">
            <span className="truncate">StockItEase · a product of aoihasu</span>
            <span className="text-emerald-400 flex items-center gap-1 shrink-0 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Live
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
