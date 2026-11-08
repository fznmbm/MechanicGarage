'use client';
import { useEffect } from 'react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
declare global {
  interface Window { __installPrompt?: InstallPrompt | null }
}

/**
 * Registers the service worker (offline page) and keeps Chrome's "install app" prompt for later,
 * so the Install button can show it whenever it's pressed.
 */
export function Pwa() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }
    const keep = (e: Event) => {
      e.preventDefault();
      window.__installPrompt = e as InstallPrompt;
      window.dispatchEvent(new Event('installprompt-ready'));
    };
    const installed = () => {
      window.__installPrompt = null;
      window.dispatchEvent(new Event('installprompt-ready'));
    };
    window.addEventListener('beforeinstallprompt', keep);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', keep);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  return null;
}
