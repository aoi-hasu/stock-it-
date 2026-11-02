import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Search,
  Bell,
  Plus,
  ChevronDown,
  Check,
  ArrowRight,
  Building2,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import { Notification } from '../../types/index.ts';

interface HeaderProps {
  onToggleSidebar: () => void;
  onOpenQuickAction: (action: string) => void;
  onNavigateTo: (tab: string, entityId?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onOpenQuickAction, onNavigateTo }) => {
  const { currentUser, currentTenant, logout, isCompanyOwner, isPlatformAdmin, platformRole, supportCompany } = useAuth();
  // Platform staff outside a Support View have no company: hide company search, quick actions and alerts.
  const consoleMode = isPlatformAdmin && !currentUser?.companyId && !supportCompany;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    leads: any[];
    customers: any[];
    quotations: any[];
    products: any[];
  } | null>(null);
  const [_isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) {
        setShowQuickMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setShowSearchDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [leads, customers, quotations, products] = await Promise.all([
          api.getLeads({ search: searchQuery }),
          api.getCustomers({ search: searchQuery }),
          api.getQuotations(),
          api.getProducts({ search: searchQuery }),
        ]);

        const q = searchQuery.toLowerCase();
        const filteredQtn = quotations.filter(
          item =>
            item.quotationNumber?.toLowerCase().includes(q) ||
            item.customerName?.toLowerCase().includes(q)
        );

        setSearchResults({
          leads: leads.slice(0, 4),
          customers: customers.slice(0, 4),
          quotations: filteredQtn.slice(0, 4),
          products: products.slice(0, 4),
        });
        setShowSearchDropdown(true);
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-white border-b border-slate-200">
      <div className="flex items-center gap-3 flex-1 max-w-2xl">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 text-slate-600 rounded-lg hover:bg-slate-100 lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div ref={searchRef} className={`relative w-full max-w-md ${consoleMode ? 'hidden' : ''}`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search leads, catalogue, customers, quotations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchQuery.trim() && searchResults) setShowSearchDropdown(true);
              }}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all placeholder:text-slate-400"
            />
          </div>

          {showSearchDropdown && searchResults && (
            <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 max-h-96 overflow-y-auto">
              {searchResults.leads.length > 0 && (
                <div className="p-2 border-b border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                    Leads ({searchResults.leads.length})
                  </div>
                  {searchResults.leads.map(lead => (
                    <button
                      key={lead.id}
                      onClick={() => {
                        setShowSearchDropdown(false);
                        onNavigateTo('leads', lead.id);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-sky-50 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div className="truncate">
                        <span className="font-semibold text-slate-800">{lead.companyName}</span>
                        <span className="text-slate-500 ml-1.5">({lead.contactPerson})</span>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>{lead.city}</span> • <span className="text-sky-600">{lead.productInterested}</span>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}

              {searchResults.customers.length > 0 && (
                <div className="p-2 border-b border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                    Customers ({searchResults.customers.length})
                  </div>
                  {searchResults.customers.map(cust => (
                    <button
                      key={cust.id}
                      onClick={() => {
                        setShowSearchDropdown(false);
                        onNavigateTo('customers', cust.id);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-sky-50 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">{cust.companyName}</span>
                        <div className="text-[11px] text-slate-400">{cust.city}, {cust.state}</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}

              {searchResults.quotations.length > 0 && (
                <div className="p-2 border-b border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                    Quotations ({searchResults.quotations.length})
                  </div>
                  {searchResults.quotations.map(qtn => (
                    <button
                      key={qtn.id}
                      onClick={() => {
                        setShowSearchDropdown(false);
                        onNavigateTo('quotations', qtn.id);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-sky-50 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">{qtn.quotationNumber}</span>
                        <span className="text-slate-500 ml-1.5">({qtn.customerName})</span>
                        <div className="text-[11px] text-emerald-600 font-mono">₹{qtn.grandTotal?.toLocaleString('en-IN')}</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}

              {searchResults.products.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                    Catalogue ({searchResults.products.length})
                  </div>
                  {searchResults.products.map(prod => (
                    <button
                      key={prod.id}
                      onClick={() => {
                        setShowSearchDropdown(false);
                        onNavigateTo('products', prod.id);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-sky-50 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">{prod.name}</span>
                        <span className="text-slate-400 text-[11px] ml-1.5">[{prod.modelNumber}]</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Company Workspace Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-sky-50/70 rounded-lg border border-slate-200">
          <Building2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          <span className="max-w-[120px] sm:max-w-[180px] truncate font-bold text-slate-900">
            {consoleMode ? 'Platform Console' : currentTenant?.name || 'Company Workspace'}
          </span>
          {consoleMode ? (
            <span className="text-[9px] bg-sky-600 text-white font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase">
              {platformRole || 'owner'}
            </span>
          ) : isCompanyOwner && (
            <span className="text-[9px] bg-sky-600 text-white font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase">
              Admin
            </span>
          )}
        </div>

        {/* Quick Action Button */}
        <div ref={quickRef} className={`relative ${consoleMode ? 'hidden' : ''}`}>
          <button
            onClick={() => setShowQuickMenu(!showQuickMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 shadow-sm shadow-sky-600/20 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quick Action</span>
            <ChevronDown className="w-3 h-3 opacity-80" />
          </button>

          {showQuickMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs">
              <button
                onClick={() => {
                  setShowQuickMenu(false);
                  onOpenQuickAction('new-lead');
                }}
                className="w-full px-3 py-2 text-left hover:bg-sky-50 flex items-center gap-2 text-slate-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-sky-600" /> Add New Lead
              </button>
              <button
                onClick={() => {
                  setShowQuickMenu(false);
                  onOpenQuickAction('new-quotation');
                }}
                className="w-full px-3 py-2 text-left hover:bg-sky-50 flex items-center gap-2 text-slate-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-sky-600" /> Create Quotation
              </button>
              <button
                onClick={() => {
                  setShowQuickMenu(false);
                  onOpenQuickAction('new-followup');
                }}
                className="w-full px-3 py-2 text-left hover:bg-sky-50 flex items-center gap-2 text-slate-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-sky-600" /> Schedule Follow-up
              </button>
              <button
                onClick={() => {
                  setShowQuickMenu(false);
                  onOpenQuickAction('new-customer');
                }}
                className="w-full px-3 py-2 text-left hover:bg-sky-50 flex items-center gap-2 text-slate-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-sky-600" /> Add Customer
              </button>
              <button
                onClick={() => {
                  setShowQuickMenu(false);
                  onOpenQuickAction('record-payment');
                }}
                className="w-full px-3 py-2 text-left hover:bg-sky-50 flex items-center gap-2 text-slate-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-sky-600" /> Record Payment
              </button>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div ref={notifRef} className={`relative ${consoleMode ? 'hidden' : ''}`}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-500 rounded-lg hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50">
              <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-slate-800">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-sky-100 text-sky-700 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] text-sky-600 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Check className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">No new notifications</div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className={`p-3 text-xs transition-colors hover:bg-slate-50 ${
                        !n.isRead ? 'bg-sky-50/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-800">{n.title}</p>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5 text-[11px]">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-100 text-sky-700 font-bold text-xs border border-sky-200">
              {currentUser?.name?.substring(0, 2).toUpperCase() || 'US'}
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-semibold text-slate-800 leading-tight">{currentUser?.name}</p>
              <p className="text-[10px] text-slate-400 capitalize">{currentUser?.role?.replace('_', ' ')}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 text-xs">
              <div className="px-2.5 py-2 border-b border-slate-100">
                <p className="font-bold text-slate-900">{currentUser?.name}</p>
                <p className="text-slate-500 text-[11px] truncate">{currentUser?.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800 uppercase">
                  {currentUser?.role?.replace('_', ' ')}
                </span>
              </div>

              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setShowUserMenu(false);
                  }}
                  className="w-full px-2.5 py-1.5 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
