-- Attachments on a card, however many there are.
--
-- Andrew: "Let's just make it 'drop files here' ... That way it's easy to just
-- add any file type in one location."
--
-- The card form had two labelled inputs, IMAGE and DOCUMENT, one file each.
-- One drop zone that takes anything immediately raises the question the old
-- shape dodged: where does the third file go? `deliverables` has room for one
-- image and one document, so without this a coach dropping four flipchart
-- photos would silently keep one.
--
-- `deliverables.image_path` survives and changes job: it is now the card's
-- THUMBNAIL, a pointer at whichever attachment should be the face of the card
-- — "if more than one image is added, make the last one uploaded the
-- image/thumbnail". `file_path` survives untouched for cards written before
-- this; the renderer shows it alongside the new rows rather than migrating it,
-- for the same reason 040/041/043 kept what they replaced.
--
-- project_id is carried directly rather than joined through deliverables, so
-- the read policy is the same one-argument can_see_project() call as
-- everywhere else instead of a subquery per row.
create table if not exists deliverable_files (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables on delete cascade,
  project_id     uuid not null references projects on delete cascade,
  path           text not null,
  name           text not null,
  mime           text,
  size           bigint,
  /** Drives whether this can be the card's face, and how it renders. */
  is_image       boolean not null default false,
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_deliverable_files_deliverable on deliverable_files(deliverable_id);
create index if not exists idx_deliverable_files_project on deliverable_files(project_id);

alter table deliverable_files enable row level security;

-- Readable with the project. This does NOT re-check the parent deliverable's
-- published_at: a draft card is invisible to a viewer because the card itself
-- is, and its attachments are unreachable without it.
drop policy if exists read_deliverable_files on deliverable_files;
create policy read_deliverable_files on deliverable_files
  for select using (can_see_project(project_id));

-- Writable by editor or admin — the same rule as deliverables, deliberately
-- NOT the admin-only rule highlights got (050). A client leading their own
-- process writes up their own sessions, and this is that content.
drop policy if exists write_deliverable_files on deliverable_files;
create policy write_deliverable_files on deliverable_files
  for all using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = deliverable_files.project_id
         and m.profile_id = auth.uid()
         and m.role in ('editor', 'admin')
    )
  ) with check (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = deliverable_files.project_id
         and m.profile_id = auth.uid()
         and m.role in ('editor', 'admin')
    )
  );
