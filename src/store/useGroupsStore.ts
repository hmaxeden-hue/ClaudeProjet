import { create } from 'zustand';
import type { Group, GroupMember } from '../types/groups';
import {
  createGroup,
  describeGroupError,
  fetchMembers,
  fetchMyGroups,
  joinGroup,
  leaveGroup,
  publishMyStats,
} from '../data/groups';
import { statsSnapshot } from '../lib/stats';
import { useAppStore } from './useAppStore';

interface GroupsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  groups: Group[];
  selectedGroupId: string | null;
  /** Members per group id, filled when a group is opened. */
  members: Record<string, GroupMember[]>;
  /** True while a create/join/leave request is running. */
  busy: boolean;
  error: string | null;

  load: () => Promise<void>;
  select: (groupId: string) => Promise<void>;
  create: (name: string) => Promise<boolean>;
  join: (code: string) => Promise<boolean>;
  leave: (groupId: string) => Promise<void>;
  clearError: () => void;
}

/** The snapshot of the local state that friends are allowed to see. */
function snapshot() {
  const { profile, areas, logs } = useAppStore.getState();
  return statsSnapshot(profile, areas, logs);
}

export const useGroupsStore = create<GroupsState>((set, get) => ({
  status: 'idle',
  groups: [],
  selectedGroupId: null,
  members: {},
  busy: false,
  error: null,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      // Publish first: opening the page should not show friends a stale
      // version of yourself while you look at their fresh numbers.
      await publishMyStats(snapshot());
      const groups = await fetchMyGroups();
      set({ groups, status: 'ready' });

      const selected = get().selectedGroupId ?? groups[0]?.id ?? null;
      if (selected) await get().select(selected);
    } catch (error) {
      set({
        status: 'error',
        error: describeGroupError((error as Error).message),
      });
    }
  },

  select: async (groupId) => {
    set({ selectedGroupId: groupId });
    try {
      const members = await fetchMembers(groupId);
      set((state) => ({ members: { ...state.members, [groupId]: members } }));
    } catch (error) {
      set({ error: describeGroupError((error as Error).message) });
    }
  },

  create: async (name) => {
    set({ busy: true, error: null });
    try {
      await publishMyStats(snapshot());
      const group = await createGroup(name, snapshot().displayName);
      set((state) => ({
        groups: [...state.groups, group],
        selectedGroupId: group.id,
        busy: false,
      }));
      await get().select(group.id);
      return true;
    } catch (error) {
      set({ busy: false, error: describeGroupError((error as Error).message) });
      return false;
    }
  },

  join: async (code) => {
    set({ busy: true, error: null });
    try {
      await publishMyStats(snapshot());
      const group = await joinGroup(code, snapshot().displayName);
      set((state) => ({
        groups: state.groups.some((g) => g.id === group.id)
          ? state.groups
          : [...state.groups, group],
        selectedGroupId: group.id,
        busy: false,
      }));
      await get().select(group.id);
      return true;
    } catch (error) {
      set({ busy: false, error: describeGroupError((error as Error).message) });
      return false;
    }
  },

  leave: async (groupId) => {
    set({ busy: true, error: null });
    try {
      await leaveGroup(groupId);
      set((state) => {
        const groups = state.groups.filter((g) => g.id !== groupId);
        const members = { ...state.members };
        delete members[groupId];
        return {
          groups,
          members,
          busy: false,
          selectedGroupId:
            state.selectedGroupId === groupId
              ? (groups[0]?.id ?? null)
              : state.selectedGroupId,
        };
      });
      const next = get().selectedGroupId;
      if (next) await get().select(next);
    } catch (error) {
      set({ busy: false, error: describeGroupError((error as Error).message) });
    }
  },

  clearError: () => set({ error: null }),
}));
