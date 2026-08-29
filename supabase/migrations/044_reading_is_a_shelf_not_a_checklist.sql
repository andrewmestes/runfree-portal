-- Reading & Pre-Work stops being a checklist.
--
-- Andrew: "I'm not sure that I want that to be a checkbox select. I think I
-- want this whole preparation section to just be a standardized visual
-- overview and resource for any church preparing for the Pivvot process."
--
-- Two problems, and the checkbox is only the visible one.
--
-- The first is that a tick-box implies the portal is tracking whether you
-- read the book, which it is not and should not. A "0/4" beside a reading
-- list tells a church they are behind before the first session — the same
-- argument that keeps a denominator off the Vision Stack.
--
-- The second is that these items pointed at nothing. Across the only two
-- churches on this template, Reading & Pre-Work held nine rows and exactly
-- one attached file:
--
--   Future Church — Parts 1 & 3       nothing, on both
--   The 7 Laws Bullet Book            a raw drive.google.com link, on both
--   Problem Statement Deck            a PDF on Athena, nothing on Christ Chapel
--   Option #1 Upper / Lower Room      prose describing a video, on both
--   Option #2 The seven laws          prose describing a video, Christ Chapel only
--
-- The two churches had already drifted apart because `template_prep_items`
-- was EMPTY for this template — nothing was ever stamped, so every project's
-- preparation was typed by hand. That is the actual defect; the checkbox is
-- a symptom.
--
-- So: the group becomes `reading`, which renders a shelf of resources rather
-- than a to-do list, and the template gets the canonical set so the next
-- church inherits it instead of someone retyping it.

begin;

-- 1. The kind. `reading` already exists in the enum (022) and is already used
--    by Younique's "Pre-Reading" — this is the extension point working as
--    designed, not a new concept.
update template_prep_groups
   set kind = 'reading'
 where title = 'Reading & Pre-Work'
   and kind = 'checklist';

-- 2. A first-page image for a file, so a shelf can show a cover rather than a
--    row of identical document glyphs. Nullable: a card without one falls
--    back to a glyph, which is what a freshly uploaded PDF gets until a
--    thumbnail is made for it.
alter table prep_items          add column if not exists thumb_path text;
alter table template_prep_items add column if not exists thumb_path text;

-- 3. Where the canonical copy of a template reading lives.
--
--    Not a storage path: storage RLS recovers the project id from
--    `{project_id}/...` (007), so a template-owned object has no legal home in
--    that bucket. Drive is already the source of truth for Will's material and
--    the portal already holds a service account that can read it, so the
--    template records WHICH Drive file and `scripts/seed-prep-reading.ts`
--    materialises it into a project's own folder — where the existing storage
--    policies apply unchanged.
alter table template_prep_items add column if not exists drive_file_id text;

-- 4. The canonical Reading & Pre-Work set.
--
--    Deliberately not "whatever the two existing churches happen to have
--    between them" — this is the list as Andrew described it, with the two
--    Option rows turned into what they were always describing in prose: the
--    master teaching videos, linked.
insert into template_prep_items (group_id, title, notes, external_url, drive_file_id, position)
select g.id, v.title, v.notes, v.external_url, v.drive_file_id, v.position
  from template_prep_groups g
  cross join (values
    ('Future Church — Part 1',
     'The first section of Will''s book. The seven laws of real church growth, and why attendance stopped being the measure.',
     null, '1TGoqavVVgL3DQtazHKPGmYRVsxudzzPd', 10),
    ('Future Church — Part 3',
     'The closing section. What a church actually changes once it takes the seven laws seriously.',
     null, '1wIh_c_yI795SaB_-R0qtebZvy0ucU7yM', 20),
    ('The 7 Laws Bullet Book',
     'Created as an opportunity to scan and appreciate the 7 Laws without having to read the whole book.',
     null, '1iV_pl9idnMZbdKZWR0cHC0BuboBvEPxD', 30),
    ('Prefer a printed copy?',
     'Future Church: Seven Laws of Real Church Growth, in paperback.',
     'https://www.amazon.com/Future-Church-Seven-Laws-Growth/dp/1540900614', null, 40),
    ('Upper Room / Lower Room — Master Teaching',
     'Watch Will''s master teaching, then force rank your current lower room activity as a team.',
     'https://www.loom.com/share/46ca4a2e6b184bda9f2a746eb3886b78', null, 50),
    ('The 7 Laws of Real Church Growth — Overview',
     'A brief overview of the seven laws. Watch as a team and have each person note which law your church is weakest on.',
     'https://www.loom.com/share/937fe2b1ae6d4993bd6a73345e108f91', null, 60)
  ) as v(title, notes, external_url, drive_file_id, position)
 where g.title = 'Reading & Pre-Work'
   and not exists (
     select 1 from template_prep_items t
      where t.group_id = g.id and t.title = v.title
   );

commit;
