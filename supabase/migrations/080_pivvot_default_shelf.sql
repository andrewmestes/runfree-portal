-- 080 — the Pivvot template opens on the shelf Andrew actually built.
--
-- Athena's Read & Watch shelf is the best-curated thing in the portal: the
-- three parts of Future Church, the four orientation videos, and the
-- Preparation Checklist — exactly the Reading & Pre-Work group, made visual.
-- The template seeded one item, so the next church would have started with a
-- near-empty shelf and someone would have rebuilt this by hand.
--
-- Three libraries are involved (books, template resources, Drive handouts),
-- which is why `seedDefaultHighlights` had to learn all three before this
-- list could mean anything. Each string below was checked against live Drive
-- and the template's own rows; the shortest match wins, so they are the
-- shortest strings that are still unambiguous.
update templates
   set ui = coalesce(ui, '{}'::jsonb)
            || jsonb_build_object(
                 'default_highlights',
                 jsonb_build_array(
                   'Future Church Part 1',
                   '7 Laws Bullet Book',
                   'Future Church Part 3',
                   'Ted Talk',
                   'Why did I write the book',
                   '7 Laws Overview Teaching',
                   '5 Eras Training Video',
                   'Preparation Checklist'
                 )
               )
 where slug = 'pivvot-vision-framing';

-- Christ Chapel gets the same shelf, so the two engagements and the template
-- all say the same thing. Copied from Athena rather than re-derived: same
-- Drive ids, same titles, same order, and anything Christ Chapel already has
-- keeps its place at the front.
insert into project_highlights
  (project_id, source_kind, source_id, title, media_kind, external_url, file_path,
   file_name, file_mime, file_size, thumb_path, thumb_url, position)
select cc.id, a.source_kind, a.source_id, a.title, a.media_kind, a.external_url, a.file_path,
       a.file_name, a.file_mime, a.file_size, a.thumb_path, a.thumb_url,
       (select coalesce(max(h.position) + 1, 0) from project_highlights h where h.project_id = cc.id)
         + row_number() over (order by a.position) - 1
  from project_highlights a
  join projects ath on ath.id = a.project_id and ath.name like 'Athena%'
 cross join lateral (select id from projects where name like 'Christ Chapel%') cc
 where not exists (
   select 1 from project_highlights h
    where h.project_id = cc.id
      and h.source_kind = a.source_kind
      and h.source_id is not distinct from a.source_id
 );

-- "Chapter 15 — Measures" says nothing about which book it is a chapter of.
-- A highlight row keeps only its title (`context` is dropped when it is
-- stored), so the card on the dashboard was a chapter of nothing. New rows
-- carry the book's name from `bookEntry`; this is the one that predates it.
update project_highlights
   set title = 'Church Unique — Chapter 15 — Measures'
 where source_kind = 'book'
   and title = 'Chapter 15 — Measures';
