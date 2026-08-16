-- Somewhere for questions, bugs and ideas to land.
--
-- The obvious implementation is a mailto: link, and it is the wrong one here:
-- mailto depends on the sender having a mail client wired up in their browser,
-- fails silently when they do not, and leaves no record anyone can search. A
-- church admin who hits a problem mid-session and gets nothing when they click
-- "contact us" concludes the portal is broken.
--
-- A table also survives the thing this portal does not have yet — an email
-- sender. When one exists, notifying Andrew becomes a trigger on this table
-- rather than a rewrite of how feedback is captured.
--
-- project_id is nullable and captured when it is known, because "the photos
-- won't upload" is a different conversation depending on which engagement it
-- came from, and asking someone to tell you is asking them to do your job.

create type feedback_kind as enum ('question', 'problem', 'idea');

create table feedback (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles on delete cascade,
  project_id  uuid references projects on delete set null,
  kind        feedback_kind not null default 'question',
  message     text not null,
  -- Whether it came from someone who can change things, captured at write
  -- time: a RunFree coach reporting "I can't publish this" and a church
  -- member reporting the same sentence mean different things, and roles
  -- change afterwards.
  from_staff  boolean not null default false,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_feedback_created on feedback(created_at desc);

alter table feedback enable row level security;

-- Anyone signed in may raise something, as themselves. profile_id is forced
-- to the caller so a submission cannot be attributed to someone else.
create policy submit_feedback on feedback
  for insert to authenticated
  with check (profile_id = auth.uid());

-- You can see what you sent; the owner sees everything. Deliberately NOT
-- visible to all staff: someone writing "I don't understand how any of this
-- works" should not have it read by the whole team.
create policy read_feedback on feedback
  for select using (profile_id = auth.uid() or am_owner());

create policy manage_feedback on feedback
  for update using (am_owner()) with check (am_owner());
