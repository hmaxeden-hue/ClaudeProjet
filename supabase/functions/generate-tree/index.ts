/**
 * Supabase Edge Function: generates a personalized skill tree for one area.
 *
 * Called once per area during onboarding. Keeping it per-area means a single
 * failure degrades to the template tree for that area instead of losing the
 * whole onboarding, and the client can show progress as trees arrive.
 *
 * Deploy with "Verify JWT" turned off — the check below does it instead, so
 * the browser's CORS preflight (which carries no token) can get through.
 */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const MODEL = 'claude-opus-5';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function isAuthenticated(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const result = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
    });
    return result.ok;
  } catch {
    return false;
  }
}

const TREE_SCHEMA = {
  type: 'object',
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description:
              'Kurzer eindeutiger Bezeichner aus Kleinbuchstaben und Bindestrichen, z. B. "erstes-buch".',
          },
          title: {
            type: 'string',
            description: 'Kurzer, konkreter Titel auf Deutsch.',
          },
          description: {
            type: 'string',
            description: 'Ein bis zwei Sätze auf Deutsch, in der Du-Form: woran man erkennt, dass es erledigt ist.',
          },
          howTo: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 4,
            description:
              'Zwei bis vier konkrete Handlungsschritte auf Deutsch, in der Du-Form. Jeder Schritt sagt, was die Person tatsächlich tut – nicht, warum es gut wäre.',
          },
          track: {
            type: 'string',
            enum: ['main', 'side1', 'side2'],
            description:
              '"main" für den Weg zum Hauptziel, "side1"/"side2" nur für genannte Nebenziele.',
          },
          type: { type: 'string', enum: ['quest', 'habit', 'milestone'] },
          xpReward: { type: 'integer', enum: [50, 75, 100, 125, 150, 200] },
          stage: {
            type: 'integer',
            enum: [0, 1, 2, 3],
            description:
              '0 = Grundlage, 1 = Routine, 2 = Ausbau, 3 = Meisterschaft.',
          },
          prerequisites: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Keys von Knoten, die WEITER OBEN in dieser Liste stehen. Leer bei Einstiegsknoten.',
          },
        },
        required: [
          'key',
          'title',
          'description',
          'howTo',
          'track',
          'type',
          'xpReward',
          'stage',
          'prerequisites',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['nodes'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Du entwirfst persönliche Entwicklungs-Skill-Trees.

Du baust einen Baum aus 7 bis 10 Knoten, der die Person Schritt für Schritt zu ihrem HAUPTZIEL führt. Der Baum ist eine Anleitung, kein Tagebuch: Nach jedem Knoten muss klar sein, was als Nächstes zu tun ist.

Hauptweg und Nebenwege:
- Die Knoten mit track "main" bilden EINEN durchgehenden Weg zum Hauptziel. Der letzte Knoten dieses Wegs ist das Hauptziel selbst, als Meilenstein formuliert.
- Für jedes genannte Nebenziel legst du einen eigenen Strang mit track "side1" bzw. "side2" an (je 2 bis 3 Knoten). Nenne einen Nebenweg-Track nur, wenn es dazu wirklich ein Nebenziel gibt.
- Nebenwege dürfen an den Hauptweg andocken: Ein Knoten mit track "side1" darf einen Knoten des Hauptwegs als Voraussetzung haben. Der Hauptweg hängt dagegen NIE von einem Nebenweg ab.

Aufbau:
- Sortiere die Knoten so, dass Voraussetzungen immer VOR den Knoten stehen, die sie brauchen. "prerequisites" darf ausschließlich Keys nennen, die weiter oben in der Liste stehen.
- Beginne mit genau einem Einstiegsknoten ohne Voraussetzungen auf dem Hauptweg.
- "stage" beschreibt die Höhe im Baum: 0 = Grundlage, 1 = Routine, 2 = Ausbau, 3 = Meisterschaft. Ein Knoten hat nie eine kleinere stage als seine Voraussetzungen.

Inhalt:
- Schreibe auf Deutsch, in der Du-Form.
- Jeder Knoten muss konkret und überprüfbar sein ("Vier Wochen lang zweimal pro Woche trainiert"), nicht vage ("fitter werden").
- "howTo" ist der wichtigste Teil: zwei bis vier Schritte, die sagen, was die Person konkret TUT. Nenne Mengen, Zeitpunkte und Auswahlkriterien ("20 Minuten nach dem Aufstehen", "drei Anbieter vergleichen"). Keine Motivationssätze, keine Begründungen.
- Richte alles am Hauptziel aus. Ein Knoten, der nicht auf das Haupt- oder ein Nebenziel einzahlt, gehört nicht in den Baum.
- Passe die Einstiegshöhe an den Erfahrungsstand an: Fortgeschrittene brauchen keine Anfängerschritte als Meisterschaftsziel.
- Die XP-Belohnung folgt dem Aufwand: 50–75 für kleine Schritte, 100–125 für mittlere, 150–200 für echte Meilensteine.

Leitplanken:
- Gesundheit: Fokus auf Konsistenz, Wohlbefinden und Leistungsfähigkeit. Keine Gewichts- oder Kalorienziele, keine extremen Vorgaben.
- Finanzen: nur Tracking- und Verhaltensziele. Niemals konkrete Anlageempfehlungen (keine bestimmten Produkte, Aktien oder Renditeversprechen).`;

interface TreeRequest {
  areaName?: string;
  areaDescription?: string;
  experience?: string;
  focus?: string[];
  /** Existing areas this one overlaps with, e.g. Spanish and communication. */
  overlaps?: string[];
  goalText?: string;
  sideGoals?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  if (!(await isAuthenticated(req))) {
    return json({ error: 'Nicht angemeldet.' }, 401);
  }

  if (!ANTHROPIC_API_KEY) {
    return json(
      {
        error:
          'Auf dem Server ist kein Anthropic-Schlüssel hinterlegt. Lege in Supabase unter Edge Functions → Secrets ein Secret namens ANTHROPIC_API_KEY an.',
      },
      500,
    );
  }

  let payload: TreeRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Ungültige Anfrage.' }, 400);
  }

  if (!payload.areaName) return json({ error: 'Es fehlt der Bereich.' }, 400);

  const experienceLabel: Record<string, string> = {
    beginner: 'Am Anfang – steigt gerade erst ein.',
    intermediate: 'Schon dabei – macht es unregelmäßig.',
    advanced: 'Weit fortgeschritten – fester Bestandteil des Alltags.',
  };

  const userPrompt = [
    `Bereich: ${payload.areaName}`,
    payload.areaDescription ? `Worum es geht: ${payload.areaDescription}` : null,
    `Erfahrungsstand: ${
      experienceLabel[payload.experience ?? 'beginner'] ??
      experienceLabel.beginner
    }`,
    `Schwerpunkte: ${
      payload.focus?.length ? payload.focus.join(', ') : 'keine genannt'
    }`,
    payload.overlaps?.length
      ? `Überschneidet sich mit diesen Bereichen: ${payload.overlaps.join(
          ', ',
        )}. Baue ein bis zwei Knoten ein, die beides gleichzeitig voranbringen.`
      : null,
    payload.goalText
      ? `HAUPTZIEL: ${payload.goalText}`
      : 'HAUPTZIEL: nicht genannt – leite ein sinnvolles Hauptziel aus Bereich, Erfahrungsstand und Schwerpunkten ab.',
    ...(payload.sideGoals ?? [])
      .filter((goal) => typeof goal === 'string' && goal.trim() !== '')
      .slice(0, 2)
      .map((goal, index) => `Nebenziel ${index + 1} (track "side${index + 1}"): ${goal}`),
    '',
    'Entwirf den Skill-Tree, der genau zu diesem Hauptziel führt.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 12000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: TREE_SCHEMA },
        },
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Anthropic API error', response.status, detail);
      let reason = '';
      try {
        reason = JSON.parse(detail)?.error?.message ?? '';
      } catch {
        reason = detail.slice(0, 200);
      }
      return json(
        {
          error: `Die Anthropic-API hat mit Status ${response.status} geantwortet${
            reason ? `: ${reason}` : ''
          }`,
        },
        502,
      );
    }

    const message = await response.json();

    if (message.stop_reason === 'refusal') {
      return json({ error: 'Für diesen Bereich konnte kein Baum erzeugt werden.' }, 422);
    }

    const textBlock = (message.content ?? []).find(
      (block: { type: string }) => block.type === 'text',
    );
    if (!textBlock?.text) return json({ error: 'Leere Antwort von der KI.' }, 502);

    const parsed = JSON.parse(textBlock.text);
    return json({ nodes: parsed.nodes ?? [] });
  } catch (error) {
    console.error('generate-tree failed', error);
    return json({ error: 'Unerwarteter Fehler bei der KI-Anfrage.' }, 500);
  }
});
