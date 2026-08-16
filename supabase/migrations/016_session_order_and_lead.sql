-- Two corrections that only show up once real engagements exist.

-- ---------------------------------------------------------------------------
-- 1. Session order was decorative
-- ---------------------------------------------------------------------------
-- createSession never set `position`, so every session in a project sits at 0
-- while getProjectDetail orders by it. Postgres is free to return rows in any
-- order among equals, so the numbered circles in the session list — 1, 2, 3 —
-- could mean a different thing on the next page load. For a record of ten
-- sessions delivered over months, that is worse than having no numbers.
--
-- Backfill by creation time, which is the only ordering information those
-- rows actually carry today. From here on the app sets position explicitly
-- and sorts by the date held first, so the list reads chronologically the way
-- a coach thinks about it.

with ordered as (
  select id, row_number() over (partition by project_id order by created_at) - 1 as seq
  from sessions
)
update sessions s
set position = ordered.seq
from ordered
where ordered.id = s.id and s.position = 0;

-- ---------------------------------------------------------------------------
-- 2. Only one lead navigator per engagement
-- ---------------------------------------------------------------------------
-- The hero prints "led by …" and the team card highlights "Your Lead
-- Navigator" by taking the FIRST member with is_lead. With nothing stopping
-- two people carrying the flag, which name a church sees would depend on row
-- order — so the constraint belongs in the database rather than in a rule
-- everyone has to remember.
--
-- Partial, so it constrains only the true rows: any number of members may
-- have is_lead false.

create unique index one_lead_per_project
  on project_members (project_id)
  where is_lead;
