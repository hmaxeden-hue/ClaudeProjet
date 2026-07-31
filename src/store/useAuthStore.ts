import { create } from 'zustand';
import { isCloudConfigured, supabase } from '../lib/supabase';
import {
  localRepository,
  setActiveRepository,
  useLocalRepository,
} from '../data/repository';
import { SupabaseRepository } from '../data/supabaseRepository';
import { useAppStore } from './useAppStore';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

interface AuthState {
  status: AuthStatus;
  email: string | null;
  /** True while data is being moved between backends after a sign-in. */
  syncing: boolean;
  error: string | null;

  init: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

/** Turns Supabase's English error strings into something a user can act on. */
function translateError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Der Server ist gerade nicht erreichbar. Prüfe deine Internetverbindung und versuch es noch einmal.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'E-Mail oder Passwort stimmt nicht.';
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'Für diese E-Mail gibt es schon ein Konto. Melde dich stattdessen an.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Bestätige zuerst die E-Mail, die wir dir geschickt haben.';
  }
  if (lower.includes('password')) {
    return 'Das Passwort ist zu kurz oder zu einfach — nimm mindestens 6 Zeichen.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Zu viele Versuche. Warte einen Moment und probier es noch einmal.';
  }
  return message;
}

/**
 * Points the repository at the cloud and, on the very first sign-in,
 * uploads whatever the user already built locally so nothing is lost.
 */
async function activateCloud(userId: string): Promise<void> {
  const cloud = new SupabaseRepository(supabase!, userId);
  const cloudData = await cloud.loadAll();

  if (!cloudData.profile) {
    const local = await localRepository.loadAll();
    if (local.profile) await cloud.seed(local);
  }

  setActiveRepository(cloud);
  await useAppStore.getState().init();
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  email: null,
  syncing: false,
  error: null,

  init: async () => {
    if (!isCloudConfigured || !supabase) {
      set({ status: 'signed_out' });
      await useAppStore.getState().init();
      return;
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (session?.user) {
      set({ status: 'signed_in', email: session.user.email ?? null });
      try {
        await activateCloud(session.user.id);
      } catch (error) {
        // Cloud unreachable – fall back to local so the app still works.
        set({ error: translateError((error as Error).message) });
        useLocalRepository();
        await useAppStore.getState().init();
      }
    } else {
      set({ status: 'signed_out' });
      await useAppStore.getState().init();
    }

    // React to sign-in / sign-out that happens in another tab.
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        set({ status: 'signed_out', email: null });
        useLocalRepository();
        void useAppStore.getState().init();
      }
    });
  },

  signUp: async (email, password) => {
    if (!supabase) return;
    set({ syncing: true, error: null });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ syncing: false, error: translateError(error.message) });
      return;
    }
    if (!data.session) {
      // Email confirmation is enabled on the project – nothing to sync yet.
      set({
        syncing: false,
        error:
          'Fast geschafft! Bestätige zuerst die E-Mail, die wir dir geschickt haben, und melde dich dann an.',
      });
      return;
    }
    set({ status: 'signed_in', email: data.user?.email ?? null });
    await activateCloud(data.user!.id);
    set({ syncing: false });
  },

  signIn: async (email, password) => {
    if (!supabase) return;
    set({ syncing: true, error: null });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      set({ syncing: false, error: translateError(error.message) });
      return;
    }
    set({ status: 'signed_in', email: data.user?.email ?? null });
    try {
      await activateCloud(data.user!.id);
      set({ syncing: false });
    } catch (err) {
      set({ syncing: false, error: translateError((err as Error).message) });
    }
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ status: 'signed_out', email: null, error: null });
    useLocalRepository();
    await useAppStore.getState().init();
  },

  clearError: () => set({ error: null }),
}));
