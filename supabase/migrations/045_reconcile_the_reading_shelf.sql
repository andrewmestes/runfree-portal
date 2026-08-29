-- Reconcile Reading & Pre-Work after 044.
--
-- 044 was written on a wrong reading of the data. I queried
-- `template_prep_items` filtered by `template_id` — a column that table does
-- not have (it hangs off `group_id`) — got nothing back, and concluded the
-- template had never been seeded. It had. 044's guarded insert then landed six
-- new rows alongside five existing ones that say some of the same things in
-- older words.
--
-- The correction is here rather than in 044 because 044 is already applied;
-- rewriting it would leave the file disagreeing with what the database
-- actually ran.
--
-- What was already there, and why each one goes or stays:
--
--   "Future Church — Parts 1 & 3"   → replaced. One row cannot hold two PDFs,
--                                     and its link was an Amazon *search*.
--   "Option #1 — Upper Room…"       → replaced. Prose describing a video,
--   "Option #2 — The seven laws…"   → replaced. now the video itself.
--   "The 7 Laws Bullet Book"        → kept, and pointed at Drive instead of a
--                                     raw drive.google.com link that sends a
--                                     church out of the portal.
--   "Problem Statement Deck"        → kept, and given its Drive id. Athena's
--                                     uploaded copy is 2,696,693 bytes and so
--                                     is this file: the same document.

begin;

-- The three superseded rows. Named exactly, so this cannot take anything else.
delete from template_prep_items t
 using template_prep_groups g
 where g.id = t.group_id
   and g.title = 'Reading & Pre-Work'
   and t.title in (
     'Future Church — Parts 1 & 3',
     'Option #1 — Upper Room / Lower Room',
     'Option #2 — The seven laws of real church growth'
   );

-- The bullet book keeps its row (and its wording, which is Andrew's) but stops
-- being a link out to Drive. Clearing external_url matters: the renderer
-- prefers a link over a file, so leaving it set would keep sending people to
-- Drive even once the PDF is attached.
update template_prep_items t
   set drive_file_id = '1iV_pl9idnMZbdKZWR0cHC0BuboBvEPxD',
       external_url  = null,
       position      = 30
  from template_prep_groups g
 where g.id = t.group_id
   and g.title = 'Reading & Pre-Work'
   and t.title = 'The 7 Laws Bullet Book';

update template_prep_items t
   set drive_file_id = '1ht5mUydl1bg4EO_gb4BxfDl6yvGRMvf4',
       position      = 70
  from template_prep_groups g
 where g.id = t.group_id
   and g.title = 'Reading & Pre-Work'
   and t.title = 'Problem Statement Deck';

commit;
