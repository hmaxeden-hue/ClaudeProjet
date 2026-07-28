import type { Area, SkillNode } from '../types/models';
import { recomputeNodeStatuses } from '../lib/tree';

/**
 * Starter content for the five core areas so the app is usable from
 * the first minute. Everything here is fully editable by the user.
 */

interface SeedNode {
  id: string;
  title: string;
  description: string;
  prerequisites: string[];
  xpReward: number;
  type: SkillNode['type'];
}

interface SeedArea {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  suggestedActivities: Area['suggestedActivities'];
  nodes: SeedNode[];
}

const SEED_AREAS: SeedArea[] = [
  {
    id: 'area-knowledge',
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
    nodes: [
      {
        id: 'node-k1',
        title: 'Erstes Buch fertiggelesen',
        description: 'Ein Sachbuch deiner Wahl komplett durchgelesen.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
      },
      {
        id: 'node-k2',
        title: 'Lese-Routine etabliert',
        description: 'Vier Wochen in Folge regelmäßig gelesen.',
        prerequisites: ['node-k1'],
        xpReward: 75,
        type: 'habit',
      },
      {
        id: 'node-k3',
        title: 'Notiz-System aufgebaut',
        description:
          'Ein System, in dem du Gelerntes festhältst und wiederfindest.',
        prerequisites: ['node-k1'],
        xpReward: 75,
        type: 'quest',
      },
      {
        id: 'node-k4',
        title: '5 Bücher gelesen',
        description: 'Fünf Bücher komplett durchgearbeitet.',
        prerequisites: ['node-k2'],
        xpReward: 100,
        type: 'milestone',
      },
      {
        id: 'node-k5',
        title: 'Wissen weitergegeben',
        description: 'Jemandem etwas Gelerntes verständlich erklärt.',
        prerequisites: ['node-k3'],
        xpReward: 75,
        type: 'quest',
      },
      {
        id: 'node-k6',
        title: '10 Bücher pro Jahr',
        description: 'Zehn Bücher innerhalb eines Jahres gelesen.',
        prerequisites: ['node-k4'],
        xpReward: 150,
        type: 'milestone',
      },
    ],
  },
  {
    id: 'area-communication',
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
    nodes: [
      {
        id: 'node-c1',
        title: 'Grundlagen aktives Zuhören',
        description:
          'Prinzipien des aktiven Zuhörens gelernt und bewusst ausprobiert.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
      },
      {
        id: 'node-c2',
        title: 'Rhetorik-Grundlagen durchgearbeitet',
        description: 'Ein Buch oder ein Kurs zu Rhetorik/Kommunikation.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
      },
      {
        id: 'node-c3',
        title: 'Gespräch mit Fremdem begonnen',
        description: 'Aus eigener Initiative ein Gespräch gestartet.',
        prerequisites: ['node-c1'],
        xpReward: 75,
        type: 'quest',
      },
      {
        id: 'node-c4',
        title: 'Technik bewusst angewandt',
        description:
          'Eine gelernte Gesprächstechnik mehrfach im Alltag eingesetzt.',
        prerequisites: ['node-c1', 'node-c2'],
        xpReward: 75,
        type: 'habit',
      },
      {
        id: 'node-c5',
        title: 'Vor einer Gruppe gesprochen',
        description: 'Einen Beitrag vor mehreren Personen gehalten.',
        prerequisites: ['node-c4'],
        xpReward: 100,
        type: 'quest',
      },
      {
        id: 'node-c6',
        title: 'Präsentation gehalten',
        description: 'Eine vorbereitete Präsentation souverän gehalten.',
        prerequisites: ['node-c5'],
        xpReward: 150,
        type: 'milestone',
      },
    ],
  },
  {
    id: 'area-health',
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
    nodes: [
      {
        id: 'node-h1',
        title: 'Ausgangslage erfasst',
        description:
          'Ehrlich notiert, wo du stehst und wie du dich fühlst – ohne Bewertung.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
      },
      {
        id: 'node-h2',
        title: 'Sportart gefunden, die Spaß macht',
        description: 'Verschiedenes ausprobiert und etwas gefunden, das bleibt.',
        prerequisites: ['node-h1'],
        xpReward: 75,
        type: 'quest',
      },
      {
        id: 'node-h3',
        title: 'Schlafroutine aufgebaut',
        description: 'Regelmäßige Schlafenszeiten über zwei Wochen gehalten.',
        prerequisites: ['node-h1'],
        xpReward: 75,
        type: 'habit',
      },
      {
        id: 'node-h4',
        title: '2x Bewegung pro Woche – 4 Wochen',
        description: 'Vier Wochen lang zweimal pro Woche aktiv gewesen.',
        prerequisites: ['node-h2'],
        xpReward: 100,
        type: 'habit',
      },
      {
        id: 'node-h5',
        title: '3x Training pro Woche – 4 Wochen',
        description: 'Die Routine auf dreimal pro Woche gesteigert und gehalten.',
        prerequisites: ['node-h4'],
        xpReward: 150,
        type: 'milestone',
      },
      {
        id: 'node-h6',
        title: 'Persönliche Bestleistung',
        description:
          'Eine selbst gewählte Bestleistung erreicht – dein Maßstab, niemand sonst.',
        prerequisites: ['node-h5'],
        xpReward: 150,
        type: 'milestone',
      },
    ],
  },
  {
    id: 'area-purpose',
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
    nodes: [
      {
        id: 'node-p1',
        title: 'Kernwerte formuliert',
        description: 'Die 3–5 Werte aufgeschrieben, die dir wirklich wichtig sind.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
      },
      {
        id: 'node-p2',
        title: 'Journal-Routine gestartet',
        description: 'Zwei Wochen regelmäßig reflektiert oder journaled.',
        prerequisites: ['node-p1'],
        xpReward: 75,
        type: 'habit',
      },
      {
        id: 'node-p3',
        title: 'Jahresziele gesetzt',
        description: 'Konkrete Ziele für dieses Jahr aus deinen Werten abgeleitet.',
        prerequisites: ['node-p1'],
        xpReward: 75,
        type: 'quest',
      },
      {
        id: 'node-p4',
        title: 'Sinnstiftende Handlung umgesetzt',
        description:
          'Etwas getan, das über dich hinaus wirkt – helfen, beitragen, schaffen.',
        prerequisites: ['node-p2'],
        xpReward: 75,
        type: 'quest',
      },
      {
        id: 'node-p5',
        title: 'Monatlicher Rückblick etabliert',
        description: 'Drei Monate in Folge einen Monatsrückblick gemacht.',
        prerequisites: ['node-p3'],
        xpReward: 100,
        type: 'habit',
      },
      {
        id: 'node-p6',
        title: 'Lebensvision aufgeschrieben',
        description: 'Ein klares Bild, wohin dein Weg langfristig führen soll.',
        prerequisites: ['node-p3'],
        xpReward: 150,
        type: 'milestone',
      },
    ],
  },
  {
    id: 'area-finance',
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
    nodes: [
      {
        id: 'node-f1',
        title: 'Überblick über Einnahmen & Ausgaben',
        description: 'Alle Einnahmen und Ausgaben eines Monats erfasst.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
      },
      {
        id: 'node-f2',
        title: 'Finanz-Grundwissen aufgebaut',
        description:
          'Grundbegriffe verstanden: Budget, Notgroschen, Zinseszins, breite Streuung.',
        prerequisites: [],
        xpReward: 50,
        type: 'quest',
      },
      {
        id: 'node-f3',
        title: 'Budget einen Monat geführt',
        description: 'Einen vollen Monat bewusst mit Budget gelebt.',
        prerequisites: ['node-f1'],
        xpReward: 75,
        type: 'habit',
      },
      {
        id: 'node-f4',
        title: 'Notgroschen aufgebaut',
        description: 'Eine Reserve für Unvorhergesehenes zur Seite gelegt.',
        prerequisites: ['node-f3'],
        xpReward: 150,
        type: 'milestone',
      },
      {
        id: 'node-f5',
        title: 'Sparquote 10 % gehalten',
        description: 'Drei Monate in Folge mindestens 10 % gespart.',
        prerequisites: ['node-f3'],
        xpReward: 100,
        type: 'habit',
      },
      {
        id: 'node-f6',
        title: 'Erstes Investment getätigt',
        description:
          'Nach eigener Recherche einen ersten, bewussten Investment-Schritt gemacht.',
        prerequisites: ['node-f2', 'node-f4'],
        xpReward: 150,
        type: 'milestone',
      },
      {
        id: 'node-f7',
        title: 'Vermögens-Meilenstein erreicht',
        description: 'Einen selbst definierten Vermögens-Meilenstein erreicht.',
        prerequisites: ['node-f6'],
        xpReward: 200,
        type: 'milestone',
      },
    ],
  },
];

export function buildSeedData(): { areas: Area[]; nodes: SkillNode[] } {
  const areas: Area[] = SEED_AREAS.map((seed, index) => ({
    id: seed.id,
    name: seed.name,
    icon: seed.icon,
    color: seed.color,
    description: seed.description,
    xp: 0,
    sortOrder: index,
    isCustom: false,
    suggestedActivities: seed.suggestedActivities,
  }));

  const nodes: SkillNode[] = SEED_AREAS.flatMap((seed) =>
    seed.nodes.map((n) => ({
      id: n.id,
      areaId: seed.id,
      title: n.title,
      description: n.description,
      prerequisites: n.prerequisites,
      xpReward: n.xpReward,
      status: 'locked' as const,
      type: n.type,
    })),
  );

  return { areas, nodes: recomputeNodeStatuses(nodes) };
}
