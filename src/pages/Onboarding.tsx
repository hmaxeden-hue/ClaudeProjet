import { useMemo, useState } from 'react';
import {
  ONBOARDING_AREAS,
  type AreaAnswer,
  type ExperienceLevel,
  type OnboardingAnswers,
} from '../data/onboarding';
import { useAppStore } from '../store/useAppStore';

const DEFAULT_ANSWER: AreaAnswer = {
  experience: 'beginner',
  tags: [],
  goalText: '',
};

export function Onboarding() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>(
    ONBOARDING_AREAS.map((a) => a.areaId),
  );
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [busy, setBusy] = useState(false);

  const activeAreas = useMemo(
    () => ONBOARDING_AREAS.filter((a) => selectedAreaIds.includes(a.areaId)),
    [selectedAreaIds],
  );

  // Step 0 = name, step 1 = area picking, then one step per selected area.
  const totalSteps = 2 + activeAreas.length;
  const areaStepIndex = step - 2;
  const currentArea = activeAreas[areaStepIndex];

  const answerFor = (areaId: string): AreaAnswer =>
    answers[areaId] ?? DEFAULT_ANSWER;

  const updateAnswer = (areaId: string, patch: Partial<AreaAnswer>) => {
    setAnswers((prev) => ({
      ...prev,
      [areaId]: { ...(prev[areaId] ?? DEFAULT_ANSWER), ...patch },
    }));
  };

  const toggleArea = (areaId: string) => {
    setSelectedAreaIds((prev) =>
      prev.includes(areaId)
        ? prev.filter((id) => id !== areaId)
        : [...prev, areaId],
    );
  };

  const canContinue =
    step === 0
      ? name.trim().length > 0
      : step === 1
        ? selectedAreaIds.length > 0
        : true;

  const isLastStep = step === totalSteps - 1;

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    await completeOnboarding({ name, selectedAreaIds, answers });
  };

  const next = () => {
    if (!canContinue) return;
    if (isLastStep) {
      void finish();
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        {/* Progress */}
        <div className="mb-6 flex gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-sky-500' : 'bg-slate-800'
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl sm:p-8">
          {step === 0 && (
            <div className="text-center">
              <div className="text-6xl">⚔️</div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
                Life RPG
              </h1>
              <p className="mt-3 text-slate-400">
                Dein Leben als Skill-Tree. In den nächsten Schritten stellen wir
                dir ein paar Fragen – daraus bauen wir einen Baum, der zu dir
                passt. Ändern kannst du später alles.
              </p>
              <label className="mt-6 block text-left text-sm font-medium text-slate-300">
                Wie heißt dein Charakter?
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && next()}
                  placeholder="Dein Name"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold">
                Welche Bereiche willst du leveln?
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">
                Wähle aus, was für dich zählt. Eigene Bereiche kannst du später
                jederzeit ergänzen.
              </p>
              <div className="mt-5 space-y-2">
                {ONBOARDING_AREAS.map((area) => {
                  const selected = selectedAreaIds.includes(area.areaId);
                  return (
                    <button
                      key={area.areaId}
                      type="button"
                      onClick={() => toggleArea(area.areaId)}
                      className="flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition"
                      style={{
                        borderColor: selected ? area.color : '#1e293b',
                        backgroundColor: selected
                          ? `${area.color}14`
                          : 'transparent',
                      }}
                    >
                      <span className="text-2xl">{area.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{area.name}</div>
                        <div className="text-xs text-slate-400">
                          {area.description}
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-lg"
                        style={{ color: selected ? area.color : '#475569' }}
                      >
                        {selected ? '✓' : '＋'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {currentArea && (
            <div>
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl"
                  style={{ backgroundColor: `${currentArea.color}1a` }}
                >
                  {currentArea.icon}
                </span>
                <div>
                  <h2 className="text-xl font-bold">{currentArea.name}</h2>
                  <p className="text-xs text-slate-500">
                    Bereich {areaStepIndex + 1} von {activeAreas.length}
                  </p>
                </div>
              </div>

              {/* Experience */}
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-300">
                  {currentArea.experiencePrompt}
                </h3>
                <div className="mt-2 space-y-2">
                  {currentArea.experienceOptions.map((option) => {
                    const selected =
                      answerFor(currentArea.areaId).experience === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          updateAnswer(currentArea.areaId, {
                            experience: option.value as ExperienceLevel,
                          })
                        }
                        className="w-full rounded-xl border p-3 text-left transition"
                        style={{
                          borderColor: selected ? currentArea.color : '#1e293b',
                          backgroundColor: selected
                            ? `${currentArea.color}14`
                            : 'transparent',
                        }}
                      >
                        <div className="text-sm font-semibold">
                          {option.label}
                        </div>
                        <div className="text-xs text-slate-400">
                          {option.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Focus tags */}
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-300">
                  {currentArea.focusPrompt}
                </h3>
                <p className="text-xs text-slate-500">Mehrfachauswahl möglich</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {currentArea.focusOptions.map((option) => {
                    const tags = answerFor(currentArea.areaId).tags;
                    const selected = tags.includes(option.tag);
                    return (
                      <button
                        key={option.tag}
                        type="button"
                        onClick={() =>
                          updateAnswer(currentArea.areaId, {
                            tags: selected
                              ? tags.filter((t) => t !== option.tag)
                              : [...tags, option.tag],
                          })
                        }
                        className="rounded-full border px-3.5 py-1.5 text-sm transition"
                        style={{
                          borderColor: selected ? currentArea.color : '#334155',
                          backgroundColor: selected
                            ? `${currentArea.color}1a`
                            : 'transparent',
                          color: selected ? currentArea.color : '#cbd5e1',
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Free-text goal */}
              <label className="mt-5 block text-sm font-semibold text-slate-300">
                {currentArea.goalPrompt}
                <span className="ml-1 font-normal text-slate-500">
                  (optional)
                </span>
                <input
                  value={answerFor(currentArea.areaId).goalText}
                  onChange={(e) =>
                    updateAnswer(currentArea.areaId, {
                      goalText: e.target.value,
                    })
                  }
                  placeholder={currentArea.goalPlaceholder}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-7 flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Zurück
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={!canContinue || busy}
              className="flex-1 rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
            >
              {busy
                ? 'Baue deine Welt …'
                : isLastStep
                  ? '⚔️ Skill-Trees erstellen'
                  : 'Weiter'}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Alle Daten bleiben lokal auf deinem Gerät gespeichert.
        </p>
      </div>
    </div>
  );
}
