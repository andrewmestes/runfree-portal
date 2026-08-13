-- Multi-tenant schema and row-level security for the RunFree client portal.
-- See docs/data-model.md for the reasoning; this migration implements it plus
-- a few gaps that doc leaves open (noted inline).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null unique,
  full_name   text,
  is_staff    boolean not null default false,
  is_owner    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  structure   jsonb not null default '[]'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create type project_visibility as enum ('private', 'team');

create table projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  template_id    uuid references templates on delete set null,
  visibility     project_visibility not null default 'private',
  drive_folder_id text,
  created_by     uuid not null references profiles,
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);

create type project_role as enum ('client', 'coach');

create table project_members (
  project_id  uuid not null references projects on delete cascade,
  profile_id  uuid not null references profiles on delete cascade,
  role        project_role not null default 'client',
  added_at    timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects on delete cascade,
  title         text not null,
  held_on       date,
  position      integer not null default 0,
  recording_url text,
  transcript    text,
  takeaways     text,
  commitments   text,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table deliverables (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects on delete cascade,
  session_id   uuid references sessions on delete set null,
  title        text not null,
  drive_file_id text,
  external_url text,
  position     integer not null default 0,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

create index idx_projects_created_by on projects(created_by);
create index idx_projects_template on projects(template_id);
create index idx_project_members_profile on project_members(profile_id);
create index idx_sessions_project on sessions(project_id);
create index idx_deliverables_project on deliverables(project_id);
create index idx_deliverables_session on deliverables(session_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

-- data-model.md's own "enable RLS" list omits `templates`. Left off, it would
-- be a table with no RLS and whatever default grants Supabase hands
-- `authenticated` — i.e. wide open. Enabling it here isn't a scope
-- expansion, it's closing a gap the doc itself would otherwise leave.
alter table profiles         enable row level security;
alter table templates        enable row level security;
alter table projects         enable row level security;
alter table project_members  enable row level security;
alter table sessions         enable row level security;
alter table deliverables     enable row level security;

-- ---------------------------------------------------------------------------
-- Security-definer helpers. Each bypasses RLS on the table it reads so that
-- policies on that same table (or on profiles) don't recurse into themselves
-- — the exact bug CVF hit in its 002_fix_recursive_rls.sql migration.
-- ---------------------------------------------------------------------------

create or replace function am_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_owner from profiles where id = auth.uid()), false);
$$;

create or replace function am_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_staff from profiles where id = auth.uid()), false);
$$;

create or replace function can_see_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members m
    where m.project_id = p and m.profile_id = auth.uid()
  )
  or exists (
    select 1 from projects pr
    join profiles me on me.id = auth.uid()
    where pr.id = p
      and (
        me.is_owner
        or (pr.visibility = 'team' and me.is_staff)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- Self, the owner, or anyone sharing a project with you. The self-join stays
-- recursion-safe because project_members' own SELECT policy resolves through
-- can_see_project(), a security-definer function — it never re-enters
-- profiles' policy.
create policy read_profiles on profiles
  for select using (
    id = auth.uid()
    or am_owner()
    or exists (
      select 1 from project_members mine
      join project_members theirs on theirs.project_id = mine.project_id
      where mine.profile_id = auth.uid() and theirs.profile_id = profiles.id
    )
  );

-- Owner-only. A self-service policy (id = auth.uid()) would let anyone flip
-- their own is_staff/is_owner — Postgres RLS has no column-level check, so
-- "you can update your own row" and "you can't grant yourself staff" can't
-- both be expressed in one USING/WITH CHECK pair. Editing one's own name is
-- deliberately not wired up yet; add it later via a security-definer RPC
-- that only ever touches full_name.
create policy manage_profiles on profiles
  for update using (am_owner()) with check (am_owner());

-- ---------------------------------------------------------------------------
-- templates
-- ---------------------------------------------------------------------------

create policy read_templates on templates
  for select using (am_staff() or am_owner());

create policy manage_templates on templates
  for all using (am_owner()) with check (am_owner());

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create policy read_projects on projects
  for select using (can_see_project(id));

-- Staff create projects; the creator is recorded and must be themselves.
create policy create_projects on projects
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from profiles me where me.id = auth.uid() and me.is_staff)
  );

create policy manage_projects on projects
  for update using (am_owner() or created_by = auth.uid())
  with check (am_owner() or created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- project_members
-- ---------------------------------------------------------------------------

create policy read_members on project_members
  for select using (can_see_project(project_id));

-- Three ways a row can be inserted:
--  1. A staff member adding themselves as coach to a project they just
--     created ("is a member of what they just made", per BRIEF.md).
--  2. An existing coach on the project adding someone else (client or
--     co-coach).
--  3. The owner, unconditionally.
create policy insert_members on project_members
  for insert with check (
    (
      profile_id = auth.uid()
      and role = 'coach'
      and exists (
        select 1 from projects pr
        where pr.id = project_id and pr.created_by = auth.uid()
      )
    )
    or exists (
      select 1 from project_members m
      where m.project_id = project_members.project_id
        and m.profile_id = auth.uid()
        and m.role = 'coach'
    )
    or am_owner()
  );

-- Revoking membership: a coach on the project, or the owner.
create policy delete_members on project_members
  for delete using (
    exists (
      select 1 from project_members m
      where m.project_id = project_members.project_id
        and m.profile_id = auth.uid()
        and m.role = 'coach'
    )
    or am_owner()
  );

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

-- Clients never see a draft; members of the project see published rows.
create policy read_sessions on sessions
  for select using (
    can_see_project(project_id)
    and (
      published_at is not null
      or exists (
        select 1 from project_members m
        where m.project_id = sessions.project_id
          and m.profile_id = auth.uid()
          and m.role = 'coach'
      )
      or am_owner()
    )
  );

-- Coaches on a project write its content.
create policy write_sessions on sessions
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = sessions.project_id
        and m.profile_id = auth.uid()
        and m.role = 'coach'
    )
    or am_owner()
  );

-- ---------------------------------------------------------------------------
-- deliverables
-- ---------------------------------------------------------------------------

-- data-model.md's read_deliverables policy only checks can_see_project(),
-- with no published_at gate — deliverables has the same draft column as
-- sessions but the doc's policy silently drops the check. Since the whole
-- point of published_at ("null = draft, invisible to clients") is stated as
-- a deliberate property of sessions, and deliverables carries the identical
-- column for the identical reason, applying it here is completing the
-- pattern, not inventing one.
create policy read_deliverables on deliverables
  for select using (
    can_see_project(project_id)
    and (
      published_at is not null
      or exists (
        select 1 from project_members m
        where m.project_id = deliverables.project_id
          and m.profile_id = auth.uid()
          and m.role = 'coach'
      )
      or am_owner()
    )
  );

create policy write_deliverables on deliverables
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = deliverables.project_id
        and m.profile_id = auth.uid()
        and m.role = 'coach'
    )
    or am_owner()
  );

-- ---------------------------------------------------------------------------
-- Provision a profile row the moment someone gets an auth.users row (i.e. on
-- invite-accept / first login), so RLS has something to check from their very
-- first request. andrew@runfree.co is bootstrapped as owner+staff on
-- creation; everyone else starts a plain client, matching "being on the
-- RunFree team grants nothing by itself" — other staff are promoted
-- afterward by the owner via manage_profiles.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, is_staff, is_owner)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email = 'andrew@runfree.co',
    new.email = 'andrew@runfree.co'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
