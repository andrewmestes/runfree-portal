-- 077: initiative check-ins.
--
-- Andrew, 6 Sept 2026: "the intuitive functionality, and the overall feel of
-- the execution tab needs work … review that site based on the God Dreams
-- material, current competitors' online execution and goal tracking
-- websites."
--
-- Every execution tool that survives past the first quarter (Ninety's Rocks,
-- Rhythm's weekly status, Lattice's "What's new?", Perdoo's check-in) has the
-- same small record at its centre: the owner of a priority says, once a week,
-- what colour it is and what changed — and the tool shows how long it has
-- been since anyone said anything. Will's Action Step List already asks for
-- it on paper: "Last Review" and "This Review" sit in the sheet's header.
--
-- So one table, one row per check-in. `status` is the light the owner chose
-- that week; `note` is the story behind it. The initiative's own `status` and
-- `last_review_on` are stamped from the newest check-in by the app, the way
-- `logReading` stamps `midground_measures.current` — best effort, because the
-- person posting is usually church staff with the task grant, not an editor.
--
-- Writes follow the action steps (may_manage_tasks, 053): the person running
-- an initiative is the person who owes the update. Reads follow everything
-- else in Execution: the whole project sees it, or it is not accountability.

create table initiative_updates (
  id                uuid primary key default gen_random_uuid(),
  initiative_id     uuid not null references initiatives on delete cascade,
  project_id        uuid not null references projects on delete cascade,
  status            rag_status not null,
  note              text,
  on_date           date not null default current_date,
  author_profile_id uuid references profiles on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);

create index idx_initiative_updates_initiative on initiative_updates(initiative_id, on_date desc);
create index idx_initiative_updates_project on initiative_updates(project_id);

alter table initiative_updates enable row level security;

create policy read_initiative_updates on initiative_updates
  for select using (can_see_project(project_id));

create policy write_initiative_updates on initiative_updates
  for all using (may_manage_tasks(project_id))
  with check (may_manage_tasks(project_id));
