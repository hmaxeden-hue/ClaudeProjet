import { describe, expect, it } from 'vitest';
import { generateSetup, sanitizeAiNodes, type AiNode } from './onboarding';
import { nodeDepths } from '../lib/tree';
import { xpForNode } from '../lib/xp';

const node = (over: Partial<AiNode> = {}): AiNode => ({
  key: 'a',
  title: 'Titel',
  description: 'Beschreibung',
  type: 'quest',
  xpReward: 75,
  stage: 0,
  prerequisites: [],
  ...over,
});

describe('sanitizeAiNodes', () => {
  it('keeps well-formed nodes as they are', () => {
    const result = sanitizeAiNodes([
      node({ key: 'a' }),
      node({ key: 'b', prerequisites: ['a'], stage: 1 }),
    ]);

    expect(result.map((n) => n.key)).toEqual(['a', 'b']);
    expect(result[1].prerequisites).toEqual(['a']);
  });

  it('drops prerequisites that point forward, so the tree stays acyclic', () => {
    // 'a' requires 'b', which is only defined afterwards – a cycle if kept.
    const result = sanitizeAiNodes([
      node({ key: 'a', prerequisites: ['b'] }),
      node({ key: 'b', prerequisites: ['a'] }),
    ]);

    expect(result[0].prerequisites).toEqual([]);
    expect(result[1].prerequisites).toEqual(['a']);
  });

  it('drops self-references and invented keys', () => {
    const result = sanitizeAiNodes([
      node({ key: 'a', prerequisites: ['a'] }),
      node({ key: 'b', prerequisites: ['a', 'gibt-es-nicht'] }),
    ]);

    expect(result[0].prerequisites).toEqual([]);
    expect(result[1].prerequisites).toEqual(['a']);
  });

  it('skips duplicate keys and nodes without a title', () => {
    const result = sanitizeAiNodes([
      node({ key: 'a' }),
      node({ key: 'a', title: 'Doppelt' }),
      node({ key: 'c', title: '   ' }),
      node({ key: '', title: 'Ohne Key' }),
    ]);

    expect(result.map((n) => n.key)).toEqual(['a']);
  });

  it('normalises out-of-range values instead of rejecting the node', () => {
    const result = sanitizeAiNodes([
      node({ key: 'a', xpReward: 9999, stage: 12, type: 'nonsense' }),
      node({ key: 'b', xpReward: 'viel', stage: -4 }),
    ]);

    expect(result[0].xpReward).toBe(200);
    expect(result[0].stage).toBe(3);
    expect(result[0].type).toBe('quest');
    expect(result[1].xpReward).toBe(75);
    expect(result[1].stage).toBe(0);
  });

  it('tolerates a completely empty or malformed response', () => {
    expect(sanitizeAiNodes([])).toEqual([]);
    expect(sanitizeAiNodes([{} as AiNode])).toEqual([]);
  });
});

describe('generateSetup with AI trees', () => {
  const answers = {
    'area-knowledge': {
      experience: 'intermediate' as const,
      tags: [],
      goalText: '',
    },
  };

  it('builds an area from AI nodes and keeps prerequisite links intact', () => {
    const ai = sanitizeAiNodes([
      node({ key: 'root', title: 'Einstieg', stage: 0 }),
      node({ key: 'mid', title: 'Routine', prerequisites: ['root'], stage: 1 }),
      node({ key: 'top', title: 'Ziel', prerequisites: ['mid'], stage: 2 }),
    ]);

    const setup = generateSetup(['area-knowledge'], answers, {
      'area-knowledge': ai,
    });

    expect(setup.nodes.map((n) => n.title)).toEqual([
      'Einstieg',
      'Routine',
      'Ziel',
    ]);

    // Prerequisites are rewritten to generated ids, and the depth is preserved.
    const depths = nodeDepths(setup.nodes);
    const byTitle = Object.fromEntries(setup.nodes.map((n) => [n.title, n]));
    expect(depths.get(byTitle['Ziel'].id)).toBe(2);
    expect(byTitle['Routine'].prerequisites).toEqual([byTitle['Einstieg'].id]);
  });

  it('counts stages below the stated experience as existing progress', () => {
    const ai = sanitizeAiNodes([
      node({ key: 'root', title: 'Einstieg', stage: 0 }),
      node({ key: 'mid', title: 'Routine', prerequisites: ['root'], stage: 1 }),
    ]);

    const setup = generateSetup(['area-knowledge'], answers, {
      'area-knowledge': ai,
    });

    // 'intermediate' completes stage 0 – the area starts with that node's XP.
    expect(setup.areas[0].xp).toBe(setup.nodes[0].xpReward);
    expect(setup.nodes[0].status).toBe('completed');
    expect(setup.nodes[1].status).toBe('available');
    expect(setup.logs).toHaveLength(1);
  });

  it('prices nodes by the system, ignoring any number the AI supplied', () => {
    const ai = sanitizeAiNodes([
      node({ key: 'root', title: 'Einstieg', type: 'quest', xpReward: 200 }),
      node({
        key: 'mid',
        title: 'Routine',
        type: 'quest',
        prerequisites: ['root'],
        stage: 1,
        xpReward: 50,
      }),
    ]);

    const setup = generateSetup(['area-knowledge'], answers, {
      'area-knowledge': ai,
    });

    expect(setup.nodes[0].xpReward).toBe(xpForNode('quest', 0));
    // Deeper node is worth more, even though the AI asked for less.
    expect(setup.nodes[1].xpReward).toBe(xpForNode('quest', 1));
    expect(setup.nodes[1].xpReward).toBeGreaterThan(setup.nodes[0].xpReward);
  });

  it('falls back to the template catalog when an area has no AI tree', () => {
    const setup = generateSetup(['area-knowledge'], answers, {});

    expect(setup.nodes.length).toBeGreaterThan(0);
    expect(setup.nodes.some((n) => n.title === 'Erstes Buch fertiggelesen')).toBe(
      true,
    );
  });
});
