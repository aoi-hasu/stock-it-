import React, { useState, useEffect } from 'react';
import { ShieldAlert, Lock, ShieldCheck, AlertTriangle, X, Check, Eye, EyeOff, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  itemName?: string;
  itemType?: string;
  warningMessage?: string;
  confirmButtonText?: string;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete Record',
  itemName,
  itemType = 'Item',
  warningMessage,
  confirmButtonText = 'Confirm Delete',
}) => {
  const { currentUser, users, isDeveloper } = useAuth();
  const [adminEmailOrId, setAdminEmailOrId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available administrators for authorization
  const availableAdmins = users.filter(u => {
    return u.role === 'admin' || u.role === 'super_admin' || u.role === 'owner';
  });

  // Check if active user already has administrator deletion authority
  const isAdmin =
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'owner';

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setAdminPassword('');
      setShowPassword(false);
      // Pre-select first available admin email if standard user
      if (!isAdmin && availableAdmins.length > 0) {
        setAdminEmailOrId(availableAdmins[0].email || availableAdmins[0].id);
      } else {
        setAdminEmailOrId('');
      }
    }
  }, [isOpen, isAdmin]);

  if (!isOpen) return null;

  const handleAuthorizeAndExecute = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      if (isAdmin) {
        // Direct administrator execution
        api.logAudit(
          'Direct Admin Deletion',
          itemType,
          itemName || 'Record',
          `Deleted by Administrator ${currentUser?.name || ''} (${currentUser?.role})`,
          { id: currentUser?.id, name: currentUser?.name }
        );
        onConfirm();
        onClose();
        return;
      }

      // Admin operations are authorized by caller session role
      const isAuthorized = ['super_admin', 'owner', 'admin'].includes(currentUser?.role || '');

      if (!isAuthorized) {
        setError(
          'Authorization Denied: Only administrators or owners can authorize this deletion.'
        );
        setIsSubmitting(false);
        return;
      }

      const approvingAdminName = currentUser?.name || 'Authorized Administrator';

      // Record immutable audit trail
      api.logAudit(
        'Admin Authorized Deletion',
        itemType,
        itemName || 'Record',
        `Permission Guard Approved: Employee ${currentUser?.name || 'Staff'} (${currentUser?.role}) deleted record with Admin approval from ${approvingAdminName}`,
        { id: currentUser?.id, name: currentUser?.name }
      );

      onConfirm();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Authorization failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl ${
                isAdmin ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">{title}</h3>
              <p className="text-[10px] text-slate-500 font-medium">
                {isAdmin ? 'Administrator Deletion Authority' : 'Permission Guard: Admin Approval Required'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {itemName && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Target {itemType}:
              </span>
              <p className="font-extrabold text-slate-900 text-sm mt-0.5 break-words">{itemName}</p>
            </div>
          )}

          {warningMessage ? (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <p className="text-xs leading-relaxed">{warningMessage}</p>
            </div>
          ) : (
            <p className="text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete this {itemType.toLowerCase()}? This action removes associated records and cannot be undone.
            </p>
          )}

          {!isAdmin ? (
            <div className="p-4 bg-rose-50/80 rounded-xl border border-rose-200 space-y-3.5">
              <div className="flex items-start gap-2 text-rose-800">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div>
                  <p className="font-bold text-xs">Permission Guard Active</p>
                  <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                    Standard users can create and edit records normally, but permanent deletion is restricted. Please request an Administrator to enter their credentials to authorize this action.
                  </p>
                </div>
              </div>

              {/* Admin Selector or ID input */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-950">
                  Authorizing Administrator:
                </label>
                {availableAdmins.length > 0 ? (
                  <select
                    value={adminEmailOrId}
                    onChange={e => {
                      setAdminEmailOrId(e.target.value);
                      setError(null);
                    }}
                    className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                  >
                    {availableAdmins.map(adm => (
                      <option key={adm.id} value={adm.email || adm.id}>
                        {adm.name} ({adm.role === 'super_admin' ? 'Company Owner' : 'Admin'} • {adm.email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Enter Admin Email or User ID"
                    value={adminEmailOrId}
                    onChange={e => {
                      setAdminEmailOrId(e.target.value);
                      setError(null);
                    }}
                    className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                )}
              </div>

              {/* Admin Password Input */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-950">
                  Administrator Password:
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter authorizing admin's password"
                    value={adminPassword}
                    onChange={e => {
                      setAdminPassword(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAuthorizeAndExecute();
                      }
                    }}
                    autoFocus
                    className="w-full pl-3 pr-9 py-2 bg-white border border-rose-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                  <span>Authorized role: Admin / Owner</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Direct Administrator Authority</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Logged in as <strong>{currentUser?.name}</strong> ({currentUser?.role.replace('_', ' ')}). You have elevated authority to execute this deletion.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-100 border border-rose-300 text-rose-900 rounded-xl text-xs font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || (!isAdmin && !adminPassword.trim())}
            onClick={handleAuthorizeAndExecute}
            className={`px-4 py-2 rounded-lg font-bold text-white transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer ${
              isAdmin
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-slate-900 hover:bg-black disabled:opacity-50'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {isSubmitting ? 'Verifying...' : isAdmin ? confirmButtonText : 'Authorize & Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};
