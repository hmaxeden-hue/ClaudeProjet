-- Life RPG – cloud schema.
-- Run this once in the Supabase SQL editor (see SETUP.md).
--
-- Every table is scoped to the authenticated user via `user_id` and protected
-- by row level security, so one account can never read or write another's data.
-- Record ids are generated client-side, so the primary key is (user_id, id).

-- ---------------------------------------------------------------- profiles --
create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null,
  avatar text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ areas --
create table if not exists public.areas (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  name text not null,
  icon text not null,
  color text not null,
  description text not null default '',
  xp integer not null default 0,
  sort_order integer not null default 0,
  is_custom boolean not null default false,
  suggested_activities jsonb not null default '[]'::jsonb,
  primary key (user_id, id)
);

-- ------------------------------------------------------------------ nodes --
create table if not exists public.nodes (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  area_id text not null,
  title text not null,
  description text not null default '',
  prerequisites jsonb not null default '[]'::jsonb,
  xp_reward integer not null default 0,
  status text not null default 'locked',
  type text not null default 'quest',
  completed_at timestamptz,
  primary key (user_id, id)
);
create index if not exists nodes_area_idx on public.nodes (user_id, area_id);

-- ------------------------------------------------------------------- logs --
create table if not exists public.logs (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  area_id text not null,
  node_id text,
  description text not null,
  xp integer not null default 0,
  timestamp timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists logs_time_idx on public.logs (user_id, timestamp desc);

-- ------------------------------------------------------------------ goals --
create table if not exists public.goals (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  area_id text not null,
  title text not null,
  description text not null default '',
  target_date date,
  status text not null default 'open',
  xp_reward integer not null default 100,
  achieved_at timestamptz,
  primary key (user_id, id)
);

-- -------------------------------------------------------------- resources --
create table if not exists public.resources (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  area_id text not null,
  node_id text,
  type text not null default 'other',
  title text not null,
  url text,
  status text not null default 'todo',
  primary key (user_id, id)
);

-- ----------------------------------------------------------- achievements --
create table if not exists public.achievements (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ------------------------------------------------------ row level security --
alter table public.profiles     enable row level security;
alter table public.areas        enable row level security;
alter table public.nodes        enable row level security;
alter table public.logs         enable row level security;
alter table public.goals        enable row level security;
alter table public.resources    enable row level security;
alter table public.achievements enable row level security;

-- One policy per table: you may only touch rows that belong to you.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'areas', 'nodes', 'logs', 'goals', 'resources', 'achievements'
  ]
  loop
    execute format(
      'drop policy if exists "own rows" on public.%I;
       create policy "own rows" on public.%I
         for all
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id);',
      t, t
    );
  end loop;
end $$;
