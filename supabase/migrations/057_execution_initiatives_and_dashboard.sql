-- What happens after the six months: the Horizon Storyline, lived.
--
-- Andrew: "I would love to have an ongoing section that is built out from the
-- God Dreams (horizon storyline) perspective that helps integrate meeting
-- activity for a church as they pursue their initiatives and goals ... even an
-- ability to have a customizable scoreboard of somekind."
--
-- And: "We want to stay away from too much 4dx overlap other than keeping the
-- foundational principles in play." So this is modelled on Will's own
-- execution handouts, not on 4DX vocabulary. Every table and column below
-- comes off a sheet a church has already been handed:
--
--   initiatives          -> "Foreground Initiative Plan Template": INITIATIVE,
--                           OBJECTIVE, KEY DELIVERABLES, PLAN OF ACTION,
--                           TIMELINE, COSTS
--   initiative_steps     -> "Action Step List (for Cross Functional Teams &
--                           Ministry Subgoal)": Action Step / Today's Status /
--                           By / Cost / Accountable, with Leader, Team, Start
--                           Date, Last Review and This Review in its header
--   scoreboard_metrics   -> "Church Ministry Dashboard": Strategy (Input) and
--                           Measures (Output) rows, each with Prior Yr. /
--                           Month / Next Yr., and a red-amber-green dot with a
--                           trend arrow
--
-- "Today's Status" is a traffic light on the page, so it is a traffic light
-- here. There is no numeric percent-complete anywhere in Will's material and
-- inventing one would quietly change the conversation a review is supposed to
-- have.

create type rag_status as enum ('red', 'amber', 'green');
create type metric_trend as enum ('up', 'flat', 'down');
create type scoreboard_group as enum ('strategy_input', 'measure_output');

-- One Foreground Initiative. The 90-day unit of work.
create table initiatives (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects on delete cascade,
  name              text not null,
  /** The six blocks of the plan template, as formatted text. */
  initiative        text,
  objective         text,
  key_deliverables  text,
  plan_of_action    text,
  timeline          text,
  costs             text,
  /** The Action Step List header carries these, not the plan. */
  leader            text,
  team              text,
  start_date        date,
  last_review_on    date,
  next_review_on    date,
  status            rag_status not null default 'green',
  /** Closed initiatives stay readable — a finished 90 days is the record of
      what the church did, not clutter to be deleted. */
  is_complete       boolean not null default false,
  position          integer not null default 0,
  created_at        timestamptz not null default now()
);

create index idx_initiatives_project on initiatives(project_id);

-- A row of the Action Step List.
create table initiative_steps (
  id             uuid primary key default gen_random_uuid(),
  initiative_id  uuid not null references initiatives on delete cascade,
  project_id     uuid not null references projects on delete cascade,
  description    text not null,
  status         rag_status not null default 'red',
  /** The sheet's "By" column, which is sometimes a date and sometimes
      "Monthly Periodic" — so text, not a date. */
  by_when        text,
  /** Likewise "Cost": the case study has "$2,500", "$0" and "?" in it. */
  cost           text,
  accountable    text,
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);

create index idx_initiative_steps_initiative on initiative_steps(initiative_id);
create index idx_initiative_steps_project on initiative_steps(project_id);

-- A row of the Church Ministry Dashboard. Labels are the church's own —
-- Worship, Connection, Life Groups, Giving per Cap — so they are data.
create table scoreboard_metrics (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects on delete cascade,
  grouping    scoreboard_group not null default 'strategy_input',
  label       text not null,
  /** Text, not numeric: the sheet mixes counts, currency and per-capita. */
  prior_year  text,
  current     text,
  next_year   text,
  trend       metric_trend,
  status      rag_status,
  position    integer not null default 0
);

create index idx_scoreboard_metrics_project on scoreboard_metrics(project_id);

alter table initiatives enable row level security;
alter table initiative_steps enable row level security;
alter table scoreboard_metrics enable row level security;

-- Everyone on the project reads all of it. The dashboard is the thing a team
-- gathers around; a scoreboard only some people can see is not a scoreboard.
create policy read_initiatives on initiatives
  for select using (can_see_project(project_id));
create policy read_initiative_steps on initiative_steps
  for select using (can_see_project(project_id));
create policy read_scoreboard_metrics on scoreboard_metrics
  for select using (can_see_project(project_id));

-- The PLAN is content: editor or admin, same as deliverables.
create policy write_initiatives on initiatives
  for all using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = initiatives.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')))
  with check (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = initiatives.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')));

create policy write_scoreboard_metrics on scoreboard_metrics
  for all using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = scoreboard_metrics.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')))
  with check (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = scoreboard_metrics.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')));

-- The STEPS are the moving parts, and they reuse may_manage_tasks() from 053
-- rather than inventing a second grant. The person accountable for "Ways to
-- Give insert" is usually a church staffer, not a portal editor, and Andrew
-- already has one switch for exactly this: "If I want a team member (or
-- subscriber) to have access, I should be able to assign that separately."
create policy write_initiative_steps on initiative_steps
  for all using (may_manage_tasks(project_id))
  with check (may_manage_tasks(project_id));
