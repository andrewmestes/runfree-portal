-- Drop Asana's bracket numbering from the Younique titles.
--
-- Andrew: "the 7A, 7B, 8A numbering is not relevant." It was Asana's own
-- ordering scheme — "[7a] Life Line Review", "[8b] Sweet Spot Overview" —
-- and it leaks a tool the client never sees into the thing the client reads.
--
-- Nothing depends on the prefix. `position` already carries the order, it is
-- what getProjectDetail sorts by, and it was populated from this same list in
-- this same sequence, so removing the text changes what a title says and not
-- where it sits.
--
-- Scoped to the Younique template rather than applied globally: Pivvot has no
-- bracket prefixes today, but a future template might use brackets to mean
-- something real, and a blanket regex over every row would eat it silently.

update template_resources tr
set title = regexp_replace(tr.title, '^\[[0-9]+[a-z]?\]\s*', '')
from templates t
where t.id = tr.template_id
  and t.slug = 'younique-lifeplan'
  and tr.title ~ '^\[[0-9]+[a-z]?\]';
