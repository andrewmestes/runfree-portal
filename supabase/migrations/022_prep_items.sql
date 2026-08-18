-- The preparation work becomes editable, per-project task cards.
--
-- Andrew: "all the pieces down on the bottom, like: Key Dates, Preparation
-- Checklist, Team Pre-Reading, Team Optional Pre-Work — all of those had a
-- lot of content in them from Asana. I want to be able to add task cards or
-- something like that. For things like key dates, it is something that I can
-- go in and edit as the team and I nail down upcoming meetings, and that
-- would get updated easily."
--
-- Today those six things are `template_resources` rows with a title and
-- nothing else — no description, no url, no children. They render as inert
-- grey pills. That is not a data-loss bug on our side: the Asana bodies never
-- came across in the export we seeded from. Either way the fix is the same,
-- because even with the text recovered a `template_resources` row is the
-- wrong home for it: that table is template-scoped and owner-write, so it is
-- shared by every church running Pivvot. Key dates are the opposite of
-- shared — they are this church's meetings, edited by this church's team.
--
-- So the split is:
--
--   template_prep_groups — the buckets. Shared, owner-curated, rendered even
--     when empty so a project always shows the same scaffolding.
--   template_prep_items  — default contents stamped into a new project, the
--     same "template declares, project stamps" pattern already used by
--     template_deliverables (015) and template_members (019).
--   prep_items           — the real, per-project, editable rows.
--
-- A group carries a `section` so this mechanism is not welded to the prepare
-- block. Guest Perspective Evaluation lives under PROCESS OVERVIEW and needs
-- exactly the same treatment (Andrew: "notes + PDF upload"), so it becomes a
-- group in that section instead of a special case in the page.

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------

-- `kind` drives which fields the card offers, and nothing else. It is not a
-- permission and not a filter — a group of the wrong kind renders the wrong
-- inputs, it does not hide or expose anything.
--
--   dates     — a date and a label. Sorted by date, no checkbox: a meeting
--               that has passed is history, not an unchecked box.
--   checklist — a checkbox, a label, optional notes and a due date.
--   reading   — a link out. No checkbox, because "done" here is per-person
--               and this table is per-project; a half-true checkbox is worse
--               than none.
--   files     — an uploaded document per row (Insights Discovery profiles).
--   notes     — long-form text with an optional document attached.
create type prep_group_kind as enum ('dates', 'checklist', 'reading', 'files', 'notes');

create table template_prep_groups (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates on delete cascade,
  section     text not null,
  key         text not null,
  title       text not null,
  description text,
  kind        prep_group_kind not null,
  position    integer not null default 0,
  unique (template_id, key)
);

create index idx_template_prep_groups_template on template_prep_groups(template_id);

alter table template_prep_groups enable row level security;

-- Same audience as template_resources: staff and owner always, plus anyone
-- who is a member of any project running this template.
create policy read_template_prep_groups on template_prep_groups
  for select using (
    am_owner() or am_staff()
    or exists (
      select 1 from projects pr
      join project_members m on m.project_id = pr.id
      where pr.template_id = template_prep_groups.template_id
        and m.profile_id = auth.uid()
    )
  );

create policy manage_template_prep_groups on template_prep_groups
  for all using (am_owner()) with check (am_owner());

-- ---------------------------------------------------------------------------
-- Template defaults
-- ---------------------------------------------------------------------------

create table template_prep_items (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references template_prep_groups on delete cascade,
  title        text not null,
  notes        text,
  external_url text,
  position     integer not null default 0
);

alter table template_prep_items enable row level security;

create policy read_template_prep_items on template_prep_items
  for select using (
    exists (
      select 1 from template_prep_groups g
      where g.id = template_prep_items.group_id
    )
  );

create policy manage_template_prep_items on template_prep_items
  for all using (am_owner()) with check (am_owner());

-- ---------------------------------------------------------------------------
-- The per-project rows
-- ---------------------------------------------------------------------------

-- group_id points at the shared group rather than copying its title onto
-- every row: renaming "Team Pre-Reading" should rename it everywhere, and a
-- denormalized title would drift the moment it did.
--
-- Files reuse the deliverable-images bucket. Its RLS keys on
-- storage.foldername(name)[1]::uuid = the project id (007), so a prep
-- document stored at {project_id}/prep-{uuid}.pdf inherits the proven
-- policies with no new bucket and no new storage rules. See migration 014 for
-- why the bucket's name is narrower than what it holds.
create table prep_items (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects on delete cascade,
  group_id     uuid not null references template_prep_groups on delete cascade,
  title        text not null,
  notes        text,
  due_on       date,
  external_url text,
  file_path    text,
  file_name    text,
  file_mime    text,
  file_size    bigint,
  is_done      boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index idx_prep_items_project on prep_items(project_id);
create index idx_prep_items_group on prep_items(group_id);

alter table prep_items enable row level security;

-- Readable by anyone who can see the project. Unlike sessions and
-- deliverables there is no draft state: preparation work is instructions to
-- the client, and instructions nobody can read are not instructions.
create policy read_prep_items on prep_items
  for select using (can_see_project(project_id));

create policy write_prep_items on prep_items
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = prep_items.project_id
        and m.profile_id = auth.uid()
        and m.role in ('editor', 'admin')
    )
    or am_owner()
  );

-- ---------------------------------------------------------------------------
-- Seed: Pivvot
-- ---------------------------------------------------------------------------

insert into template_prep_groups (template_id, section, key, title, description, kind, position)
select t.id, v.section, v.key, v.title, v.description, v.kind::prep_group_kind, v.position
from templates t
cross join (values
  ('CHURCH PREPARATION', 'key-dates', 'Key Dates',
   'Onsite days, virtual sessions, and deadlines. Update these as they are set.',
   'dates', 1),
  ('CHURCH PREPARATION', 'preparation-checklist', 'Preparation Checklist',
   'What the team completes before the first session.',
   'checklist', 2),
  ('CHURCH PREPARATION', 'team-pre-reading', 'Team Pre-Reading',
   'Read these before we begin.',
   'reading', 3),
  ('CHURCH PREPARATION', 'team-optional-pre-work', 'Team Optional Pre-Work',
   'Not required, but it deepens the work.',
   'checklist', 4),
  ('CHURCH PREPARATION', 'team-building-profiles', 'Team Building Profiles',
   'Upload each team member''s Insights Discovery profile.',
   'files', 5),
  ('PROCESS OVERVIEW', 'guest-perspective', 'Guest Perspective Evaluation',
   'Notes from the guest walk-through, plus the written evaluation.',
   'notes', 1)
) as v(section, key, title, description, kind, position)
where t.slug = 'pivvot-vision-framing';

-- Will's books, which are the pre-reading. Amazon links match the format the
-- CVF portal already uses (a search URL, not an ASIN — an ASIN goes stale
-- when an edition changes, a search does not). Younique is deliberately
-- absent: it is the 1:1 life-planning book, not church pre-reading.
insert into template_prep_items (group_id, title, notes, external_url, position)
select g.id, v.title, v.notes, v.external_url, v.position
from template_prep_groups g
join templates t on t.id = g.template_id
cross join (values
  ('Church Unique',
   'Will Mancini. Chapter 9 is the Kingdom Concept pre-reading for Module 2.',
   'https://www.amazon.com/s?k=Church%20Unique%20Will%20Mancini', 1),
  ('God Dreams',
   'Will Mancini and Warren Bird. Background for the Horizon Storyline.',
   'https://www.amazon.com/s?k=God%20Dreams%20Will%20Mancini%20Warren%20Bird', 2),
  ('Future Church',
   'Will Mancini and Cory Hartman. The seven laws behind the process.',
   'https://www.amazon.com/s?k=Future%20Church%20Will%20Mancini%20Cory%20Hartman', 3)
) as v(title, notes, external_url, position)
where t.slug = 'pivvot-vision-framing' and g.key = 'team-pre-reading';

-- ---------------------------------------------------------------------------
-- Seed: Younique
-- ---------------------------------------------------------------------------

-- The 1:1 process has its own prepare block. "Recommended Pre-work List",
-- "Life Discovery Grid (LDG) Worksheet" and "Discovery Insights Information"
-- are the same shape of empty shell, in the "Recommended Prework" section.
insert into template_prep_groups (template_id, section, key, title, description, kind, position)
select t.id, v.section, v.key, v.title, v.description, v.kind::prep_group_kind, v.position
from templates t
cross join (values
  ('Recommended Prework', 'younique-key-dates', 'Key Dates',
   'Session days and deadlines.',
   'dates', 1),
  ('Recommended Prework', 'younique-prework', 'Recommended Pre-Work',
   'Complete these before your first day.',
   'checklist', 2),
  ('Recommended Prework', 'younique-reading', 'Pre-Reading',
   'Read these before we begin.',
   'reading', 3),
  ('Recommended Prework', 'younique-profiles', 'Assessments and Profiles',
   'Upload your completed assessments.',
   'files', 4)
) as v(section, key, title, description, kind, position)
where t.slug = 'younique-lifeplan';

insert into template_prep_items (group_id, title, notes, external_url, position)
select g.id, v.title, v.notes, v.external_url, v.position
from template_prep_groups g
join templates t on t.id = g.template_id
cross join (values
  ('Younique',
   'Will Mancini. The book behind this process.',
   'https://www.amazon.com/s?k=Younique%20Will%20Mancini', 1)
) as v(title, notes, external_url, position)
where t.slug = 'younique-lifeplan' and g.key = 'younique-reading';

-- ---------------------------------------------------------------------------
-- Retire the shells these groups replace
-- ---------------------------------------------------------------------------

-- Each of these is a title with no description, no url and no file — the
-- placeholder the group now supersedes. Leaving them would render the same
-- heading twice, once as a dead pill and once as a live card.
--
-- "Pivvot Notebook — All Handouts" goes for a different reason. Andrew:
-- "the pivvot notebook handouts can go away" — the per-module handout sets
-- carry the same material, folder by folder, and the combined notebook is the
-- one clients open by mistake.
delete from template_resources
where title in (
  'Key Dates',
  'Preparation Checklist',
  'Team Pre-Reading',
  'Team Optional Pre-Work',
  'Team Building Profiles',
  'Guest Perspective Evaluation',
  'Pivvot Notebook — All Handouts',
  'Recommended Pre-work List',
  'Discovery Insights Information'
);

-- ---------------------------------------------------------------------------
-- Backfill existing projects
-- ---------------------------------------------------------------------------

insert into prep_items (project_id, group_id, title, notes, external_url, position)
select pr.id, ti.group_id, ti.title, ti.notes, ti.external_url, ti.position
from projects pr
join template_prep_groups g on g.template_id = pr.template_id
join template_prep_items ti on ti.group_id = g.id;
