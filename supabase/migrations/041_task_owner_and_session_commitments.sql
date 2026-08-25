-- Who owes a task, and one home for next steps.
--
-- Two changes that belong together, both from Andrew's session-notes
-- conversation and the Brooke walkthrough before it.
--
-- 1. TASKS GET AN OWNER.
--
-- Will's sample session summary splits its action items in two: "For the
-- cohort — practice" and "For Will & Andrew — owed to the group". That
-- distinction is load-bearing and the portal had no way to express it. Without
-- it a church's What's Important Now lists "Andrew to send the video link"
-- beside their own homework, and RunFree has no way to see what it owes across
-- every engagement at once.
--
-- 'church' is the default because that is what almost every existing row is:
-- homework for the team. Nothing needs re-tagging for the old rows to stay
-- correct.
--
-- 2. sessions.commitments BECOMES TASKS.
--
-- Andrew, walking Brooke through the portal: "currently there's three
-- different places where they're looking for next steps and I need to be able
-- to streamline that." Those three were projects.priorities (converted in
-- 040), sessions.commitments (converted here), and project_tasks — which is
-- the one that can actually be ticked off, dated and counted.
--
-- Same conversion as 040, and the same restraint: `commitments` is NOT dropped
-- or cleared. If a conversion is wrong for a session the original text is
-- still there to read; the app simply stops rendering it. Removing the column
-- is a later decision, once these have been lived with.
--
-- `takeaways` survives on purpose. It is a short "if you read nothing else",
-- which is a different thing from a list of things to do, and it does not
-- compete with tasks.

alter table project_tasks
  add column if not exists owner text not null default 'church';

alter table project_tasks
  drop constraint if exists project_tasks_owner_check;

alter table project_tasks
  add constraint project_tasks_owner_check check (owner in ('church', 'runfree'));

comment on column project_tasks.owner is
  'Who owes this: church (the client team) or runfree (us, owed to them).';

-- Each non-blank line of a session''s commitments becomes one task on that
-- session. Blank lines are separators. Leading list markers are stripped so a
-- pasted "- do the thing" does not become a task literally called "- do the
-- thing".
insert into project_tasks (project_id, session_id, title, section, position, is_done, owner)
select
  s.project_id,
  s.id,
  btrim(regexp_replace(line.value, '^\s*([-*•]|\d+[.)])\s*', '')) as title,
  s.section,
  coalesce(
    (select max(t.position) from project_tasks t where t.project_id = s.project_id),
    -1
  ) + line.ord,
  false,
  'church'
from sessions s
cross join lateral (
  select value, row_number() over () as ord
  from unnest(string_to_array(s.commitments, E'\n')) as value
) as line
where s.commitments is not null
  and btrim(regexp_replace(line.value, '^\s*([-*•]|\d+[.)])\s*', '')) <> ''
  -- Don't convert twice, and don't duplicate a line that already exists as a
  -- task on this session.
  and not exists (
    select 1 from project_tasks t
    where t.project_id = s.project_id
      and t.session_id = s.id
      and btrim(lower(t.title))
          = btrim(lower(regexp_replace(line.value, '^\s*([-*•]|\d+[.)])\s*', '')))
  );
