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
  created_at timestamptz not null default now(),
  -- { day, nodeId, completed } – today's highlighted skill.
  daily_quest jsonb
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
  -- Areas this one overlaps with (e.g. Spanish → knowledge + communication).
  linked_area_ids jsonb not null default '[]'::jsonb,
  -- [{ id, title, isMain }] – the main goal's track plus side tracks.
  tracks jsonb not null default '[]'::jsonb,
  primary key (user_id, id)
);

-- ------------------------------------------------------------------ nodes --
create table if not exists public.nodes (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  area_id text not null,
  track_id text,
  title text not null,
  description text not null default '',
  -- Concrete steps for actually doing this one.
  how_to jsonb not null default '[]'::jsonb,
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
  -- Further areas the same activity counted for; each got the full reward.
  secondary_area_ids jsonb not null default '[]'::jsonb,
  node_id text,
  description text not null,
  xp integer not null default 0,
  scope text,
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
  size text,
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

-- ------------------------------------------------------------------ notes --
-- Journal notes written while working on a skill. For many tasks the written
-- record *is* the deliverable, so these are content, not metadata.
create table if not exists public.notes (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  node_id text not null,
  area_id text not null,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists notes_time_idx
  on public.notes (user_id, created_at desc);
create index if not exists notes_node_idx on public.notes (user_id, node_id);

-- ----------------------------------------------------------- achievements --
create table if not exists public.achievements (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ----------------------------------------------------------------- groups --
-- Groups are the one place where data crosses account borders. The tables
-- above stay strictly private; friends only ever see the snapshot in
-- `member_stats` below, which holds nothing but name, levels and streak.
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  /** Short code friends type in to join. */
  invite_code text not null unique,
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx
  on public.group_members (user_id);

-- Everything a group member may learn about another member. Deliberately not
-- a view onto the real tables: activities, skills, goals and notes have no
-- column here, so they cannot leak even if the client asked for them.
create table if not exists public.member_stats (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Held:in',
  level integer not null default 1,
  total_xp integer not null default 0,
  streak integer not null default 0,
  -- [{ name, icon, color, level }] – per-area level, no XP breakdown.
  area_levels jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ migrations --
-- `create table if not exists` leaves existing tables untouched, so columns
-- added later need their own statement. Running this file again is safe.
alter table public.areas
  add column if not exists linked_area_ids jsonb not null default '[]'::jsonb;
alter table public.logs
  add column if not exists secondary_area_ids jsonb not null default '[]'::jsonb;
alter table public.logs
  add column if not exists scope text;
alter table public.goals
  add column if not exists size text;
alter table public.profiles
  add column if not exists daily_quest jsonb;
alter table public.areas
  add column if not exists tracks jsonb not null default '[]'::jsonb;
alter table public.nodes
  add column if not exists track_id text;
alter table public.nodes
  add column if not exists how_to jsonb not null default '[]'::jsonb;
alter table public.nodes
  add column if not exists needs_notes boolean not null default false;

-- ------------------------------------------------------ row level security --
alter table public.profiles     enable row level security;
alter table public.areas        enable row level security;
alter table public.nodes        enable row level security;
alter table public.logs         enable row level security;
alter table public.goals        enable row level security;
alter table public.resources    enable row level security;
alter table public.notes        enable row level security;
alter table public.achievements enable row level security;

-- One policy per table: you may only touch rows that belong to you.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'areas', 'nodes', 'logs', 'goals', 'resources', 'notes',
    'achievements'
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

-- ------------------------------------------------- row level security: groups --
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.member_stats  enable row level security;

-- A policy on `group_members` that reads `group_members` would recurse, so the
-- membership tests run as `security definer` functions instead. They only ever
-- answer yes/no about the *calling* user, so they hand out no data themselves.
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = auth.uid()
  );
$$;

create or replace function public.shares_group_with(other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  );
$$;

-- Groups: visible to their members (and to the creator, who has to be able to
-- read the row back at creation time). Joining does not go through this policy
-- – it runs via join_group() below, so guessing codes reveals nothing.
drop policy if exists "members read group" on public.groups;
create policy "members read group" on public.groups
  for select using (created_by = auth.uid() or public.is_group_member(id));

drop policy if exists "creator manages group" on public.groups;
create policy "creator manages group" on public.groups
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "creator deletes group" on public.groups;
create policy "creator deletes group" on public.groups
  for delete using (created_by = auth.uid());

-- Members: everyone in the group sees who else is in it; you may only add or
-- remove yourself.
drop policy if exists "members read members" on public.group_members;
create policy "members read members" on public.group_members
  for select using (user_id = auth.uid() or public.is_group_member(group_id));

drop policy if exists "join as self" on public.group_members;
create policy "join as self" on public.group_members
  for insert with check (user_id = auth.uid());

drop policy if exists "leave as self" on public.group_members;
create policy "leave as self" on public.group_members
  for delete using (user_id = auth.uid());

-- Stats: readable by yourself and by people you share a group with. Writable
-- only by yourself – nobody can edit someone else's numbers.
drop policy if exists "read shared stats" on public.member_stats;
create policy "read shared stats" on public.member_stats
  for select using (user_id = auth.uid() or public.shares_group_with(user_id));

drop policy if exists "write own stats" on public.member_stats;
create policy "write own stats" on public.member_stats
  for insert with check (user_id = auth.uid());

drop policy if exists "update own stats" on public.member_stats;
create policy "update own stats" on public.member_stats
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------- group RPCs --
-- Creating a group and joining one both need to touch a row the caller may not
-- read yet, so they run server-side as single, atomic steps.

create or replace function public.create_group(group_name text, member_name text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.groups;
  code text;
  attempt int := 0;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  loop
    -- Six characters is enough for a circle of friends and still typeable.
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.groups (name, invite_code, created_by)
      values (
        coalesce(nullif(trim(group_name), ''), 'Meine Gruppe'),
        code,
        auth.uid()
      )
      returning * into created;
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt > 5 then raise; end if;
    end;
  end loop;

  insert into public.group_members (group_id, user_id, display_name)
  values (
    created.id,
    auth.uid(),
    coalesce(nullif(trim(member_name), ''), 'Held:in')
  );

  return created;
end;
$$;

create or replace function public.join_group(code text, member_name text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.groups;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  select * into target
  from public.groups
  where invite_code = upper(trim(code));

  if target.id is null then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  insert into public.group_members (group_id, user_id, display_name)
  values (
    target.id,
    auth.uid(),
    coalesce(nullif(trim(member_name), ''), 'Held:in')
  )
  on conflict (group_id, user_id) do update
    set display_name = excluded.display_name;

  return target;
end;
$$;

revoke all on function public.create_group(text, text) from public;
revoke all on function public.join_group(text, text) from public;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(text, text) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;
