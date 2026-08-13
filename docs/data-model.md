# Data model and access control

A starting point, not a finished migration. Read `BRIEF.md` first for why the
access model is shaped this way.

The rule this whole document exists to serve: **a person sees a project only if
they are on it, or if it is team-wide and they are staff.** Being on the RunFree
team is not, by itself, permission to see anything.

---

## Tables

### `profiles`
One row per human, keyed to `auth.users`. `is_staff` marks RunFree people;
`is_owner` marks Andrew. A client has both false.

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
  -- The session/phase skeleton a new project starts with.
  structure   jsonb not null default '[]'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
```

Keeping the skeleton as `jsonb` means adding a vertical is data, not a
migration. Revisit if the structure grows its own relationships.

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
The table every policy reads.

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

---

## Row-level security

Enable on every table above. Without this the access model is only as good as
the last route handler someone wrote.

```sql
alter table projects         enable row level security;
alter table project_members  enable row level security;
alter table sessions         enable row level security;
alter table deliverables     enable row level security;
alter table profiles         enable row level security;
```

### The one function everything else uses

```sql
-- security definer so it can read project_members without recursing through
-- that table's own policies.
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
        me.is_owner                                 -- owner sees everything
        or (pr.visibility = 'team' and me.is_staff) -- staff see team-wide
      )
  );
$$;
```

### Policies

```sql
create policy read_projects on projects
  for select using (can_see_project(id));

create policy read_members on project_members
  for select using (can_see_project(project_id));

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
      or exists (select 1 from profiles me where me.id = auth.uid() and me.is_owner)
    )
  );

create policy read_deliverables on deliverables
  for select using (can_see_project(project_id));

-- Staff create projects; the creator is recorded and must be themselves.
create policy create_projects on projects
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from profiles me where me.id = auth.uid() and me.is_staff)
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
    or exists (select 1 from profiles me where me.id = auth.uid() and me.is_owner)
  );
```

---

## Things to verify before trusting this

Write these as real tests against a seeded database. Each one is a way the
model could be wrong in a way nobody notices until a client sees another
client's material.

1. A client on project A gets **zero rows** querying project B — through the
   API and through a direct PostgREST call with their own token.
2. A staff member who is not a member of a **private** project gets zero rows,
   even though they are staff.
3. That same staff member **does** see a team-wide project.
4. A client sees no unpublished session, and the coach on that project does.
5. A coach can create a project and is a member of it immediately.
6. A client cannot create a project at all.
7. Revoking membership takes effect on the next request, with no cached list
   still serving the old answer.

Test 2 is the one that matters most, because it is the assumption most likely
to get "simplified" back to a staff-sees-all shortcut during a busy afternoon.
