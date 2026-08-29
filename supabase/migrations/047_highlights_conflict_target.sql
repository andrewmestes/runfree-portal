-- The unique index has to be inferable by ON CONFLICT.
--
-- 046 made it partial (`where source_id is not null`) so uploads, which have
-- no source, would not collide with each other. But Postgres can only infer a
-- partial index for ON CONFLICT when the statement repeats its predicate, and
-- PostgREST's upsert does not — so every multi-select add failed with "no
-- unique or exclusion constraint matching the ON CONFLICT specification" and
-- silently added nothing. Found by driving the picker, not by reading it.
--
-- A plain unique index is the right answer and the partial one was never
-- needed: NULLs are distinct in a Postgres unique index, so any number of
-- uploads with a null source_id coexist happily.
drop index if exists idx_project_highlights_unique;

create unique index idx_project_highlights_unique
  on project_highlights(project_id, source_kind, source_id);
