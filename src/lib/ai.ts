import type { NodeType } from '../types/models';
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

  if (error) {
    throw new Error(
      'Die Vorschläge konnten nicht geladen werden. Bist du angemeldet und online?',
    );
  }
  if (data?.error) throw new Error(data.error);

  return (data?.suggestions ?? []) as NodeSuggestion[];
}
