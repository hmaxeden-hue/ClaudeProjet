import { useMemo, useState } from 'react';
import type { SkillNode } from '../types/models';
import { useAppStore } from '../store/useAppStore';

interface NodeNotesProps {
  node: SkillNode;
  color: string;
  /** Focus the field on mount – used where writing is the point of the screen. */
  autoFocus?: boolean;
}

/**
 * Notes for one skill: what is already written down, plus a field for the next
 * entry. Used inline in the node detail and inside the quick-note dialog, so
 * there is exactly one implementation of "write something down".
 */
export function NodeNotes({ node, color, autoFocus = false }: NodeNotesProps) {
  const allNotes = useAppStore((s) => s.notes);
  const saveNote = useAppStore((s) => s.saveNote);
  const deleteNote = useAppStore((s) => s.deleteNote);

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const notes = useMemo(
    () =>
      allNotes
        .filter((n) => n.nodeId === node.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allNotes, node.id],
  );

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await saveNote({ nodeId: node.id, text });
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Notizen
        </h3>
        {notes.length > 0 && (
          <span className="text-xs text-slate-500">
            {notes.length} {notes.length === 1 ? 'Eintrag' : 'Einträge'} · im
            Journal
          </span>
        )}
      </div>

      {node.needsNotes && notes.length === 0 && (
        <p className="mt-1.5 rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: `${color}44`,
            backgroundColor: `${color}0d`,
            color: '#cbd5e1',
          }}
        >
          Bei dieser Aufgabe sind deine Notizen das Ergebnis — halte hier fest,
          was du beobachtest.
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter alone should make a new line; sending is deliberate.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
        }}
        autoFocus={autoFocus}
        rows={3}
        placeholder="Was ist dir aufgefallen?"
        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder-slate-600 focus:border-sky-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!text.trim() || saving}
        className="mt-1.5 w-full rounded-lg py-2 text-sm font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
        style={{ backgroundColor: color }}
      >
        {saving ? 'Speichert …' : 'Notiz speichern'}
      </button>

      {notes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {notes.map((entry) => (
            <li
              key={entry.id}
              className="group rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm text-slate-200">
                  {entry.text}
                </p>
                <button
                  type="button"
                  onClick={() => void deleteNote(entry.id)}
                  aria-label="Notiz löschen"
                  className="shrink-0 text-xs text-slate-600 transition hover:text-rose-400"
                >
                  ✕
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {new Date(entry.createdAt).toLocaleString('de-DE', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
