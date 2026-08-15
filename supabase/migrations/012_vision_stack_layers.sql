-- The Vision Stack has two independent groupings, and conflating them is the
-- mistake this migration exists to prevent.
--
--   deliverables.section     — which module PRODUCED it   ("Mod #2 CROWD CLOUD")
--   deliverables.stack_layer — where it BELONGS in the stack ("Paradigm Convictions")
--
-- The Kingdom Concept is built during Module 2 but sits in the foundation
-- layer of the finished stack. A church browsing the process wants the first
-- grouping; a church showing their board the finished work wants the second.
-- One column cannot answer both.
--
-- Structure read from a real finished stack (South Tampa Fellowship, 2024) to
-- get the layer names and their contents right rather than inventing them.
-- Only the SHAPE was taken — no client's actual vision content appears here
-- or anywhere in this repo.
--
-- Layers are ordered bottom-to-top exactly as the printed stack graphic reads:
--   1 Paradigm Convictions  (foundation — why anything must change)
--   2 The Vision Frame      (mission, values, strategy, measures)
--   3 The Horizon Storyline (where God is taking them, over time)
--   4 Application Toolbox   (tools that activate each side of the frame)
--
-- Andrew, on the presentation build: "This is a secondary piece, not a
-- priority right now, just something down the road." So this migration lands
-- the structure only. The animated, Apple-style scroll treatment he described
-- is then purely a UI job against a model that already holds the right shape.

create table vision_stack_layers (
  slug        text primary key,
  name        text not null,
  blurb       text,
  position    integer not null
);

insert into vision_stack_layers (slug, name, blurb, position) values
  ('paradigm-convictions', 'Paradigm Convictions',
   'The conviction that something must change, and the clarity about who you are that makes it possible.', 1),
  ('vision-frame', 'The Vision Frame',
   'The five irreducible questions of leadership, answered: mission, values, strategy, measures.', 2),
  ('horizon-storyline', 'The Horizon Storyline',
   'Where God is taking you, told across four horizons — from ninety days to beyond.', 3),
  ('application-toolbox', 'Application Toolbox',
   'The tools that turn a finished frame into something your church actually lives.', 4);

alter table deliverables
  add column stack_layer text references vision_stack_layers(slug) on delete set null;

create index idx_deliverables_stack_layer on deliverables(stack_layer);

-- Layers are shared reference data, not per-project — every engagement's
-- stack has the same four. Readable by any signed-in user; only the owner
-- changes them.
alter table vision_stack_layers enable row level security;

create policy read_vision_stack_layers on vision_stack_layers
  for select to authenticated using (true);

create policy manage_vision_stack_layers on vision_stack_layers
  for all using (am_owner()) with check (am_owner());

-- ---------------------------------------------------------------------------
-- Place the deliverables already seeded for Athena into their layers.
-- ---------------------------------------------------------------------------

update deliverables set stack_layer = 'paradigm-convictions'
where kind = 'vision_stack' and title in (
  'Assimilation Funnel', 'Church Problem Statement', 'KC Summary', 'Crowd Cloud Cameos'
);

update deliverables set stack_layer = 'vision-frame'
where kind = 'vision_stack' and title in (
  'Mission Statement', 'Mission Measures', 'Strategy Napkin Sketch',
  'Values Work', 'Mission — Final', 'Mission Measures — Final',
  'Strategy — Final', 'Values — Final'
);

update deliverables set stack_layer = 'horizon-storyline'
where kind = 'vision_stack' and title in (
  'Beyond the Horizon (5 yr. DREAM)', 'Background Horizon (3 yr. OBJs)',
  'Midground Horizon (1 yr. GOAL)', 'Foreground Horizon (90-day STEPS)',
  'Vivid Description', 'Completed Template'
);

-- The Application Toolbox has no Asana equivalent — those tools are produced
-- after the frame is finished — so its slots are created here rather than
-- mapped. Same five on every engagement.
insert into deliverables (project_id, title, stack_layer, kind, position)
select p.id, t.title, 'application-toolbox', 'vision_stack', t.position
from public.projects p
cross join (values
  ('Mission Partnership Script', 801),
  ('Measures Flash Assessment', 802),
  ('Public Strategy Narrative', 803),
  ('Values Demonstrated Onramps', 804),
  ('Ministry Environments Scorecard', 805)
) as t(title, position)
join public.templates tmpl on tmpl.id = p.template_id and tmpl.slug = 'pivvot-vision-framing'
where not exists (
  select 1 from public.deliverables d
  where d.project_id = p.id and d.title = t.title
);
