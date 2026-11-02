import React, { useState } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext.tsx';
import { Layout } from './components/layout/Layout.tsx';
import { LoginView } from './views/LoginView.tsx';
import { DashboardView } from './views/DashboardView.tsx';
import { LeadsView } from './views/LeadsView.tsx';
import { PipelineView } from './views/PipelineView.tsx';
import { CustomersView } from './views/CustomersView.tsx';
import { ContactsView } from './views/ContactsView.tsx';
import { ProductsView } from './views/ProductsView.tsx';
import { InventoryView } from './views/InventoryView.tsx';
import { PurchasesView } from './views/PurchasesView.tsx';
import { QuotationsView } from './views/QuotationsView.tsx';
import { TaxInvoicesView } from './views/TaxInvoicesView.tsx';
import { OrdersView } from './views/OrdersView.tsx';
import { PaymentsView } from './views/PaymentsView.tsx';
import { FollowUpsView } from './views/FollowUpsView.tsx';
import { TasksView } from './views/TasksView.tsx';
import { CommunicationsView } from './views/CommunicationsView.tsx';
import { DocumentsView } from './views/DocumentsView.tsx';
import { ReportsView } from './views/ReportsView.tsx';
import { UsersTeamView } from './views/UsersTeamView.tsx';
import { ClientsView } from './views/ClientsView.tsx';
import { PlatformHomeView } from './views/PlatformHomeView.tsx';
import { PlatformStaffView } from './views/PlatformStaffView.tsx';
import { PlatformActivityView } from './views/PlatformActivityView.tsx';
import { SettingsView } from './views/SettingsView.tsx';
import { AuditLogsView } from './views/AuditLogsView.tsx';
import { ForceChangePasswordModal } from './components/common/ForceChangePasswordModal.tsx';
import { Lead, Customer, Product } from './types/index.ts';
import { isSupabaseConfigured } from './services/supabase.ts';
import { ConfigRequiredScreen } from './components/common/ConfigRequiredScreen.tsx';
import { SetRecoveryPasswordModal } from './components/common/SetRecoveryPasswordModal.tsx';
import { Boxes } from 'lucide-react';

export const AppContent: React.FC = () => {
  const { currentUser, isInitialized, isPasswordRecovery, clearPasswordRecovery, isPlatformAdmin, platformRole, supportCompany } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>();
  const [quotationPreloadLead, setQuotationPreloadLead] = useState<Lead | Customer | null>(null);
  const [quotationPreloadProduct, setQuotationPreloadProduct] = useState<Product | undefined>();

  // If Supabase environment is unconfigured, display guidance screen gracefully
  if (!isSupabaseConfigured) {
    return <ConfigRequiredScreen />;
  }

  // Handle PASSWORD_RECOVERY auth event
  if (isPasswordRecovery) {
    return (
      <SetRecoveryPasswordModal
        onSuccess={() => clearPasswordRecovery()}
        onCancel={() => clearPasswordRecovery()}
      />
    );
  }

  // If session state is still loading, show branded loading screen
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 flex flex-col items-center justify-center text-white">
        <div className="w-14 h-14 rounded-2xl bg-sky-600 flex items-center justify-center shadow-xl shadow-sky-600/30 animate-pulse mb-3">
          <Boxes className="w-8 h-8 text-white" />
        </div>
        <p className="text-sm font-bold tracking-tight text-white">StockItEase</p>
        <p className="text-[11px] text-sky-400 font-medium mt-1">Connecting to Secure Cloud...</p>
      </div>
    );
  }

  // When opening the app, first screen is always the login page
  if (!currentUser) {
    return <LoginView />;
  }

  const handleSelectTab = (tab: string, entityId?: string) => {
    setCurrentTab(tab);
    setSelectedEntityId(entityId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenQuickAction = (action: string) => {
    if (action === 'new-lead') {
      handleSelectTab('leads');
    } else if (action === 'new-quotation') {
      handleSelectTab('quotations');
    } else if (action === 'new-followup') {
      handleSelectTab('follow-ups');
    } else if (action === 'new-customer') {
      handleSelectTab('customers');
    } else if (action === 'record-payment') {
      handleSelectTab('payments');
    }
  };

  const handleOpenQuotationFromLead = (lead: Lead | Customer) => {
    setQuotationPreloadLead(lead);
    setQuotationPreloadProduct(undefined);
    handleSelectTab('quotations');
  };

  const handleOpenQuotationFromProduct = (product: Product) => {
    setQuotationPreloadProduct(product);
    setQuotationPreloadLead(null);
    handleSelectTab('quotations');
  };

  // Platform staff (no company of their own) only get the platform console,
  // plus a client's screens while an audited Support View is open.
  const platformMode = isPlatformAdmin && !currentUser.companyId;
  const platformTabs = ['platform-home', 'clients', 'platform-staff', 'platform-activity'];
  const tabAllowed = (t: string) => {
    if (platformTabs.includes(t)) {
      if (!platformMode) return false;
      if (t === 'platform-staff') return platformRole === 'owner';
      if (t === 'platform-activity') return platformRole === 'owner' || platformRole === 'manager';
      return true;
    }
    return !platformMode || Boolean(supportCompany);
  };
  const effectiveTab = tabAllowed(currentTab)
    ? currentTab
    : platformMode
      ? 'platform-home'
      : 'dashboard';

  return (
    <>
      {currentUser.mustChangePassword && <ForceChangePasswordModal />}

      <Layout
        currentTab={effectiveTab}
        onSelectTab={handleSelectTab}
        onOpenQuickAction={handleOpenQuickAction}
      >
        {effectiveTab === 'dashboard' && (
          <DashboardView
            onNavigate={handleSelectTab}
            onQuickAction={handleOpenQuickAction}
          />
        )}

        {effectiveTab === 'leads' && (
          <LeadsView
            initialLeadId={selectedEntityId}
            onOpenCreateQuotation={handleOpenQuotationFromLead}
          />
        )}

        {effectiveTab === 'pipeline' && (
          <PipelineView
            onOpenCreateQuotation={handleOpenQuotationFromLead}
            onOpenLeadModal={(id: string) => handleSelectTab('leads', id)}
          />
        )}

        {effectiveTab === 'customers' && (
          <CustomersView
            initialCustomerId={selectedEntityId}
            onOpenCreateQuotation={handleOpenQuotationFromLead}
          />
        )}

        {effectiveTab === 'contacts' && <ContactsView />}

        {effectiveTab === 'products' && (
          <ProductsView
            initialProductId={selectedEntityId}
            onSelectMachineForQuote={handleOpenQuotationFromProduct}
          />
        )}

        {effectiveTab === 'inventory' && <InventoryView />}

        {effectiveTab === 'purchases' && <PurchasesView />}

        {effectiveTab === 'quotations' && (
          <QuotationsView
            initialLeadOrCustomer={quotationPreloadLead}
            preselectedProduct={quotationPreloadProduct}
          />
        )}

        {effectiveTab === 'invoices' && (
          <TaxInvoicesView onNavigateTo={handleSelectTab} />
        )}

        {effectiveTab === 'orders' && <OrdersView />}

        {effectiveTab === 'payments' && <PaymentsView />}

        {effectiveTab === 'follow-ups' && <FollowUpsView />}

        {effectiveTab === 'tasks' && <TasksView />}

        {effectiveTab === 'communications' && <CommunicationsView />}

        {effectiveTab === 'documents' && <DocumentsView />}

        {effectiveTab === 'reports' && <ReportsView />}

        {effectiveTab === 'users' && <UsersTeamView />}

        {platformMode && effectiveTab === 'platform-home' && <PlatformHomeView onNavigate={handleSelectTab} />}

        {platformMode && effectiveTab === 'clients' && <ClientsView />}

        {platformMode && effectiveTab === 'platform-staff' && <PlatformStaffView />}

        {platformMode && effectiveTab === 'platform-activity' && <PlatformActivityView />}

        {effectiveTab === 'settings' && <SettingsView />}

        {effectiveTab === 'audit-logs' && <AuditLogsView />}
      </Layout>
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
