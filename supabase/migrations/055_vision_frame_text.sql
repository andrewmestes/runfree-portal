-- The Vision Frame as text, not as a PDF on a tile.
--
-- Andrew: "I like the ability to input text so it's searchable at some level."
--
-- Everything the church actually produces has been stored as an artifact of
-- itself — the mission is a PDF, the values are a PDF. That one fact blocks
-- searching a church's own vision, showing their mission on their dashboard,
-- generating the one-page frame, or carrying any of it into a 90-day cadence
-- later. This is the narrow fix: the seven elements of the Vision Frame
-- Progress sheet, as editable text.
--
-- ONE rich-text body per element rather than a column per blank. The sheet's
-- shapes vary by church and are still moving — Central Church's Measures are
-- "Heart Awakener - Worships with Wonder" pairs, the Kingdom Concept is three
-- fill-ins plus One Word, the Problem Statement is three more-of/less-of
-- lines. Modelling each precisely would be a schema that breaks the first
-- time Will phrases one differently. A formatted block per element is
-- searchable, displayable and publishable, which is what downstream needs.
create type vision_frame_element as enum (
  'problem_statement','kingdom_concept','mission','measures','strategy','values','vision_proper'
);

create table vision_frame (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects on delete cascade,
  element     vision_frame_element not null,
  body        text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles on delete set null,
  unique (project_id, element)
);

create index idx_vision_frame_project on vision_frame(project_id);
alter table vision_frame enable row level security;

-- No draft state: a half-written mission is still the church's mission, and
-- the point of putting it here is that the team watches it take shape.
create policy read_vision_frame on vision_frame
  for select using (can_see_project(project_id));

create policy write_vision_frame on vision_frame
  for all using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = vision_frame.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')))
  with check (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = vision_frame.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')));
