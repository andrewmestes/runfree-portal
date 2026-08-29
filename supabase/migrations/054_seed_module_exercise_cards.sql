-- Blank cards per module, named after the exercises on the Asana boards.
--
-- Andrew: "please start with a few blank cards in each module that have a few
-- of the same titles that our Asana boards have. don't need to add all of
-- them, just a few exercises since we have videos listed elsewhere."
--
-- Exercises only. The teachings already have their own block under each
-- module, and repeating them here as empty cards would be two lists of the
-- same videos.
--
-- Created UNPUBLISHED. A card with nothing in it is a note to the coach about
-- what to capture, not something a church should scroll past, and
-- `deliverables` already gates on published_at — so a draft is invisible to a
-- viewer without any new rule.
--
-- Applied to the template as well as the live projects, so the next church
-- starts with the same scaffolding instead of someone retyping it. The
-- not-exists guard matters: Christ Chapel's Expectations Exercise is a real
-- card with a chart and notes, and must not be shadowed by a blank.
insert into template_deliverables (template_id, title, section, kind, position)
select t.id, v.title, v.section, 'session_image'::deliverable_kind, v.position
  from templates t
  cross join (values
    ('Expectations Exercise',               'Mod #1 FUNNEL FUSION',       900),
    ('Upper / Lower Room Assessment',       'Mod #1 FUNNEL FUSION',       901),
    ('5 Eras Assessment',                   'Mod #1 FUNNEL FUSION',       902),
    ('Geographic Influence Footprint',      'Mod #2 CROWD CLOUD',         900),
    ('Kingdom Concept: One Word Refinement','Mod #2 CROWD CLOUD',         901),
    ('6-Word Challenge',                    'Mod #2 CROWD CLOUD',         902),
    ('Coffee Questions',                    'Mod #3 DISCIPLE''S JOURNEY', 900),
    ('Shark Tank Exercise',                 'Mod #3 DISCIPLE''S JOURNEY', 901),
    ('Character and Competencies of Jesus', 'Mod #3 DISCIPLE''S JOURNEY', 902),
    ('Frisbee Strategy Design Exercise',    'Mod #4 KINGDOM PLATFORM',    900),
    ('Z-landers Ministry Map',              'Mod #4 KINGDOM PLATFORM',    901),
    ('Z-landers Leadership Star',           'Mod #4 KINGDOM PLATFORM',    902),
    ('Values Work',                         'Mod #5 VISION FRAME',        900),
    ('Beyond the Horizon (5 yr. DREAM)',    'Mod #6 HORIZON STORYLINE',   900),
    ('Background Horizon (3 yr. OBJs)',     'Mod #6 HORIZON STORYLINE',   901),
    ('Foreground Horizon (90-day STEPS)',   'Mod #6 HORIZON STORYLINE',   902)
  ) as v(title, section, position)
 where t.name ilike '%Pivvot%'
   and not exists (
     select 1 from template_deliverables td
      where td.template_id = t.id and td.section = v.section and td.title = v.title
   );

insert into deliverables (project_id, title, section, kind, position, published_at)
select p.id, v.title, v.section, 'session_image'::deliverable_kind, v.position, null
  from projects p
  cross join (values
    ('Expectations Exercise',               'Mod #1 FUNNEL FUSION',       900),
    ('Upper / Lower Room Assessment',       'Mod #1 FUNNEL FUSION',       901),
    ('5 Eras Assessment',                   'Mod #1 FUNNEL FUSION',       902),
    ('Geographic Influence Footprint',      'Mod #2 CROWD CLOUD',         900),
    ('Kingdom Concept: One Word Refinement','Mod #2 CROWD CLOUD',         901),
    ('6-Word Challenge',                    'Mod #2 CROWD CLOUD',         902),
    ('Coffee Questions',                    'Mod #3 DISCIPLE''S JOURNEY', 900),
    ('Shark Tank Exercise',                 'Mod #3 DISCIPLE''S JOURNEY', 901),
    ('Character and Competencies of Jesus', 'Mod #3 DISCIPLE''S JOURNEY', 902),
    ('Frisbee Strategy Design Exercise',    'Mod #4 KINGDOM PLATFORM',    900),
    ('Z-landers Ministry Map',              'Mod #4 KINGDOM PLATFORM',    901),
    ('Z-landers Leadership Star',           'Mod #4 KINGDOM PLATFORM',    902),
    ('Values Work',                         'Mod #5 VISION FRAME',        900),
    ('Beyond the Horizon (5 yr. DREAM)',    'Mod #6 HORIZON STORYLINE',   900),
    ('Background Horizon (3 yr. OBJs)',     'Mod #6 HORIZON STORYLINE',   901),
    ('Foreground Horizon (90-day STEPS)',   'Mod #6 HORIZON STORYLINE',   902)
  ) as v(title, section, position)
 where p.name ilike '%Pivvot Vision Framing%'
   and not exists (
     select 1 from deliverables d
      where d.project_id = p.id and d.section = v.section and d.title = v.title
   );
