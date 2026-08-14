-- Real content, read directly from the live Asana workspace (RUN FREE
-- Pivvot Vision Framing Template DO NOT CHANGE, project 1206908483973984,
-- and its stamped copy Athena Christian Church - Pivvot Vision Framing,
-- project 1217123610305722) — not fabricated. See BRIEF.md's build order,
-- step 2: "Pivvot template, with Athena Christian Church as the first real
-- project. One vertical, one live client, end to end."
--
-- Deliberately NOT carried over from Asana: the "Will's Books" and "Master
-- Teaching Videos" sections. That content already lives in the Certified
-- Vision Framers portal, which is a separate login on a separate domain a
-- church client has no access to — bridging it is a real cross-portal
-- feature (and probably the actual shape of the certification_access flag
-- added in 006), not something to fake with a broken link here. Parked, not
-- forgotten.
--
-- Also not carried over: "YOUR NAME HERE - Your Lead Navigator {ADD PHOTO}"
-- and "RunFree.co Team Contact Info" placeholder tasks — those are
-- per-project, not identical across every Pivvot engagement (the assigned
-- coach differs by project), so they don't belong in a template's static
-- resource library. The project page already surfaces "who's on this
-- project" from project_members directly.
--
-- Safe to re-run: everything is gated by a slug/name lookup with a delete
-- first, not ON CONFLICT, since template_resources and deliverables don't
-- have natural-key uniqueness constraints to conflict on.

do $$
declare
  v_template_id uuid;
  v_project_id uuid;
  v_andrew_id uuid;
begin
  select id into v_andrew_id from public.profiles where email = 'andrew@runfree.co';
  if v_andrew_id is null then
    raise exception 'andrew@runfree.co has no profile row — run 008_backfill_profiles_from_existing_users.sql first';
  end if;

  -- -------------------------------------------------------------------
  -- Template
  -- -------------------------------------------------------------------
  delete from public.templates where slug = 'pivvot-vision-framing';

  insert into public.templates (name, slug, description, structure)
  values (
    'Pivvot Vision Framing',
    'pivvot-vision-framing',
    'RunFree''s core church-clarity engagement: six modules from Funnel Fusion through Horizon Storyline, producing a completed Vision Frame.',
    jsonb_build_object('sections', jsonb_build_array(
      'FUTURE TEAM INFO',
      'CHURCH PREPARATION',
      'SESSION RECORDINGS',
      'PROCESS OVERVIEW',
      'Mod #1 FUNNEL FUSION',
      'Mod #2 CROWD CLOUD',
      E'Mod #3 DISCIPLE\'S JOURNEY',
      'Mod #4 KINGDOM PLATFORM',
      'Mod #5 VISION FRAME',
      'Mod #6 HORIZON STORYLINE'
    ))
  )
  returning id into v_template_id;

  -- -------------------------------------------------------------------
  -- template_resources — identical across every Pivvot project
  -- -------------------------------------------------------------------
  insert into public.template_resources (template_id, section, kind, title, position)
  select v_template_id, section, kind::template_resource_kind, title, row_number() over ()
  from (values
    -- FUTURE TEAM INFO
    ('FUTURE TEAM INFO', 'team_bio', 'Will Mancini — Founder and Process Creator'),
    ('FUTURE TEAM INFO', 'team_bio', 'Brooke Domek — Executive Director'),

    -- CHURCH PREPARATION
    ('CHURCH PREPARATION', 'link', 'Key Dates'),
    ('CHURCH PREPARATION', 'exercise', 'Preparation Checklist'),
    ('CHURCH PREPARATION', 'link', 'Team Pre-Reading'),
    ('CHURCH PREPARATION', 'link', 'Team Optional Pre-Work'),
    ('CHURCH PREPARATION', 'video', 'Orientation Video: Future Church "Ted Talk" (19 min.)'),
    ('CHURCH PREPARATION', 'video', 'Orientation Video: Future Church Backstory (< 2 min.)'),
    ('CHURCH PREPARATION', 'video', 'Orientation Video: Why did I write the book (< 3 min.)'),
    ('CHURCH PREPARATION', 'video', 'Orientation Video: Leading Church Testimony - Long Hollow (< 4 min.)'),
    ('CHURCH PREPARATION', 'exercise', 'Team Building Profiles'),

    -- PROCESS OVERVIEW
    ('PROCESS OVERVIEW', 'handout', 'Pivvot Notebook — All Handouts'),
    ('PROCESS OVERVIEW', 'video', 'Process Overview Teaching (19 min.)'),
    ('PROCESS OVERVIEW', 'video', '7 Laws Overview Teaching'),
    ('PROCESS OVERVIEW', 'video', 'Collaboration Dynamics Training'),
    ('PROCESS OVERVIEW', 'exercise', 'Guest Perspective Evaluation'),
    ('PROCESS OVERVIEW', 'exercise', 'Guest Perspective Recommendations'),
    ('PROCESS OVERVIEW', 'exercise', 'Existing Vision Frame Evaluation'),

    -- Mod #1 FUNNEL FUSION
    ('Mod #1 FUNNEL FUSION', 'handout', 'Funnel Fusion Handouts'),
    ('Mod #1 FUNNEL FUSION', 'video', 'Funnel Fusion Overview Teaching (5 min.)'),
    ('Mod #1 FUNNEL FUSION', 'exercise', 'Expectations Exercise'),
    ('Mod #1 FUNNEL FUSION', 'exercise', 'Upper / Lower Room Assessment'),
    ('Mod #1 FUNNEL FUSION', 'video', E'5 Era\'s Training Video for Team Dialogue (29 min.)'),
    ('Mod #1 FUNNEL FUSION', 'exercise', E'5 Era\'s Assessment'),
    ('Mod #1 FUNNEL FUSION', 'video', 'Problem Statement Training Video for Team Dialogue (7 min.)'),
    ('Mod #1 FUNNEL FUSION', 'video', 'Funnel Fusion Reinforcement Training (< 3 min.)'),

    -- Mod #2 CROWD CLOUD
    ('Mod #2 CROWD CLOUD', 'handout', 'Crowd Cloud Handouts'),
    ('Mod #2 CROWD CLOUD', 'exercise', 'Geographic Influence Footprint'),
    ('Mod #2 CROWD CLOUD', 'video', 'Crowd Cloud Overview Teaching'),
    ('Mod #2 CROWD CLOUD', 'exercise', 'Demographics Report'),
    ('Mod #2 CROWD CLOUD', 'exercise', 'Kingdom Concept (KC) Pre-reading (Chapter 9 of Church Unique) and Process Work'),
    ('Mod #2 CROWD CLOUD', 'video', E'The "Future is found in a Few" Reinforcement Training'),
    ('Mod #2 CROWD CLOUD', 'video', E'Satan\'s Loophole Reinforcement Training (6 min.)'),
    ('Mod #2 CROWD CLOUD', 'exercise', 'Virtual Meeting Log'),

    -- Mod #3 DISCIPLE'S JOURNEY
    (E'Mod #3 DISCIPLE\'S JOURNEY', 'handout', E'Disciple\'s Journey Handouts'),
    (E'Mod #3 DISCIPLE\'S JOURNEY', 'video', E'Disciple\'s Journey Overview Teaching (60 min.)'),
    (E'Mod #3 DISCIPLE\'S JOURNEY', 'exercise', 'Coffee Questions'),
    (E'Mod #3 DISCIPLE\'S JOURNEY', 'exercise', 'Shark Tank Exercise'),
    (E'Mod #3 DISCIPLE\'S JOURNEY', 'exercise', '10 Saints Exercise'),
    (E'Mod #3 DISCIPLE\'S JOURNEY', 'exercise', 'Character and Competencies of Jesus'),
    (E'Mod #3 DISCIPLE\'S JOURNEY', 'video', 'Smart Segmentation Training'),

    -- Mod #4 KINGDOM PLATFORM
    ('Mod #4 KINGDOM PLATFORM', 'handout', 'Kingdom Platform Handouts'),
    ('Mod #4 KINGDOM PLATFORM', 'handout', 'Ministry Design Basics'),
    ('Mod #4 KINGDOM PLATFORM', 'exercise', 'Frisbee Strategy Design Exercise'),
    ('Mod #4 KINGDOM PLATFORM', 'exercise', 'Z-landers Ministry Map'),
    ('Mod #4 KINGDOM PLATFORM', 'exercise', 'Z-landers Leadership Star'),
    ('Mod #4 KINGDOM PLATFORM', 'exercise', 'X-Y-Z Calling Clarity - Younique'),

    -- Mod #5 VISION FRAME
    ('Mod #5 VISION FRAME', 'handout', 'Vision Frame Handouts'),
    ('Mod #5 VISION FRAME', 'video', 'Vision Frame Overview Teaching'),
    ('Mod #5 VISION FRAME', 'video', 'Vision Proper Training'),

    -- Mod #6 HORIZON STORYLINE
    ('Mod #6 HORIZON STORYLINE', 'handout', 'Horizon Storyline Handouts'),
    ('Mod #6 HORIZON STORYLINE', 'video', 'God Dreams Preparation Video — Overview of the Horizon Storyline and the 12 Vision Templates')
  ) as t(section, kind, title);

  -- -------------------------------------------------------------------
  -- Athena Christian Church — the real first project
  -- -------------------------------------------------------------------
  delete from public.projects where name = 'Athena Christian Church - Pivvot Vision Framing';

  insert into public.projects (name, template_id, visibility, created_by)
  values ('Athena Christian Church - Pivvot Vision Framing', v_template_id, 'private', v_andrew_id)
  returning id into v_project_id;

  insert into public.project_members (project_id, profile_id, role)
  values (v_project_id, v_andrew_id, 'admin');

  -- Deliverable placeholders — client-specific outputs, empty until a real
  -- session fills them in. Includes the "FLIPCHARTS (Date)" slots, which are
  -- exactly the screenshot-a-chart-and-drop-it-in case.
  insert into public.deliverables (project_id, section, title, position)
  select v_project_id, section, title, row_number() over ()
  from (values
    ('Mod #1 FUNNEL FUSION', 'Assimilation Funnel'),
    ('Mod #1 FUNNEL FUSION', 'Church Problem Statement'),

    ('Mod #2 CROWD CLOUD', 'Flipcharts'),
    ('Mod #2 CROWD CLOUD', 'KC Summary'),
    ('Mod #2 CROWD CLOUD', 'Crowd Cloud Cameos'),
    ('Mod #2 CROWD CLOUD', 'Mission Statement'),

    (E'Mod #3 DISCIPLE\'S JOURNEY', 'Flipcharts'),
    (E'Mod #3 DISCIPLE\'S JOURNEY', 'Mission Measures'),

    ('Mod #4 KINGDOM PLATFORM', 'Flipcharts'),
    ('Mod #4 KINGDOM PLATFORM', E'Future Team Z-lander "Personal Vision" Work'),
    ('Mod #4 KINGDOM PLATFORM', 'Strategy Napkin Sketch'),

    ('Mod #5 VISION FRAME', 'Values Work'),
    ('Mod #5 VISION FRAME', 'Mission — Final'),
    ('Mod #5 VISION FRAME', 'Mission Measures — Final'),
    ('Mod #5 VISION FRAME', 'Strategy — Final'),
    ('Mod #5 VISION FRAME', 'Values — Final'),

    ('Mod #6 HORIZON STORYLINE', 'Beyond the Horizon (5 yr. DREAM)'),
    ('Mod #6 HORIZON STORYLINE', 'Background Horizon (3 yr. OBJs)'),
    ('Mod #6 HORIZON STORYLINE', 'Midground Horizon (1 yr. GOAL)'),
    ('Mod #6 HORIZON STORYLINE', 'Foreground Horizon (90-day STEPS)'),
    ('Mod #6 HORIZON STORYLINE', 'Vivid Description'),
    ('Mod #6 HORIZON STORYLINE', 'Completed Template')
  ) as t(section, title);

  raise notice 'Seeded template % and project %', v_template_id, v_project_id;
end $$;
