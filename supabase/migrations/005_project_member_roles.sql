-- Andrew: "anyone added can either be a viewer, editor, project admin" — the
-- fixed client/coach split can't express the Pivvot Coaching case (a client
-- leading their own process needs to write, not just read), and it has no
-- notion of "can manage who's on this project" at all. Three tiers instead:
--   viewer — read-only (what 'client' used to mean)
--   editor — can write sessions/deliverables (what 'coach' used to mean)
--   admin  — editor, plus can manage project_members and project settings
--
-- Renaming values in place rather than dropping/recreating the type: the
-- column stays project_role, only its allowed values change, and there is no
-- data yet to migrate (project_members has 0 rows).
--
-- Split into its own migration on purpose: Postgres refuses to let a value
-- added by ALTER TYPE ... ADD VALUE be used (e.g. in a policy) within the
-- same transaction that added it. Isolating this migration means 'admin' is
-- fully committed before 006 writes any policy that references it.

alter type project_role rename value 'coach' to 'editor';
alter type project_role rename value 'client' to 'viewer';
alter type project_role add value 'admin';
