import { useMemo, useState } from 'react';
import {
  DEFAULT_ANSWER,
  MAX_SIDE_GOALS,
  ONBOARDING_AREAS,
  type AreaAnswer,
  type ExperienceLevel,
  type OnboardingAnswers,
  type ResolvedNode,
} from '../data/onboarding';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { isCloudConfigured } from '../lib/supabase';
import { fetchGeneratedTree } from '../lib/ai';
import { AuthModal } from '../components/AuthModal';

type BuildState = 'idle' | 'pending' | 'done' | 'failed';

export function Onboarding() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>(
    ONBOARDING_AREAS.map((a) => a.areaId),
  );
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [busy, setBusy] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [buildStates, setBuildStates] = useState<Record<string, BuildState>>({});
  const [buildError, setBuildError] = useState<string | null>(null);
  const isSignedIn = useAuthStore((s) => s.status) === 'signed_in';

  const activeAreas = useMemo(
    () => ONBOARDING_AREAS.filter((a) => selectedAreaIds.includes(a.areaId)),
    [selectedAreaIds],
  );

  // Step 0 = name, 1 = area picking, then one step per area, then the
  // question of how the trees should be built.
  const totalSteps = 3 + activeAreas.length;
  const isBuildStep = step === totalSteps - 1;
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

  const sideGoalsOf = (areaId: string): string[] =>
    answerFor(areaId).sideGoals;

  const updateSideGoal = (areaId: string, index: number, value: string) => {
    const next = [...sideGoalsOf(areaId)];
    next[index] = value;
    updateAnswer(areaId, { sideGoals: next });
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
        : currentArea
          ? answerFor(currentArea.areaId).goalText.trim().length > 2
          : true;

  const finishWithTemplates = async () => {
    if (busy) return;
    setBusy(true);
    await completeOnboarding({ name, selectedAreaIds, answers });
  };

  /**
   * Designs every selected area's tree in parallel. A failure is contained:
   * that area silently falls back to the template catalog, so onboarding
   * always finishes with a complete set of trees.
   */
  const finishWithAi = async () => {
    if (busy) return;
    setBusy(true);
    setBuildError(null);
    setBuildStates(
      Object.fromEntries(activeAreas.map((a) => [a.areaId, 'pending'])),
    );

    const results = await Promise.all(
      activeAreas.map(async (config) => {
        const answer = answerFor(config.areaId);
        try {
          const nodes = await fetchGeneratedTree({
            areaName: config.name,
            areaDescription: config.description,
            experience: answer.experience,
            focus: config.focusOptions
              .filter((o) => answer.tags.includes(o.tag))
              .map((o) => o.label.replace(/^\S+\s/, '')),
            goalText: answer.goalText,
            sideGoals: answer.sideGoals,
          });
          setBuildStates((prev) => ({
            ...prev,
            [config.areaId]: nodes.length > 0 ? 'done' : 'failed',
          }));
          return [config.areaId, nodes] as const;
        } catch (error) {
          setBuildStates((prev) => ({ ...prev, [config.areaId]: 'failed' }));
          setBuildError((error as Error).message);
          return [config.areaId, [] as ResolvedNode[]] as const;
        }
      }),
    );

    const aiNodesByArea: Record<string, ResolvedNode[]> = {};
    for (const [areaId, nodes] of results) {
      if (nodes.length > 0) aiNodesByArea[areaId] = nodes;
    }

    // Let the finished state show for a beat before the dashboard appears.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await completeOnboarding({ name, selectedAreaIds, answers, aiNodesByArea });
  };

  const next = () => {
    if (!canContinue) return;
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
                Dein Leben als Skill-Tree. Gleich fragen wir dich vor allem
                nach deinen Zielen – daraus bauen wir für jeden Bereich einen
                Weg, der genau dorthin führt. Ändern kannst du später alles.
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

              {/* Main goal – this is what the tree is built around */}
              <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <h3 className="text-sm font-semibold text-slate-200">
                  🎯 Dein Hauptziel in diesem Bereich
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Je konkreter, desto genauer der Baum. „Besser werden" ergibt
                  einen Baum für alle — „5 km am Stück laufen" ergibt deinen.
                </p>
                <input
                  value={answerFor(currentArea.areaId).goalText}
                  onChange={(e) =>
                    updateAnswer(currentArea.areaId, {
                      goalText: e.target.value,
                    })
                  }
                  placeholder={currentArea.goalPlaceholder}
                  className="mt-2.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {currentArea.goalExamples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() =>
                        updateAnswer(currentArea.areaId, { goalText: example })
                      }
                      className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
                    >
                      {example}
                    </button>
                  ))}
                </div>

                {/* Side goals become their own branches next to the main one */}
                <div className="mt-4 border-t border-slate-800 pt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nebenziele
                    <span className="ml-1 font-normal normal-case tracking-normal">
                      (optional, eigener Ast im Baum)
                    </span>
                  </h4>
                  {sideGoalsOf(currentArea.areaId).map((goal, index) => (
                    <input
                      key={index}
                      value={goal}
                      onChange={(e) =>
                        updateSideGoal(currentArea.areaId, index, e.target.value)
                      }
                      placeholder={`Nebenziel ${index + 1}`}
                      className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                    />
                  ))}
                  {sideGoalsOf(currentArea.areaId).length < MAX_SIDE_GOALS && (
                    <button
                      type="button"
                      onClick={() =>
                        updateAnswer(currentArea.areaId, {
                          sideGoals: [...sideGoalsOf(currentArea.areaId), ''],
                        })
                      }
                      className="mt-2 text-xs text-slate-400 transition hover:text-white"
                    >
                      + Nebenziel hinzufügen
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}


          {isBuildStep && (
            <div>
              <h2 className="text-xl font-bold">
                Wie sollen deine Bäume entstehen?
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">
                Beides führt zu einem vollständigen Baum pro Bereich — ändern
                kannst du danach jeden Knoten.
              </p>

              {busy ? (
                <div className="mt-6 space-y-2">
                  {activeAreas.map((area) => {
                    const state = buildStates[area.areaId] ?? 'idle';
                    return (
                      <div
                        key={area.areaId}
                        className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3"
                      >
                        <span className="text-xl">{area.icon}</span>
                        <span className="flex-1 font-medium">{area.name}</span>
                        <span className="text-sm text-slate-400">
                          {state === 'pending' && (
                            <span className="animate-pulse">entwirft …</span>
                          )}
                          {state === 'done' && (
                            <span className="text-emerald-400">✓ fertig</span>
                          )}
                          {state === 'failed' && (
                            <span className="text-amber-400">Vorlage</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  <p className="pt-2 text-center text-xs text-slate-500">
                    Das dauert einen Moment — die KI entwirft jeden Baum einzeln.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (isSignedIn) void finishWithAi();
                      else setShowAuth(true);
                    }}
                    disabled={!isCloudConfigured}
                    className="w-full rounded-xl border border-sky-500/50 bg-sky-500/10 p-4 text-left transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="font-bold text-sky-300">
                      ✨ Von der KI entwerfen lassen
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      {!isCloudConfigured
                        ? 'Dafür muss die App mit einem Konto verbunden sein — siehe SETUP.md.'
                        : isSignedIn
                          ? 'Baut für jeden Bereich einen eigenen Baum aus deinen Antworten.'
                          : 'Braucht ein Konto — du kannst dich gleich hier anmelden.'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => void finishWithTemplates()}
                    className="w-full rounded-xl border border-slate-700 p-4 text-left transition hover:border-slate-500"
                  >
                    <div className="font-bold">⚔️ Aus Vorlagen erstellen</div>
                    <div className="mt-1 text-sm text-slate-400">
                      Sofort fertig, funktioniert auch ohne Konto und ohne Netz.
                    </div>
                  </button>

                  {buildError && (
                    <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                      {buildError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-7 flex items-center gap-3">
            {step > 0 && !busy && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Zurück
              </button>
            )}
            {!isBuildStep && (
              <button
                type="button"
                onClick={next}
                disabled={!canContinue || busy}
                className="flex-1 rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
              >
                Weiter
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Ohne Konto bleiben alle Daten lokal auf deinem Gerät.
        </p>
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => {
            setShowAuth(false);
            if (useAuthStore.getState().status === 'signed_in') void finishWithAi();
          }}
        />
      )}
    </div>
  );
}
