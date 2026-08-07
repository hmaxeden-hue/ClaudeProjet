import type {
  Area,
  AreaTrack,
  Goal,
  LogEntry,
  NodeType,
  SkillNode,
  SuggestedActivity,
} from '../types/models';
import { createId } from '../lib/id';
import { MAIN_TRACK_ID, nodeDepths, recomputeNodeStatuses } from '../lib/tree';
import { GOAL_XP, xpForNode } from '../lib/xp';

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
  /** Concrete steps for doing it – the catalog's answer to "und wie?". */
  howTo?: string[];
  /** The written record is the deliverable – offer the note field up front. */
  needsNotes?: boolean;
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
  /** One-click examples – the fastest way to make someone concrete. */
  goalExamples: string[];
  templates: NodeTemplate[];
}

/**
 * How much of a tree already counts as done, by stated experience. Beginners
 * start with nothing completed; the further along someone is, the deeper the
 * pre-completed part – and therefore the starting level.
 */
export const COMPLETED_THROUGH_STAGE: Record<ExperienceLevel, number> = {
  beginner: -1,
  intermediate: 0,
  advanced: 1,
};

const STANDARD_EXPERIENCE = (
  beginner: string,
  intermediate: string,
  advanced: string,
): ExperienceOption[] => [
  {
    value: 'beginner',
    label: 'Am Anfang',
    description: beginner,
    completedThroughStage: COMPLETED_THROUGH_STAGE.beginner,
  },
  {
    value: 'intermediate',
    label: 'Schon dabei',
    description: intermediate,
    completedThroughStage: COMPLETED_THROUGH_STAGE.intermediate,
  },
  {
    value: 'advanced',
    label: 'Weit fortgeschritten',
    description: advanced,
    completedThroughStage: COMPLETED_THROUGH_STAGE.advanced,
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
    goalExamples: [
      '12 Sachbücher in diesem Jahr lesen',
      'Ein Thema so verstehen, dass ich es erklären kann',
      'Jeden Tag 20 Minuten lernen – drei Monate am Stück',
    ],
    templates: [
      {
        key: 'first-book',
        howTo: [
          'Wähle ein Buch zu einer Frage, die dich gerade wirklich beschäftigt.',
          'Leg eine feste Zeit fest – z. B. 20 Minuten nach dem Aufstehen.',
          'Notiere nach jedem Kapitel einen Satz, der hängen geblieben ist.',
        ],
        title: 'Erstes Buch fertiggelesen',
        description: 'Ein Sachbuch deiner Wahl komplett durchgelesen.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'learn-source',
        needsNotes: true,
        howTo: [
          'Sammle 10 Kanäle, Kurse oder Newsletter, die du schon kennst.',
          'Streiche alles, was du zuletzt nur nebenbei konsumiert hast.',
          'Behalte 3 bis 5 – zu viele Quellen sind der Grund, warum nichts hängen bleibt.',
        ],
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
        howTo: [
          'Setz dir eine Mindestmenge, die auch an schlechten Tagen geht (5 Minuten).',
          'Häng sie an etwas, das du ohnehin täglich tust.',
          'Hak jeden Tag ab – die Kette nicht zu unterbrechen ist der eigentliche Trick.',
        ],
        title: 'Lese-Routine etabliert',
        description: 'Vier Wochen in Folge regelmäßig gelesen oder gelernt.',
        prerequisites: ['first-book'],
        xpReward: 75,
        type: 'habit',
        stage: 1,
      },
      {
        key: 'notes',
        needsNotes: true,
        howTo: [
          'Entscheide dich für einen Ort: App oder Heft, aber nur einen.',
          'Halte pro Quelle drei Dinge fest: Kernaussage, Beispiel, was du ändern willst.',
          'Geh einmal pro Woche fünf Minuten durch die neuen Notizen.',
        ],
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
        howTo: [
          'Leg die nächsten zwei Bücher schon jetzt fest, damit keine Lücke entsteht.',
          'Brich Bücher ab, die dir nichts geben – Durchhalten ist hier kein Wert an sich.',
          'Notiere zu jedem Buch die eine Sache, die du übernommen hast.',
        ],
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
        needsNotes: true,
        howTo: [
          'Schreib aus dem Kopf auf, was hängen geblieben ist – erst danach nachschlagen.',
          'Kürze auf eine Seite: Kernaussage, drei Argumente, dein Fazit.',
          'Was du nicht in eigenen Worten erklären kannst, hast du noch nicht verstanden.',
        ],
        title: 'Erste Zusammenfassung geschrieben',
        description: 'Ein Buch oder Thema in eigenen Worten zusammengefasst.',
        prerequisites: ['routine'],
        xpReward: 75,
        type: 'quest',
        stage: 2,
      },
      {
        key: 'teach',
        howTo: [
          'Such dir eine Person, die das Thema nicht kennt.',
          'Erklär es in fünf Minuten ohne Fachbegriffe.',
          'Notiere die Stellen, an denen du ins Stocken kamst – das sind deine Lücken.',
        ],
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
        howTo: [
          'Rechne aus, wie viele Seiten pro Tag das bedeutet – meist weniger als gedacht.',
          'Halte einen kurzen Vorrat an ungelesenen Büchern bereit.',
          'Zähl mit, aber lass die Zahl nicht die Auswahl bestimmen.',
        ],
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
        needsNotes: true,
        howTo: [
          'Formuliere die Frage, die du am Ende beantworten können willst.',
          'Nimm mindestens drei Quellen, die sich widersprechen dürfen.',
          'Schreib zum Schluss deine eigene Antwort auf – mit Begründung.',
        ],
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
    goalExamples: [
      'Einen Vortrag vor dem Team halten',
      'Auf Fremde zugehen, ohne mich zu überwinden',
      'Ein schwieriges Gespräch führen, das ich aufschiebe',
    ],
    templates: [
      {
        key: 'listening-basics',
        howTo: [
          'Lies oder schau eine Einführung zu aktivem Zuhören.',
          'Nimm dir für das nächste Gespräch eine Sache vor: nicht unterbrechen.',
          'Fass am Ende zusammen, was du verstanden hast, und lass es bestätigen.',
        ],
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
        howTo: [
          'Nimm ein Buch oder einen Kurs und arbeite ihn wirklich durch.',
          'Schreib nach jedem Kapitel eine Technik auf, die du ausprobieren willst.',
          'Probier jede Technik einmal aus, bevor du weiterliest.',
        ],
        title: 'Rhetorik-Grundlagen durchgearbeitet',
        description: 'Ein Buch oder ein Kurs zu Rhetorik und Kommunikation.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'apply-technique',
        needsNotes: true,
        howTo: [
          'Wähle eine einzige Technik für die ganze Woche.',
          'Setz sie bewusst in mindestens drei Gesprächen ein.',
          'Notiere abends kurz, wie es sich angefühlt hat und was passiert ist.',
        ],
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
        needsNotes: true,
        howTo: [
          'Stell in jedem Gespräch mindestens zwei Nachfragen zur selben Sache.',
          'Nutze offene Fragen: „Wie kam es dazu?" statt „War das gut?"',
          'Achte darauf, ob dein Gegenüber mehr erzählt als sonst.',
        ],
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
        howTo: [
          'Such eine Alltagssituation mit natürlichem Anlass: Schlange, Kurs, Bahn.',
          'Beginne mit einer Beobachtung statt mit einer Frage.',
          'Ein kurzes Gespräch reicht – es geht um den Anfang, nicht um die Länge.',
        ],
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
        howTo: [
          'Melde dich in einer Runde zu Wort, in der du sonst schweigst.',
          'Bereite einen Gedanken vor, den du beitragen willst.',
          'Sprich langsamer als du willst und mach eine Pause nach dem Kernsatz.',
        ],
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
        howTo: [
          'Schreib vorher auf, was du erreichen willst – und was nicht.',
          'Beginne mit deiner Wahrnehmung statt mit einem Vorwurf.',
          'Plane das Gespräch zu einem Zeitpunkt, an dem beide Ruhe haben.',
        ],
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
        howTo: [
          'Bau sie um eine einzige Kernbotschaft herum.',
          'Übe einmal laut und vollständig, nicht nur im Kopf.',
          'Halte den Einstieg und den Schluss wörtlich bereit – der Rest darf frei sein.',
        ],
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
        howTo: [
          'Behalte eine Technik so lange, bis du sie nicht mehr bewusst wählst.',
          'Such dir alle paar Wochen eine neue Situation, die dir noch unangenehm ist.',
          'Blick monatlich zurück: Was war vor drei Monaten noch schwer?',
        ],
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
    goalExamples: [
      '5 km am Stück laufen, ohne zu gehen',
      'Drei Monate lang zweimal pro Woche trainieren',
      'Ausgeruht aufwachen – sieben Stunden Schlaf als Regel',
    ],
    templates: [
      {
        key: 'baseline',
        needsNotes: true,
        howTo: [
          'Notiere ohne Wertung, wie oft du dich in einer normalen Woche bewegst.',
          'Halte fest, wie du dich morgens fühlst – Energie, Schlaf, Laune.',
          'Das ist dein Ausgangspunkt, kein Urteil.',
        ],
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
        needsNotes: true,
        howTo: [
          'Probier in vier Wochen drei verschiedene Sachen aus.',
          'Bewerte danach nur eine Frage: Würdest du nächste Woche wieder hingehen?',
          'Nimm das, worauf du dich freust – nicht das mit dem besten Ruf.',
        ],
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
        howTo: [
          'Leg eine feste Aufstehzeit fest, auch am Wochenende.',
          'Bildschirme eine halbe Stunde vor dem Schlafen weglegen.',
          'Halte es zwei Wochen durch, bevor du beurteilst, ob es wirkt.',
        ],
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
        howTo: [
          'Trag zwei feste Termine in den Kalender – wie eine Verabredung.',
          'Leg die Sachen am Vorabend bereit.',
          'Bei wenig Zeit die kurze Version machen statt ausfallen lassen.',
        ],
        title: '2x Bewegung pro Woche – 4 Wochen',
        description: 'Vier Wochen lang zweimal pro Woche aktiv gewesen.',
        prerequisites: ['find-sport'],
        xpReward: 100,
        type: 'habit',
        stage: 1,
      },
      {
        key: 'strength-base',
        howTo: [
          'Lern die Grundbewegungen mit leichtem Gewicht sauber.',
          'Lass die Technik einmal von jemandem anschauen, der es kann.',
          'Steigere erst, wenn die Ausführung über alle Wiederholungen stabil bleibt.',
        ],
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
        howTo: [
          'Wähle eine Distanz, die etwa 20 % über deiner jetzigen liegt.',
          'Bau langsam auf – lieber öfter kurz als einmal zu viel.',
          'Tempo so, dass du dich noch unterhalten könntest.',
        ],
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
        howTo: [
          'Such eine Gruppe mit festem Termin statt loser Verabredungen.',
          'Geh dreimal hin, bevor du entscheidest.',
          'Feste Zeiten mit anderen tragen an den Tagen, an denen die Motivation fehlt.',
        ],
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
        howTo: [
          'Nimm zehn Minuten an festen Tagen, nicht „wenn Zeit ist".',
          'Konzentrier dich auf die zwei Stellen, die bei dir wirklich zwicken.',
          'Kurz und regelmäßig schlägt lang und selten.',
        ],
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
        howTo: [
          'Such eine Route, die etwas über deiner gewohnten Länge liegt.',
          'Plane Verpflegung, Wetter und Rückweg vorher.',
          'Geh los, auch wenn das Wetter nur mittelgut ist.',
        ],
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
        howTo: [
          'Erhöhe erst, wenn zweimal pro Woche vier Wochen lang stabil lief.',
          'Leg die dritte Einheit auf einen Tag mit wenig Terminen.',
          'Plane eine leichtere Einheit ein – nicht jede muss hart sein.',
        ],
        title: '3x Training pro Woche – 4 Wochen',
        description: 'Die Routine auf dreimal pro Woche gesteigert und gehalten.',
        prerequisites: ['twice-weekly'],
        xpReward: 150,
        type: 'milestone',
        stage: 3,
      },
      {
        key: 'personal-best',
        howTo: [
          'Wähle eine Messgröße, die zu deinem Sport passt.',
          'Setz sie knapp über deinen aktuellen Stand.',
          'Der Maßstab bist du vor drei Monaten, niemand sonst.',
        ],
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
    goalExamples: [
      'Jeden Sonntag eine Wochenreflexion schreiben',
      'Meine fünf Kernwerte kennen und danach entscheiden',
      'Etwas regelmäßig beitragen, das über mich hinausgeht',
    ],
    templates: [
      {
        key: 'values',
        needsNotes: true,
        howTo: [
          'Schreib zehn Dinge auf, die dir wichtig sind.',
          'Streiche so lange, bis fünf übrig sind – das tut absichtlich weh.',
          'Prüfe bei jedem: Habe ich dafür in den letzten Wochen Zeit aufgewendet?',
        ],
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
        needsNotes: true,
        howTo: [
          'Nimm dir fünf Minuten zur selben Tageszeit.',
          'Beantworte drei feste Fragen statt frei zu schreiben.',
          'Zwei Wochen durchhalten, bevor du entscheidest, ob es etwas bringt.',
        ],
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
        needsNotes: true,
        howTo: [
          'Leite aus jedem Kernwert höchstens ein Ziel ab.',
          'Formuliere jedes so, dass du am Jahresende Ja oder Nein sagen kannst.',
          'Mehr als drei Ziele bedeutet, dass keines wirklich zählt.',
        ],
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
        howTo: [
          'Wähle etwas, das jemand anderem konkret nützt.',
          'Klein und tatsächlich getan schlägt groß und geplant.',
          'Notiere danach, wie es sich angefühlt hat.',
        ],
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
        needsNotes: true,
        howTo: [
          'Setz einen festen Termin am Monatsende.',
          'Drei Fragen: Was lief gut, was nicht, was ändere ich?',
          'Schreib die Antworten auf – im Kopf zählt es nicht.',
        ],
        title: 'Monatlicher Rückblick etabliert',
        description: 'Drei Monate in Folge einen Monatsrückblick gemacht.',
        prerequisites: ['values'],
        xpReward: 100,
        type: 'habit',
        stage: 2,
      },
      {
        key: 'align',
        howTo: [
          'Such die eine Gewohnheit, die am deutlichsten gegen deine Werte läuft.',
          'Ändere sie für vier Wochen, nicht für immer.',
          'Halte fest, was der Wegfall tatsächlich verändert hat.',
        ],
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
        needsNotes: true,
        howTo: [
          'Beschreib einen normalen Dienstag in fünf Jahren.',
          'Konkret werden: Wo, mit wem, womit verbringst du den Tag?',
          'Prüfe, welcher heutige Schritt in diese Richtung zeigt.',
        ],
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
    goalExamples: [
      'Drei Monatsausgaben als Rücklage aufbauen',
      'Ein Jahr lang jeden Monat mein Budget führen',
      'Meine Sparquote auf 20 % bringen und halten',
    ],
    templates: [
      {
        key: 'overview',
        needsNotes: true,
        howTo: [
          'Sammle einen Monat lang alle Einnahmen und Ausgaben an einer Stelle.',
          'Sortiere sie in wenige Kategorien – fünf bis sieben reichen.',
          'Rechne aus, was am Monatsende übrig bleibt.',
        ],
        title: 'Überblick über Einnahmen & Ausgaben',
        description: 'Alle Einnahmen und Ausgaben eines Monats erfasst.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
        stage: 0,
      },
      {
        key: 'basics',
        howTo: [
          'Klär vier Begriffe: Budget, Rücklage, Zinseszins, breite Streuung.',
          'Nutze neutrale Quellen ohne Produktverkauf.',
          'Erklär jeden Begriff in einem Satz in eigenen Worten.',
        ],
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
        needsNotes: true,
        howTo: [
          'Leg pro Kategorie vorab einen Betrag fest.',
          'Trag Ausgaben laufend ein, nicht am Monatsende aus dem Gedächtnis.',
          'Am Monatsende vergleichen und die Beträge für den nächsten anpassen.',
        ],
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
        howTo: [
          'Lege einen festen Betrag fest, der auch in einem schlechten Monat geht.',
          'Richte einen Dauerauftrag auf ein getrenntes Konto ein.',
          'Direkt nach dem Geldeingang, nicht was am Ende übrig bleibt.',
        ],
        title: 'Erste Rücklage gebildet',
        description: 'Zum ersten Mal bewusst Geld zur Seite gelegt.',
        prerequisites: ['overview'],
        xpReward: 75,
        type: 'quest',
        stage: 1,
      },
      {
        key: 'emergency-fund',
        howTo: [
          'Rechne aus, was du in einem Monat wirklich brauchst.',
          'Setz dir daraus ein Ziel, das dir Ruhe gibt.',
          'Halte das Geld getrennt und jederzeit verfügbar.',
        ],
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
        howTo: [
          'Leg deinen Anteil als Prozentsatz fest, nicht als Restbetrag.',
          'Prüfe ihn monatlich zusammen mit deinem Budget.',
          'Passe ihn an, wenn er drei Monate lang nicht zu halten war.',
        ],
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
        needsNotes: true,
        howTo: [
          'Schreib auf, wofür du sparst und bis wann.',
          'Zerleg jedes Ziel in Monatsbeträge.',
          'Halte fest, was du bei einem unerwarteten Betrag tun würdest.',
        ],
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
        howTo: [
          'Klär zuerst Rücklage und Schulden – in dieser Reihenfolge.',
          'Lies dich unabhängig ein, bevor du irgendwo unterschreibst.',
          'Entscheide selbst und nur, was du erklären kannst; diese App gibt keine Anlageempfehlungen.',
        ],
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
        howTo: [
          'Setz einen Betrag, der für dich einen Unterschied macht.',
          'Halte fest, woran du unterwegs erkennst, dass es vorangeht.',
          'Prüfe einmal im Quartal, ob der Meilenstein noch der richtige ist.',
        ],
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
  /** The main goal – the tree's main track leads exactly here. */
  goalText: string;
  /** Optional secondary goals, each becoming its own side track. */
  sideGoals: string[];
}

/** Track keys the AI may use; they are mapped to real track ids on assembly. */
export const SIDE_TRACK_KEYS = ['side1', 'side2'] as const;
export const MAX_SIDE_GOALS = SIDE_TRACK_KEYS.length;

export type OnboardingAnswers = Record<string, AreaAnswer>;

export interface GeneratedSetup {
  areas: Area[];
  nodes: SkillNode[];
  goals: Goal[];
  logs: LogEntry[];
}

/**
 * A node ready to be assembled into an area — the common shape produced by
 * both the template catalog and the AI, so the assembly below is shared.
 */
export interface ResolvedNode {
  key: string;
  title: string;
  description: string;
  /** Concrete steps for doing it – what turns the tree into instructions. */
  howTo: string[];
  /** The written record is the deliverable of this one. */
  needsNotes: boolean;
  prerequisites: string[];
  xpReward: number;
  type: NodeType;
  stage: number;
  /** 'main' or one of SIDE_TRACK_KEYS. */
  track: string;
}

/** Node shape returned by the tree-generating edge function. */
export interface AiNode {
  key?: unknown;
  title?: unknown;
  description?: unknown;
  howTo?: unknown;
  needsNotes?: unknown;
  prerequisites?: unknown;
  xpReward?: unknown;
  type?: unknown;
  stage?: unknown;
  track?: unknown;
}

const NODE_TYPES: NodeType[] = ['quest', 'habit', 'milestone'];
const ALLOWED_XP = [50, 75, 100, 125, 150, 200];

function nearestXp(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 75;
  return ALLOWED_XP.reduce((best, candidate) =>
    Math.abs(candidate - n) < Math.abs(best - n) ? candidate : best,
  );
}

/**
 * Turns raw AI output into nodes we are willing to build a tree from.
 *
 * The important guarantee is acyclicity: a prerequisite is only kept when it
 * refers to a node defined *earlier* in the list. A model that invents a key,
 * points at itself, or wires up a loop therefore cannot produce a tree with
 * permanently unreachable nodes.
 */
export function sanitizeAiNodes(
  raw: AiNode[],
  /** Side track keys the user actually has goals for. */
  allowedTracks: string[] = [],
): ResolvedNode[] {
  const seen = new Set<string>();
  const result: ResolvedNode[] = [];

  for (const node of raw ?? []) {
    const key = typeof node.key === 'string' ? node.key.trim() : '';
    const title = typeof node.title === 'string' ? node.title.trim() : '';
    if (!key || !title || seen.has(key)) continue;

    const prerequisites = Array.isArray(node.prerequisites)
      ? node.prerequisites.filter(
          (p): p is string => typeof p === 'string' && p !== key && seen.has(p),
        )
      : [];

    const stageValue = typeof node.stage === 'number' ? Math.round(node.stage) : 0;

    // A node on a side track the user never asked for belongs on the main one.
    const track =
      typeof node.track === 'string' &&
      (SIDE_TRACK_KEYS as readonly string[]).includes(node.track) &&
      allowedTracks.includes(node.track)
        ? node.track
        : MAIN_TRACK_ID;

    result.push({
      key,
      title,
      description:
        typeof node.description === 'string' ? node.description.trim() : '',
      howTo: Array.isArray(node.howTo)
        ? node.howTo
            .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
            .map((s) => s.trim())
            .slice(0, 5)
        : [],
      needsNotes: node.needsNotes === true,
      prerequisites,
      xpReward: nearestXp(node.xpReward),
      type: NODE_TYPES.includes(node.type as NodeType)
        ? (node.type as NodeType)
        : 'quest',
      stage: Math.min(3, Math.max(0, stageValue)),
      track,
    });
    seen.add(key);
  }

  return result;
}

/** Picks the template nodes that match the chosen focus tags. */
function templateNodes(
  config: OnboardingAreaConfig,
  answer: AreaAnswer,
): ResolvedNode[] {
  const selected = config.templates.filter(
    (t) => !t.requiresTag || answer.tags.includes(t.requiresTag),
  );
  const keys = new Set(selected.map((t) => t.key));
  // Templates are generic and know nothing about personal goals, so they all
  // form the main track.
  return selected.map((t) => ({
    key: t.key,
    title: t.title,
    description: t.description,
    howTo: t.howTo ?? [],
    needsNotes: t.needsNotes ?? false,
    prerequisites: t.prerequisites.filter((k) => keys.has(k)),
    xpReward: t.xpReward,
    type: t.type,
    stage: t.stage,
    track: MAIN_TRACK_ID,
  }));
}

export interface BuiltArea {
  area: Area;
  nodes: SkillNode[];
  goals: Goal[];
  logs: LogEntry[];
}

/**
 * Turns resolved nodes into real skill nodes of one area.
 *
 * Nodes at or below `completedThroughStage` start out completed and their XP
 * counts as existing progress, so the starting level reflects where the person
 * actually is. Rewards always come from `xpForNode` – neither the templates nor
 * the AI get to set a number, which is what keeps levels comparable.
 */
export function materializeNodes(
  areaId: string,
  resolved: ResolvedNode[],
  completedThroughStage: number,
  now: string,
  /** Track keys that exist for this area; unknown ones fall back to main. */
  knownTracks: string[] = [],
): { nodes: SkillNode[]; startingXp: number } {
  const idByKey = new Map(resolved.map((n) => [n.key, createId()]));

  const nodes: SkillNode[] = resolved.map((n) => ({
    id: idByKey.get(n.key)!,
    areaId,
    trackId: knownTracks.includes(n.track) ? n.track : MAIN_TRACK_ID,
    title: n.title,
    description: n.description,
    howTo: n.howTo.length > 0 ? n.howTo : undefined,
    needsNotes: n.needsNotes || undefined,
    prerequisites: n.prerequisites
      .filter((k) => idByKey.has(k))
      .map((k) => idByKey.get(k)!),
    // Placeholder – replaced below once the real depths are known.
    xpReward: 0,
    status: n.stage <= completedThroughStage ? 'completed' : 'locked',
    type: n.type,
    completedAt: n.stage <= completedThroughStage ? now : undefined,
  }));

  const depths = nodeDepths(nodes);
  let startingXp = 0;
  nodes.forEach((node) => {
    node.xpReward = xpForNode(node.type, depths.get(node.id) ?? 0);
    if (node.status === 'completed') startingXp += node.xpReward;
  });

  return { nodes, startingXp };
}

/** The area fields the caller decides on; the rest follows from the tree. */
type AreaShell = Omit<Area, 'xp' | 'tracks'>;

/**
 * Turns the stated goals into tracks. The main track always exists – it is
 * what the app keeps pointing at – and carries the main goal as its headline,
 * falling back to the area name when no goal was given.
 */
export function tracksFromAnswer(
  answer: AreaAnswer,
  areaName: string,
): AreaTrack[] {
  const main: AreaTrack = {
    id: MAIN_TRACK_ID,
    title: answer.goalText.trim() || areaName,
    isMain: true,
  };
  const sides = answer.sideGoals
    .map((goal) => goal.trim())
    .filter(Boolean)
    .slice(0, MAX_SIDE_GOALS)
    .map((title, index) => ({
      id: SIDE_TRACK_KEYS[index],
      title,
      isMain: false,
    }));
  return [main, ...sides];
}

/** Builds one complete area – tree, optional goal and the progress log entry. */
function buildArea(
  shell: AreaShell,
  answer: AreaAnswer,
  completedThroughStage: number,
  resolved: ResolvedNode[],
  now: string,
  /** Wording for the records this creates – onboarding vs. a later addition. */
  origin: { goalNote: string; progressNote: string },
): BuiltArea {
  const tracks = tracksFromAnswer(answer, shell.name);
  const { nodes, startingXp } = materializeNodes(
    shell.id,
    resolved,
    completedThroughStage,
    now,
    tracks.map((t) => t.id),
  );

  const goals: Goal[] = [];
  const goalText = answer.goalText.trim();
  if (goalText) {
    goals.push({
      id: createId(),
      areaId: shell.id,
      title: goalText,
      description: origin.goalNote,
      status: 'open',
      size: 'medium',
      xpReward: GOAL_XP.medium,
    });
  }

  const logs: LogEntry[] = [];
  if (startingXp > 0) {
    logs.push({
      id: createId(),
      areaId: shell.id,
      description: origin.progressNote,
      xp: startingXp,
      timestamp: now,
    });
  }

  return { area: { ...shell, xp: startingXp, tracks }, nodes, goals, logs };
}

function assembleArea(
  config: OnboardingAreaConfig,
  answer: AreaAnswer,
  sortOrder: number,
  resolved: ResolvedNode[],
  now: string,
): BuiltArea {
  const option = config.experienceOptions.find(
    (o) => o.value === answer.experience,
  );
  return buildArea(
    {
      id: config.areaId,
      name: config.name,
      icon: config.icon,
      color: config.color,
      description: config.description,
      sortOrder,
      isCustom: false,
      suggestedActivities: config.suggestedActivities,
    },
    answer,
    option?.completedThroughStage ?? -1,
    resolved,
    now,
    {
      goalNote: 'Aus dem Onboarding übernommen.',
      progressNote: 'Bestehender Fortschritt aus dem Onboarding',
    },
  );
}

/**
 * Same assembly for a self-created area, so a topic added later (say Spanish)
 * is priced and levelled exactly like the ones from the onboarding.
 */
export function buildCustomArea(
  shell: AreaShell,
  answer: AreaAnswer,
  resolved: ResolvedNode[],
): BuiltArea {
  const built = buildArea(
    shell,
    answer,
    COMPLETED_THROUGH_STAGE[answer.experience],
    resolved,
    new Date().toISOString(),
    {
      goalNote: 'Beim Anlegen des Bereichs gesetzt.',
      progressNote: 'Bestehender Fortschritt beim Anlegen des Bereichs',
    },
  );
  return { ...built, nodes: recomputeNodeStatuses(built.nodes) };
}

export const DEFAULT_ANSWER: AreaAnswer = {
  experience: 'beginner',
  tags: [],
  goalText: '',
  sideGoals: [],
};

/**
 * Turns the questionnaire answers into a personalized starting setup.
 *
 * `aiNodesByArea` may supply an AI-generated tree per area; areas without one
 * (never requested, or the request failed) fall back to the template catalog,
 * so a partial AI failure still yields a complete setup.
 */
export function generateSetup(
  selectedAreaIds: string[],
  answers: OnboardingAnswers,
  aiNodesByArea: Record<string, ResolvedNode[]> = {},
): GeneratedSetup {
  const areas: Area[] = [];
  const nodes: SkillNode[] = [];
  const goals: Goal[] = [];
  const logs: LogEntry[] = [];
  const now = new Date().toISOString();

  ONBOARDING_AREAS.filter((config) =>
    selectedAreaIds.includes(config.areaId),
  ).forEach((config, index) => {
    const answer = answers[config.areaId] ?? DEFAULT_ANSWER;
    const fromAi = aiNodesByArea[config.areaId];
    const resolved =
      fromAi && fromAi.length > 0 ? fromAi : templateNodes(config, answer);

    const built = assembleArea(config, answer, index, resolved, now);
    areas.push(built.area);
    nodes.push(...built.nodes);
    goals.push(...built.goals);
    logs.push(...built.logs);
  });

  return { areas, nodes: recomputeNodeStatuses(nodes), goals, logs };
}
