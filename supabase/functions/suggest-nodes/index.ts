/**
 * Supabase Edge Function: personalized skill suggestions.
 *
 * The Anthropic API key lives only in this function's environment, never in
 * the browser.
 *
 * Authentication is checked *here* rather than by the gateway's "Verify JWT"
 * setting. That setting also rejects the browser's CORS preflight, which
 * carries no Authorization header by design — the request would then fail
 * before this code ever runs. Deploy this function with Verify JWT turned off;
 * the check below keeps it just as closed to anonymous callers.
 */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
// Injected automatically by Supabase into every edge function.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const MODEL = 'claude-opus-5';

/** Resolves the caller's token against Supabase Auth. */
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

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Shape the model must return, enforced by structured outputs. */
const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Kurzer, konkreter Titel des Skills auf Deutsch.',
          },
          description: {
            type: 'string',
            description:
              'Ein bis zwei Sätze, woran man erkennt, dass es erledigt ist. Auf Deutsch.',
          },
          howTo: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 4,
            description:
              'Zwei bis vier konkrete Handlungsschritte auf Deutsch, in der Du-Form. Jeder Schritt sagt, was die Person tatsächlich tut.',
          },
          type: {
            type: 'string',
            enum: ['quest', 'habit', 'milestone'],
          },
          xpReward: { type: 'integer', enum: [50, 75, 100, 125, 150, 200] },
        },
        required: ['title', 'description', 'howTo', 'type', 'xpReward'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Du hilfst Menschen, ihren persönlichen Entwicklungs-Skill-Tree zu erweitern.

Du bekommst einen Lebensbereich, das aktuelle Level der Person und die Skills, die sie bereits abgeschlossen hat oder noch vor sich hat. Schlage 3 neue Skill-Knoten vor, die logisch an den bisherigen Fortschritt anschließen.

Regeln:
- Schreibe auf Deutsch, in der Du-Form.
- Jeder Vorschlag muss konkret und überprüfbar sein ("Drei Monate lang wöchentlich X"), nicht vage ("besser werden").
- "howTo" sagt, was die Person konkret TUT: zwei bis vier Schritte mit Mengen und Zeitpunkten, keine Motivationssätze.
- Schlage nichts vor, das inhaltlich schon in der Liste steht.
- Steigere die Anforderung passend zum Level: kleine Schritte bei niedrigem Level, anspruchsvollere bei hohem.
- Gesundheit: Fokus auf Konsistenz, Wohlbefinden und Leistungsfähigkeit. Keine Gewichts- oder Kalorienziele, keine extremen Vorgaben.
- Finanzen: nur Tracking- und Verhaltensziele. Gib niemals konkrete Anlageempfehlungen (keine bestimmten Produkte, Aktien oder Renditeversprechen).
- Die XP-Belohnung soll zum Aufwand passen: 50–75 für kleine Schritte, 100–125 für mittlere, 150–200 für echte Meilensteine.`;

interface SuggestRequest {
  areaName?: string;
  areaDescription?: string;
  level?: number;
  completedNodes?: string[];
  openNodes?: string[];
  goals?: string[];
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
    return json(
      { error: 'Nicht angemeldet. Melde dich ab und wieder an, dann probier es erneut.' },
      401,
    );
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

  let payload: SuggestRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Ungültige Anfrage.' }, 400);
  }

  if (!payload.areaName) {
    return json({ error: 'Es fehlt der Bereich.' }, 400);
  }

  const userPrompt = [
    `Bereich: ${payload.areaName}`,
    payload.areaDescription ? `Beschreibung: ${payload.areaDescription}` : null,
    `Aktuelles Level: ${payload.level ?? 1}`,
    `Bereits abgeschlossen: ${
      payload.completedNodes?.length ? payload.completedNodes.join(', ') : 'noch nichts'
    }`,
    `Noch offen im Baum: ${
      payload.openNodes?.length ? payload.openNodes.join(', ') : 'nichts'
    }`,
    payload.goals?.length ? `Eigene Ziele: ${payload.goals.join(', ')}` : null,
    '',
    'Schlage 3 passende neue Skills vor.',
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
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: SUGGESTION_SCHEMA,
          },
        },
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Anthropic API error', response.status, detail);
      // Surface the API's own reason (e.g. invalid key, no credit) – it makes
      // the difference between a five-second fix and guesswork. Contains no
      // secrets, only the error description.
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

    // Safety classifiers can decline a request; that arrives as a 200.
    if (message.stop_reason === 'refusal') {
      return json(
        {
          error:
            'Für diese Anfrage konnten keine Vorschläge erzeugt werden. Formuliere den Bereich etwas anders.',
        },
        422,
      );
    }

    const textBlock = (message.content ?? []).find(
      (block: { type: string }) => block.type === 'text',
    );
    if (!textBlock?.text) {
      return json({ error: 'Leere Antwort von der KI.' }, 502);
    }

    const parsed = JSON.parse(textBlock.text);
    return json({ suggestions: parsed.suggestions ?? [] });
  } catch (error) {
    console.error('suggest-nodes failed', error);
    return json({ error: 'Unerwarteter Fehler bei der KI-Anfrage.' }, 500);
  }
});
