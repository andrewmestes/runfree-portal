-- Everything in What's Important Now becomes a task you can tick off.
--
-- Andrew, twice: "I would like those to be more like the element that is
-- showing up as one finished where it is actually something to be a checkbox
-- that they can complete rather than just text on a screen that has no action
-- that the user can do."
--
-- He was asking for something the data model could not give him.
-- `projects.priorities` is a single free-text column: it can hold a list, but
-- it has nowhere to record that line three is done. A checkbox drawn beside
-- prose would either not persist or would need a second store keyed by line
-- number, which breaks the moment anyone edits the text above it.
--
-- `project_tasks` already is the right shape — one row per thing, with
-- is_done, completed_at, a due date and a section. So the prose moves into it
-- and the card becomes a single list of checkable items rather than a note
-- with a list underneath.
--
-- Each non-blank line becomes one task, in order, appended after whatever
-- tasks the project already has. Blank lines are separators, not items.
--
-- `projects.priorities` is deliberately NOT dropped or cleared. If this
-- conversion is wrong for a project, the original text is still there to read.
-- The app simply stops rendering it. Removing the column is a later decision,
-- once these have been lived with.
--
-- Idempotent by construction: it will not run twice for a project, because
-- the guard checks for a task already carrying the converted marker.

insert into project_tasks (project_id, title, section, position, is_done)
select
  p.id,
  btrim(line.value) as title,
  null,
  coalesce(
    (select max(t.position) from project_tasks t where t.project_id = p.id),
    -1
  ) + line.ord,
  false
from projects p
cross join lateral (
  select value, row_number() over () as ord
  from unnest(string_to_array(p.priorities, E'\n')) as value
) as line
where p.priorities is not null
  and btrim(line.value) <> ''
  -- Don't convert a project twice, and don't duplicate a line that already
  -- exists as a task (someone may have typed it in both places).
  and not exists (
    select 1 from project_tasks t
    where t.project_id = p.id
      and btrim(lower(t.title)) = btrim(lower(line.value))
  );
