import React, { useState } from 'react';
import { Sidebar } from './Sidebar.tsx';
import { Header } from './Header.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentTab: string;
  onSelectTab: (tab: string, entityId?: string) => void;
  onOpenQuickAction: (action: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentTab,
  onSelectTab,
  onOpenQuickAction,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { supportCompany, exitSupportMode } = useAuth();

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 antialiased overflow-hidden font-sans">
      {/* Sidebar Component */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          onSelectTab(tab);
          setSidebarOpen(false);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden lg:pl-64">
        {/* Top Header */}
        <Header
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onOpenQuickAction={onOpenQuickAction}
          onNavigateTo={onSelectTab}
        />

        {/* Audited Support View Banner */}
        {supportCompany && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between border-b border-amber-600 shadow-xs z-30">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-950 shrink-0" />
              <span>
                <strong>Audited Support View Active:</strong> Inspecting organization <strong>{supportCompany.name}</strong> ({supportCompany.code || supportCompany.id}). All access is recorded in <code>platform_access_logs</code>.
              </span>
            </div>
            <button
              onClick={() => {
                exitSupportMode();
                onSelectTab('clients');
              }}
              className="px-3 py-1 bg-slate-950 text-white rounded-lg text-xs font-bold hover:bg-slate-900 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ml-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Exit Support View
            </button>
          </div>
        )}

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-100/60">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
