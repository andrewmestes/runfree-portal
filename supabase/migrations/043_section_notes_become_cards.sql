-- The per-module notes become cards.
--
-- "Notes & homework" was a single free-text field hanging off a module, and
-- it has been removed from the module panel — Andrew: "If we do that, we can
-- remove 'homework & Next Steps' and 'notes & Homework' from this area."
--
-- The text is not dropped with the component. There was exactly one row in
-- production, 1,297 characters of the Expectations Exercise on Funnel Fusion
-- for Christ Chapel, and it is precisely the thing Andrew described wanting
-- inside a card: "I was in person with them when running the Expectations
-- exercise. I have a chart image of that, but I'd want the text added inside
-- that card."
--
-- So each note becomes a card — a `deliverables` row of kind session_image,
-- in the same module, with the prose in `body` (migration 042). The chart
-- image is attached separately by scripts/import-asana-cards.ts, which pulls
-- it from the Asana task of the same name.
--
-- Same restraint as 040 and 041: `section_notes` rows are NOT deleted. The
-- app simply stops reading them. Dropping the table is a later decision.
--
-- Idempotent: it will not run twice, because the guard checks for a card
-- already carrying the same title in the same section.

insert into deliverables (project_id, section, kind, title, body, position)
select
  n.project_id,
  n.section,
  'session_image',
  'Notes from this module',
  n.body,
  coalesce(
    (select max(d.position) from deliverables d where d.project_id = n.project_id),
    -1
  ) + 1
from section_notes n
where n.body is not null
  and btrim(n.body) <> ''
  and not exists (
    select 1 from deliverables d
    where d.project_id = n.project_id
      and d.section is not distinct from n.section
      and d.title = 'Notes from this module'
  );
