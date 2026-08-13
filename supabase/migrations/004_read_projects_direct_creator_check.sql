-- can_see_project()'s new created_by clause (003) requires a self-join back
-- onto `projects` — fine for sessions/deliverables' policies, which check a
-- DIFFERENT table's project_id, but broken for read_projects itself: during
-- `insert into projects (...) returning *`, Postgres evaluates the RETURNING
-- row against the table's SELECT policy within the same command that
-- inserted it, and a subquery that re-reads `projects` can't see that row
-- yet (no CommandCounterIncrement between the insert and its own RETURNING
-- check). Confirmed directly against the live project: the same insert
-- succeeds without RETURNING, and a plain SELECT in a later statement sees
-- the row and can_see_project() returns true for it — it's specifically the
-- same-command self-reference that fails.
--
-- Fix: check created_by as a plain column on the row itself first — no
-- subquery, so no self-reference problem — and fall back to
-- can_see_project() for every other case.

drop policy if exists read_projects on projects;

create policy read_projects on projects
  for select using (
    created_by = auth.uid()
    or can_see_project(id)
  );
