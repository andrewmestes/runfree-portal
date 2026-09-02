-- Executive Coaching, built from the RunFree coaching project structure in
-- Asana (the columns of a live engagement, generalized; none of the client's
-- own content). Andrew, 2 Sept 2026: "pay attention to the column names as
-- inspiration and guidelines. pull every pdf and video link to bring into the
-- template … if a task says vision — just note that we need a vision task
-- with the ability to edit text."
--
-- The placeholder "Meta Performance Coaching" template becomes this one: it
-- had an outline and three guessed prework items, no projects, and Meta
-- Performance is the school of thought behind this coaching (Jaggard's
-- "Beyond High Performance" is the first-month read below), not a different
-- offering.
--
-- How the Asana columns map onto the portal:
--
--   Executive Coaching (onboarding)  → Preparation: Key Dates, Coaching
--                                      Commitments (checklist), Getting to
--                                      Know You (the intake questions, each
--                                      an editable note), Forms and Scheduling
--   1-1 / Completed Sessions          → Sessions, as everywhere
--   Whiteboarding                     → photos on the session they came from
--   Additional Resources              → a process section: the books, as PDFs
--                                      and links
--   Healthy Practices                 → a process section of image cards
--   Deliverables                      → DELIVERABLES groups, one per tool,
--                                      each field an editable item; the
--                                      worksheets as DELIVERABLES resources
--   Optional Life Planning            → a process section: chapters, videos,
--                                      and the fill-in tools, in-section
--   Younique Book by Chapter          → a process section
--
-- Team or one person is the PROJECT's choice from here on (projects.is_group,
-- null = the template's default); this template defaults to one person.
--
-- Files are attached afterwards by scripts/import-template-files.ts, matched
-- on section + title.

alter table projects add column if not exists is_group boolean;

update templates set
  slug = 'executive-coaching',
  name = 'Executive Coaching',
  description = 'Executive coaching for one leader or a team: onboarding, sessions, the deliverables built along the way, the performance practices, and the optional Younique life-planning tools.',
  is_group = false,
  voice = 'organization',
  process_kind = 'sections',
  has_vision_stack = false,
  structure = jsonb_build_object('sections', jsonb_build_array(
    'Coaching Sessions', 'Healthy Practices', 'Additional Resources',
    'Optional Life Planning', 'Younique Book by Chapter'))
where slug = 'meta-performance-coaching';

-- The placeholder groups and their guessed items.
delete from template_prep_items i using template_prep_groups g, templates t
 where i.group_id = g.id and g.template_id = t.id and t.slug = 'executive-coaching';
delete from template_prep_groups g using templates t
 where g.template_id = t.id and t.slug = 'executive-coaching';
delete from template_resources r using templates t
 where r.template_id = t.id and t.slug = 'executive-coaching';

insert into template_prep_groups (template_id, section, key, title, description, kind, position)
select t.id, v.section, v.key, v.title, v.description, v.kind::prep_group_kind, v.position
from templates t
cross join (values
  -- Preparation
  ('PREPARATION', 'ec-key-dates', 'Key Dates', 'Session days and deadlines.', 'dates', 1),
  ('PREPARATION', 'ec-commitments', 'Coaching Commitments',
   'What we each agree to before the first session. Tick each one you can say yes to.', 'checklist', 2),
  ('PREPARATION', 'ec-getting-to-know-you', 'Getting to Know You',
   'Your coach reads these before the first session. Answer in your own words, and edit any time.', 'notes', 3),
  ('PREPARATION', 'ec-forms', 'Forms and Scheduling',
   'The onboarding survey, the feedback form, and where to book time with your coach.', 'notes', 4),
  -- Team
  ('TEAM', 'ec-profiles', 'Assessments and Profiles',
   'Upload your Insights, StrengthsFinder, APEST and Working Genius reports here. The anchor-phrase deliverables draw on them.', 'files', 5),
  -- Deliverables, in the order the coaching works through them
  ('DELIVERABLES', 'ec-thrill-professional', 'Professional: Top 5 Thrill List',
   'Your vision for your professional life a year from now, as five distinct aspirations.', 'notes', 10),
  ('DELIVERABLES', 'ec-thrill-personal', 'Personal: Top 5 Thrill List',
   'Your vision for your personal life a year from now, as five distinct aspirations.', 'notes', 11),
  ('DELIVERABLES', 'ec-role-description', 'Role Description',
   'Your top three Key Responsibility Areas (KRAs), then the five Get Out of Bed Questions (GOOBQs) that drive them.', 'notes', 12),
  ('DELIVERABLES', 'ec-chronic-complaints', 'Chronic Complaints: Top 5',
   'Your five most persistent complaints, professional or personal.', 'notes', 13),
  ('DELIVERABLES', 'ec-storyboard', 'YQ: 6-Sketch Storyboard',
   'The six most important events or experiences that made the leader you are today. Attach a photo of your storyboard, give it a title of six words or fewer, and describe each sketch in a sentence or two.', 'notes', 14),
  ('DELIVERABLES', 'ec-insights', 'YQ: Insights Assessment + Anchor Phrases',
   'Attach your Insights report under Team, then write six anchor statements — truths about yourself that best represent you and resonate deeply.', 'notes', 15),
  ('DELIVERABLES', 'ec-strengths', 'YQ: StrengthsFinder + Anchor Phrases',
   'Attach your Top 5 Strengths report under Team, then write three anchor statements from any of the five.', 'notes', 16),
  ('DELIVERABLES', 'ec-apest', 'YQ: APEST Assessment + Anchor Phrases',
   'Attach your APEST report under Team, then write two anchor statements.', 'notes', 17),
  ('DELIVERABLES', 'ec-motivators', 'YQ: Workplace Motivators',
   'Using the Workplace Motivators sheet, choose the five ideas that most motivate you at work.', 'notes', 18),
  ('DELIVERABLES', 'ec-activator-advantage', 'YQ: Activator + Advantage',
   'Read pages 82–83 of Younique on CONTEXT with the Activator–Advantage sheet. Rank the three activators (Command, Creativity, Contribution) and the three advantages (Ideas, Things, People).', 'notes', 19),
  ('DELIVERABLES', 'ec-life-stage', 'YQ: Life Stage',
   'Read the Life Stage Identification sheet and answer the two questions at the bottom of the page.', 'notes', 20),
  ('DELIVERABLES', 'ec-passion-funnel', 'YQ: Passion Funnel',
   'Read the PASSION chapter of Younique and fill in the funnel.', 'notes', 21),
  ('DELIVERABLES', 'ec-offenders', 'YQ: Offenders',
   'Read the PASSION chapter of Younique and name what offends you — and the value each one reveals.', 'notes', 22),
  -- Optional Life Planning: the fill-in tools, shown inside that section
  ('Optional Life Planning', 'ec-life-lies', 'Life Lies and Truths',
   'Younique pages 52–54, in the PASSION chapter. Which Life Lie are you tempted to believe, and what is the Gospel truth you will preach to yourself?', 'notes', 30),
  ('Optional Life Planning', 'ec-name-meaning', 'Name Meaning',
   'Younique pages 61–63, in the ABILITY chapter. Look up the meanings of your first, middle, last and maiden names, and any nicknames, then string them into a narrative. Use poetic licence.', 'notes', 31),
  ('Optional Life Planning', 'ec-signature-scripture', 'Signature Scripture', 'Chapter 8, BULLS-EYE.', 'notes', 32),
  ('Optional Life Planning', 'ec-big-sentence', 'Big Sentence', 'Chapter 8, BULLS-EYE. One clause at a time.', 'notes', 33),
  ('Optional Life Planning', 'ec-two-words', 'Two Words', 'Chapter 8, BULLS-EYE.', 'notes', 34),
  ('Optional Life Planning', 'ec-lifecall', 'LifeCall', 'Chapter 10, MISSION.', 'notes', 35),
  ('Optional Life Planning', 'ec-lifecore', 'LifeCore', 'Chapter 11, VALUES. Your four LifeCore values.', 'notes', 36),
  ('Optional Life Planning', 'ec-lifescore', 'LifeScore (Storylines)', 'Chapter 12, MEASURES. Your four storylines.', 'notes', 37),
  ('Optional Life Planning', 'ec-lifesteps', 'LifeSteps',
   'Chapter 13, STRATEGY. For each storyline, the role you are stepping into or the resource you are increasing in the next 90 days — physical, spiritual, relational, financial or intellectual capital.', 'notes', 38),
  ('Optional Life Planning', 'ec-three-year-dream', 'My 3-Year Dream (Beyond the Horizon)',
   'Chapter 15, THREE YEARS FROM NOW. An image, a shorthand statement, and vivid description bullets — add as many as you need.', 'notes', 39)
) as v(section, key, title, description, kind, position)
where t.slug = 'executive-coaching'
on conflict (template_id, key) do update
  set section = excluded.section, title = excluded.title, description = excluded.description,
      kind = excluded.kind, position = excluded.position;

insert into template_prep_items (group_id, title, notes, external_url, position)
select g.id, v.title, v.notes, v.url, v.position
from template_prep_groups g
join templates t on t.id = g.template_id
join (values
  ('ec-commitments', 'Who''s the boss? Not you. Not me. Your potential self. Agree?', null, null, 1),
  ('ec-commitments', 'Be on time — no more than one minute late.', null, null, 2),
  ('ec-commitments', 'Complete a five-minute evaluation within 24 hours when asked, by text.', null, null, 3),
  ('ec-commitments', 'Use the portal to track progress.', null, null, 4),
  ('ec-commitments', 'Be disrupted out of fierce advocacy during our sessions.', null, null, 5),
  ('ec-commitments', 'Fully participate: become who you need to become to create what you are committed to create.', null, null, 6),
  ('ec-commitments', 'Complete 100% of the commitments you make.', null, null, 7),

  ('ec-getting-to-know-you', 'What is your birthday?', null, null, 1),
  ('ec-getting-to-know-you', 'What is your occupation?', null, null, 2),
  ('ec-getting-to-know-you', 'Do you have kids?', null, null, 3),
  ('ec-getting-to-know-you', 'What are the three biggest changes you are committed to making in your life in the next three months?', null, null, 4),
  ('ec-getting-to-know-you', 'What is the hardest thing in your life you have had to overcome?', null, null, 5),
  ('ec-getting-to-know-you', 'Have you worked with a coach before?', null, null, 6),
  ('ec-getting-to-know-you', 'Have you had any major transitions in the last two years?', null, null, 7),
  ('ec-getting-to-know-you', 'What is your favorite sweet treat?', null, null, 8),
  ('ec-getting-to-know-you', 'What do you like to do in your free time?', null, null, 9),
  ('ec-getting-to-know-you', 'What is your favorite vacation spot?', null, null, 10),
  ('ec-getting-to-know-you', 'How do you typically get in your own way?', null, null, 11),
  ('ec-getting-to-know-you', 'Who are the key people in your life, and what do they provide for you?', null, null, 12),
  ('ec-getting-to-know-you', 'On a scale of 1 to 10, how much stress is in your life right now?', null, null, 13),
  ('ec-getting-to-know-you', 'What are your primary stressors?', null, null, 14),
  ('ec-getting-to-know-you', 'What motivates you?', null, null, 15),
  ('ec-getting-to-know-you', 'If you reach the age of 95, what regrets do you think you will have?', null, null, 16),

  ('ec-forms', 'Complete the onboarding survey', 'Before the first session.', 'https://iesjab5ewat.typeform.com/to/xNSxvyy8', 1),
  ('ec-forms', 'Send feedback after a session', 'The five-minute evaluation, whenever your coach asks for it.', 'https://iesjab5ewat.typeform.com/thrillform', 2),
  ('ec-forms', 'Book your next session', 'Your coach adds their scheduling link here.', null, 3),
  ('ec-forms', 'Join the coaching call', 'Your coach adds the video-call link here.', null, 4),

  ('ec-thrill-professional', 'Vision point #1', null, null, 1),
  ('ec-thrill-professional', 'Vision point #2', null, null, 2),
  ('ec-thrill-professional', 'Vision point #3', null, null, 3),
  ('ec-thrill-professional', 'Vision point #4', null, null, 4),
  ('ec-thrill-professional', 'Vision point #5', null, null, 5),
  ('ec-thrill-personal', 'Vision point #1', null, null, 1),
  ('ec-thrill-personal', 'Vision point #2', null, null, 2),
  ('ec-thrill-personal', 'Vision point #3', null, null, 3),
  ('ec-thrill-personal', 'Vision point #4', null, null, 4),
  ('ec-thrill-personal', 'Vision point #5', null, null, 5),
  ('ec-role-description', 'KRA #1', null, null, 1),
  ('ec-role-description', 'KRA #2', null, null, 2),
  ('ec-role-description', 'KRA #3', null, null, 3),
  ('ec-role-description', 'GOOBQ #1', null, null, 4),
  ('ec-role-description', 'GOOBQ #2', null, null, 5),
  ('ec-role-description', 'GOOBQ #3', null, null, 6),
  ('ec-role-description', 'GOOBQ #4', null, null, 7),
  ('ec-role-description', 'GOOBQ #5', null, null, 8),
  ('ec-chronic-complaints', 'Chronic complaint #1', null, null, 1),
  ('ec-chronic-complaints', 'Chronic complaint #2', null, null, 2),
  ('ec-chronic-complaints', 'Chronic complaint #3', null, null, 3),
  ('ec-chronic-complaints', 'Chronic complaint #4', null, null, 4),
  ('ec-chronic-complaints', 'Chronic complaint #5', null, null, 5),
  ('ec-storyboard', 'Storyboard title (six words or fewer)', null, null, 1),
  ('ec-storyboard', 'Sketch #1', null, null, 2),
  ('ec-storyboard', 'Sketch #2', null, null, 3),
  ('ec-storyboard', 'Sketch #3', null, null, 4),
  ('ec-storyboard', 'Sketch #4', null, null, 5),
  ('ec-storyboard', 'Sketch #5', null, null, 6),
  ('ec-storyboard', 'Sketch #6', null, null, 7),
  ('ec-insights', 'Anchor sentence #1, from the overview', null, null, 1),
  ('ec-insights', 'Anchor sentence #2, from the overview', null, null, 2),
  ('ec-insights', 'Anchor sentence #1, from the strengths page', null, null, 3),
  ('ec-insights', 'Anchor sentence #2, from the strengths page', null, null, 4),
  ('ec-insights', 'Anchor sentence #1, from the value-to-the-team page', null, null, 5),
  ('ec-insights', 'Anchor sentence #2, from the value-to-the-team page', null, null, 6),
  ('ec-strengths', 'Anchor statement #1', null, null, 1),
  ('ec-strengths', 'Anchor statement #2', null, null, 2),
  ('ec-strengths', 'Anchor statement #3', null, null, 3),
  ('ec-apest', 'Anchor statement #1', null, null, 1),
  ('ec-apest', 'Anchor statement #2', null, null, 2),
  ('ec-motivators', 'Motivator #1', null, null, 1),
  ('ec-motivators', 'Motivator #2', null, null, 2),
  ('ec-motivators', 'Motivator #3', null, null, 3),
  ('ec-motivators', 'Motivator #4', null, null, 4),
  ('ec-motivators', 'Motivator #5', null, null, 5),
  ('ec-activator-advantage', 'Activator #1', null, null, 1),
  ('ec-activator-advantage', 'Activator #2', null, null, 2),
  ('ec-activator-advantage', 'Activator #3', null, null, 3),
  ('ec-activator-advantage', 'Advantage #1', null, null, 4),
  ('ec-activator-advantage', 'Advantage #2', null, null, 5),
  ('ec-activator-advantage', 'Advantage #3', null, null, 6),
  ('ec-life-stage', 'My current life stage', null, null, 1),
  ('ec-life-stage', 'Is there anything keeping me from progressing?', null, null, 2),
  ('ec-passion-funnel', 'Interested in…', null, null, 1),
  ('ec-passion-funnel', 'Excited about…', null, null, 2),
  ('ec-passion-funnel', 'Driven by…', null, null, 3),
  ('ec-passion-funnel', 'Burdened for…', null, null, 4),
  ('ec-offenders', 'Offender #1', null, null, 1),
  ('ec-offenders', 'The opposite of offender #1 — what value does it reveal?', null, null, 2),
  ('ec-offenders', 'Offender #2', null, null, 3),
  ('ec-offenders', 'The opposite of offender #2 — what value does it reveal?', null, null, 4),
  ('ec-offenders', 'Offender #3', null, null, 5),
  ('ec-offenders', 'The opposite of offender #3 — what value does it reveal?', null, null, 6),
  ('ec-offenders', 'Offender #4', null, null, 7),
  ('ec-offenders', 'The opposite of offender #4 — what value does it reveal?', null, null, 8),

  ('ec-life-lies', 'The lie about life', null, null, 1),
  ('ec-life-lies', 'The lie about me', null, null, 2),
  ('ec-life-lies', 'The lie about God', null, null, 3),
  ('ec-life-lies', 'The Gospel truth, and how I will preach it to myself', null, null, 4),
  ('ec-name-meaning', 'My first name', null, null, 1),
  ('ec-name-meaning', 'My middle name', null, null, 2),
  ('ec-name-meaning', 'My last name', null, null, 3),
  ('ec-name-meaning', 'Other names — maiden name, nicknames', null, null, 4),
  ('ec-name-meaning', 'My name-meaning sequence', null, null, 5),
  ('ec-signature-scripture', 'My signature scripture', null, null, 1),
  ('ec-big-sentence', 'I was created to honor God and help others by…', null, null, 1),
  ('ec-big-sentence', '…leveraging my abilities to…', null, null, 2),
  ('ec-big-sentence', '…with a deep passion for…', null, null, 3),
  ('ec-big-sentence', '…in the ideal context of…', null, null, 4),
  ('ec-two-words', 'I exist to honor God and help others by ________ing ________.', null, null, 1),
  ('ec-lifecall', 'My two-word sweet spot', null, null, 1),
  ('ec-lifecall', 'My six-word mission', null, null, 2),
  ('ec-lifecall', 'My LifeCall', null, null, 3),
  ('ec-lifecore', 'My LifeCore #1', null, null, 1),
  ('ec-lifecore', 'My LifeCore #2', null, null, 2),
  ('ec-lifecore', 'My LifeCore #3', null, null, 3),
  ('ec-lifecore', 'My LifeCore #4', null, null, 4),
  ('ec-lifescore', 'My storyline #1', null, null, 1),
  ('ec-lifescore', 'My storyline #2', null, null, 2),
  ('ec-lifescore', 'My storyline #3', null, null, 3),
  ('ec-lifescore', 'My storyline #4', null, null, 4),
  ('ec-lifesteps', 'My role or resource for storyline #1', null, null, 1),
  ('ec-lifesteps', 'My role or resource for storyline #2', null, null, 2),
  ('ec-lifesteps', 'My role or resource for storyline #3', null, null, 3),
  ('ec-lifesteps', 'My role or resource for storyline #4', null, null, 4),
  ('ec-three-year-dream', 'The image or picture that reminds me of my 3-year dream', null, null, 1),
  ('ec-three-year-dream', 'My shorthand: a phrase or short sentence that sums it up', null, null, 2),
  ('ec-three-year-dream', 'Vivid description #1', null, null, 3),
  ('ec-three-year-dream', 'Vivid description #2', null, null, 4),
  ('ec-three-year-dream', 'Vivid description #3', null, null, 5)
) as v(key, title, notes, url, position) on v.key = g.key
where t.slug = 'executive-coaching';

-- Resources: the books, the practice cards, the chapters and videos, and the
-- deliverable worksheets. Rows only; the import script attaches the files.
insert into template_resources (template_id, section, kind, title, description, external_url, position)
select t.id, v.section, v.kind::template_resource_kind, v.title, v.description, v.url, v.position
from templates t
cross join (values
  ('Additional Resources', 'link', 'Beyond High Performance — Jason Jaggard',
   'Highly recommended in your first month of coaching. Buy the book.', 'https://amzn.to/47CJQ6N', 1),
  ('Additional Resources', 'link', 'Jason Jaggard on Beyond High Performance',
   'An interview on the book, from C-Suite Conversations with Scott Miller.',
   'https://resources.franklincovey.com/c-suite-conversations-with-scott-miller/73-jason-jaggard', 2),
  ('Additional Resources', 'handout', 'The Three Laws of Performance — executive summary',
   'Highly recommended by your third month of coaching.', null, 3),
  ('Additional Resources', 'handout', 'Straight-Line Leadership — chapters 1–6 and the inner-stance contrasts', null, null, 4),
  ('Additional Resources', 'handout', 'Clarity Spiral — Will Mancini',
   'The four break-through practices to find the one thing you are called to do.', null, 5),
  ('Additional Resources', 'handout', 'Rocket Fuel — chapter 1', null, null, 6),

  ('Healthy Practices', 'handout', 'Occurrence', null, null, 1),
  ('Healthy Practices', 'handout', 'Affirmation', null, null, 2),
  ('Healthy Practices', 'handout', 'Invitation and On the Hook', null, null, 3),
  ('Healthy Practices', 'handout', 'Commitment', null, null, 4),
  ('Healthy Practices', 'handout', 'Feedback: Giving', null, null, 5),
  ('Healthy Practices', 'handout', 'Feedback: Receiving', null, null, 6),
  ('Healthy Practices', 'handout', 'Trust Process', 'For team members, when a commitment is broken.', null, 7),
  ('Healthy Practices', 'handout', 'Growth Process', 'How you grow when you break a commitment.', null, 8),

  ('Optional Life Planning', 'handout', 'LifePlan Snapshot template',
   'The plan on a page — the finish line every tool in this section works toward. Chapter 19 explains it.', null, 1),
  ('Optional Life Planning', 'handout', 'Younique chapter 19 — Snapshot', null, null, 2),
  ('Optional Life Planning', 'exercise', 'The Life Discovery Grid',
   'Start with the first video below; the other two go deeper.', null, 3),
  ('Optional Life Planning', 'exercise', 'Life Discovery Grid worksheet', null, null, 4),
  ('Optional Life Planning', 'video', 'Life Discovery Grid — start here', null,
   'https://www.loom.com/share/543af7d142f24ddda7c00ef4bc4d544e', 5),
  ('Optional Life Planning', 'video', 'Life Discovery Grid — teaching 2', null,
   'https://www.loom.com/share/c0ff79336faa41d7890a258b07cc70a4', 6),
  ('Optional Life Planning', 'video', 'Life Discovery Grid — teaching 3', null,
   'https://www.loom.com/share/11be89e3243343d8a38cad64a4cd12bc', 7),
  ('Optional Life Planning', 'handout', 'Younique chapter 8 — Bulls-Eye',
   'For Signature Scripture, Big Sentence and Two Words.', null, 8),
  ('Optional Life Planning', 'handout', 'Younique chapter 9 — Clarity',
   'The four sides of the Vision Frame — LifeCall, LifeCore, LifeSteps, LifeScore — one chapter each.', null, 9),
  ('Optional Life Planning', 'handout', 'Younique chapter 10 — Mission', null, null, 10),
  ('Optional Life Planning', 'handout', 'Younique chapter 11 — Values', null, null, 11),
  ('Optional Life Planning', 'handout', 'Younique chapter 12 — Measures', null, null, 12),
  ('Optional Life Planning', 'handout', 'Younique chapter 13 — Strategy', null, null, 13),
  ('Optional Life Planning', 'handout', 'Younique chapter 14 — Dream',
   'The Horizon Storyline: chapters 14 to 18, and the bucket list.', null, 14),
  ('Optional Life Planning', 'handout', 'Younique chapter 15 — Three Years From Now', null, null, 15),
  ('Optional Life Planning', 'handout', 'Younique chapter 16 — One Year From Now', null, null, 16),
  ('Optional Life Planning', 'handout', 'Younique chapter 17 — Ninety Days From Now', null, null, 17),
  ('Optional Life Planning', 'handout', 'Younique chapter 18 — Now', null, null, 18),
  ('Optional Life Planning', 'handout', 'Younique chapter 25 — Bucket List', null, null, 19),

  ('Younique Book by Chapter', 'handout', 'Younique chapter 2 — You',
   'Designing the Life God Dreamed for You — Will Mancini.', null, 1),
  ('Younique Book by Chapter', 'handout', 'Younique chapter 3 — Climb', null, null, 2),

  ('DELIVERABLES', 'handout', 'Workplace Motivators', 'For YQ: Workplace Motivators.', null, 1),
  ('DELIVERABLES', 'handout', 'Activator–Advantage', 'For YQ: Activator + Advantage.', null, 2),
  ('DELIVERABLES', 'handout', 'Life Stage Identification', 'For YQ: Life Stage.', null, 3),
  ('DELIVERABLES', 'handout', 'Passion Funnel', 'For YQ: Passion Funnel.', null, 4),
  ('DELIVERABLES', 'handout', 'Offenders', 'For YQ: Offenders.', null, 5)
) as v(section, kind, title, description, url, position)
where t.slug = 'executive-coaching';

insert into template_members (template_id, profile_id, role, org_role, position)
select t.id, p.id, 'viewer'::project_role, 'Executive Coach', 1
from templates t
join profiles p on lower(p.email) = 'brooke@runfree.co'
where t.slug = 'executive-coaching'
on conflict do nothing;
