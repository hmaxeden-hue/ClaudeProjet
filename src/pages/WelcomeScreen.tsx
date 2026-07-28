import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

export function WelcomeScreen() {
  const createProfile = useAppStore((s) => s.createProfile);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    await createProfile(name);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center shadow-2xl">
        <div className="text-6xl">⚔️</div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Life RPG</h1>
        <p className="mt-3 text-slate-400">
          Dein Leben als Skill-Tree: Level dich in Wissen, Kommunikation,
          Gesundheit, Purpose und Finanzen – Schritt für Schritt, in deinem
          eigenen Spiel.
        </p>
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <label className="block text-left text-sm font-medium text-slate-300">
            Wie heißt dein Charakter?
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dein Name"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-sky-500 py-3 font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
          >
            {busy ? 'Erstelle deine Welt …' : 'Abenteuer starten'}
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          Alle Daten bleiben lokal auf deinem Gerät gespeichert.
        </p>
      </div>
    </div>
  );
}
