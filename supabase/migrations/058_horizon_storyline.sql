-- The Horizon Storyline itself — the sheet the Execution module is named for.
--
-- 057 built the Foreground and nothing above it, which leaves a church's
-- ninety-day initiatives laddering up to nothing. "The Horizon Storyline
-- Template" is one page with four bands, and the other three are what make
-- the fourth mean anything:
--
--   Beyond the Horizon      5-20 years   one box
--   Background Vision       3 years      four boxes
--   Midground Milestone     1 year       one box
--   Foreground Initiatives  90 days      four boxes   <- these are `initiatives`
--
-- Modelled as rows rather than four columns on `projects` because Background
-- is a set, and because this is the same shape as `vision_frame` (055): one
-- row per box, written one at a time over months, upserted on its coordinates
-- so there is never a "create the storyline" step.
--
-- The Foreground band is NOT stored here. It is `initiatives`, and duplicating
-- the names into a second table would give a church two places to rename an
-- initiative and one of them would be wrong by the afternoon.

create type horizon_band as enum ('beyond', 'background', 'midground');

create table horizon_storyline (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects on delete cascade,
  horizon     horizon_band not null,
  /** Formatted text, same allowlist as every other note in the portal. */
  body        text,
  /** 0 for beyond and midground; 0-3 for the four background boxes. */
  position    integer not null default 0,
  updated_at  timestamptz not null default now(),
  unique (project_id, horizon, position)
);

create index idx_horizon_storyline_project on horizon_storyline(project_id);

alter table horizon_storyline enable row level security;

-- Read by everyone on the project: this is the church's own vision, and the
-- whole point of the sheet is that the room is looking at it together.
create policy read_horizon_storyline on horizon_storyline
  for select using (can_see_project(project_id));

-- Written by editor or admin, same as the initiative plan in 057. It is the
-- output of a facilitated retreat, not something edited between meetings.
create policy write_horizon_storyline on horizon_storyline
  for all using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = horizon_storyline.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')))
  with check (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = horizon_storyline.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')));
