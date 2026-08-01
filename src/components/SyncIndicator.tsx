import { useEffect, useState } from 'react';
import { getActiveSync, useAuthStore } from '../store/useAuthStore';

/**
 * Shows whether local changes still have to reach the cloud. Stays out of the
 * way when everything is in sync – it only matters when it isn't.
 */
export function SyncIndicator() {
  const status = useAuthStore((s) => s.status);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void getActiveSync()?.flush();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (status !== 'signed_in') {
      setPending(0);
      return;
    }
    const sync = getActiveSync();
    if (!sync) return;

    const unsubscribe = sync.onPendingChange(setPending);
    // Catch writes that failed while the tab was in the background.
    const timer = window.setInterval(() => void sync.flush(), 30_000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [status]);

  if (status !== 'signed_in') return null;

  if (!online) {
    return (
      <span
        title={
          pending > 0
            ? `${pending} Änderung(en) werden gesendet, sobald du wieder online bist`
            : 'Offline – deine Änderungen werden lokal gespeichert'
        }
        className="rounded-full border border-slate-600 bg-slate-800/70 px-3 py-1 text-xs text-slate-300"
      >
        ⚡ Offline{pending > 0 ? ` · ${pending}` : ''}
      </span>
    );
  }

  if (pending > 0) {
    return (
      <span
        title={`${pending} Änderung(en) werden hochgeladen`}
        className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-300"
      >
        ↑ {pending}
      </span>
    );
  }

  return null;
}
