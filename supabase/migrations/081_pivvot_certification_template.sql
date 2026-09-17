-- Pivvot Vision Framing Certification: the template a certification cohort is
-- stamped from, built from the Kairos cohort's Asana board.
--
-- Andrew, 17 Sept 2026: "create and import a project for 'kairos' check out
-- all the content i have for them in Asana. For the new certification group
-- coming to north carolina next week, lets go ahead and create a project for
-- that."
--
-- A cohort is not a church. It builds no Vision Frame and runs no Execution
-- tab; it learns the six modules, draws the five core drawings from memory,
-- practises teach-backs, and takes the tools into real churches. So:
--
--   process_kind 'modules'   the six "Mod #N" sections, spelled exactly as on
--                            Pivvot, so ModuleNav, the Drive handout library
--                            and "Sessions on this" work unchanged
--   frame_elements '{}'      no Vision Frame sheet (070)
--   has_vision_stack false   no Stack
--   voice 'organization'     "Your Team", not "Church Team"
--   ui.nav.execution null    no Execution tab
--
-- How the Asana columns land:
--
--   TEAM INFO                 → project members, not cards (the import script)
--   PREVIEW TOOLS             → Reading & Pre-Work, the orientation videos,
--                               Team Building Profiles, Key Dates
--   SESSION RECORDINGS        → Sessions (the import script)
--   MEETING DATES & CERT.     → Key Dates; "Certification Resources"
--   RESOURCES
--   FACILITATOR'S GUIDE       → nothing stored: the guide is private and the
--                               portal already serves it at /guide
--   PILOT EXPERIENCES         → "Pilot Experiences"
--   PROCESS OVERVIEW          → the overview teachings
--   Mod #1 … Mod #6           → a "Tools covered in session" checklist per
--                               module, numbered as in the August 2026 guide,
--                               plus each module's teaching videos
--   Application Toolbox       → a DELIVERABLES checklist
--   Will's Books              → the Books tab, which already carries these
--                               books. The eight Future Church bonus chapters
--                               are NOT copied: the complete book is kept out
--                               of storage as publisher content, and these
--                               are probably the same. See CLAUDE.md.
--   Master Teaching Videos    → "Master Teaching Videos"
--
-- Declared sections that are not modules render under The Process as
-- "Further materials" (orphan sections). A section of PDFs we hold draws each
-- first page (078); an image resource is a card (069).
--
-- Files are attached afterwards by scripts/import-template-files.ts, matched
-- on section + title. The reading PDFs are copied into each project by
-- scripts/seed-prep-reading.ts.
--
-- Written to be re-runnable: groups upsert on (template_id, key), and items,
-- resources and members insert only when missing. Never delete a template
-- group here once a project exists — prep_items cascade from it.

insert into templates (
  slug, name, description, structure, ui, handouts_folder_id,
  has_vision_stack, is_group, process_kind, frame_elements, voice, is_active
)
values (
  'pivvot-certification',
  'Pivvot Vision Framing Certification',
  'A cohort of facilitators getting certified in the Pivvot Vision Framing toolbox. Live sessions cover the six modules, the five core drawings drawn from memory, teach-backs and practice with real churches. The cohort gets the handouts, teaching videos and books, and a record of which tools have been covered.',
  jsonb_build_object('sections', jsonb_build_array(
    'PROCESS OVERVIEW',
    'Mod #1 FUNNEL FUSION',
    'Mod #2 CROWD CLOUD',
    'Mod #3 DISCIPLE''S JOURNEY',
    'Mod #4 KINGDOM PLATFORM',
    'Mod #5 VISION FRAME',
    'Mod #6 HORIZON STORYLINE',
    'Certification Resources',
    'Pilot Experiences',
    'Master Teaching Videos'
  )),
  jsonb_build_object(
    'nav', jsonb_build_object(
      'prepare', 'Preparation',
      'team', 'Cohort',
      'process', 'The Toolbox',
      'execution', null
    ),
    'wording', jsonb_build_object(
      -- A session's list holds what RunFree owes as well as the practice.
      'tasks', 'Assignments and next steps',
      'task_add', 'Add an assignment',
      'tasks_theirs', 'Cohort assignments',
      'team_title', 'Your Trainers',
      'process_eyebrow', 'The six modules',
      'materials', 'Certification materials'
    ),
    'session_prep', jsonb_build_array(
      'Which of the five core drawings can you now draw from memory, with no notes?',
      'Where have you practised a tool since the last session, with whom, and what happened?',
      'Which tool are you least ready to teach back if you are called on today?',
      'What do you most want coached next?'
    ),
    'session_prep_note', 'A few minutes before each session. Expect to be asked to redraw or teach back a tool.',
    'feedback', jsonb_build_array(
      'What did you like best about this session?',
      'Which tool still feels unclear, and why?',
      'What should your trainers do differently next time?'
    ),
    'feedback_rating', 'How ready do you feel to facilitate what we covered, 1 to 10?',
    'default_highlights', jsonb_build_array(
      'Core Tools Success Scorecard',
      'Vision Frame Cheat Sheet',
      'Future Church Part 1',
      '7 Laws Bullet Book',
      'Future Church Part 3',
      'Ted Talk',
      'Upper / Lower Room Master Teaching',
      '7 Laws Overview Teaching'
    )
  ),
  -- Pivvot's handout library. The rebranded certification handouts are still
  -- to come (Session 2); point this at their folder when they exist, and
  -- share that folder with the portal's service account first.
  '1bbtzQA7WR1jSJmDVgnfdWqnLDfVDcLb4',
  false, true, 'modules', '{}', 'organization', true
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  structure = excluded.structure,
  ui = excluded.ui,
  handouts_folder_id = excluded.handouts_folder_id,
  has_vision_stack = excluded.has_vision_stack,
  is_group = excluded.is_group,
  process_kind = excluded.process_kind,
  frame_elements = excluded.frame_elements,
  voice = excluded.voice;

-- ── Groups ──────────────────────────────────────────────────────────────────
insert into template_prep_groups (template_id, section, key, title, description, kind, position)
select t.id, v.section, v.key, v.title, v.description, v.kind::prep_group_kind, v.position
from templates t
cross join (values
  ('CHURCH PREPARATION', 'pc-key-dates', 'Key Dates',
   'Session dates and on-site days.', 'dates', 1),
  ('CHURCH PREPARATION', 'pc-reading', 'Reading & Pre-Work',
   'What to read and watch before the first session.', 'reading', 2),
  ('CHURCH PREPARATION', 'pc-facilitator-kit', 'Facilitator Kit',
   'What to have on hand before you facilitate.', 'checklist', 3),
  -- Rules, not tasks: a notes card has no tick boxes, so these do not count
  -- as "things to do before we begin" on the dashboard.
  ('CHURCH PREPARATION', 'pc-using-materials', 'Using the Materials',
   'What you may share, and what stays with you.', 'notes', 4),
  ('TEAM', 'pc-profiles', 'Team Building Profiles',
   'Insights Discovery profiles for the cohort.', 'files', 5),
  ('Mod #1 FUNNEL FUSION', 'pc-mod1-tools', 'Tools covered in session',
   'Ticked once a tool has been taught in a session. Numbered as in the August 2026 guide.', 'checklist', 10),
  ('Mod #2 CROWD CLOUD', 'pc-mod2-tools', 'Tools covered in session',
   'Ticked once a tool has been taught in a session. Numbered as in the August 2026 guide.', 'checklist', 11),
  ('Mod #3 DISCIPLE''S JOURNEY', 'pc-mod3-tools', 'Tools covered in session',
   'Ticked once a tool has been taught in a session. Numbered as in the August 2026 guide.', 'checklist', 12),
  ('Mod #4 KINGDOM PLATFORM', 'pc-mod4-tools', 'Tools covered in session',
   'Ticked once a tool has been taught in a session. Numbered as in the August 2026 guide.', 'checklist', 13),
  ('Mod #5 VISION FRAME', 'pc-mod5-tools', 'Tools covered in session',
   'Ticked once a tool has been taught in a session. Numbered as in the August 2026 guide.', 'checklist', 14),
  ('Mod #6 HORIZON STORYLINE', 'pc-mod6-tools', 'Tools covered in session',
   'Ticked once a tool has been taught in a session. Numbered as in the August 2026 guide.', 'checklist', 15),
  ('DELIVERABLES', 'pc-core-drawings', 'The Five Core Drawings, drawn cold',
   'The certification standard: each of the five drawn from memory, with no notes.', 'checklist', 20),
  ('DELIVERABLES', 'pc-application-toolbox', 'Application Toolbox',
   'Tools for putting a finished Vision Frame to work.', 'checklist', 21)
) as v(section, key, title, description, kind, position)
where t.slug = 'pivvot-certification'
on conflict (template_id, key) do update
  set section = excluded.section, title = excluded.title, description = excluded.description,
      kind = excluded.kind, position = excluded.position;

-- ── Items ───────────────────────────────────────────────────────────────────
insert into template_prep_items (group_id, title, notes, external_url, drive_file_id, position)
select g.id, v.title, v.notes, v.url, v.drive_id, v.position
from template_prep_groups g
join templates t on t.id = g.template_id
join (values
  -- Reading & Pre-Work. The Drive ids are the Books shelf's own files, the
  -- same ones Pivvot's list uses; seed-prep-reading.ts copies them into each
  -- project. The two Looms match Pivvot's reading rows.
  ('pc-reading', 'Future Church — Part 1',
   'The first section of Will''s book. The seven laws of real church growth, and why attendance stopped being the measure.',
   null, '1TGoqavVVgL3DQtazHKPGmYRVsxudzzPd', 10),
  ('pc-reading', 'Future Church — Part 3',
   'The closing section. What a church actually changes once it takes the seven laws seriously.',
   null, '1wIh_c_yI795SaB_-R0qtebZvy0ucU7yM', 20),
  ('pc-reading', 'The 7 Laws Bullet Book',
   'Created as an opportunity to scan and appreciate the 7 Laws without having to read the bulk of Future Church itself. The bullet book covers Future Church Part 2.',
   null, '1iV_pl9idnMZbdKZWR0cHC0BuboBvEPxD', 30),
  ('pc-reading', 'Future Church Visual Summary',
   'Future Church, summarised visually.',
   null, '1NLvDnK-l7z708kLESXnEyfWUD_uuaUL6', 40),
  ('pc-reading', 'Problem Statement Deck',
   null,
   null, '1ht5mUydl1bg4EO_gb4BxfDl6yvGRMvf4', 50),
  ('pc-reading', 'Upper Room / Lower Room — Master Teaching',
   'Will''s teaching on the Doorway, the first of the five core drawings. Be ready to teach it back.',
   'https://www.loom.com/share/46ca4a2e6b184bda9f2a746eb3886b78', null, 60),
  ('pc-reading', 'The 7 Laws of Real Church Growth — Overview',
   'A brief overview of the seven laws.',
   'https://www.loom.com/share/937fe2b1ae6d4993bd6a73345e108f91', null, 70),

  ('pc-facilitator-kit', 'A practice flip chart and easel of your own', null, null, null, 1),
  ('pc-facilitator-kit', 'Grid anchor flip-chart paper',
   'Andrew uses the oversized 27 × 34 in. sheets with a 1-inch grid. Order ahead.',
   'https://www.dickblick.com/products/pacon-heavy-duty-anchor-chart-paper/', null, 2),
  ('pc-facilitator-kit', 'Chisel-tip markers in black, red and blue', null, null, null, 3),
  ('pc-facilitator-kit', 'The Core Tools Success Scorecard, printed, at the front of your notebook',
   'Under Certification Resources in The Toolbox.', null, null, 4),
  ('pc-facilitator-kit', 'The Digital Facilitator''s Guide on an iPad or tablet',
   'Open it from Guide at the top of the portal.', null, null, 5),
  ('pc-facilitator-kit', 'Access to the portal''s handouts, books and teaching videos', null, null, null, 6),

  ('pc-using-materials', 'Church Unique and Future Church PDFs are publisher-owned: do not forward them', null, null, null, 1),
  ('pc-using-materials', 'God Dreams and Younique: use freely with teams you personally lead, and no further', null, null, null, 2),
  ('pc-using-materials', 'The Digital Facilitator''s Guide is private: do not email or share it', null, null, null, 3),
  ('pc-using-materials', 'Power phrases are yours to use, no attribution needed', null, null, null, 4),
  ('pc-using-materials', 'The process is royalty-free: lead it under your own brand as a certified vision framer', null, null, null, 5),

  ('pc-mod1-tools', '1.1 Introductions & Expectations Exercise', null, null, null, 1),
  ('pc-mod1-tools', '1.2 Three Kinds of Change', null, null, null, 2),
  ('pc-mod1-tools', '1.3 Vision Frame Inside & Introduction', null, null, null, 3),
  ('pc-mod1-tools', '1.4 Pivvot Vision Framing Overview', null, null, null, 4),
  ('pc-mod1-tools', '1.5 Collaboration & Clarity Dynamics', null, null, null, 5),
  ('pc-mod1-tools', '1.6 Transfer of Authority', null, null, null, 6),
  ('pc-mod1-tools', '1.7 Future Team Survey', null, null, null, 7),
  ('pc-mod1-tools', '1.8 The Functional Great Commission', null, null, null, 8),
  ('pc-mod1-tools', '1.9 Upper Room / Lower Room & Assessment', null, null, null, 9),
  ('pc-mod1-tools', '1.10 Eras of Church Growth & Assessment', null, null, null, 10),
  ('pc-mod1-tools', '1.11 Funnel Fusion', null, null, null, 11),
  ('pc-mod1-tools', '1.12 Current Vision Frame Evaluation', null, null, null, 12),
  ('pc-mod1-tools', '1.13 DELIVERABLE: Church Problem Statement', null, null, null, 13),

  ('pc-mod2-tools', '2.1 Crowd Cloud Overview Teaching', null, null, null, 1),
  ('pc-mod2-tools', '2.2 Seven Laws Flash Assessment', null, null, null, 2),
  ('pc-mod2-tools', '2.3 Geographic Influence Footprint', null, null, null, 3),
  ('pc-mod2-tools', '2.4 Demographics Report', null, null, null, 4),
  ('pc-mod2-tools', '2.5 Kingdom Concept (KC) Pre-reading and Process Work',
   'The pre-reading is Church Unique chapter 9, on the Books tab.', null, null, 5),
  ('pc-mod2-tools', '2.6 Three Kinds of Words', null, null, null, 6),
  ('pc-mod2-tools', '2.7 DELIVERABLE: KC Summary', null, null, null, 7),
  ('pc-mod2-tools', '2.8 Does the Mission Make Heroes? - 6 Cs', null, null, null, 8),
  ('pc-mod2-tools', '2.9 Mission Types: A to B', null, null, null, 9),
  ('pc-mod2-tools', '2.10 Mission Types: KC Direct (6 word story)', null, null, null, 10),
  ('pc-mod2-tools', '2.11 DELIVERABLE: Mission Statement', null, null, null, 11),
  ('pc-mod2-tools', '2.12 DELIVERABLE: Crowd Cloud Cameos', null, null, null, 12),
  ('pc-mod2-tools', '2.13 Vision Frame Progress', null, null, null, 13),

  ('pc-mod3-tools', '3.1 Coffee Questions', null, null, null, 1),
  ('pc-mod3-tools', '3.2 The Dip', null, null, null, 2),
  ('pc-mod3-tools', '3.3 Disciple''s Journey Overview Teaching', null, null, null, 3),
  ('pc-mod3-tools', '3.4 Shark Tank Exercise', null, null, null, 4),
  ('pc-mod3-tools', '3.5 Character and Competencies Mining', null, null, null, 5),
  ('pc-mod3-tools', '3.6 Top 5 Saints Exercise', null, null, null, 6),
  ('pc-mod3-tools', '3.7 Deciding on Our Top 5 Measures', null, null, null, 7),
  ('pc-mod3-tools', '3.8a Four Ways to Articulate Measures', null, null, null, 8),
  ('pc-mod3-tools', '3.8b Five Filters for Finalizing Measures', null, null, null, 9),
  ('pc-mod3-tools', '3.9 DELIVERABLE: Mission Measures', null, null, null, 10),
  ('pc-mod3-tools', '3.10 Seven Steps to Implement Measures', null, null, null, 11),
  ('pc-mod3-tools', '3.11 Vision Frame Progress', null, null, null, 12),
  ('pc-mod3-tools', '3.12 Smart Segmentation Training', null, null, null, 13),

  ('pc-mod4-tools', '4.1 Strategy Exercise', null, null, null, 1),
  ('pc-mod4-tools', '4.2 Strategy Concepts Teaching', null, null, null, 2),
  ('pc-mod4-tools', '4.3 TRAINED - 4 Steps - Red Funnel Development', null, null, null, 3),
  ('pc-mod4-tools', '4.4 SENT - 4 Fields - Red Funnel Development', null, null, null, 4),
  ('pc-mod4-tools', '4.5 CALLED - 4 Layers - Red Funnel Development', null, null, null, 5),
  ('pc-mod4-tools', '4.6 Strategy Design DISC Game Exercise', null, null, null, 6),
  ('pc-mod4-tools', '4.7 DISC Game Final', null, null, null, 7),
  ('pc-mod4-tools', '4.8 Strategy Narrative', null, null, null, 8),
  ('pc-mod4-tools', '4.9 Z-landers Ministry Map', null, null, null, 9),
  ('pc-mod4-tools', '4.10 Four Kinds of Napkin Sketches', null, null, null, 10),
  ('pc-mod4-tools', 'DELIVERABLE: Strategy Napkin Sketch', null, null, null, 11),
  ('pc-mod4-tools', 'DELIVERABLE: Customized Discipleship Invitation', null, null, null, 12),
  ('pc-mod4-tools', '4.11 Vision Frame Progress', null, null, null, 13),

  ('pc-mod5-tools', '5.1 Our Mascot', null, null, null, 1),
  ('pc-mod5-tools', '5.2 Values Funnel', null, null, null, 2),
  ('pc-mod5-tools', '5.3 Leadership Survey Revisited', null, null, null, 3),
  ('pc-mod5-tools', '5.4 Affirmed Behaviors', null, null, null, 4),
  ('pc-mod5-tools', '5.5 Values Funnel Continued', null, null, null, 5),
  ('pc-mod5-tools', '5.6 Values - Our Top 4', null, null, null, 6),
  ('pc-mod5-tools', '5.7 Values Final', null, null, null, 7),
  ('pc-mod5-tools', '5.8 Vision Frame Progress', null, null, null, 8),
  ('pc-mod5-tools', 'Mission FINAL', null, null, null, 9),
  ('pc-mod5-tools', 'Mission Measures FINAL', null, null, null, 10),
  ('pc-mod5-tools', 'Strategy FINAL', null, null, null, 11),
  ('pc-mod5-tools', 'Vision Proper Training', null, null, null, 12),

  ('pc-mod6-tools', '6.1 The Gift of Looking Ahead', null, null, null, 1),
  ('pc-mod6-tools', '6.2 Mission and Vision: The Difference', null, null, null, 2),
  ('pc-mod6-tools', '6.3 Church Life Map', null, null, null, 3),
  ('pc-mod6-tools', '6.4 Horizon Storyline Overview', null, null, null, 4),
  ('pc-mod6-tools', '6.5 BTH - One Picture Idea', null, null, null, 5),
  ('pc-mod6-tools', '6.6 BTH - Developing the Vivid Description (5-Year DREAM)', null, null, null, 6),
  ('pc-mod6-tools', '6.7 Background Vision (3-Year OBJs)', null, null, null, 7),
  ('pc-mod6-tools', '6.8 Long Range Summary', null, null, null, 8),
  ('pc-mod6-tools', '6.9 Midground Vision (1-Year GOAL)', null, null, null, 9),
  ('pc-mod6-tools', '6.10 Foreground Vision (90-Day STEPS)', null, null, null, 10),
  ('pc-mod6-tools', '6.11 Vision Frame Celebration', null, null, null, 11),
  ('pc-mod6-tools', 'DELIVERABLE: Vivid Description', null, null, null, 12),
  ('pc-mod6-tools', 'DELIVERABLE: Completed Template', null, null, null, 13),

  ('pc-core-drawings', 'The Doorway — Upper Room / Lower Room', null, null, null, 1),
  ('pc-core-drawings', 'The Pathway — Pivvot Vision Framing Overview', null, null, null, 2),
  ('pc-core-drawings', 'The Master''s Way — Funnel Fusion', null, null, null, 3),
  ('pc-core-drawings', 'Your Way, Part 1 (Identity) — the Vision Frame', null, null, null, 4),
  ('pc-core-drawings', 'Your Way, Part 2 (Direction) — the Horizon Storyline', null, null, null, 5),

  ('pc-application-toolbox', 'Mission Partnership Script (MPS)', null, null, null, 1),
  ('pc-application-toolbox', 'Values Demonstrated Onramps', null, null, null, 2),
  ('pc-application-toolbox', 'Ministry Environment Scorecard', null, null, null, 3),
  ('pc-application-toolbox', 'Napkin Sketch Strategy', null, null, null, 4),
  ('pc-application-toolbox', 'Public Strategy Narrative', null, null, null, 5),
  ('pc-application-toolbox', 'Life-Marks Self Evaluation', null, null, null, 6),
  ('pc-application-toolbox', 'Geographic Influence Footprint', null, null, null, 7),
  ('pc-application-toolbox', 'Visionary Plan Shorthand', null, null, null, 8)
) as v(key, title, notes, url, drive_id, position) on v.key = g.key
where t.slug = 'pivvot-certification'
  and not exists (
    select 1 from template_prep_items x where x.group_id = g.id and x.title = v.title
  );

-- ── Resources ───────────────────────────────────────────────────────────────
-- Link rows. The file-backed rows (Certification Resources, Pilot
-- Experiences) are inserted by scripts/import-template-files.ts with their
-- files, so none of them exists here as an empty label.
insert into template_resources (template_id, section, kind, title, external_url, position)
select t.id, v.section, v.kind::template_resource_kind, v.title, v.url, v.position
from templates t
cross join (values
  -- Orientation videos. Preparation does not draw template resources; these
  -- reach a cohort through the dashboard highlights and the picker.
  ('CHURCH PREPARATION', 'video', 'Orientation Video: Future Church "Ted Talk" (19 min.)',
   'https://www.loom.com/share/f056b015647b47a1b6d7fc1c4a60b670', 1),
  ('CHURCH PREPARATION', 'video', 'Orientation Video: Future Church Backstory (< 2 min.)',
   'https://www.loom.com/share/b3c0606f01c642a080456f51120ad2eb', 2),
  ('CHURCH PREPARATION', 'video', 'Orientation Video: Why did I write the book (< 3 min.)',
   'https://www.loom.com/share/9e062843240e4aeb92da30e6477a9ad8', 3),
  ('CHURCH PREPARATION', 'video', 'Orientation Video: Leading Church Testimony - Long Hollow (< 4 min.)',
   'https://www.loom.com/share/e6b4e80dfd6a4efdbb0c04436be819e0', 4),

  ('PROCESS OVERVIEW', 'video', 'Vision Frame Overview Teaching',
   'https://www.loom.com/share/be8f8a7adae244ea927cc2938d07b186', 10),
  ('PROCESS OVERVIEW', 'video', '7 Laws Overview Teaching',
   'https://www.loom.com/share/937fe2b1ae6d4993bd6a73345e108f91', 11),

  ('Mod #1 FUNNEL FUSION', 'video', '1.4 Process Overview Teaching (19 min.)',
   'https://www.loom.com/share/a1572bae6a0f4b31b066f63511bae2f4', 20),
  -- Asana says 12 min.; this Loom is 9. The 12-minute teaching is the one in
  -- Master Teaching Videos.
  ('Mod #1 FUNNEL FUSION', 'video', '1.9 Upper / Lower Room Teaching (9 min.)',
   'https://www.loom.com/share/bbbbc28954d448839fc4fd249a8e3584', 21),
  ('Mod #1 FUNNEL FUSION', 'video', '1.10 Five Eras Training Video for Team Dialogue (29 min.)',
   'https://www.loom.com/share/202dd145c33d4c6e911d494acbf87b77', 22),
  ('Mod #1 FUNNEL FUSION', 'video', '1.11 Funnel Fusion Overview Teaching (5 min.)',
   'https://www.loom.com/share/b42d9b019edd4306897f5ee8fe060615', 23),
  ('Mod #1 FUNNEL FUSION', 'video', '1.13 Problem Statement Training Video for Team Dialogue (7 min.)',
   'https://www.loom.com/share/4b1bfafcef1440299545f52c222f8f64', 24),
  -- The Kairos board links a Drive copy; Pivvot's Loom of the same title
  -- (2:45) plays in place and has a cover.
  ('Mod #1 FUNNEL FUSION', 'video', 'Funnel Fusion Reinforcement Training (< 3 min.)',
   'https://www.loom.com/share/67258650c929480381eefa9ada703ed8', 25),

  ('Mod #2 CROWD CLOUD', 'video', '2.1 Crowd Cloud Overview Teaching',
   'https://www.loom.com/share/87e14978ff174c9baaedb5aebfd2dcd8', 30),
  ('Mod #2 CROWD CLOUD', 'video', '2.11 Mission: Satan''s Loophole Reinforcement Training (6 min.)',
   'https://www.loom.com/share/774ff6bdc7d14734bbabf0041bef5b37', 31),
  ('Mod #2 CROWD CLOUD', 'video', 'The "Future is found in a Few" Reinforcement Training',
   'https://www.loom.com/share/63a29e16f72d40a39486c056f2c68a99', 32),

  ('Mod #3 DISCIPLE''S JOURNEY', 'video', '3.3 Disciple''s Journey Overview Teaching',
   'https://www.loom.com/share/62f247e914c64c76bc6526f5e5d6f25f', 40),

  ('Mod #5 VISION FRAME', 'video', 'Vision Frame Overview Teaching',
   'https://www.loom.com/share/be8f8a7adae244ea927cc2938d07b186', 50),

  ('Mod #6 HORIZON STORYLINE', 'video',
   'God Dreams Preparation Video — Overview of the Horizon Storyline and the 12 Vision Templates',
   'https://www.loom.com/share/3eb7dffa23b04bc19b38d772a68f634e', 60),

  -- The master library, complete on purpose: several repeat a module's video.
  ('Master Teaching Videos', 'video', 'Upper / Lower Room Master Teaching (12 min.)',
   'https://www.loom.com/share/ef1ec3b7a5f646b2b22b1409b34fec60', 70),
  ('Master Teaching Videos', 'video', '7 Laws Overview Teaching',
   'https://www.loom.com/share/937fe2b1ae6d4993bd6a73345e108f91', 71),
  ('Master Teaching Videos', 'video', 'Funnel Fusion Master Teaching (5 min.)',
   'https://www.loom.com/share/b42d9b019edd4306897f5ee8fe060615', 72),
  ('Master Teaching Videos', 'video', 'Crowd Cloud Master Teaching',
   'https://www.loom.com/share/87e14978ff174c9baaedb5aebfd2dcd8', 73),
  ('Master Teaching Videos', 'video', 'Disciple''s Journey Overview Teaching (26 min.)',
   'https://www.loom.com/share/c36ae2d19cdc4c3c9e7db8125af6c26d', 74),
  ('Master Teaching Videos', 'video', 'Vision Frame Master Teaching',
   'https://www.loom.com/share/be8f8a7adae244ea927cc2938d07b186', 75),
  ('Master Teaching Videos', 'video', '12 Vision Templates Overview (Vintage Master Teaching) (29 min.)',
   'https://www.loom.com/share/4c360db95b034b1ca2001254a7fbad68', 76),
  ('Master Teaching Videos', 'video', 'Horizon Storyline Overview (Vintage Master Teaching) (19 min.)',
   'https://www.loom.com/share/392ad79dbed747709cf3106548e06337', 77),
  ('Master Teaching Videos', 'video', 'Future Church Book Overview Teaching',
   'https://www.loom.com/share/daca3da5c9bf485c86667c165ab7f90e', 78)
) as v(section, kind, title, url, position)
where t.slug = 'pivvot-certification'
  and not exists (
    select 1 from template_resources x
     where x.template_id = t.id and x.section = v.section and x.title = v.title
  );

-- ── RunFree staff on every cohort ──────────────────────────────────────────
-- Will co-teaches, so he is an editor here (he can post a session's notes);
-- Brooke follows along. Andrew is the creator of each cohort, so admin and
-- lead through createProject().
insert into template_members (template_id, profile_id, role, org_role, position)
select t.id, p.id, v.role::project_role, v.org_role, v.position
from templates t
cross join (values
  ('will@runfree.co', 'editor', 'Founder and Process Creator', 1),
  ('brooke@runfree.co', 'viewer', 'Executive Director', 2)
) as v(email, role, org_role, position)
join profiles p on lower(p.email) = v.email
where t.slug = 'pivvot-certification'
on conflict (template_id, profile_id) do nothing;
