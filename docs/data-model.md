# Data model and access control

**Implemented and tested** — `supabase/migrations/001-004`, verified by
`tests/rls.test.ts` against a real Supabase project with real signed-in users
(`npm run test:rls`). This document describes what's built, not a sketch of
what to build; where the implementation improved on the original design, the
improvement is what's recorded here.

The rule this whole document exists to serve: **a person sees a project only if
they are on it, or if it is team-wide and they are staff.** Being on the RunFree
team is not, by itself, permission to see anything.

---

## Tables

### `profiles`
One row per human, keyed to `auth.users`. `is_staff` marks RunFree people;
`is_owner` marks Andrew. A client has both false.

**`auth.users` is shared with the Certified Vision Framers portal**, if the two
end up on the same Supabase project (see `BRIEF.md` — not yet decided which
project this schema actually lives in). A row in `auth.users` grants nothing
here on its own; access comes from `project_members`.

**A `profiles` row is created automatically** by a trigger on `auth.users`
insert (`handle_new_user()`, in `001_multi_tenant_schema.sql`), not created by
hand at invite time as originally sketched. Everyone starts a plain client
(`is_staff`/`is_owner` both false) except `andrew@runfree.co`, hardcoded as
owner+staff on creation; every other staff grant is a deliberate act by the
owner afterward via `manage_profiles`.

This is a considered change from the original plan, not an oversight: it can
never be forgotten in application code, and `read_profiles`' RLS means a
profile with no project memberships is invisible to everyone but its own owner
and the RunFree owner — so it's inert, not exposed, even for someone who only
ever interacts with the *other* portal.

```sql
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null unique,
  full_name   text,
  is_staff    boolean not null default false,
  is_owner    boolean not null default false,
  created_at  timestamptz not null default now()
);
```

`is_staff` grants the ability to *create* projects and to see team-wide ones.
It does not grant access to private projects.

### `templates`
One per vertical. Stamped onto new projects.

```sql
create table templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,              -- 'Pivvot Vision Framing'
  slug        text not null unique,
  description text,
  structure   jsonb not null default '[]'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
```

Keeping the skeleton as `jsonb` means adding a vertical is data, not a
migration. Revisit if the structure grows its own relationships.

**RLS is staff/owner-read, owner-write** (`read_templates`, `manage_templates`)
— a gap the original sketch of this document left open entirely. Left
unenabled, `templates` would have inherited Supabase's default `authenticated`
grants: readable and writable by any signed-in user, client or not.

### `projects`
One per engagement. `visibility` is the switch the whole access model turns on.

```sql
create type project_visibility as enum ('private', 'team');

create table projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,           -- 'Athena Christian Church'
  template_id    uuid references templates on delete set null,
  visibility     project_visibility not null default 'private',
  -- Its own Drive folder. Deliberately not an env var: that assumption is
  -- exactly what makes the CVF portal single-tenant.
  drive_folder_id text,
  created_by     uuid not null references profiles,
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);
```

### `project_members`
The table most policies read, via `can_see_project()` below.

```sql
create type project_role as enum ('client', 'coach');

create table project_members (
  project_id  uuid not null references projects on delete cascade,
  profile_id  uuid not null references profiles on delete cascade,
  role        project_role not null default 'client',
  added_at    timestamptz not null default now(),
  primary key (project_id, profile_id)
);
```

### `sessions`
The spine of an engagement — a working session, coaching call, or module.

```sql
create table sessions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects on delete cascade,
  title         text not null,
  held_on       date,
  position      integer not null default 0,
  -- Separate columns on purpose. If these collapse into one blob of pasted
  -- text, the note automation Andrew wants later has nowhere to write, and
  -- every existing note has to be re-entered by hand.
  recording_url text,                     -- Loom, occasionally Zoom
  transcript    text,
  takeaways     text,
  commitments   text,
  published_at  timestamptz,              -- null = draft, invisible to clients
  created_at    timestamptz not null default now()
);
```

`published_at` matters: a coach writing notes after a call should not have the
client watching the draft appear a sentence at a time.

### `deliverables`
Files attached to a project or a session. Drive-backed like the CVF portal, or
uploaded later.

```sql
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
```

**Carries the same `published_at` draft gate as `sessions`**, on the same
reasoning — the original sketch of this document specified the column but
dropped the gate from its own `read_deliverables` policy. Closed in
implementation, not left as designed.

---

## Row-level security

Enabled on all six tables, including `templates` — the original version of
this list omitted it.

```sql
alter table profiles         enable row level security;
alter table templates        enable row level security;
alter table projects         enable row level security;
alter table project_members  enable row level security;
alter table sessions         enable row level security;
alter table deliverables     enable row level security;
```

### Security-definer helpers

Three small functions, not one. `can_see_project()` is what the original
sketch had; `am_owner()`/`am_staff()` factor out the repeated
`is_owner`/`is_staff` lookup that would otherwise appear inline in nearly every
policy below.

```sql
create or replace function am_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_owner from profiles where id = auth.uid()), false);
$$;

create or replace function am_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_staff from profiles where id = auth.uid()), false);
$$;

-- Current version, after the two fixes below. See "A real bug, found and
-- fixed" for why it looks different from a first-pass read of the access
-- rule at the top of this document.
create or replace function can_see_project(p uuid)
returns boolean
language sql stable security definer set search_path = public
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
        or pr.created_by = auth.uid()
        or (pr.visibility = 'team' and me.is_staff)
      )
  );
$$;
```

**Supabase grants `EXECUTE` on every new function to `anon`/`authenticated` by
default, independent of `PUBLIC`** — a plain `revoke ... from public` doesn't
touch it. `002_restrict_helper_function_grants.sql` revokes from both and
re-grants only to `authenticated`, which policies still need since RLS
evaluates as the querying role. `anon` being able to call these directly over
PostgREST's `/rpc` was flagged by Supabase's own security advisor; none of the
three leak data (each only answers a question about the *calling* session), but
there's no reason to leave it open.

### Policies

```sql
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

-- Owner-only, not self-service. Postgres RLS has no column-level check, so
-- "you can edit your own row" and "you can't grant yourself staff" can't both
-- be expressed in one policy. Editing one's own name isn't wired up yet —
-- add it later via a security-definer RPC that only ever touches full_name.
create policy manage_profiles on profiles
  for update using (am_owner()) with check (am_owner());

create policy read_templates on templates
  for select using (am_staff() or am_owner());

create policy manage_templates on templates
  for all using (am_owner()) with check (am_owner());

-- Direct created_by check first (see "A real bug, found and fixed"), then
-- can_see_project() for every other case.
create policy read_projects on projects
  for select using (created_by = auth.uid() or can_see_project(id));

create policy create_projects on projects
  for insert with check (created_by = auth.uid() and am_staff());

create policy manage_projects on projects
  for update using (am_owner() or created_by = auth.uid())
  with check (am_owner() or created_by = auth.uid());

create policy read_members on project_members
  for select using (can_see_project(project_id));

-- Three ways a row can be inserted: a staff member adding themselves as coach
-- to a project they just created; an existing coach adding someone else; or
-- the owner, unconditionally.
create policy insert_members on project_members
  for insert with check (
    (
      profile_id = auth.uid() and role = 'coach'
      and exists (select 1 from projects pr where pr.id = project_id and pr.created_by = auth.uid())
    )
    or exists (
      select 1 from project_members m
      where m.project_id = project_members.project_id and m.profile_id = auth.uid() and m.role = 'coach'
    )
    or am_owner()
  );

create policy delete_members on project_members
  for delete using (
    exists (
      select 1 from project_members m
      where m.project_id = project_members.project_id and m.profile_id = auth.uid() and m.role = 'coach'
    )
    or am_owner()
  );

-- Clients never see a draft; members of the project see published rows.
create policy read_sessions on sessions
  for select using (
    can_see_project(project_id)
    and (
      published_at is not null
      or exists (
        select 1 from project_members m
        where m.project_id = sessions.project_id and m.profile_id = auth.uid() and m.role = 'coach'
      )
      or am_owner()
    )
  );

create policy write_sessions on sessions
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = sessions.project_id and m.profile_id = auth.uid() and m.role = 'coach'
    )
    or am_owner()
  );

-- Same draft gate as sessions.
create policy read_deliverables on deliverables
  for select using (
    can_see_project(project_id)
    and (
      published_at is not null
      or exists (
        select 1 from project_members m
        where m.project_id = deliverables.project_id and m.profile_id = auth.uid() and m.role = 'coach'
      )
      or am_owner()
    )
  );

create policy write_deliverables on deliverables
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = deliverables.project_id and m.profile_id = auth.uid() and m.role = 'coach'
    )
    or am_owner()
  );
```

---

## A real bug, found and fixed

Test 5 (below) — *a coach can create a project and is a member of it
immediately* — failed on the first pass. `insert into projects (...) returning
*` was rejected: the row satisfied `create_projects`' `WITH CHECK`, but
Postgres also re-checks the table's `SELECT` policy against the `RETURNING`
row, and the original `can_see_project()` only granted visibility through
`project_members`, ownership, or team-wide-plus-staff — a brand-new private
project has none of those yet.

The first fix (`003`) added `pr.created_by = auth.uid()` to `can_see_project()`.
That fixed every *other* table's policies (`sessions`, `deliverables`, which
check a *different* table's `project_id` and so can safely subquery `projects`)
but not `read_projects` itself: within the same command that inserted a row,
a subquery that re-reads `projects` can't see it yet — no
`CommandCounterIncrement` between the insert and its own `RETURNING` check.
Confirmed directly: the same insert succeeds without `RETURNING`, and a plain
`select` in a *later* statement sees the row fine.

The second fix (`004`) checks `created_by = auth.uid()` as a plain column
comparison on `read_projects` directly — no subquery, so no self-reference —
and falls back to `can_see_project()` for every other case. That's the version
above.

**If a self-referencing RLS check on a just-inserted row ever misbehaves again,
this is the shape of the bug to look for first.**

---

## Verified

`tests/rls.test.ts`, run against a real Supabase project with real signed-in
users via `npm run test:rls`. All 11 checks pass — the original 7 below, plus
2 for the templates and deliverables gaps this implementation closed.

1. A client on project A gets zero rows querying project B.
2. A staff member who is not a member of a **private** project gets zero rows.
3. That same staff member **does** see a team-wide project.
4. A client sees no unpublished session; the coach on that project does.
5. A coach can create a project and is a member of it immediately.
6. A client cannot create a project at all.
7. Revoking membership hides the project on the very next request.
8. A client cannot read `templates`; staff can.
9. A client does not see an unpublished `deliverables` row.

Test 2 is the one that matters most going forward, because it is the
assumption most likely to get "simplified" back to a staff-sees-all shortcut
during a busy afternoon. If any future schema change touches these policies,
re-run `npm run test:rls` before trusting it.
