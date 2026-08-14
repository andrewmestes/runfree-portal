-- Younique 1-1 Life Plan template, built from the real "Joe McGinn - Younique
-- 1-1 LifePlan" Asana project (1210988335506297) — a completed, real
-- engagement, not a blank "DO NOT CHANGE" template like Pivvot had. Andrew:
-- "Use Joe McGinn project to get a rough idea of the Younique 1-on-1
-- template." Only task TITLES were read, never notes/comments — those would
-- carry Joe's actual personal life-plan content, which has no business in a
-- shared template library.
--
-- The 33-step numbered curriculum ([1]..[33]) reads the same as Pivvot
-- Coaching's 1.1/1.2 facilitator numbering: generic process-step names, not
-- personal content, so they're safe to seed as template_resources. Steps
-- that are clearly THIS PERSON'S declared output rather than a generic
-- curriculum step are deliberately excluded — those belong as per-project
-- deliverables once a real Younique project exists, the same way Pivvot's
-- "DELIVERABLE:" tasks did, not as shared template content:
--   [1] Personalized Cover Slide, [7d] My Life Drifts, [16] Sweet Spot
--   Summary, [18] LifeCall Declared, [19] LifeCore Declared, [20b] LifeScore
--   Assessment, [24] LifeSteps Declared, [26] 100 Life Dreams, [27] Tombstone
--   Tweet, VIVID DESCRIPTION, [29] 3-Year Vision, [30] 1-Year Objectives,
--   [31] 90-Day Goal, [32] NOW Rhythms, [33] Horizon Storyline Completion.
--
-- Also not carried over, matching the Pivvot precedent: "Younique Book by
-- chapter" (27 chapters) — that's Will's book content, which belongs in a
-- future cross-portal bridge into the Certified Vision Framers library, not
-- duplicated here. Parked, not forgotten — see 006's certification_access
-- column and seed.sql's note on "Will's Books".
--
-- No project seeded here, unlike Athena Christian Church for Pivvot — Andrew
-- didn't name a real current Younique client, so there's nothing real to
-- stamp this onto yet. Template only.

do $$
declare
  v_template_id uuid;
begin
  delete from public.templates where slug = 'younique-lifeplan';

  insert into public.templates (name, slug, description, structure)
  values (
    'Younique 1-1 Life Plan',
    'younique-lifeplan',
    'A one-on-one, multi-day life-planning engagement built around the Younique framework — Sweet Spot, LifeCall, LifeSteps, Horizon Storyline.',
    jsonb_build_object('sections', jsonb_build_array(
      'Overview',
      'Recommended Prework',
      'Session Recordings',
      'Day 1 - Section #1',
      'Day 1 - Section #2',
      'Day 1 - Section #3',
      'Day 2 Section #1',
      'Day 2 Section #2',
      'Day 3 - Section #3',
      'Life-Making Cycle Resources'
    ))
  )
  returning id into v_template_id;

  insert into public.template_resources (template_id, section, kind, title, position)
  select v_template_id, section, kind::template_resource_kind, title, row_number() over ()
  from (values
    ('Overview', 'team_bio', 'Andrew Estes — Certified Life Coach'),

    ('Recommended Prework', 'exercise', 'Recommended Pre-work List'),
    ('Recommended Prework', 'exercise', 'Life Discovery Grid (LDG) Worksheet'),
    ('Recommended Prework', 'video', 'LDG Video #1'),
    ('Recommended Prework', 'video', 'LDG Video #2'),
    ('Recommended Prework', 'video', 'LDG Video #3'),
    ('Recommended Prework', 'link', 'Discovery Insights Information'),

    ('Day 1 - Section #1', 'exercise', '[2] Journey Overview'),
    ('Day 1 - Section #1', 'exercise', '[3] LifePlan Snapshot Overview'),
    ('Day 1 - Section #1', 'exercise', '[4] Clarity Goldmine'),
    ('Day 1 - Section #1', 'exercise', '[5] 5 Barriers to Self Awareness'),
    ('Day 1 - Section #1', 'exercise', '[6] Grounding Questions'),
    ('Day 1 - Section #1', 'exercise', '[7a] Life Line Review'),
    ('Day 1 - Section #1', 'exercise', '[7b] Life Discovery Grid Learnings'),
    ('Day 1 - Section #1', 'video', '[7c] Life Drifts Teaching'),
    ('Day 1 - Section #1', 'exercise', E'[8a] 2 Word Sweet Spot — Hunch Round'),

    ('Day 1 - Section #2', 'video', '[8b] Sweet Spot Overview'),
    ('Day 1 - Section #2', 'exercise', '[9] Passion Funnel'),
    ('Day 1 - Section #2', 'exercise', '[10] Offenders + Opposites'),
    ('Day 1 - Section #2', 'exercise', '[11] Ability Assessments'),

    ('Day 1 - Section #3', 'exercise', '[12] Sense of Accomplishment'),
    ('Day 1 - Section #3', 'exercise', '[13] Live Sent'),
    ('Day 1 - Section #3', 'exercise', '[14] Activator Advantage'),
    ('Day 1 - Section #3', 'exercise', '[15] Workplace Motivators'),

    ('Day 2 Section #1', 'video', '[17] Vision Frame Overview'),
    ('Day 2 Section #1', 'exercise', '[20a] LifeScore as Storylines'),
    ('Day 2 Section #1', 'exercise', E'[21a] LifeSteps — Role-mapping 1'),
    ('Day 2 Section #1', 'exercise', E'[21b] LifeSteps — Role-mapping 2'),

    ('Day 2 Section #2', 'link', E'[22] LifeSteps — Resources'),
    ('Day 2 Section #2', 'exercise', E'[23] LifeSteps — Replenishment'),

    ('Day 3 - Section #3', 'video', '[28] Horizon Storyline Overview'),

    ('Life-Making Cycle Resources', 'handout', 'Digital Forms'),
    ('Life-Making Cycle Resources', 'handout', 'Retreating Guides')
  ) as t(section, kind, title);

  raise notice 'Seeded Younique template %', v_template_id;
end $$;
