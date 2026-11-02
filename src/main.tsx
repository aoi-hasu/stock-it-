import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Iframe-safe alert shim to prevent modal freezes in preview environments
if (typeof window !== 'undefined') {
  const originalAlert = window.alert;
  window.alert = (message?: any) => {
    try {
      const text = String(message ?? '');
      const containerId = 'toast-alert-container';
      let container = document.getElementById(containerId);
      if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '99999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.maxWidth = '400px';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      toast.style.background = '#0f172a';
      toast.style.color = '#f8fafc';
      toast.style.border = '1px solid #334155';
      toast.style.padding = '12px 16px';
      toast.style.borderRadius = '12px';
      toast.style.fontSize = '13px';
      toast.style.fontWeight = '500';
      toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5)';
      toast.style.lineHeight = '1.4';
      toast.style.pointerEvents = 'auto';
      toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      toast.textContent = text;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-6px)';
        setTimeout(() => toast.remove(), 250);
      }, 4000);
    } catch {
      originalAlert?.(message);
    }
  };
}

import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

