import type { NodeType } from '../types/models';
import { sanitizeAiNodes, type ResolvedNode } from '../data/onboarding';
import { supabase } from './supabase';

export interface NodeSuggestion {
  title: string;
  description: string;
  type: NodeType;
  xpReward: number;
}

export interface SuggestionRequest {
  areaName: string;
  areaDescription: string;
  level: number;
  completedNodes: string[];
  openNodes: string[];
  goals: string[];
}

/**
 * supabase-js collapses every non-2xx response into a generic error and hides
 * the body, so the useful message our function sent has to be read back off
 * the attached Response.
 */
async function describeInvokeError(error: unknown): Promise<string> {
  const response = (error as { context?: unknown }).context;

  if (response instanceof Response) {
    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      try {
        body = await response.clone().text();
      } catch {
        body = null;
      }
    }

    const detail =
      typeof body === 'string'
        ? body
        : ((body as { error?: string } | null)?.error ?? '');

    if (response.status === 404) {
      return 'Die Serverfunktion "suggest-nodes" wurde nicht gefunden. Prüfe in Supabase unter Edge Functions, ob sie genau so heißt und veröffentlicht ist.';
    }
    if (response.status === 401 || response.status === 403) {
      return 'Der Server hat die Anfrage abgelehnt. Melde dich einmal ab und wieder an.';
    }
    if (detail) {
      return `${detail} (Status ${response.status})`;
    }
    return `Die Serverfunktion hat mit Status ${response.status} geantwortet. Details stehen in Supabase unter Edge Functions → suggest-nodes → Logs.`;
  }

  const message = (error as Error)?.message ?? '';
  if (message.toLowerCase().includes('failed to fetch')) {
    return 'Der Server ist nicht erreichbar. Prüfe deine Internetverbindung.';
  }
  return message || 'Unbekannter Fehler beim Aufruf der Serverfunktion.';
}

/**
 * Asks the backend for skill suggestions. The Anthropic key stays on the
 * server – the browser only ever talks to our own edge function.
 */
export async function fetchNodeSuggestions(
  input: SuggestionRequest,
): Promise<NodeSuggestion[]> {
  if (!supabase) {
    throw new Error('Für KI-Vorschläge musst du angemeldet sein.');
  }

  const { data, error } = await supabase.functions.invoke('suggest-nodes', {
    body: input,
  });

  if (error) throw new Error(await describeInvokeError(error));
  if (data?.error) throw new Error(data.error);

  return (data?.suggestions ?? []) as NodeSuggestion[];
}

export interface TreeRequest {
  areaName: string;
  areaDescription: string;
  experience: string;
  focus: string[];
  goalText: string;
}

/**
 * Asks the backend to design a whole skill tree for one area. The result is
 * sanitized before it is handed back, so callers always get a valid DAG.
 */
export async function fetchGeneratedTree(
  input: TreeRequest,
): Promise<ResolvedNode[]> {
  if (!supabase) {
    throw new Error('Für KI-Bäume musst du angemeldet sein.');
  }

  const { data, error } = await supabase.functions.invoke('generate-tree', {
    body: input,
  });

  if (error) throw new Error(await describeInvokeError(error));
  if (data?.error) throw new Error(data.error);

  return sanitizeAiNodes(data?.nodes ?? []);
}
