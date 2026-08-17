-- What a church is supposed to be doing right now, and notes per module.
--
-- Andrew: "I want somewhere at the top of the entire project… an assigned
-- homework section or something that says 'these are the immediate priorities
-- for your team this month'… That should be front and center as soon as
-- anybody logs in. What are my commitments? What am I supposed to be doing
-- right now with my team?"
--
-- This is the answer to the question a church team member actually arrives
-- with. Everything else on the page answers "where is the material" — useful,
-- but only once you already know what you are meant to be doing. Putting it on
-- the project rather than on a session is deliberate: it survives between
-- sessions, which is exactly the stretch of time when someone forgets.

alter table projects add column priorities text;
alter table projects add column priorities_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- Per-module notes
-- ---------------------------------------------------------------------------
-- Andrew, on a module: "I should have a nice place right here where I can add
-- notes, next steps, or homework assignments."
--
-- A table rather than a column on projects, because notes belong to a
-- (project, section) pair and a project has many sections. Keyed on the
-- section string rather than a foreign key because sections are free text —
-- they come from a template's structure or from someone typing a new one, and
-- there is no sections table to point at.

create table section_notes (
  project_id uuid not null references projects on delete cascade,
  section    text not null,
  body       text,
  updated_at timestamptz not null default now(),
  primary key (project_id, section)
);

alter table section_notes enable row level security;

-- Visible to anyone who can see the project. Unlike sessions and deliverables
-- there is no draft state: a note is written to be read, and a coach who wants
-- to draft one can simply not save it yet.
create policy read_section_notes on section_notes
  for select using (can_see_project(project_id));

create policy write_section_notes on section_notes
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = section_notes.project_id
        and m.profile_id = auth.uid()
        and m.role in ('editor', 'admin')
    )
    or am_owner()
  )
  with check (
    exists (
      select 1 from project_members m
      where m.project_id = section_notes.project_id
        and m.profile_id = auth.uid()
        and m.role in ('editor', 'admin')
    )
    or am_owner()
  );

-- ---------------------------------------------------------------------------
-- Which templates have a Vision Stack
-- ---------------------------------------------------------------------------
-- Andrew: "The vision stack is not applicable to this content. That is only
-- applicable to the Pivvot vision framing stuff. It is not applicable to any
-- of the Meta Performance Team Coaching or One-on-One Coaching."
--
-- A flag on the template rather than a hardcoded slug check in the UI, so a
-- future vertical that does produce a stack can opt in without a code change.

alter table templates add column has_vision_stack boolean not null default false;

update templates set has_vision_stack = true where slug = 'pivvot-vision-framing';

-- ---------------------------------------------------------------------------
-- Headshots
-- ---------------------------------------------------------------------------
-- "Adding a headshot for Andrew Estes or for Will Mancini or for Brooke Domek
-- should be easy to do."
--
-- On the profile, not on the membership: a person has one face across every
-- engagement they are on, and storing it per project would mean re-uploading
-- it for each one.

alter table profiles add column avatar_path text;
