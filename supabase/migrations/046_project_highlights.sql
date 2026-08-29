-- Highlighted resources: "read this, watch this, before we meet again."
--
-- Andrew: "I could have a section on anybody's dashboard board that says
-- 'Assign Resources' or 'Highlight Resources'... I could click on that, and it
-- would show up as a searchable pop-up... do a multi-select to assign all of
-- them, and have them display in a nice, uniform way."
--
-- The portal already holds 44 template resources, Will's books, every session
-- recording and every file a church has been given, and until now there was no
-- way to say *these three, this week*. Reading & Pre-Work proved the cost of
-- that: two of its rows were sentences telling a team to go and watch a master
-- teaching the portal already had a working link to, because pointing at it
-- was not possible.
--
-- **This is a pointer table, not a copy of the library.** A highlight names
-- what it points at (`source_kind` + `source_id`) so the same resource is
-- recognisable across projects and cannot be silently duplicated.
--
-- It also caches what the card needs to *draw* — title, kind, art. That is
-- deliberate denormalisation, and the reason is measured: Will's books and the
-- handouts live in Google Drive, and the books panel takes ~7s to settle
-- against it. A dashboard that had to ask Drive what a highlight is called
-- before it could render would become the slowest page in the portal. The
-- cached row draws immediately; the click resolves the real thing.
--
-- Highlights carry no done state. What needs ticking is a task
-- (`project_tasks`, see 040/041); this is the shelf beside it. Andrew, on the
-- same distinction in Preparation: "I'm not sure that I want that to be a
-- checkbox select."

create type highlight_source as enum (
  'template_resource',  -- a video, handout or exercise from the template
  'book',               -- one of Will's books, by Drive file id
  'deliverable',        -- a card or finished piece on this project
  'prep_item',          -- something already on the reading shelf
  'session',            -- "rewatch the August 24 session"
  'upload'              -- a one-off PDF for this church
);

-- How to DRAW it. Separate from `source_kind`, which is where it came from:
-- a deliverable can be a PDF or an image, and a template resource can be a
-- video or a handout.
create type highlight_media as enum ('video', 'pdf', 'image', 'link', 'book');

create table project_highlights (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects on delete cascade,

  source_kind  highlight_source not null,
  -- Not a uuid: a book is a Drive file id and an upload has no source at all.
  source_id    text,

  -- Cached display. Refreshed when the highlight is re-saved, never read
  -- through to Drive on render.
  title        text not null,
  media_kind   highlight_media not null,
  /** A note from the coach: "chapter 4 only", "watch before the 28th". */
  note         text,

  -- Exactly one of these carries the thing itself.
  external_url text,
  file_path    text,
  file_name    text,
  file_mime    text,
  file_size    bigint,

  -- And one of these carries the picture. `thumb_path` is ours (storage),
  -- `thumb_url` is remote (a Loom still, a Drive cover).
  thumb_path   text,
  thumb_url    text,

  position     integer not null default 0,
  created_by   uuid references profiles on delete set null,
  created_at   timestamptz not null default now()
);

create index idx_project_highlights_project on project_highlights(project_id);

-- The same resource twice on one project is always a mistake, never an
-- intent. Uploads are exempt: they have no source_id to collide on.
create unique index idx_project_highlights_unique
  on project_highlights(project_id, source_kind, source_id)
  where source_id is not null;

alter table project_highlights enable row level security;

-- Readable by anyone who can see the project. No draft state, for the same
-- reason prep_items has none: a highlight nobody can read is not a highlight.
create policy read_project_highlights on project_highlights
  for select using (can_see_project(project_id));

-- Writable by whoever can write the project's content. Mirrors
-- write_deliverables rather than inventing a fourth rule.
create policy insert_project_highlights on project_highlights
  for insert with check (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = project_highlights.project_id
         and m.profile_id = auth.uid()
         and m.role in ('editor', 'admin')
    )
  );

create policy update_project_highlights on project_highlights
  for update using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = project_highlights.project_id
         and m.profile_id = auth.uid()
         and m.role in ('editor', 'admin')
    )
  );

create policy delete_project_highlights on project_highlights
  for delete using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = project_highlights.project_id
         and m.profile_id = auth.uid()
         and m.role in ('editor', 'admin')
    )
  );
