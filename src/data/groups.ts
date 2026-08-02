import type { Group, GroupMember, MemberStats } from '../types/groups';
import { supabase } from '../lib/supabase';

/**
 * Group access. Unlike the rest of the data layer this talks to Supabase
 * directly and has no local mirror: a group is shared state, and a cached copy
 * would show friends' numbers that are quietly out of date while looking
 * authoritative. Without a connection the UI says so instead.
 */

type Row = Record<string, unknown>;

const toGroup = (r: Row): Group => ({
  id: r.id as string,
  name: r.name as string,
  inviteCode: r.invite_code as string,
  createdBy: r.created_by as string,
  createdAt: r.created_at as string,
});

const toStats = (r: Row): MemberStats => ({
  userId: r.user_id as string,
  displayName: r.display_name as string,
  level: (r.level as number) ?? 1,
  totalXp: (r.total_xp as number) ?? 0,
  streak: (r.streak as number) ?? 0,
  areaLevels: (r.area_levels as MemberStats['areaLevels']) ?? [],
  updatedAt: r.updated_at as string,
});

/** Turns Postgres/PostgREST errors into something a user can act on. */
export function describeGroupError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('group_not_found')) {
    return 'Zu diesem Code gibt es keine Gruppe. Tippfehler?';
  }
  if (lower.includes('not_signed_in')) {
    return 'Für Gruppen musst du angemeldet sein.';
  }
  if (
    lower.includes('could not find the function') ||
    lower.includes('does not exist') ||
    lower.includes('schema cache')
  ) {
    return 'Die Gruppen-Tabellen fehlen noch in deinem Supabase-Projekt. Führe supabase/schema.sql noch einmal im SQL-Editor aus.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Keine Verbindung. Gruppen brauchen Internet, dein eigener Fortschritt läuft offline weiter.';
  }
  return message;
}

function client() {
  if (!supabase) throw new Error('NOT_SIGNED_IN');
  return supabase;
}

export async function fetchMyGroups(): Promise<Group[]> {
  const db = client();
  const { data: memberships, error: memberError } = await db
    .from('group_members')
    .select('group_id')
    .order('joined_at');
  if (memberError) throw new Error(memberError.message);

  const ids = (memberships ?? []).map((m) => (m as Row).group_id as string);
  if (ids.length === 0) return [];

  const { data, error } = await db.from('groups').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toGroup);
}

export async function createGroup(
  name: string,
  memberName: string,
): Promise<Group> {
  const { data, error } = await client().rpc('create_group', {
    group_name: name,
    member_name: memberName,
  });
  if (error) throw new Error(error.message);
  return toGroup(data as Row);
}

export async function joinGroup(
  code: string,
  memberName: string,
): Promise<Group> {
  const { data, error } = await client().rpc('join_group', {
    code,
    member_name: memberName,
  });
  if (error) throw new Error(error.message);
  return toGroup(data as Row);
}

export async function leaveGroup(groupId: string): Promise<void> {
  const db = client();
  const { data: session } = await db.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('NOT_SIGNED_IN');

  const { error } = await db
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/**
 * Members of a group with their published snapshot.
 *
 * Two queries rather than one join: `group_members` and `member_stats` both
 * point at `auth.users` and not at each other, so PostgREST cannot relate them.
 */
export async function fetchMembers(groupId: string): Promise<GroupMember[]> {
  const db = client();
  const { data: rows, error } = await db
    .from('group_members')
    .select('*')
    .eq('group_id', groupId);
  if (error) throw new Error(error.message);

  const members = ((rows ?? []) as Row[]).map((r) => ({
    userId: r.user_id as string,
    displayName: r.display_name as string,
    joinedAt: r.joined_at as string,
  }));
  if (members.length === 0) return [];

  const { data: stats, error: statsError } = await db
    .from('member_stats')
    .select('*')
    .in(
      'user_id',
      members.map((m) => m.userId),
    );
  if (statsError) throw new Error(statsError.message);

  const byUser = new Map(
    ((stats ?? []) as Row[]).map((r) => [r.user_id as string, toStats(r)]),
  );
  return members.map((m) => ({ ...m, stats: byUser.get(m.userId) }));
}

/**
 * Publishes the caller's own snapshot. Silently does nothing when signed out —
 * it is called after every XP gain, and a local-only user has nobody to
 * publish to.
 */
export async function publishMyStats(
  snapshot: Omit<MemberStats, 'userId' | 'updatedAt'>,
): Promise<void> {
  if (!supabase) return;
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return;

  const { error } = await supabase.from('member_stats').upsert({
    user_id: userId,
    display_name: snapshot.displayName,
    level: snapshot.level,
    total_xp: snapshot.totalXp,
    streak: snapshot.streak,
    area_levels: snapshot.areaLevels,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
