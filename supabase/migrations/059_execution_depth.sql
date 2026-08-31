-- Making Execution the thing a church actually opens on a Monday.
--
-- Andrew: "I just want the whole thing to be relevant, actionable, intuitive,
-- easy to use, robust with full descriptions and next steps ... I'm thinking
-- of an organization visiting this on a weekly basis, emphasizing the
-- important over the urgent, over the whirlwind, accessible for a 15-min
-- standup meeting, keeping the cadence of accountability, all within the God
-- Dreams / Horizon Storyline framework."
--
-- Five additions, each off a specific God Dreams handout:

-- 1. THE THREE TYPES OF FOREGROUND INITIATIVE
--
-- "Using 3 Types of Foreground Initiatives" is a table with three rows, and
-- the type decides how many action steps to expect, who is responsible, and
-- where it gets reviewed. It also explains the Action Step List's subtitle
-- ("for Cross Functional Teams & Ministry Subgoal") — an All Staff Driver has
-- exactly one step and is reviewed peer-to-peer in a staff meeting, which is
-- why that sheet does not mention it.
create type initiative_kind as enum (
  'cross_functional',   -- Many steps (5-15), team, high complexity
  'ministry_subgoal',   -- Some steps (3-8), team or individual, variable
  'all_staff_driver'    -- One step, individual, low complexity
);

alter table initiatives
  add column kind initiative_kind not null default 'cross_functional';

-- 2. A STEP CAN BE ASSIGNED TO A REAL PERSON
--
-- Andrew: "maybe assign tasks to people involved in the project for ongoing
-- notifications." `accountable` stays — it is free text on the printed sheet
-- and plenty of accountable people ("Jeff & Carolyn", "Comms") are not portal
-- logins. This is the additional, structured half: when a step belongs to
-- someone with an account, it can reach them.
alter table initiative_steps
  add column assignee_profile_id uuid references profiles on delete set null;

create index idx_initiative_steps_assignee
  on initiative_steps(assignee_profile_id)
  where assignee_profile_id is not null;

-- 3. BACKGROUND VISION NOTES
--
-- Andrew: "The Background elements need to open with more detail as well when
-- clicked on." The handout that opens is "Background Vision Notes - 3 years",
-- and it is three columns wide. `body` stays the headline; these are the
-- notes behind it.
alter table horizon_storyline
  add column where_we_stand text,
  add column where_were_headed text,
  add column how_well_get_there text;

-- 4. THE TWO VISION TEMPLATES
--
-- Andrew: "maybe a place for their two vision templates at the top of the
-- 1:4:1:4." The 12 Templates handout is explicit that they describe the
-- Beyond-the-Horizon vision, which is the top band — so they belong there.
--
-- `template_key` is text validated in the app rather than an enum: the twelve
-- are Will's published set and will not change, but an enum would need a
-- migration to fix the one whose ICON FILE is misnamed ("Obidient
-- Amplification" on disk; the template is Obedient Anticipation).
create table project_vision_templates (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects on delete cascade,
  template_key text not null,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (project_id, template_key)
);

create index idx_project_vision_templates_project
  on project_vision_templates(project_id);

-- 5. THE MIDGROUND, MADE MEASURABLE
--
-- Andrew: "For the Midground Horizon, i want a way of scoring and keeping
-- track of that. we always encourage people to use a qualitative and
-- quantitative aspect of the midground, so it needs to be measurable somehow
-- on the dashboard."
--
-- Every example on the "Midground Milestone (One-Year Goal) Examples" handout
-- carries a number inside the sentence — "80 percent of our church praying
-- for three people", "from 12 percent of the congregation to 25 percent".
-- The statement is the qualitative half and lives in `horizon_storyline`;
-- this is the quantitative half.
--
-- baseline -> target with a current reading, so progress is a real fraction
-- rather than someone's impression. numeric, not text: unlike the Ministry
-- Dashboard (whose column mixes counts, dollars and per-capita in one line),
-- these three values are the same quantity three times and have to subtract.
create table midground_measures (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects on delete cascade,
  label       text not null,
  /** "%", "people", "$", "groups" — suffixed to every value. */
  unit        text,
  baseline    numeric,
  target      numeric,
  current     numeric,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_midground_measures_project on midground_measures(project_id);

-- Each check-in, kept. A milestone you can only see the latest number for is
-- a status; a milestone with its readings is a trajectory, which is what a
-- team needs to know whether the year is still winnable.
create table measure_readings (
  id          uuid primary key default gen_random_uuid(),
  measure_id  uuid not null references midground_measures on delete cascade,
  project_id  uuid not null references projects on delete cascade,
  on_date     date not null default current_date,
  value       numeric not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index idx_measure_readings_measure on measure_readings(measure_id, on_date);
create index idx_measure_readings_project on measure_readings(project_id);

alter table project_vision_templates enable row level security;
alter table midground_measures enable row level security;
alter table measure_readings enable row level security;

-- Read by everyone on the project — same argument as the rest of Execution:
-- a scoreboard only some people can see is not a scoreboard.
create policy read_project_vision_templates on project_vision_templates
  for select using (can_see_project(project_id));
create policy read_midground_measures on midground_measures
  for select using (can_see_project(project_id));
create policy read_measure_readings on measure_readings
  for select using (can_see_project(project_id));

-- Choosing the templates and defining a measure is content: editor or admin.
create policy write_project_vision_templates on project_vision_templates
  for all using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = project_vision_templates.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')))
  with check (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = project_vision_templates.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')));

create policy write_midground_measures on midground_measures
  for all using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = midground_measures.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')))
  with check (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = midground_measures.project_id
         and m.profile_id = auth.uid() and m.role in ('editor','admin')));

-- But LOGGING a reading is the weekly act, not an authoring act — so it
-- reuses may_manage_tasks() like the action steps do. The person who knows
-- this week's number is usually church staff, not a portal editor.
create policy write_measure_readings on measure_readings
  for all using (may_manage_tasks(project_id))
  with check (may_manage_tasks(project_id));
