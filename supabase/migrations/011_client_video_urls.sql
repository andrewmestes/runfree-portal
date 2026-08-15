-- Point the Pivvot template's video rows at the real Loom recordings.
--
-- Andrew: "we may need to duplicate, probably will need to duplicate, the
-- location of the videos so that clients can see them and certified people
-- can see them... The primary difference would be the branding of the
-- handouts and also the Digital Facilitators Guide. Our typical clients do
-- not get access to that."
--
-- So the *rows* are duplicated — this portal owns its own template_resources
-- and can diverge freely — but the *URLs* are read from training_videos at
-- migration time rather than pasted in. Re-running this after a video is
-- re-recorded in the CVF library picks up the new link instead of silently
-- keeping a dead one. training_videos stays CVF's table; this only reads it.
--
-- Matching is an explicit (section, client title, video title) map, not fuzzy
-- string similarity. The two libraries name things differently on purpose —
-- "Why did I write the book (< 3 min.)" here vs "Why I Wrote the Book" there
-- — and a fuzzy match that silently pairs the wrong two recordings is worse
-- than no match at all.

do $$
declare
  v_template_id uuid;
  v_matched int;
  v_unmatched int;
begin
  select id into v_template_id from public.templates where slug = 'pivvot-vision-framing';
  if v_template_id is null then
    raise exception 'pivvot-vision-framing template not found — run seed.sql first';
  end if;

  create temp table video_map (section text, client_title text, video_title text) on commit drop;

  insert into video_map (section, client_title, video_title) values
    ('CHURCH PREPARATION', 'Orientation Video: Future Church "Ted Talk" (19 min.)', 'Future Church "Ted Talk"'),
    ('CHURCH PREPARATION', 'Orientation Video: Future Church Backstory (< 2 min.)', 'Future Church Backstory'),
    ('CHURCH PREPARATION', 'Orientation Video: Why did I write the book (< 3 min.)', 'Why I Wrote the Book'),
    ('CHURCH PREPARATION', 'Orientation Video: Leading Church Testimony - Long Hollow (< 4 min.)', 'Leading Church Testimony — Long Hollow'),
    ('PROCESS OVERVIEW', 'Process Overview Teaching (19 min.)', 'Process Overview Teaching'),
    ('PROCESS OVERVIEW', '7 Laws Overview Teaching', '7 Laws Overview Teaching'),
    ('Mod #1 FUNNEL FUSION', 'Funnel Fusion Overview Teaching (5 min.)', 'Funnel Fusion Overview Teaching'),
    ('Mod #1 FUNNEL FUSION', '5 Era''s Training Video for Team Dialogue (29 min.)', '5 Eras Training Video for Team Dialogue'),
    ('Mod #1 FUNNEL FUSION', 'Problem Statement Training Video for Team Dialogue (7 min.)', 'Problem Statement Training for Team Dialogue'),
    ('Mod #1 FUNNEL FUSION', 'Funnel Fusion Reinforcement Training (< 3 min.)', 'Funnel Fusion Reinforcement Training'),
    ('Mod #2 CROWD CLOUD', 'Crowd Cloud Overview Teaching', 'Crowd Cloud Overview Teaching'),
    ('Mod #2 CROWD CLOUD', 'The "Future is found in a Few" Reinforcement Training', 'The Future Is Found in a Few'),
    ('Mod #2 CROWD CLOUD', 'Satan''s Loophole Reinforcement Training (6 min.)', 'Satan''s Loophole Reinforcement Training'),
    ('Mod #3 DISCIPLE''S JOURNEY', 'Disciple''s Journey Overview Teaching (60 min.)', 'Disciple''s Journey Overview Teaching'),
    ('Mod #5 VISION FRAME', 'Vision Frame Overview Teaching', 'Vision Frame Overview Teaching'),
    ('Mod #6 HORIZON STORYLINE', 'God Dreams Preparation Video — Overview of the Horizon Storyline and the 12 Vision Templates', 'God Dreams Preparation Video');

  update public.template_resources tr
  set external_url = tv.url
  from video_map vm
  join public.training_videos tv on tv.title = vm.video_title and tv.is_published
  where tr.template_id = v_template_id
    and tr.kind = 'video'
    and tr.section = vm.section
    and tr.title = vm.client_title;

  get diagnostics v_matched = row_count;

  -- Three recordings exist in the CVF library but had no row here, because
  -- Asana filed them under "Master Teaching Videos" — a section deliberately
  -- not carried over (see seed.sql). They belong with their module for a
  -- client, who has no separate videos page to find them on.
  insert into public.template_resources (template_id, section, kind, title, external_url, position)
  select v_template_id, m.section, 'video'::template_resource_kind, tv.title, tv.url, m.position
  from (values
    ('Mod #1 FUNNEL FUSION', 'Upper / Lower Room Master Teaching', 900),
    ('Mod #6 HORIZON STORYLINE', 'Horizon Storyline Overview', 901),
    ('Mod #6 HORIZON STORYLINE', '12 Vision Templates Overview', 902)
  ) as m(section, video_title, position)
  join public.training_videos tv on tv.title = m.video_title and tv.is_published
  where not exists (
    select 1 from public.template_resources existing
    where existing.template_id = v_template_id
      and existing.section = m.section
      and existing.title = tv.title
  );

  select count(*) into v_unmatched
  from public.template_resources
  where template_id = v_template_id and kind = 'video' and external_url is null;

  raise notice 'Linked % video rows; % still have no URL', v_matched, v_unmatched;
end $$;
