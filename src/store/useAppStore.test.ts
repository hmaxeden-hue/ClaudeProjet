import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './useAppStore';
import { db } from '../data/db';
import { useLocalRepository } from '../data/repository';
import type { Area, SkillNode } from '../types/models';
import { xpForActivity } from '../lib/xp';
import { dailyQuestBonus, dayKey } from '../lib/dailyQuest';

// The store schedules its feedback overlays through `window`, which the node
// test environment does not provide.
vi.stubGlobal('window', { setTimeout, clearTimeout });

const area = (id: string, over: Partial<Area> = {}): Area => ({
  id,
  name: id,
  icon: '⭐',
  color: '#38bdf8',
  description: '',
  xp: 0,
  sortOrder: 0,
  isCustom: true,
  suggestedActivities: [],
  ...over,
});

/** Puts the store into a signed-out, ready state with the given areas. */
async function reset(areas: Area[]): Promise<void> {
  await db.delete();
  await db.open();
  useLocalRepository();
  useAppStore.setState({
    status: 'ready',
    profile: { id: 'profile', name: 'Test', createdAt: new Date().toISOString() },
    areas,
    nodes: [],
    logs: [],
    goals: [],
    resources: [],
    notes: [],
    achievements: [],
    pendingAchievements: [],
  });
}

describe('logActivity across several areas', () => {
  beforeEach(async () => {
    await reset([area('spanish'), area('communication'), area('knowledge')]);
  });

  it('gives every listed area the full reward from a single entry', async () => {
    await useAppStore.getState().logActivity({
      areaId: 'spanish',
      secondaryAreaIds: ['communication'],
      description: 'Gespräch auf Spanisch geführt',
      baseXp: 20,
      scope: 'normal',
    });

    const expected = xpForActivity(20, 'normal');
    const { areas, logs } = useAppStore.getState();
    expect(areas.find((a) => a.id === 'spanish')!.xp).toBe(expected);
    expect(areas.find((a) => a.id === 'communication')!.xp).toBe(expected);
    expect(areas.find((a) => a.id === 'knowledge')!.xp).toBe(0);

    // One activity stays one entry – it is not duplicated per area.
    expect(logs).toHaveLength(1);
    expect(logs[0].areaId).toBe('spanish');
    expect(logs[0].secondaryAreaIds).toEqual(['communication']);
    expect(logs[0].xp).toBe(expected);

    // …and it is persisted that way.
    const stored = await db.logs.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].secondaryAreaIds).toEqual(['communication']);
  });

  it('never credits the same area twice', async () => {
    await useAppStore.getState().logActivity({
      areaId: 'spanish',
      secondaryAreaIds: ['spanish', 'communication', 'communication'],
      description: 'Doppelt genannt',
      baseXp: 20,
      scope: 'normal',
    });

    const expected = xpForActivity(20, 'normal');
    const { areas, logs } = useAppStore.getState();
    expect(areas.find((a) => a.id === 'spanish')!.xp).toBe(expected);
    expect(logs[0].secondaryAreaIds).toEqual(['communication']);
  });

  it('scales the reward with the chosen scope, not with a typed number', async () => {
    await useAppStore.getState().logActivity({
      areaId: 'spanish',
      description: 'Lange Einheit',
      baseXp: 20,
      scope: 'large',
    });

    expect(useAppStore.getState().areas[0].xp).toBe(xpForActivity(20, 'large'));
  });
});

describe('deleteArea with overlaps', () => {
  beforeEach(async () => {
    await reset([
      area('spanish', { linkedAreaIds: ['communication'] }),
      area('communication'),
    ]);
  });

  it('keeps activities that also counted elsewhere and drops the dead link', async () => {
    await useAppStore.getState().logActivity({
      areaId: 'communication',
      secondaryAreaIds: ['spanish'],
      description: 'Gespräch geführt',
      baseXp: 20,
      scope: 'normal',
    });

    await useAppStore.getState().deleteArea('spanish');

    const { areas, logs } = useAppStore.getState();
    expect(areas.map((a) => a.id)).toEqual(['communication']);
    // The entry belongs to communication and survives, without the stale id.
    expect(logs).toHaveLength(1);
    expect(logs[0].secondaryAreaIds).toEqual([]);
    expect((await db.logs.toArray())[0].secondaryAreaIds).toEqual([]);
  });

  it('removes the deleted area from other areas overlap lists', async () => {
    await useAppStore.getState().deleteArea('communication');

    const remaining = useAppStore.getState().areas;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].linkedAreaIds).toEqual([]);
    expect((await db.areas.get('spanish'))!.linkedAreaIds).toEqual([]);
  });
});

describe('completing nodes', () => {
  const node = (id: string, over: Partial<SkillNode> = {}): SkillNode => ({
    id,
    areaId: 'spanish',
    title: `Skill ${id}`,
    description: '',
    prerequisites: [],
    xpReward: 100,
    status: 'available',
    type: 'quest',
    ...over,
  });

  beforeEach(async () => {
    await reset([area('spanish')]);
  });

  it('lets a locked node be ticked off anyway', async () => {
    useAppStore.setState({
      nodes: [node('a'), node('b', { prerequisites: ['a'], status: 'locked' })],
    });

    await useAppStore.getState().completeNode('b');

    const { nodes, areas } = useAppStore.getState();
    expect(nodes.find((n) => n.id === 'b')!.status).toBe('completed');
    // The skipped prerequisite stays open – nothing is auto-completed for you.
    expect(nodes.find((n) => n.id === 'a')!.status).toBe('available');
    expect(areas[0].xp).toBe(100);
  });

  it('refuses to complete the same node twice', async () => {
    useAppStore.setState({ nodes: [node('a')] });

    await useAppStore.getState().completeNode('a');
    await useAppStore.getState().completeNode('a');

    expect(useAppStore.getState().areas[0].xp).toBe(100);
    expect(useAppStore.getState().logs).toHaveLength(1);
  });

  it('pays the daily-quest bonus once, on the quest node only', async () => {
    const today = dayKey();
    useAppStore.setState({
      nodes: [node('a'), node('b')],
      profile: {
        id: 'profile',
        name: 'Test',
        createdAt: new Date().toISOString(),
        dailyQuest: { day: today, nodeId: 'a', completed: false },
      },
    });

    await useAppStore.getState().completeNode('b');
    expect(useAppStore.getState().areas[0].xp).toBe(100);

    await useAppStore.getState().completeNode('a');
    expect(useAppStore.getState().areas[0].xp).toBe(
      100 + 100 + dailyQuestBonus(100),
    );
    expect(useAppStore.getState().profile!.dailyQuest!.completed).toBe(true);
  });

  it('does not pay the bonus for a quest from an earlier day', async () => {
    useAppStore.setState({
      nodes: [node('a')],
      profile: {
        id: 'profile',
        name: 'Test',
        createdAt: new Date().toISOString(),
        dailyQuest: { day: '2020-01-01', nodeId: 'a', completed: false },
      },
    });

    await useAppStore.getState().completeNode('a');
    expect(useAppStore.getState().areas[0].xp).toBe(100);
  });
});

describe('journal notes', () => {
  const skill = (id: string): SkillNode => ({
    id,
    areaId: 'spanish',
    title: `Skill ${id}`,
    description: '',
    prerequisites: [],
    xpReward: 100,
    status: 'available',
    type: 'quest',
  });

  beforeEach(async () => {
    await reset([area('spanish'), area('communication')]);
    useAppStore.setState({ nodes: [skill('a')] });
  });

  it('stores a note against its skill and area', async () => {
    await useAppStore.getState().saveNote({ nodeId: 'a', text: '  Lief gut.  ' });

    const { notes } = useAppStore.getState();
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe('Lief gut.');
    // The area is denormalised so the journal can colour entries without a lookup.
    expect(notes[0].areaId).toBe('spanish');
    expect((await db.notes.toArray())[0].text).toBe('Lief gut.');
  });

  it('ignores empty notes and unknown skills', async () => {
    await useAppStore.getState().saveNote({ nodeId: 'a', text: '   ' });
    await useAppStore.getState().saveNote({ nodeId: 'gibt-es-nicht', text: 'x' });

    expect(useAppStore.getState().notes).toHaveLength(0);
    expect(await db.notes.count()).toBe(0);
  });

  it('keeps notes newest first and deletes them again', async () => {
    await useAppStore.getState().saveNote({ nodeId: 'a', text: 'erste' });
    await useAppStore.getState().saveNote({ nodeId: 'a', text: 'zweite' });

    expect(useAppStore.getState().notes.map((n) => n.text)).toEqual([
      'zweite',
      'erste',
    ]);

    await useAppStore.getState().deleteNote(useAppStore.getState().notes[0].id);
    expect(useAppStore.getState().notes.map((n) => n.text)).toEqual(['erste']);
    expect(await db.notes.count()).toBe(1);
  });

  it('unlocks the first-note badge', async () => {
    await useAppStore.getState().saveNote({ nodeId: 'a', text: 'Erste Notiz' });

    expect(
      useAppStore.getState().achievements.map((a) => a.id),
    ).toContain('first-note');
  });

  it('drops the notes of a deleted area', async () => {
    await useAppStore.getState().saveNote({ nodeId: 'a', text: 'weg damit' });
    await useAppStore.getState().deleteArea('spanish');

    expect(useAppStore.getState().notes).toHaveLength(0);
    expect(await db.notes.count()).toBe(0);
  });
});
