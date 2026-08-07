import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AchievementUnlock,
  AppData,
  Area,
  Goal,
  LogEntry,
  Note,
  Profile,
  Resource,
  SkillNode,
} from '../types/models';
import type { LifeRpgRepository } from './repository';

/**
 * Cloud implementation of the repository. Rows are scoped to the signed-in
 * user by row level security, so `user_id` is the only extra column the
 * mapping has to deal with.
 */

type Row = Record<string, unknown>;

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

// --- row <-> domain mapping ------------------------------------------------

const toArea = (r: Row): Area => ({
  id: r.id as string,
  name: r.name as string,
  icon: r.icon as string,
  color: r.color as string,
  description: (r.description as string) ?? '',
  xp: (r.xp as number) ?? 0,
  sortOrder: (r.sort_order as number) ?? 0,
  isCustom: Boolean(r.is_custom),
  suggestedActivities: (r.suggested_activities as Area['suggestedActivities']) ?? [],
  linkedAreaIds: (r.linked_area_ids as string[]) ?? undefined,
  tracks: (r.tracks as Area['tracks']) ?? undefined,
});

const fromArea = (a: Area, userId: string): Row => ({
  user_id: userId,
  id: a.id,
  name: a.name,
  icon: a.icon,
  color: a.color,
  description: a.description,
  xp: a.xp,
  sort_order: a.sortOrder,
  is_custom: a.isCustom,
  suggested_activities: a.suggestedActivities,
  linked_area_ids: a.linkedAreaIds ?? [],
  tracks: a.tracks ?? [],
});

const toNode = (r: Row): SkillNode => ({
  id: r.id as string,
  areaId: r.area_id as string,
  trackId: (r.track_id as string) ?? undefined,
  title: r.title as string,
  description: (r.description as string) ?? '',
  howTo: (r.how_to as string[]) ?? undefined,
  needsNotes: Boolean(r.needs_notes),
  prerequisites: (r.prerequisites as string[]) ?? [],
  xpReward: (r.xp_reward as number) ?? 0,
  status: r.status as SkillNode['status'],
  type: r.type as SkillNode['type'],
  completedAt: (r.completed_at as string) ?? undefined,
});

const fromNode = (n: SkillNode, userId: string): Row => ({
  user_id: userId,
  id: n.id,
  area_id: n.areaId,
  track_id: n.trackId ?? null,
  title: n.title,
  description: n.description,
  how_to: n.howTo ?? [],
  needs_notes: n.needsNotes ?? false,
  prerequisites: n.prerequisites,
  xp_reward: n.xpReward,
  status: n.status,
  type: n.type,
  completed_at: n.completedAt ?? null,
});

const toLog = (r: Row): LogEntry => {
  const secondary = (r.secondary_area_ids as string[]) ?? [];
  return {
    id: r.id as string,
    areaId: r.area_id as string,
    secondaryAreaIds: secondary.length > 0 ? secondary : undefined,
    nodeId: (r.node_id as string) ?? undefined,
    description: r.description as string,
    xp: (r.xp as number) ?? 0,
    timestamp: r.timestamp as string,
    scope: (r.scope as LogEntry['scope']) ?? undefined,
  };
};

const fromLog = (l: LogEntry, userId: string): Row => ({
  user_id: userId,
  id: l.id,
  area_id: l.areaId,
  secondary_area_ids: l.secondaryAreaIds ?? [],
  node_id: l.nodeId ?? null,
  description: l.description,
  xp: l.xp,
  timestamp: l.timestamp,
  scope: l.scope ?? null,
});

const toGoal = (r: Row): Goal => ({
  id: r.id as string,
  areaId: r.area_id as string,
  title: r.title as string,
  description: (r.description as string) ?? '',
  targetDate: (r.target_date as string) ?? undefined,
  status: r.status as Goal['status'],
  size: (r.size as Goal['size']) ?? undefined,
  xpReward: (r.xp_reward as number) ?? 0,
  achievedAt: (r.achieved_at as string) ?? undefined,
});

const fromGoal = (g: Goal, userId: string): Row => ({
  user_id: userId,
  id: g.id,
  area_id: g.areaId,
  title: g.title,
  description: g.description,
  target_date: g.targetDate ?? null,
  status: g.status,
  size: g.size ?? null,
  xp_reward: g.xpReward,
  achieved_at: g.achievedAt ?? null,
});

const toNote = (r: Row): Note => ({
  id: r.id as string,
  nodeId: r.node_id as string,
  areaId: r.area_id as string,
  text: r.text as string,
  createdAt: r.created_at as string,
});

const fromNote = (n: Note, userId: string): Row => ({
  user_id: userId,
  id: n.id,
  node_id: n.nodeId,
  area_id: n.areaId,
  text: n.text,
  created_at: n.createdAt,
});

const toResource = (r: Row): Resource => ({
  id: r.id as string,
  areaId: r.area_id as string,
  nodeId: (r.node_id as string) ?? undefined,
  type: r.type as Resource['type'],
  title: r.title as string,
  url: (r.url as string) ?? undefined,
  status: r.status as Resource['status'],
});

const fromResource = (res: Resource, userId: string): Row => ({
  user_id: userId,
  id: res.id,
  area_id: res.areaId,
  node_id: res.nodeId ?? null,
  type: res.type,
  title: res.title,
  url: res.url ?? null,
  status: res.status,
});

export class SupabaseRepository implements LifeRpgRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async loadAll(): Promise<AppData> {
    const [profiles, areas, nodes, logs, goals, resources, notes, achievements] =
      await Promise.all([
        this.client.from('profiles').select('*'),
        this.client.from('areas').select('*').order('sort_order'),
        this.client.from('nodes').select('*'),
        this.client.from('logs').select('*'),
        this.client.from('goals').select('*'),
        this.client.from('resources').select('*'),
        this.client.from('notes').select('*'),
        this.client.from('achievements').select('*'),
      ]);

    fail('Profil laden', profiles.error);
    fail('Bereiche laden', areas.error);
    fail('Skills laden', nodes.error);
    fail('Aktivitäten laden', logs.error);
    fail('Ziele laden', goals.error);
    fail('Ressourcen laden', resources.error);
    fail('Notizen laden', notes.error);
    fail('Abzeichen laden', achievements.error);

    const profileRow = (profiles.data ?? [])[0] as Row | undefined;

    return {
      profile: profileRow
        ? {
            id: 'profile',
            name: profileRow.name as string,
            avatar: (profileRow.avatar as string) ?? undefined,
            createdAt: profileRow.created_at as string,
            dailyQuest:
              (profileRow.daily_quest as Profile['dailyQuest']) ?? undefined,
          }
        : null,
      areas: ((areas.data ?? []) as Row[]).map(toArea),
      nodes: ((nodes.data ?? []) as Row[]).map(toNode),
      logs: ((logs.data ?? []) as Row[]).map(toLog),
      goals: ((goals.data ?? []) as Row[]).map(toGoal),
      resources: ((resources.data ?? []) as Row[]).map(toResource),
      notes: ((notes.data ?? []) as Row[]).map(toNote),
      achievements: ((achievements.data ?? []) as Row[]).map((r) => ({
        id: r.id as string,
        unlockedAt: r.unlocked_at as string,
      })),
    };
  }

  async seed(data: AppData): Promise<void> {
    if (data.profile) await this.saveProfile(data.profile);
    // Each bulk insert is skipped when empty so we don't send pointless requests.
    if (data.areas.length) {
      fail(
        'Bereiche speichern',
        (await this.client
          .from('areas')
          .upsert(data.areas.map((a) => fromArea(a, this.userId)))).error,
      );
    }
    if (data.nodes.length) await this.saveNodes(data.nodes);
    if (data.logs.length) {
      fail(
        'Aktivitäten speichern',
        (await this.client
          .from('logs')
          .upsert(data.logs.map((l) => fromLog(l, this.userId)))).error,
      );
    }
    if (data.goals.length) {
      fail(
        'Ziele speichern',
        (await this.client
          .from('goals')
          .upsert(data.goals.map((g) => fromGoal(g, this.userId)))).error,
      );
    }
    if (data.resources.length) {
      fail(
        'Ressourcen speichern',
        (await this.client
          .from('resources')
          .upsert(data.resources.map((r) => fromResource(r, this.userId)))).error,
      );
    }
    if (data.notes.length) {
      fail(
        'Notizen speichern',
        (await this.client
          .from('notes')
          .upsert(data.notes.map((n) => fromNote(n, this.userId)))).error,
      );
    }
    if (data.achievements.length) await this.addAchievements(data.achievements);
  }

  async saveProfile(profile: Profile): Promise<void> {
    fail(
      'Profil speichern',
      (await this.client.from('profiles').upsert({
        user_id: this.userId,
        name: profile.name,
        avatar: profile.avatar ?? null,
        created_at: profile.createdAt,
        daily_quest: profile.dailyQuest ?? null,
      })).error,
    );
  }

  async saveArea(area: Area): Promise<void> {
    fail(
      'Bereich speichern',
      (await this.client.from('areas').upsert(fromArea(area, this.userId))).error,
    );
  }

  async deleteArea(areaId: string): Promise<void> {
    // No cascade between these tables – remove the children explicitly.
    for (const table of ['nodes', 'logs', 'goals', 'resources', 'notes'] as const) {
      fail(
        `${table} löschen`,
        (await this.client.from(table).delete().eq('area_id', areaId)).error,
      );
    }
    fail(
      'Bereich löschen',
      (await this.client.from('areas').delete().eq('id', areaId)).error,
    );
  }

  async saveNode(node: SkillNode): Promise<void> {
    await this.saveNodes([node]);
  }

  async saveNodes(nodes: SkillNode[]): Promise<void> {
    if (nodes.length === 0) return;
    fail(
      'Skills speichern',
      (await this.client
        .from('nodes')
        .upsert(nodes.map((n) => fromNode(n, this.userId)))).error,
    );
  }

  async deleteNode(nodeId: string): Promise<void> {
    fail(
      'Skill löschen',
      (await this.client.from('nodes').delete().eq('id', nodeId)).error,
    );
  }

  async addLog(entry: LogEntry): Promise<void> {
    fail(
      'Aktivität speichern',
      (await this.client.from('logs').upsert(fromLog(entry, this.userId))).error,
    );
  }

  async deleteLog(logId: string): Promise<void> {
    fail(
      'Aktivität löschen',
      (await this.client.from('logs').delete().eq('id', logId)).error,
    );
  }

  async saveGoal(goal: Goal): Promise<void> {
    fail(
      'Ziel speichern',
      (await this.client.from('goals').upsert(fromGoal(goal, this.userId))).error,
    );
  }

  async deleteGoal(goalId: string): Promise<void> {
    fail(
      'Ziel löschen',
      (await this.client.from('goals').delete().eq('id', goalId)).error,
    );
  }

  async saveResource(resource: Resource): Promise<void> {
    fail(
      'Ressource speichern',
      (await this.client
        .from('resources')
        .upsert(fromResource(resource, this.userId))).error,
    );
  }

  async deleteResource(resourceId: string): Promise<void> {
    fail(
      'Ressource löschen',
      (await this.client.from('resources').delete().eq('id', resourceId)).error,
    );
  }

  async saveJournalNote(note: Note): Promise<void> {
    fail(
      'Notiz speichern',
      (await this.client.from('notes').upsert(fromNote(note, this.userId))).error,
    );
  }

  async deleteJournalNote(noteId: string): Promise<void> {
    fail(
      'Notiz löschen',
      (await this.client.from('notes').delete().eq('id', noteId)).error,
    );
  }

  async addAchievements(unlocks: AchievementUnlock[]): Promise<void> {
    if (unlocks.length === 0) return;
    fail(
      'Abzeichen speichern',
      (await this.client.from('achievements').upsert(
        unlocks.map((u) => ({
          user_id: this.userId,
          id: u.id,
          unlocked_at: u.unlockedAt,
        })),
      )).error,
    );
  }
}
