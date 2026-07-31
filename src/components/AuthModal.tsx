import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { Modal } from './Modal';

type Mode = 'signin' | 'signup';

interface AuthModalProps {
  onClose: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const syncing = useAuthStore((s) => s.syncing);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const status = useAuthStore((s) => s.status);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    if (!email.trim() || password.length < 6) return;
    clearError();
    if (mode === 'signin') {
      await signIn(email.trim(), password);
    } else {
      await signUp(email.trim(), password);
    }
    // Close only on success – otherwise the error stays visible.
    if (useAuthStore.getState().status === 'signed_in') onClose();
  };

  return (
    <Modal
      title={mode === 'signin' ? 'Anmelden' : 'Konto erstellen'}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-slate-400">
          Mit einem Konto wird dein Fortschritt in der Cloud gespeichert und ist
          auf allen deinen Geräten gleich.
        </p>

        <label className="block text-sm font-medium text-slate-300">
          E-Mail
          <input
            autoFocus
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="du@beispiel.de"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>

        <label className="block text-sm font-medium text-slate-300">
          Passwort
          <input
            type="password"
            autoComplete={
              mode === 'signin' ? 'current-password' : 'new-password'
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="mindestens 6 Zeichen"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        )}

        {mode === 'signup' && status !== 'signed_in' && (
          <p className="text-xs text-slate-500">
            Dein bisheriger lokaler Spielstand wird beim ersten Anmelden
            automatisch in dein Konto übernommen.
          </p>
        )}

        <button
          type="submit"
          disabled={syncing || !email.trim() || password.length < 6}
          className="w-full rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
        >
          {syncing
            ? 'Einen Moment …'
            : mode === 'signin'
              ? 'Anmelden'
              : 'Konto erstellen'}
        </button>

        <button
          type="button"
          onClick={() => {
            clearError();
            setMode(mode === 'signin' ? 'signup' : 'signin');
          }}
          className="w-full text-sm text-slate-400 transition hover:text-white"
        >
          {mode === 'signin'
            ? 'Noch kein Konto? Jetzt erstellen'
            : 'Ich habe schon ein Konto'}
        </button>
      </form>
    </Modal>
  );
}
