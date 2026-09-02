-- The Younique 1-1 Life Plan template, made real; the coaching template,
-- given a shape.
--
-- 009 seeded Younique from the titles of Joe McGinn's Asana project and
-- deliberately nothing else. Andrew, 1 Sept 2026: "consider Joe McGinn's
-- Younique project in asana as a general structure for a younique template."
-- What the portal was missing was the substance — the worksheets, the LDG
-- videos, the prework list — and a day-by-day process a client could follow.
--
-- Nothing personal to Joe is carried over: only the generic curriculum steps,
-- the blank worksheets (imported by scripts/import-template-files.ts against
-- 063's file columns), and the pre-work list from the template's own note.
-- Joe's declared outputs ([16] Sweet Spot Summary, [24] LifeSteps Declared,
-- the vivid description…) stay per-project deliverables, as 009 decided.
--
-- Section names are normalised to "Day N - Section #M": Asana had "Day 2
-- Section #1" without the dash and "Day 3 - Section #3" for the only section
-- of day three, both copy-paste artefacts a client would read as their own.
--
-- Meta Performance Coaching gets an outline and three prework items so a
-- coach can file sessions and resources somewhere on day one. The prework
-- items are a starting point for Andrew to edit, not a curriculum.

do $$
declare
  v_y uuid;
  v_m uuid;
  v_prework uuid;
  v_mp_prep uuid;
begin
  select id into v_y from templates where slug = 'younique-lifeplan';
  select id into v_m from templates where slug = 'meta-performance-coaching';
  if v_y is null then
    raise exception 'younique-lifeplan template is missing';
  end if;

  -- Section names a client can read.
  update template_resources set section = 'Day 2 - Section #1'
   where template_id = v_y and section = 'Day 2 Section #1';
  update template_resources set section = 'Day 2 - Section #2'
   where template_id = v_y and section = 'Day 2 Section #2';
  update template_resources set section = 'Day 3 - Section #1'
   where template_id = v_y and section = 'Day 3 - Section #3';

  -- Teachings delivered live in the room were seeded as kind 'video' with no
  -- recording, and a video row with no URL never renders. They are steps in
  -- the day.
  update template_resources set kind = 'exercise'
   where template_id = v_y and external_url is null and kind in ('video', 'link')
     and title in ('Life Drifts Teaching', 'Sweet Spot Overview', 'Vision Frame Overview',
                   'Horizon Storyline Overview', 'LifeSteps — Resources');

  -- The three Life Discovery Grid videos, from the Asana task notes.
  update template_resources set external_url = 'https://www.loom.com/share/543af7d142f24ddda7c00ef4bc4d544e'
   where template_id = v_y and title = 'LDG Video #1';
  update template_resources set external_url = 'https://www.loom.com/share/c0ff79336faa41d7890a258b07cc70a4'
   where template_id = v_y and title = 'LDG Video #2';
  update template_resources set external_url = 'https://www.loom.com/share/11be89e3243343d8a38cad64a4cd12bc'
   where template_id = v_y and title = 'LDG Video #3';

  -- Two container rows from Asana, superseded by the documents they held.
  delete from template_resources
   where template_id = v_y and section = 'Life-Making Cycle Resources'
     and title in ('Digital Forms', 'Retreating Guides');

  -- The curriculum, in the order the days work through it. Existing rows are
  -- re-positioned by title; missing rows are added. Files are attached
  -- afterwards by the import script, matched on section + title.
  create temp table curriculum (section text, title text, kind text, position int, description text)
    on commit drop;
  insert into curriculum values
    ('Recommended Prework', 'Life Discovery Grid (LDG) Worksheet', 'exercise', 1,
     'Fill this in before Day 1. The three videos walk you through it.'),
    ('Recommended Prework', 'LDG Video #1', 'video', 2, null),
    ('Recommended Prework', 'LDG Video #2', 'video', 3, null),
    ('Recommended Prework', 'LDG Video #3', 'video', 4, null),

    ('Day 1 - Section #1', 'Journey Overview', 'exercise', 1, null),
    ('Day 1 - Section #1', 'LifePlan Snapshot Overview', 'exercise', 2, 'The one page the three days fill in.'),
    ('Day 1 - Section #1', 'Clarity Goldmine', 'exercise', 3, null),
    ('Day 1 - Section #1', '5 Barriers to Self Awareness', 'exercise', 4, null),
    ('Day 1 - Section #1', 'Grounding Questions', 'exercise', 5, null),
    ('Day 1 - Section #1', 'Life Line Review', 'exercise', 6, null),
    ('Day 1 - Section #1', 'Life Discovery Grid Learnings', 'exercise', 7, 'What your grid says back to you.'),
    ('Day 1 - Section #1', 'Life Drifts Teaching', 'exercise', 8, null),
    ('Day 1 - Section #1', 'Life Drifts Grid', 'exercise', 9, null),
    ('Day 1 - Section #1', '2 Word Sweet Spot — Hunch Round', 'exercise', 10, 'A first guess. You come back to it after each circle.'),

    ('Day 1 - Section #2', 'Sweet Spot Overview', 'exercise', 1, null),
    ('Day 1 - Section #2', 'Passion Funnel', 'exercise', 2, null),
    ('Day 1 - Section #2', 'Passion Circle Inventory', 'exercise', 3, null),
    ('Day 1 - Section #2', 'Offenders + Opposites', 'exercise', 4, null),
    ('Day 1 - Section #2', 'Ability Assessments', 'exercise', 5, null),
    ('Day 1 - Section #2', 'Ability Circle Inventory', 'exercise', 6, null),

    ('Day 1 - Section #3', 'Sense of Accomplishment', 'exercise', 1, null),
    ('Day 1 - Section #3', 'Live Sent', 'exercise', 2, null),
    ('Day 1 - Section #3', 'Activator Advantage', 'exercise', 3, null),
    ('Day 1 - Section #3', 'Workplace Motivators', 'exercise', 4, null),
    ('Day 1 - Section #3', 'Context Circle Inventory', 'exercise', 5, null),
    ('Day 1 - Section #3', 'Naming Your Sweet Spot', 'exercise', 6, 'Where the three circles overlap, in two words.'),

    ('Day 2 - Section #1', 'Vision Frame Overview', 'exercise', 1, null),
    ('Day 2 - Section #1', 'Vision Frame Reporting', 'exercise', 2, null),
    ('Day 2 - Section #1', 'LifeScore as Storylines', 'exercise', 3, null),
    ('Day 2 - Section #1', 'LifeSteps — Role-mapping 1', 'exercise', 4, null),
    ('Day 2 - Section #1', 'LifeSteps — Role-mapping 2', 'exercise', 5, null),

    ('Day 2 - Section #2', 'LifeSteps — Resources', 'exercise', 1, null),
    ('Day 2 - Section #2', 'LifeSteps — Replenishment', 'exercise', 2, null),
    ('Day 2 - Section #2', 'Storyline Bucket List', 'exercise', 3, null),

    ('Day 3 - Section #1', 'Horizon Storyline Overview', 'exercise', 1, null),
    ('Day 3 - Section #1', 'Horizon Storyline Worksheet', 'exercise', 2, 'Beyond, background, midground, foreground — for one life.'),
    ('Day 3 - Section #1', 'Foreground Horizon', 'exercise', 3, 'The 90-day goal, written down.'),

    ('Life-Making Cycle Resources', 'Life-Making Cycle 1-Pager', 'handout', 1, null),
    ('Life-Making Cycle Resources', 'Life-Making Cycle Overview for Calendar Blocking', 'handout', 2, null),
    ('Life-Making Cycle Resources', '90-Day Launch (blank)', 'handout', 3, 'Print it.'),
    ('Life-Making Cycle Resources', '90-Day Launch (fillable PDF)', 'handout', 4, 'Type into it.'),
    ('Life-Making Cycle Resources', 'Weekly Reflecting Guide', 'handout', 5, null),
    ('Life-Making Cycle Resources', 'Quarterly Planning Guide', 'handout', 6, null),
    ('Life-Making Cycle Resources', 'Annual Retreating Guide', 'handout', 7, null);

  update template_resources r
     set position = c.position,
         kind = c.kind::template_resource_kind,
         description = coalesce(r.description, c.description)
    from curriculum c
   where r.template_id = v_y and r.section = c.section and r.title = c.title;

  insert into template_resources (template_id, section, kind, title, description, position)
  select v_y, c.section, c.kind::template_resource_kind, c.title, c.description, c.position
    from curriculum c
   where not exists (
     select 1 from template_resources r
      where r.template_id = v_y and r.section = c.section and r.title = c.title
   );

  update templates
     set structure = jsonb_build_object('sections', jsonb_build_array(
           'Overview', 'Recommended Prework', 'Session Recordings',
           'Day 1 - Section #1', 'Day 1 - Section #2', 'Day 1 - Section #3',
           'Day 2 - Section #1', 'Day 2 - Section #2', 'Day 3 - Section #1',
           'Life-Making Cycle Resources')),
         description = 'A one-on-one, three-day life-planning engagement built on the Younique framework — Sweet Spot, LifeCall, LifeSteps, Horizon Storyline — with the Life-Making Cycle to keep it going.'
   where id = v_y;

  -- The pre-work list, from the template task's own note: "have your client
  -- complete: The Life Discovery Grid (3 Videos Provided), Grounding
  -- Questions, Preferred Assessments, Your Customized Prep".
  select id into v_prework from template_prep_groups where template_id = v_y and key = 'younique-prework';
  insert into template_prep_items (group_id, title, notes, position)
  select v_prework, v.title, v.notes, v.position
    from (values
      ('Watch the three Life Discovery Grid videos',
       'About an hour all told. They walk you through the grid before you fill it in.', 1),
      ('Complete the Life Discovery Grid worksheet',
       'The worksheet is in Preparation. Bring it with you to Day 1.', 2),
      ('Answer the Grounding Questions',
       'Short answers are fine. They are where Day 1 starts, not a test.', 3),
      ('Take your assessments',
       'RunFree orders your Insights Discovery profile for you — watch for the email. Anything you already have (StrengthsFinder, Enneagram, DISC) is worth bringing too.', 4),
      ('Your customised prep',
       'Anything your coach asked you for specifically.', 5)
    ) as v(title, notes, position)
   where v_prework is not null
     and not exists (select 1 from template_prep_items i where i.group_id = v_prework and i.title = v.title);

  update template_prep_groups set description = 'Session days and deadlines.'
   where template_id = v_y and key = 'younique-key-dates';

  -- Meta Performance Coaching: an outline and a starting prework list.
  if v_m is not null then
    update templates
       set structure = jsonb_build_object('sections', jsonb_build_array(
             'COACHING PREPARATION', 'Coaching Sessions', 'Coaching Resources', 'TEAM')),
           description = 'Team and one-on-one performance coaching. Sessions, notes, homework and resources, without the six-module Vision Framing arc.'
     where id = v_m;

    update template_prep_groups set description = 'Sessions and deadlines.'
     where template_id = v_m and key = 'mp-key-dates';

    select id into v_mp_prep from template_prep_groups where template_id = v_m and key = 'mp-prep';
    insert into template_prep_items (group_id, title, notes, position)
    select v_mp_prep, v.title, v.notes, v.position
      from (values
        ('Complete the coaching intake form',
         'Your coach sends the link. Fifteen minutes, and it shapes the first session.', 1),
        ('Take the Working Genius assessment',
         'You will get a code from RunFree. About ten minutes.', 2),
        ('Send any assessments you already have',
         'Insights, StrengthsFinder, DISC, Enneagram — whatever is current.', 3)
      ) as v(title, notes, position)
     where v_mp_prep is not null
       and not exists (select 1 from template_prep_items i where i.group_id = v_mp_prep and i.title = v.title);
  end if;
end $$;
