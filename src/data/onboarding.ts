import type {
  Area,
  Goal,
  LogEntry,
  NodeType,
  SkillNode,
  SuggestedActivity,
} from '../types/models';
import { createId } from '../lib/id';
import { recomputeNodeStatuses } from '../lib/tree';

/**
 * Onboarding catalog: per area a set of questions plus a pool of node
 * templates. The answers decide which optional nodes are included and how
 * much of the tree already counts as completed, so every person ends up
 * with a different starting tree.
 */

/** Where the user stands today – decides the pre-completed part of the tree. */
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

interface NodeTemplate {
  /** Unique within its area; referenced by `prerequisites`. */
  key: string;
  title: string;
  description: string;
  prerequisites: string[];
  xpReward: number;
  type: NodeType;
  /** 0 = foundation … 3 = mastery. Used together with the experience answer. */
  stage: number;
  /** Optional node – only included when the user picked this focus tag. */
  requiresTag?: string;
}

interface ExperienceOption {
  value: ExperienceLevel;
  label: string;
  description: string;
  /** Templates up to and including this stage start out as completed. */
  completedThroughStage: number;
}

export interface OnboardingAreaConfig {
  areaId: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  suggestedActivities: SuggestedActivity[];
  experiencePrompt: string;
  experienceOptions: ExperienceOption[];
  focusPrompt: string;
  focusOptions: { tag: string; label: string }[];
  goalPrompt: string;
  goalPlaceholder: string;
  templates: NodeTemplate[];
}

const STANDARD_EXPERIENCE = (
  beginner: string,
  intermediate: string,
  advanced: string,
): ExperienceOption[] => [
  {
    value: 'beginner',
    label: 'Am Anfang',
    description: beginner,
    completedThroughStage: -1,
  },
  {
    value: 'intermediate',
    label: 'Schon dabei',
    description: intermediate,
    completedThroughStage: 0,
  },
  {
    value: 'advanced',
    label: 'Weit fortgeschritten',
    description: advanced,
    completedThroughStage: 1,
  },
];

export const ONBOARDING_AREAS: OnboardingAreaConfig[] = [
  {
    areaId: 'area-knowledge',
    name: 'Wissen',
    icon: '📚',
    color: '#38bdf8',
    description:
      'Wissen aufbauen durch Bücher, Videos und eigene Notizen zu Themen, die dich weiterbringen.',
    suggestedActivities: [
      { label: 'Kapitel gelesen', xp: 15 },
      { label: 'Sachbuch beendet', xp: 60 },
      { label: 'Lehrvideo geschaut', xp: 10 },
      { label: 'Zusammenfassung geschrieben', xp: 25 },
    ],
    experiencePrompt: 'Wie viel liest oder lernst du aktuell?',
    experienceOptions: STANDARD_EXPERIENCE(
      'Eher selten – ich will damit anfangen.',
      'Ab und zu ein Buch oder Lernvideo.',
      'Regelmäßig, Lernen gehört zu meinem Alltag.',
    ),
    focusPrompt: 'Worauf willst du dich konzentrieren?',
    focusOptions: [
      { tag: 'books', label: '📖 Sachbücher' },
      { tag: 'videos', label: '🎬 Lernvideos & Kurse' },
      { tag: 'notes', label: '🗂️ Notizen & Wissenssystem' },
      { tag: 'teaching', label: '🧑‍🏫 Weitergeben & erklären' },
    ],
    goalPrompt: 'Hast du ein konkretes Ziel für diesen Bereich?',
    goalPlaceholder: 'z. B. 12 Bücher in diesem Jahr lesen',
    templates: [
      {
        key: 'first-book',
        title: 'Erstes Buch fertiggelesen',
        description: 'Ein Sachbuch deiner Wahl komplett durchgelesen.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'learn-source',
        title: 'Lernquellen kuratiert',
        description:
          'Eine Liste mit Kanälen, Kursen oder Newslettern, denen du wirklich folgen willst.',
        prerequisites: [],
        xpReward: 40,
        type: 'quest',
        stage: 0,
        requiresTag: 'videos',
      },
      {
        key: 'routine',
        title: 'Lese-Routine etabliert',
        description: 'Vier Wochen in Folge regelmäßig gelesen oder gelernt.',
        prerequisites: ['first-book'],
        xpReward: 75,
        type: 'habit',
        stage: 1,
      },
      {
        key: 'notes',
        title: 'Notiz-System aufgebaut',
        description:
          'Ein System, in dem du Gelerntes festhältst und zuverlässig wiederfindest.',
        prerequisites: ['first-book'],
        xpReward: 75,
        type: 'quest',
        stage: 1,
        requiresTag: 'notes',
      },
      {
        key: 'five-books',
        title: '5 Bücher gelesen',
        description: 'Fünf Bücher komplett durchgearbeitet.',
        prerequisites: ['routine'],
        xpReward: 100,
        type: 'milestone',
        stage: 2,
        requiresTag: 'books',
      },
      {
        key: 'summary',
        title: 'Erste Zusammenfassung geschrieben',
        description: 'Ein Buch oder Thema in eigenen Worten zusammengefasst.',
        prerequisites: ['routine'],
        xpReward: 75,
        type: 'quest',
        stage: 2,
      },
      {
        key: 'teach',
        title: 'Wissen weitergegeben',
        description: 'Jemandem etwas Gelerntes verständlich erklärt.',
        prerequisites: ['summary'],
        xpReward: 100,
        type: 'quest',
        stage: 2,
        requiresTag: 'teaching',
      },
      {
        key: 'ten-books',
        title: '10 Bücher pro Jahr',
        description: 'Zehn Bücher innerhalb eines Jahres gelesen.',
        prerequisites: ['five-books'],
        xpReward: 150,
        type: 'milestone',
        stage: 3,
        requiresTag: 'books',
      },
      {
        key: 'deep-dive',
        title: 'Thema in die Tiefe durchdrungen',
        description:
          'Ein Thema aus mehreren Quellen erarbeitet, bis du es sicher erklären kannst.',
        prerequisites: ['summary'],
        xpReward: 150,
        type: 'milestone',
        stage: 3,
      },
    ],
  },
  {
    areaId: 'area-communication',
    name: 'Kommunikation',
    icon: '🗣️',
    color: '#a78bfa',
    description:
      'Kommunikationsfähigkeit gezielt verbessern und im echten Kontakt anwenden.',
    suggestedActivities: [
      { label: 'Buch/Video zu Rhetorik durchgearbeitet', xp: 25 },
      { label: 'Technik im Gespräch angewandt', xp: 20 },
      { label: 'Vor Gruppe gesprochen', xp: 40 },
      { label: 'Aktiv zugehört & nachgefragt', xp: 15 },
    ],
    experiencePrompt: 'Wie wohl fühlst du dich im Gespräch mit anderen?',
    experienceOptions: STANDARD_EXPERIENCE(
      'Oft unsicher – besonders mit fremden Menschen.',
      'Im Alltag okay, in größeren Runden schwieriger.',
      'Sicher – ich will gezielt an Feinheiten arbeiten.',
    ),
    focusPrompt: 'Was möchtest du besonders verbessern?',
    focusOptions: [
      { tag: 'listening', label: '👂 Zuhören & Fragen stellen' },
      { tag: 'smalltalk', label: '💬 Auf Menschen zugehen' },
      { tag: 'presenting', label: '🎤 Vor Gruppen sprechen' },
      { tag: 'conflict', label: '🤝 Konflikte & schwierige Gespräche' },
    ],
    goalPrompt: 'Hast du ein konkretes Ziel für diesen Bereich?',
    goalPlaceholder: 'z. B. einen Vortrag im Team halten',
    templates: [
      {
        key: 'listening-basics',
        title: 'Grundlagen aktives Zuhören',
        description:
          'Prinzipien des aktiven Zuhörens gelernt und bewusst ausprobiert.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'rhetoric-basics',
        title: 'Rhetorik-Grundlagen durchgearbeitet',
        description: 'Ein Buch oder ein Kurs zu Rhetorik und Kommunikation.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'apply-technique',
        title: 'Technik bewusst angewandt',
        description:
          'Eine gelernte Gesprächstechnik mehrfach im Alltag eingesetzt.',
        prerequisites: ['listening-basics', 'rhetoric-basics'],
        xpReward: 75,
        type: 'habit',
        stage: 1,
      },
      {
        key: 'ask-deeper',
        title: 'Echtes Interesse gezeigt',
        description:
          'In fünf Gesprächen bewusst nachgefragt statt nur zu antworten.',
        prerequisites: ['listening-basics'],
        xpReward: 75,
        type: 'habit',
        stage: 1,
        requiresTag: 'listening',
      },
      {
        key: 'stranger',
        title: 'Gespräch mit Fremdem begonnen',
        description: 'Aus eigener Initiative ein Gespräch gestartet.',
        prerequisites: ['apply-technique'],
        xpReward: 100,
        type: 'quest',
        stage: 2,
        requiresTag: 'smalltalk',
      },
      {
        key: 'group',
        title: 'Vor einer Gruppe gesprochen',
        description: 'Einen Beitrag vor mehreren Personen gehalten.',
        prerequisites: ['apply-technique'],
        xpReward: 100,
        type: 'quest',
        stage: 2,
        requiresTag: 'presenting',
      },
      {
        key: 'difficult-talk',
        title: 'Schwieriges Gespräch geführt',
        description:
          'Ein unangenehmes Thema ruhig und klar angesprochen statt es zu vermeiden.',
        prerequisites: ['apply-technique'],
        xpReward: 100,
        type: 'quest',
        stage: 2,
        requiresTag: 'conflict',
      },
      {
        key: 'presentation',
        title: 'Präsentation gehalten',
        description: 'Eine vorbereitete Präsentation souverän gehalten.',
        prerequisites: ['group'],
        xpReward: 150,
        type: 'milestone',
        stage: 3,
        requiresTag: 'presenting',
      },
      {
        key: 'natural',
        title: 'Kommunikation wird selbstverständlich',
        description:
          'Drei Monate lang bewusst kommuniziert – es fühlt sich normal an.',
        prerequisites: ['apply-technique'],
        xpReward: 150,
        type: 'milestone',
        stage: 3,
      },
    ],
  },
  {
    areaId: 'area-health',
    name: 'Gesundheit',
    icon: '💪',
    color: '#34d399',
    description:
      'Körperliche Form, Energie und Wohlbefinden – nachhaltig und mit Fokus auf Konsistenz.',
    suggestedActivities: [
      { label: 'Training absolviert', xp: 25 },
      { label: 'Sportart betrieben', xp: 20 },
      { label: 'Spaziergang / Bewegung im Alltag', xp: 10 },
      { label: 'Schlaf & Regeneration geachtet', xp: 10 },
    ],
    experiencePrompt: 'Wie aktiv bist du zurzeit?',
    experienceOptions: STANDARD_EXPERIENCE(
      'Kaum Bewegung – ich möchte einsteigen.',
      'Ab und zu aktiv, aber unregelmäßig.',
      'Fester Bestandteil meiner Woche.',
    ),
    focusPrompt: 'Was machst du gern – oder willst du ausprobieren?',
    focusOptions: [
      { tag: 'gym', label: '🏋️ Kraftsport' },
      { tag: 'cardio', label: '🏃 Laufen & Ausdauer' },
      { tag: 'team', label: '⚽ Team- & Ballsport' },
      { tag: 'mobility', label: '🧘 Yoga & Beweglichkeit' },
      { tag: 'outdoor', label: '🥾 Draußen unterwegs' },
      { tag: 'sleep', label: '😴 Schlaf & Erholung' },
    ],
    goalPrompt: 'Hast du ein persönliches Ziel für deine Gesundheit?',
    goalPlaceholder: 'z. B. entspannt 5 km am Stück laufen',
    templates: [
      {
        key: 'baseline',
        title: 'Ausgangslage erfasst',
        description:
          'Ehrlich notiert, wo du stehst und wie du dich fühlst – ohne Bewertung.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'find-sport',
        title: 'Bewegung gefunden, die Spaß macht',
        description:
          'Verschiedenes ausprobiert und etwas gefunden, das du gern machst.',
        prerequisites: ['baseline'],
        xpReward: 75,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'sleep-routine',
        title: 'Schlafroutine aufgebaut',
        description: 'Zwei Wochen lang regelmäßige Schlafenszeiten gehalten.',
        prerequisites: ['baseline'],
        xpReward: 75,
        type: 'habit',
        stage: 1,
        requiresTag: 'sleep',
      },
      {
        key: 'twice-weekly',
        title: '2x Bewegung pro Woche – 4 Wochen',
        description: 'Vier Wochen lang zweimal pro Woche aktiv gewesen.',
        prerequisites: ['find-sport'],
        xpReward: 100,
        type: 'habit',
        stage: 1,
      },
      {
        key: 'strength-base',
        title: 'Grundübungen sauber gelernt',
        description:
          'Die wichtigsten Bewegungen mit sauberer Technik ausgeführt.',
        prerequisites: ['twice-weekly'],
        xpReward: 100,
        type: 'quest',
        stage: 2,
        requiresTag: 'gym',
      },
      {
        key: 'endurance-base',
        title: 'Erste Ausdauer-Distanz geschafft',
        description:
          'Eine Distanz am Stück geschafft, die dir vorher zu weit vorkam.',
        prerequisites: ['twice-weekly'],
        xpReward: 100,
        type: 'milestone',
        stage: 2,
        requiresTag: 'cardio',
      },
      {
        key: 'team-regular',
        title: 'Fester Teil einer Gruppe',
        description:
          'Regelmäßig mit anderen Sport gemacht – Verein, Gruppe oder Freunde.',
        prerequisites: ['twice-weekly'],
        xpReward: 100,
        type: 'habit',
        stage: 2,
        requiresTag: 'team',
      },
      {
        key: 'mobility-routine',
        title: 'Beweglichkeits-Routine etabliert',
        description: 'Regelmäßig gedehnt oder Yoga gemacht – vier Wochen am Stück.',
        prerequisites: ['twice-weekly'],
        xpReward: 100,
        type: 'habit',
        stage: 2,
        requiresTag: 'mobility',
      },
      {
        key: 'outdoor-tour',
        title: 'Größere Tour gemacht',
        description: 'Eine Wanderung oder Tour, auf die du stolz bist.',
        prerequisites: ['twice-weekly'],
        xpReward: 100,
        type: 'milestone',
        stage: 2,
        requiresTag: 'outdoor',
      },
      {
        key: 'three-weekly',
        title: '3x Training pro Woche – 4 Wochen',
        description: 'Die Routine auf dreimal pro Woche gesteigert und gehalten.',
        prerequisites: ['twice-weekly'],
        xpReward: 150,
        type: 'milestone',
        stage: 3,
      },
      {
        key: 'personal-best',
        title: 'Persönliche Bestleistung',
        description:
          'Eine selbst gewählte Bestleistung erreicht – dein Maßstab, niemand sonst.',
        prerequisites: ['three-weekly'],
        xpReward: 150,
        type: 'milestone',
        stage: 3,
      },
    ],
  },
  {
    areaId: 'area-purpose',
    name: 'Purpose',
    icon: '🧭',
    color: '#fb7185',
    description:
      'Klarheit über Werte und übergeordnete Ziele gewinnen, um Erfüllung zu finden.',
    suggestedActivities: [
      { label: 'Reflektiert / Journal geschrieben', xp: 15 },
      { label: 'Wert oder Ziel definiert', xp: 25 },
      { label: 'Sinnstiftende Handlung', xp: 30 },
      { label: 'Rückblick gemacht', xp: 20 },
    ],
    experiencePrompt: 'Wie klar ist dir, was dir wirklich wichtig ist?',
    experienceOptions: STANDARD_EXPERIENCE(
      'Noch ziemlich unklar – ich suche Orientierung.',
      'Eine grobe Richtung habe ich, aber nichts Festes.',
      'Ich kenne meine Werte und arbeite an der Umsetzung.',
    ),
    focusPrompt: 'Was möchtest du angehen?',
    focusOptions: [
      { tag: 'values', label: '💎 Werte klären' },
      { tag: 'journaling', label: '📓 Reflexion & Journaling' },
      { tag: 'goals', label: '🗺️ Ziele & Planung' },
      { tag: 'giving', label: '🤲 Etwas beitragen' },
    ],
    goalPrompt: 'Gibt es etwas, das du in diesem Bereich erreichen willst?',
    goalPlaceholder: 'z. B. jeden Sonntag eine Wochenreflexion',
    templates: [
      {
        key: 'values',
        title: 'Kernwerte formuliert',
        description:
          'Die 3–5 Werte aufgeschrieben, die dir wirklich wichtig sind.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'journal-start',
        title: 'Journal-Routine gestartet',
        description: 'Zwei Wochen regelmäßig reflektiert oder journaled.',
        prerequisites: [],
        xpReward: 75,
        type: 'habit',
        stage: 1,
        requiresTag: 'journaling',
      },
      {
        key: 'year-goals',
        title: 'Jahresziele gesetzt',
        description:
          'Konkrete Ziele für dieses Jahr aus deinen Werten abgeleitet.',
        prerequisites: ['values'],
        xpReward: 75,
        type: 'quest',
        stage: 1,
        requiresTag: 'goals',
      },
      {
        key: 'meaningful-act',
        title: 'Sinnstiftende Handlung umgesetzt',
        description:
          'Etwas getan, das über dich hinaus wirkt – helfen, beitragen, schaffen.',
        prerequisites: ['values'],
        xpReward: 100,
        type: 'quest',
        stage: 2,
        requiresTag: 'giving',
      },
      {
        key: 'monthly-review',
        title: 'Monatlicher Rückblick etabliert',
        description: 'Drei Monate in Folge einen Monatsrückblick gemacht.',
        prerequisites: ['values'],
        xpReward: 100,
        type: 'habit',
        stage: 2,
      },
      {
        key: 'align',
        title: 'Alltag an Werten ausgerichtet',
        description:
          'Eine Gewohnheit bewusst geändert, weil sie nicht zu deinen Werten passte.',
        prerequisites: ['monthly-review'],
        xpReward: 125,
        type: 'quest',
        stage: 3,
      },
      {
        key: 'vision',
        title: 'Lebensvision aufgeschrieben',
        description: 'Ein klares Bild, wohin dein Weg langfristig führen soll.',
        prerequisites: ['monthly-review'],
        xpReward: 150,
        type: 'milestone',
        stage: 3,
      },
    ],
  },
  {
    areaId: 'area-finance',
    name: 'Finanzen',
    icon: '💰',
    color: '#fbbf24',
    description:
      'Der Weg zu finanzieller Freiheit: Überblick, klare Ziele und ein Plan dorthin.',
    suggestedActivities: [
      { label: 'Budget geführt', xp: 15 },
      { label: 'Sparziel-Fortschritt gemacht', xp: 25 },
      { label: 'Investiert (nach eigenem Plan)', xp: 30 },
      { label: 'Finanzwissen aufgebaut', xp: 20 },
    ],
    experiencePrompt: 'Wie gut kennst du deine Finanzen?',
    experienceOptions: STANDARD_EXPERIENCE(
      'Wenig Überblick – ich will Struktur reinbringen.',
      'Grober Überblick, aber kein richtiger Plan.',
      'Klarer Überblick und feste Sparroutine.',
    ),
    focusPrompt: 'Woran willst du arbeiten?',
    focusOptions: [
      { tag: 'budget', label: '📊 Überblick & Budget' },
      { tag: 'saving', label: '🏦 Sparen & Rücklagen' },
      { tag: 'knowledge', label: '🧠 Finanzwissen' },
      { tag: 'investing', label: '📈 Langfristig anlegen' },
    ],
    goalPrompt: 'Hast du ein finanzielles Ziel?',
    goalPlaceholder: 'z. B. drei Monatsausgaben als Rücklage',
    templates: [
      {
        key: 'overview',
        title: 'Überblick über Einnahmen & Ausgaben',
        description: 'Alle Einnahmen und Ausgaben eines Monats erfasst.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'basics',
        title: 'Finanz-Grundwissen aufgebaut',
        description:
          'Grundbegriffe verstanden: Budget, Rücklage, Zinseszins, breite Streuung.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
        requiresTag: 'knowledge',
      },
      {
        key: 'budget-month',
        title: 'Budget einen Monat geführt',
        description: 'Einen vollen Monat bewusst mit Budget gelebt.',
        prerequisites: ['overview'],
        xpReward: 75,
        type: 'habit',
        stage: 1,
        requiresTag: 'budget',
      },
      {
        key: 'first-savings',
        title: 'Erste Rücklage gebildet',
        description: 'Zum ersten Mal bewusst Geld zur Seite gelegt.',
        prerequisites: ['overview'],
        xpReward: 75,
        type: 'quest',
        stage: 1,
      },
      {
        key: 'emergency-fund',
        title: 'Notgroschen aufgebaut',
        description: 'Eine Reserve für Unvorhergesehenes zur Seite gelegt.',
        prerequisites: ['first-savings'],
        xpReward: 150,
        type: 'milestone',
        stage: 2,
        requiresTag: 'saving',
      },
      {
        key: 'savings-rate',
        title: 'Sparquote gehalten',
        description:
          'Drei Monate in Folge deinen selbst gesetzten Sparanteil erreicht.',
        prerequisites: ['first-savings'],
        xpReward: 100,
        type: 'habit',
        stage: 2,
      },
      {
        key: 'plan',
        title: 'Eigenen Finanzplan aufgeschrieben',
        description:
          'Festgehalten, wofür du sparst und in welchen Schritten du dahin kommst.',
        prerequisites: ['savings-rate'],
        xpReward: 125,
        type: 'quest',
        stage: 3,
      },
      {
        key: 'first-investment',
        title: 'Erster Anlage-Schritt gemacht',
        description:
          'Nach eigener Recherche einen ersten, bewussten Schritt beim Anlegen gemacht.',
        prerequisites: ['plan'],
        xpReward: 150,
        type: 'milestone',
        stage: 3,
        requiresTag: 'investing',
      },
      {
        key: 'wealth-milestone',
        title: 'Selbst gesetzter Meilenstein erreicht',
        description: 'Einen eigenen Vermögens-Meilenstein erreicht.',
        prerequisites: ['plan'],
        xpReward: 200,
        type: 'milestone',
        stage: 3,
      },
    ],
  },
];

/** One area's answers from the questionnaire. */
export interface AreaAnswer {
  experience: ExperienceLevel;
  tags: string[];
  goalText: string;
}

export type OnboardingAnswers = Record<string, AreaAnswer>;

export interface GeneratedSetup {
  areas: Area[];
  nodes: SkillNode[];
  goals: Goal[];
  logs: LogEntry[];
}

/**
 * Turns the questionnaire answers into a personalized starting setup.
 * Nodes below the user's stated experience level start out completed and
 * their XP counts as existing progress, so the starting level reflects
 * where the person actually is.
 */
export function generateSetup(
  selectedAreaIds: string[],
  answers: OnboardingAnswers,
): GeneratedSetup {
  const areas: Area[] = [];
  const nodes: SkillNode[] = [];
  const goals: Goal[] = [];
  const logs: LogEntry[] = [];
  const now = new Date().toISOString();

  ONBOARDING_AREAS.filter((config) =>
    selectedAreaIds.includes(config.areaId),
  ).forEach((config, index) => {
    const answer = answers[config.areaId] ?? {
      experience: 'beginner' as const,
      tags: [],
      goalText: '',
    };
    const option = config.experienceOptions.find(
      (o) => o.value === answer.experience,
    );
    const completedThroughStage = option?.completedThroughStage ?? -1;

    // Keep templates that are either unconditional or match a chosen focus.
    const selected = config.templates.filter(
      (t) => !t.requiresTag || answer.tags.includes(t.requiresTag),
    );
    const selectedKeys = new Set(selected.map((t) => t.key));

    // Map template keys to generated ids so prerequisites stay intact.
    const idByKey = new Map(selected.map((t) => [t.key, createId()]));

    let startingXp = 0;
    selected.forEach((template) => {
      const isCompleted = template.stage <= completedThroughStage;
      if (isCompleted) startingXp += template.xpReward;
      nodes.push({
        id: idByKey.get(template.key)!,
        areaId: config.areaId,
        title: template.title,
        description: template.description,
        // Drop prerequisites whose template was filtered out.
        prerequisites: template.prerequisites
          .filter((key) => selectedKeys.has(key))
          .map((key) => idByKey.get(key)!),
        xpReward: template.xpReward,
        status: isCompleted ? 'completed' : 'locked',
        type: template.type,
        completedAt: isCompleted ? now : undefined,
      });
    });

    areas.push({
      id: config.areaId,
      name: config.name,
      icon: config.icon,
      color: config.color,
      description: config.description,
      xp: startingXp,
      sortOrder: index,
      isCustom: false,
      suggestedActivities: config.suggestedActivities,
    });

    if (startingXp > 0) {
      logs.push({
        id: createId(),
        areaId: config.areaId,
        description: 'Bestehender Fortschritt aus dem Onboarding',
        xp: startingXp,
        timestamp: now,
      });
    }

    const goalText = answer.goalText.trim();
    if (goalText) {
      goals.push({
        id: createId(),
        areaId: config.areaId,
        title: goalText,
        description: 'Aus dem Onboarding übernommen.',
        status: 'open',
        xpReward: 100,
      });
    }
  });

  return { areas, nodes: recomputeNodeStatuses(nodes), goals, logs };
}
