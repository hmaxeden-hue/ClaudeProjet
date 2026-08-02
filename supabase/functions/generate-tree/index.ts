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
            description: 'Ein bis zwei Sätze auf Deutsch, in der Du-Form.',
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

Für einen Lebensbereich baust du einen Baum aus 6 bis 9 Knoten, der zur beschriebenen Person passt.

Aufbau:
- Sortiere die Knoten so, dass Voraussetzungen immer VOR den Knoten stehen, die sie brauchen. "prerequisites" darf ausschließlich Keys nennen, die weiter oben in der Liste stehen.
- Beginne mit ein bis zwei Einstiegsknoten ohne Voraussetzungen.
- Baue echte Verzweigungen: nicht eine einzige Kette, sondern parallele Pfade, die sich an den gewählten Schwerpunkten orientieren.
- "stage" beschreibt die Höhe im Baum: 0 = Grundlage, 1 = Routine, 2 = Ausbau, 3 = Meisterschaft. Ein Knoten hat nie eine kleinere stage als seine Voraussetzungen.

Inhalt:
- Schreibe auf Deutsch, in der Du-Form.
- Jeder Knoten muss konkret und überprüfbar sein ("Vier Wochen lang zweimal pro Woche trainiert"), nicht vage ("fitter werden").
- Richte die Knoten an den genannten Schwerpunkten und am Ziel der Person aus. Wer nichts zu einem Thema gesagt hat, bekommt dazu auch keine Knoten.
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
    payload.goalText ? `Eigenes Ziel: ${payload.goalText}` : null,
    '',
    'Entwirf den passenden Skill-Tree.',
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
