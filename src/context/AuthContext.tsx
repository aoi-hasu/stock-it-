import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole, TenantOrganization } from '../types/index.ts';
import { supabase } from '../services/supabase.ts';
import { api } from '../services/api.ts';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  users: User[];
  visibleUsers: User[];
  token: string | null;
  login: (email: string, password?: string, rememberDevice?: boolean) => Promise<void>;
  logout: () => void;
  resetPasswordForEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  updatePassword: (newPassword: string) => Promise<void>;
  switchUser: (userId: string) => Promise<void> | void;
  hasRole: (roles: UserRole[]) => boolean;
  isDeveloper: boolean;
  isSuperAdmin: boolean;
  isCompanyOwner: boolean;
  canManageSettings: boolean;
  canManageInventory: boolean;
  canManageAccounts: boolean;
  canManageSales: boolean;
  canManageUsers: boolean;
  canOversightEmployees: boolean;
  refreshUsers: () => Promise<void>;
  transferDeveloperOwnership: (newDev: any) => Promise<void>;
  // Tenant Organization
  currentTenant: TenantOrganization | null;
  tenants: TenantOrganization[];
  isAllTenantsView: boolean;
  activeCompanyId: string | undefined;
  switchTenant: (tenantId: string | 'all') => void;
  refreshTenants: () => Promise<void>;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  // Platform Admin & Audited Support View
  isPlatformAdmin: boolean;
  platformRole: 'owner' | 'manager' | 'support' | null;
  supportCompany: TenantOrganization | null;
  enterSupportMode: (company: TenantOrganization) => Promise<void>;
  exitSupportMode: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);
  const [tenants, setTenants] = useState<TenantOrganization[]>([]);
  const [currentTenant, setCurrentTenant] = useState<TenantOrganization | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean>(false);
  const [platformRole, setPlatformRole] = useState<'owner' | 'manager' | 'support' | null>(null);
  const [supportCompany, setSupportCompany] = useState<TenantOrganization | null>(null);

  // Load user profile from Supabase given an authenticated user id
  const loadUserProfile = async (authUserId: string, sessionToken: string): Promise<User | null> => {
    try {
      // Always start from a clean platform state so a previous login cannot leak its role
      setIsPlatformAdmin(false);
      setPlatformRole(null);

      // 1. Check if user is a platform developer via platform-whoami
      try {
        const whoamiRes = await fetch('/api/platform-whoami', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (whoamiRes.ok) {
          const whoamiData = await whoamiRes.json();
          if (whoamiData.isPlatformAdmin) {
            setIsPlatformAdmin(true);
            setPlatformRole(whoamiData.platformRole || 'owner');
          }
        }
      } catch (err) {
        console.warn('whoami lookup notice:', err);
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUserId)
        .single();

      if (error || !profile) {
        // If no client profile exists, check if caller is a platform administrator
        try {
          const whoamiRes = await fetch('/api/platform-whoami', {
            headers: { Authorization: `Bearer ${sessionToken}` },
          });
          if (whoamiRes.ok) {
            const whoamiData = await whoamiRes.json();
            if (whoamiData.isPlatformAdmin) {
              const devUser: User = {
                id: authUserId,
                name: whoamiData.name || (whoamiData.platformRole === 'owner' || !whoamiData.platformRole ? 'Platform Developer' : 'Platform Staff'),
                email: whoamiData.email || 'developer@stockitease.com',
                role: 'super_admin',
                phone: '',
                department: 'Platform',
                active: true,
                createdAt: new Date().toISOString(),
                isOwner: true,
                companyId: undefined,
                mustChangePassword: whoamiData.mustChangePassword === true,
              };
              setCurrentUser(devUser);
              setToken(sessionToken);
              setIsPlatformAdmin(true);
              setPlatformRole(whoamiData.platformRole || 'owner');
              return devUser;
            }
          }
        } catch {
          // ignore
        }

        console.warn('Profile lookup error or not found:', error);
        return null;
      }

      // Block inactive users
      if (!profile.active) {
        await supabase.auth.signOut();
        return null;
      }

      const userRecord: User = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        phone: profile.phone || '',
        department: profile.department || 'Operations',
        active: profile.active,
        createdAt: profile.created_at,
        isOwner: profile.role === 'super_admin' || profile.role === 'owner',
        companyId: profile.company_id,
        mustChangePassword: profile.must_change_password,
      };

      setCurrentUser(userRecord);
      setToken(sessionToken);

      // Load client organization
      if (profile.company_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profile.company_id)
          .single();

        if (orgData) {
          const tenantRecord: TenantOrganization = {
            id: orgData.id,
            name: orgData.name,
            code: orgData.code || '',
            industry: orgData.data?.industry || '',
            contactPerson: orgData.data?.contactPerson || '',
            email: orgData.data?.email || '',
            phone: orgData.data?.phone || '',
            active: orgData.active,
            plan: orgData.data?.plan || 'Professional',
            createdAt: orgData.created_at,
          };
          setCurrentTenant(tenantRecord);
          setTenants([tenantRecord]);
        }
      }

      return userRecord;
    } catch (err) {
      console.warn('Error loading user profile:', err);
      return null;
    }
  };

  const refreshUsers = async () => {
    if (!currentUser) return;
    try {
      const list = await api.getUsers();
      setUsers(list);
    } catch (e) {
      console.warn('Could not refresh users:', e);
    }
  };

  const refreshTenants = async () => {
    try {
      const orgs = await api.getOrganizations();
      setTenants(orgs);
      if (currentUser?.companyId) {
        const found = orgs.find(o => o.id === currentUser.companyId) || orgs[0] || null;
        setCurrentTenant(found);
      } else if (orgs.length > 0) {
        setCurrentTenant(orgs[0]);
      }
    } catch {
      // ignore
    }
  };

  // Listen to Supabase Auth state changes
  useEffect(() => {
    let mounted = true;

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user && session.access_token) {
        loadUserProfile(session.user.id, session.access_token).finally(() => {
          if (mounted) setIsInitialized(true);
        });
      } else {
        setCurrentUser(null);
        setToken(null);
        setIsInitialized(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      if (session?.user && session.access_token) {
        await loadUserProfile(session.user.id, session.access_token);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setToken(null);
        setCurrentTenant(null);
        setIsPasswordRecovery(false);
      }
      setIsInitialized(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
  };

  // Fetch users when authenticated user is established
  useEffect(() => {
    if (currentUser) {
      refreshUsers();
    }
  }, [currentUser?.id]);

  const login = async (email: string, password?: string, rememberDevice: boolean = false) => {
    if (!password) {
      throw new Error('Password is required.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      throw new Error(error.message || 'Invalid email or password.');
    }

    if (!data.user || !data.session) {
      throw new Error('Login failed. Please check credentials.');
    }

    const profile = await loadUserProfile(data.user.id, data.session.access_token);
    if (!profile) {
      throw new Error('Account inactive or profile not found. Please contact your company administrator.');
    }

    if (rememberDevice) {
      localStorage.setItem('sie_remembered_email', email);
    } else {
      localStorage.removeItem('sie_remembered_email');
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setToken(null);
    setCurrentTenant(null);
    setIsPlatformAdmin(false);
    setPlatformRole(null);
    setSupportCompany(null);
  };

  const resetPasswordForEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      success: true,
      message: 'Password reset link sent to your email. Check your inbox to proceed.',
    };
  };

  const updatePassword = async (newPassword: string) => {
    if (!currentUser) throw new Error('Not logged in.');

    const { error: authErr } = await supabase.auth.updateUser({
      password: newPassword,
      ...(isPlatformAdmin && !currentUser.companyId ? { data: { must_change_password: false } } : {}),
    });
    if (authErr) throw new Error(authErr.message);

    // Record password change timestamp in database before acknowledging
    try {
      await supabase.rpc('record_password_change_time');
    } catch (e) {
      console.warn('record_password_change_time notice:', e);
    }

    // Securely clear must_change_password flag via security definer function
    const { error: rpcErr } = await supabase.rpc('ack_password_changed');
    if (rpcErr) {
      console.warn('ack_password_changed notice:', rpcErr.message);
    }

    setCurrentUser(prev => (prev ? { ...prev, mustChangePassword: false } : null));
  };

  const enterSupportMode = async (company: TenantOrganization) => {
    try {
      await supabase.rpc('record_platform_support_access', {
        p_company_id: company.id,
        p_what: `Platform Admin entered Audited Support View for ${company.name} (${company.id})`,
      });
    } catch (err) {
      console.warn('Could not record support access audit:', err);
    }
    setSupportCompany(company);
    setCurrentTenant(company);
  };

  const exitSupportMode = () => {
    setSupportCompany(null);
    if (currentUser?.companyId) {
      const homeTenant = tenants.find(t => t.id === currentUser.companyId) || null;
      setCurrentTenant(homeTenant);
    } else {
      setCurrentTenant(null);
    }
  };

  const switchUser = () => {
    // Personas / developer switches are removed
    console.warn('Switch user persona is deprecated in secure production environment.');
  };

  const switchTenant = (tenantId: string) => {
    const found = tenants.find(t => t.id === tenantId);
    if (found) setCurrentTenant(found);
  };

  const transferDeveloperOwnership = async () => {
    throw new Error('Developer ownership transfer is removed. Use Cloudflare Platform Admin.');
  };

  const role = currentUser?.role || 'salesperson';
  const isCompanyOwner = role === 'super_admin' || role === 'owner';
  const isSuperAdmin = role === 'super_admin';
  const isDeveloper = isPlatformAdmin;

  const hasRole = (allowedRoles: UserRole[]) => {
    return allowedRoles.includes(role);
  };

  const canManageSettings = isCompanyOwner || role === 'admin' || isPlatformAdmin;
  const canManageUsers = isCompanyOwner || role === 'admin';
  const canOversightEmployees = isCompanyOwner || role === 'admin' || role === 'sales_manager' || role === 'manager';
  const canManageInventory = isCompanyOwner || role === 'admin' || role === 'inventory_manager';
  const canManageAccounts = isCompanyOwner || role === 'admin' || role === 'accounts' || role === 'sales_manager' || role === 'manager';
  const canManageSales = isCompanyOwner || role === 'admin' || role === 'sales_manager' || role === 'manager' || role === 'salesperson';

  const visibleUsers = users.filter(u => u.companyId === (supportCompany?.id || currentUser?.companyId));

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: Boolean(currentUser && token),
        isInitialized,
        users,
        visibleUsers,
        token,
        login,
        logout,
        resetPasswordForEmail,
        updatePassword,
        switchUser,
        hasRole,
        isDeveloper,
        isSuperAdmin,
        isCompanyOwner,
        canManageSettings,
        canManageInventory,
        canManageAccounts,
        canManageSales,
        canManageUsers,
        canOversightEmployees,
        refreshUsers,
        transferDeveloperOwnership,
        currentTenant,
        tenants,
        isAllTenantsView: false,
        activeCompanyId: supportCompany?.id || currentUser?.companyId,
        switchTenant,
        refreshTenants,
        isPasswordRecovery,
        clearPasswordRecovery,
        isPlatformAdmin,
        platformRole,
        supportCompany,
        enterSupportMode,
        exitSupportMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
