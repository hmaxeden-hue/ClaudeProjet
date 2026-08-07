import { describe, expect, it } from 'vitest';
import {
  MAIN_TRACK_ID,
  nextStepForArea,
  nextStepsByTrack,
  recomputeNodeStatuses,
  tracksOf,
} from './tree';
import type { Area, SkillNode } from '../types/models';

const area: Area = {
  id: 'area-1',
  name: 'Gesundheit',
  icon: '💪',
  color: '#34d399',
  description: '',
  xp: 0,
  sortOrder: 0,
  isCustom: false,
  suggestedActivities: [],
  tracks: [
    { id: MAIN_TRACK_ID, title: '5 km am Stück laufen', isMain: true },
    { id: 'side1', title: 'Besser schlafen', isMain: false },
  ],
};

const node = (id: string, over: Partial<SkillNode> = {}): SkillNode => ({
  id,
  areaId: 'area-1',
  title: `Skill ${id}`,
  description: '',
  prerequisites: [],
  xpReward: 50,
  status: 'available',
  type: 'quest',
  ...over,
});

describe('tracksOf', () => {
  it('puts the main track first', () => {
    expect(tracksOf(area).map((t) => t.id)).toEqual([MAIN_TRACK_ID, 'side1']);
  });

  it('treats an area without tracks as one main track', () => {
    const legacy = { ...area, tracks: undefined };
    expect(tracksOf(legacy)).toEqual([
      { id: MAIN_TRACK_ID, title: 'Gesundheit', isMain: true },
    ]);
  });
});

describe('nextStepForArea', () => {
  it('prefers the main track over an equally shallow side step', () => {
    const nodes = [
      node('side-root', { trackId: 'side1' }),
      node('main-root'),
    ];

    expect(nextStepForArea(nodes, 'area-1')?.id).toBe('main-root');
  });

  it('falls back to a side step when the main track is blocked', () => {
    const nodes = [
      node('main-root', { status: 'completed' }),
      node('main-next', {
        prerequisites: ['main-root', 'nicht-erledigt'],
        status: 'locked',
      }),
      node('side-root', { trackId: 'side1' }),
    ];

    expect(nextStepForArea(nodes, 'area-1')?.id).toBe('side-root');
  });
});

describe('nextStepsByTrack', () => {
  it('returns the shallowest open node per track, main track first', () => {
    const nodes = [
      node('main-root', { status: 'completed' }),
      node('main-next', { prerequisites: ['main-root'] }),
      node('main-later', { prerequisites: ['main-next'], status: 'locked' }),
      node('side-root', { trackId: 'side1' }),
    ];

    const steps = nextStepsByTrack(area, nodes);
    expect(steps.map((s) => [s.track.id, s.node.id])).toEqual([
      [MAIN_TRACK_ID, 'main-next'],
      ['side1', 'side-root'],
    ]);
  });

  it('skips tracks that have nothing open', () => {
    const nodes = [node('main-root'), node('side-done', { trackId: 'side1', status: 'completed' })];

    expect(nextStepsByTrack(area, nodes).map((s) => s.track.id)).toEqual([
      MAIN_TRACK_ID,
    ]);
  });
});

describe('recomputeNodeStatuses', () => {
  it('unlocks a node once every prerequisite is completed', () => {
    const nodes = recomputeNodeStatuses([
      node('a', { status: 'completed' }),
      node('b', { prerequisites: ['a'], status: 'locked' }),
      node('c', { prerequisites: ['a', 'b'], status: 'locked' }),
    ]);

    expect(nodes.map((n) => n.status)).toEqual([
      'completed',
      'available',
      'locked',
    ]);
  });

  it('never downgrades something that was completed out of order', () => {
    // The deeper node was ticked off first; it must stay completed.
    const nodes = recomputeNodeStatuses([
      node('a', { status: 'available' }),
      node('b', { prerequisites: ['a'], status: 'completed' }),
    ]);

    expect(nodes[1].status).toBe('completed');
  });
});
