import { useEffect, useState } from 'react';
import { useGroupsStore } from '../store/useGroupsStore';
import { useAuthStore } from '../store/useAuthStore';
import { isCloudConfigured } from '../lib/supabase';
import { AuthModal } from '../components/AuthModal';
import { Modal } from '../components/Modal';
import { GroupMemberCard } from '../components/GroupMemberCard';

export function Groups() {
  const isSignedIn = useAuthStore((s) => s.status) === 'signed_in';
  const myUserId = useAuthStore((s) => s.userId);

  const status = useGroupsStore((s) => s.status);
  const groups = useGroupsStore((s) => s.groups);
  const selectedGroupId = useGroupsStore((s) => s.selectedGroupId);
  const members = useGroupsStore((s) => s.members);
  const busy = useGroupsStore((s) => s.busy);
  const error = useGroupsStore((s) => s.error);
  const load = useGroupsStore((s) => s.load);
  const select = useGroupsStore((s) => s.select);
  const create = useGroupsStore((s) => s.create);
  const join = useGroupsStore((s) => s.join);
  const leave = useGroupsStore((s) => s.leave);

  const [showAuth, setShowAuth] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'join' | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (isSignedIn) void load();
  }, [isSignedIn, load]);

  const selected = groups.find((g) => g.id === selectedGroupId);
  const list = selected ? (members[selected.id] ?? []) : [];
  // Highest character level first – that is what "gemeinsam leveln" is about.
  const ranked = [...list].sort(
    (a, b) => (b.stats?.level ?? 0) - (a.stats?.level ?? 0),
  );

  const copyCode = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied – the code is visible anyway.
    }
  };

  if (!isCloudConfigured) {
    return (
      <Empty
        title="Gruppen brauchen ein Konto"
        text="Diese Installation läuft ohne Cloud-Anbindung. Wie du sie einrichtest, steht in SETUP.md."
      />
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <Empty
          title="Mit Freunden leveln"
          text="Erstell eine Gruppe, teile den Code – und ihr seht gegenseitig euer Level, eure Bereiche und eure Streaks. Aktivitäten, Skills, Ziele und Notizen bleiben privat."
          action={
            <button
              onClick={() => setShowAuth(true)}
              className="rounded-lg bg-sky-500 px-5 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400"
            >
              Anmelden und loslegen
            </button>
          }
        />
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">👥 Gruppen</h1>
          <p className="text-sm text-slate-400">
            Level gemeinsam mit Freunden – sichtbar sind nur Name, Level und
            Streak.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setCode('');
              setDialog('join');
            }}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium transition hover:border-slate-500"
          >
            Beitreten
          </button>
          <button
            onClick={() => {
              setName('');
              setDialog('create');
            }}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-sky-400"
          >
            + Gruppe erstellen
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {status === 'loading' && groups.length === 0 && (
        <p className="animate-pulse text-slate-400">Lade deine Gruppen …</p>
      )}

      {status !== 'loading' && groups.length === 0 && !error && (
        <Empty
          title="Noch keine Gruppe"
          text="Erstell eine Gruppe und schick den Code an deine Freunde – oder tritt mit einem Code bei, den du bekommen hast."
        />
      )}

      {groups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => void select(group.id)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                group.id === selectedGroupId
                  ? 'border-sky-400 bg-sky-400/10 text-sky-300'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold">{selected.name}</h2>
              <p className="text-sm text-slate-400">
                {ranked.length} {ranked.length === 1 ? 'Mitglied' : 'Mitglieder'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void copyCode()}
                title="Einladungscode kopieren"
                className="rounded-lg border border-slate-700 px-4 py-2 font-mono text-lg font-bold tracking-widest transition hover:border-sky-500"
              >
                {selected.inviteCode}
              </button>
              <span className="text-xs text-slate-500">
                {copied ? 'Kopiert!' : 'Code zum Teilen'}
              </span>
            </div>
          </div>

          <ul className="space-y-2">
            {ranked.map((member, index) => (
              <GroupMemberCard
                key={member.userId}
                member={member}
                rank={index + 1}
                isSelf={member.userId === myUserId}
              />
            ))}
          </ul>

          <button
            onClick={() => setConfirmLeave(true)}
            className="text-sm text-slate-500 transition hover:text-rose-400"
          >
            Gruppe verlassen
          </button>
        </section>
      )}

      {dialog === 'create' && (
        <Modal title="Gruppe erstellen" onClose={() => setDialog(null)}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await create(name)) setDialog(null);
            }}
          >
            <label className="block text-sm font-medium text-slate-300">
              Name der Gruppe
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Die Montagsrunde"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <p className="text-xs text-slate-500">
              Danach bekommst du einen Code, den du an deine Freunde
              weitergibst.
            </p>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="w-full rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
            >
              {busy ? 'Wird erstellt …' : 'Gruppe erstellen'}
            </button>
          </form>
        </Modal>
      )}

      {dialog === 'join' && (
        <Modal title="Gruppe beitreten" onClose={() => setDialog(null)}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await join(code)) setDialog(null);
            }}
          >
            <label className="block text-sm font-medium text-slate-300">
              Einladungscode
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center font-mono text-2xl tracking-[0.3em] placeholder-slate-700 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy || code.trim().length < 4}
              className="w-full rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
            >
              {busy ? 'Trete bei …' : 'Beitreten'}
            </button>
          </form>
        </Modal>
      )}

      {confirmLeave && selected && (
        <Modal title="Gruppe verlassen?" onClose={() => setConfirmLeave(false)}>
          <p className="text-sm text-slate-300">
            Du verlässt „{selected.name}“. Dein eigener Fortschritt bleibt
            komplett erhalten – die anderen sehen dich danach nicht mehr.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setConfirmLeave(false)}
              className="flex-1 rounded-lg border border-slate-700 py-2.5 font-medium transition hover:border-slate-500"
            >
              Abbrechen
            </button>
            <button
              onClick={async () => {
                await leave(selected.id);
                setConfirmLeave(false);
              }}
              disabled={busy}
              className="flex-1 rounded-lg bg-rose-500 py-2.5 font-bold text-slate-950 transition hover:bg-rose-400 disabled:opacity-40"
            >
              Verlassen
            </button>
          </div>
        </Modal>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}

function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-12 text-center">
      <div className="text-4xl">👥</div>
      <h2 className="mt-3 text-xl font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
