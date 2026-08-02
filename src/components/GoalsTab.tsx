import { useState } from 'react';
import type { Area, Goal } from '../types/models';
import { useAppStore } from '../store/useAppStore';
import {
  GOAL_SIZE_META,
  GOAL_SIZES,
  GOAL_XP,
  type GoalSize,
} from '../lib/xp';
import { createId } from '../lib/id';
import { Modal } from './Modal';

interface GoalsTabProps {
  area: Area;
}

export function GoalsTab({ area }: GoalsTabProps) {
  const goals = useAppStore((s) => s.goals).filter(
    (g) => g.areaId === area.id,
  );
  const achieveGoal = useAppStore((s) => s.achieveGoal);
  const deleteGoal = useAppStore((s) => s.deleteGoal);

  const [editing, setEditing] = useState<Goal | null>(null);
  const [showForm, setShowForm] = useState(false);

  const open = goals.filter((g) => g.status === 'open');
  const achieved = goals.filter((g) => g.status === 'achieved');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Deine frei definierten Ziele für {area.name}.
        </p>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          + Neues Ziel
        </button>
      </div>

      {goals.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
          Noch keine Ziele. Definiere, wohin die Reise gehen soll!
        </p>
      )}

      {open.map((goal) => (
        <div
          key={goal.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
        >
          <div className="min-w-0">
            <h3 className="font-semibold">{goal.title}</h3>
            {goal.description && (
              <p className="mt-0.5 truncate text-sm text-slate-400">
                {goal.description}
              </p>
            )}
            <div className="mt-1 flex gap-3 text-xs text-slate-500">
              {goal.targetDate && (
                <span>
                  🎯 bis {new Date(goal.targetDate).toLocaleDateString('de-DE')}
                </span>
              )}
              <span>+{goal.xpReward} XP</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => void achieveGoal(goal.id)}
              className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-950 transition hover:brightness-110"
              style={{ backgroundColor: area.color }}
            >
              ✓ Erreicht
            </button>
            <button
              onClick={() => {
                setEditing(goal);
                setShowForm(true);
              }}
              className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-sm text-slate-400 hover:text-white"
              aria-label="Ziel bearbeiten"
            >
              ✎
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Ziel "${goal.title}" löschen?`)) {
                  void deleteGoal(goal.id);
                }
              }}
              className="rounded-lg border border-slate-800 px-2.5 py-1.5 text-sm text-rose-400 hover:border-rose-500"
              aria-label="Ziel löschen"
            >
              🗑
            </button>
          </div>
        </div>
      ))}

      {achieved.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Erreicht
          </h3>
          {achieved.map((goal) => (
            <div
              key={goal.id}
              className="mb-2 flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/30 p-3 text-sm"
            >
              <span className="text-slate-400">
                ✅ <span className="line-through">{goal.title}</span>
              </span>
              <span className="text-xs text-slate-500">
                {goal.achievedAt &&
                  new Date(goal.achievedAt).toLocaleDateString('de-DE')}
              </span>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <GoalFormModal
          areaId={area.id}
          goal={editing}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function GoalFormModal({
  areaId,
  goal,
  onClose,
}: {
  areaId: string;
  goal: Goal | null;
  onClose: () => void;
}) {
  const saveGoal = useAppStore((s) => s.saveGoal);
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [size, setSize] = useState<GoalSize>(goal?.size ?? 'medium');

  const submit = async () => {
    if (!title.trim()) return;
    await saveGoal({
      id: goal?.id ?? createId(),
      areaId,
      title: title.trim(),
      description: description.trim(),
      targetDate: targetDate || undefined,
      status: goal?.status ?? 'open',
      size,
      xpReward: GOAL_XP[size],
      achievedAt: goal?.achievedAt,
    });
    onClose();
  };

  return (
    <Modal title={goal ? 'Ziel bearbeiten' : 'Neues Ziel'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm font-medium text-slate-300">
          Titel
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. 12 Bücher dieses Jahr"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium text-slate-300">
          Beschreibung
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium text-slate-300">
          Zieldatum
          <span className="ml-1 font-normal text-slate-500">(optional)</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>

        <div>
          <span className="text-sm font-medium text-slate-300">Umfang</span>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {GOAL_SIZES.map((value) => {
              const selected = value === size;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSize(value)}
                  className={`rounded-lg border px-2 py-2 text-center transition ${
                    selected
                      ? 'border-sky-400 bg-sky-400/10'
                      : 'border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="text-sm font-semibold">
                    {GOAL_SIZE_META[value].label}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {GOAL_SIZE_META[value].hint}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-sky-300">
                    +{GOAL_XP[value]} XP
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400"
        >
          {goal ? 'Speichern' : 'Ziel anlegen'}
        </button>
      </form>
    </Modal>
  );
}
