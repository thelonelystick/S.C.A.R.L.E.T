import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Message = { role: 'user' | 'assistant'; text: string; time: string };
export type Task = { id: number; title: string; due: string; priority: 'High' | 'Medium' | 'Low'; completed: boolean };
export type Expense = { id: number; description: string; category: string; amount: number; date: string };
export type RoutineItem = { id: number; title: string; time: string; days: string; enabled: boolean };
export type Memory = { id: number; type: string; content: string; updated: string };

export type WorkspaceState = {
  messages: Message[];
  tasks: Task[];
  expenses: Expense[];
  routines: RoutineItem[];
  memories: Memory[];
  voice: boolean;
  launch: boolean;
};

const localStorageKey = 'scarlet.workspace.v1';

type WorkspaceRow = { data: Partial<WorkspaceState> | null };

const mergeState = (fallback: WorkspaceState, saved: Partial<WorkspaceState> | null | undefined): WorkspaceState => ({
  ...fallback,
  ...saved,
});

export const loadWorkspaceState = async (user: User | null, fallback: WorkspaceState): Promise<WorkspaceState> => {
  if (!user || !supabase) {
    const localState = localStorage.getItem(localStorageKey);
    return localState ? mergeState(fallback, JSON.parse(localState) as Partial<WorkspaceState>) : fallback;
  }

  const { data, error } = await supabase
    .from('workspace_state')
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle<WorkspaceRow>();
  if (error) throw error;
  return mergeState(fallback, data?.data);
};

export const saveWorkspaceState = async (user: User | null, state: WorkspaceState): Promise<void> => {
  localStorage.setItem(localStorageKey, JSON.stringify(state));
  if (!user || !supabase) return;

  const { error } = await supabase.from('workspace_state').upsert(
    { user_id: user.id, data: state, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
};
