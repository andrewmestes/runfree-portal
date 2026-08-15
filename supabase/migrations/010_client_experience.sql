-- Everything the client-facing redesign needs. Andrew's brief, in his words:
-- "I want this to be a profound and impressive user experience... think like a
-- premium consultant. Very high ticket, up to a $100,000 ticket."
--
-- Four changes, each answering a specific thing a church team needs to see.

-- ---------------------------------------------------------------------------
-- 1. The church's own identity on their project
-- ---------------------------------------------------------------------------
-- "I want to be able to add the church's logo and maybe a little information
-- about them, like the location of the church or the church website."
--
-- logo_path is a path in the existing deliverable-images bucket, stored as
-- {project_id}/logo-{uuid}.{ext} — deliberately reusing that bucket rather
-- than adding one, because its RLS already reads foldername(name)[1] as the
-- project id, so a logo is readable by exactly the people who can see the
-- project and writable by exactly its editors. A new bucket would mean
-- duplicating four policies to get the identical result. Logos never appear
-- in a gallery: images render only from an explicit deliverables.image_path,
-- never from a bucket listing.

alter table projects add column logo_path text;
alter table projects add column location text;
alter table projects add column website_url text;
alter table projects add column about text;

-- ---------------------------------------------------------------------------
-- 2. Who someone is, as distinct from what they may do
-- ---------------------------------------------------------------------------
-- "An easily accessible list of team members with their names, email
-- addresses, and the role that they play at the church."
--
-- org_role is their title where they work ("Executive Pastor") and carries NO
-- permissions whatsoever — project_members.role (viewer/editor/admin) remains
-- the only thing RLS reads. Keeping these in separate columns is the point:
-- collapsing them would mean a job title could silently grant access, which
-- is exactly the class of bug this schema's RLS exists to make impossible.
--
-- is_lead marks the RunFree person leading this engagement — for Athena,
-- Andrew. Will Mancini and Brooke Domek are the same on every project and so
-- live in template_resources as team_bio rows; the lead navigator differs per
-- project and so lives here.

alter table project_members add column org_role text;
alter table project_members add column is_lead boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Untitled images, so nobody has to invent a name for a flipchart
-- ---------------------------------------------------------------------------
-- "I'm just curious if we could have the freedom to not name every single
-- piece, because sometimes we don't get to every single exercise that we
-- name."
--
-- Two genuinely different things were sharing one table:
--   vision_stack  — the named, finished artifacts a church shows its board
--   session_image — a photo of a flipchart, meaningful without a title
-- Splitting by kind lets the page render each the way it deserves: the stack
-- as named deliverables, the images as a gallery. Title becomes optional
-- because requiring one is what made someone stop and invent "Flipchart 3".

create type deliverable_kind as enum ('vision_stack', 'session_image');

alter table deliverables add column kind deliverable_kind not null default 'vision_stack';
alter table deliverables alter column title drop not null;

-- The FLIPCHARTS placeholders seeded from Asana are session images by
-- nature — they were always going to be photographs of wall work.
update deliverables set kind = 'session_image' where title ilike '%flipchart%';

-- ---------------------------------------------------------------------------
-- 4. One handout leads, the rest stay quiet
-- ---------------------------------------------------------------------------
-- During a session a facilitator says "turn to the Assimilation Funnel" and a
-- team member wants one file to page through, not twelve to hunt among. But
-- afterwards someone redoing a single exercise wants that single sheet. So
-- both exist and the hierarchy does the work: is_primary marks the combined
-- module handout, which renders large; everything else renders small beneath.

alter table template_resources add column is_primary boolean not null default false;
