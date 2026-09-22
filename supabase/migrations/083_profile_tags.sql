-- 083 — Tags on a person.
--
-- Andrew, 22 Sept 2026, after the September cohort was invited with hub
-- access and no project: "add a tag 'North Carolina (2026)'". A cohort that
-- is not yet on a project has nothing that groups its people, so Admin
-- showed thirteen new framers indistinguishable from the rest.
--
-- A free-text array rather than a cohorts table: a tag is a label an admin
-- types, it can name anything (a cohort, a network, a year), and the same
-- person can carry several. Writes go through the existing manage_profiles
-- policy (admins), reads through read_profiles.

alter table profiles
  add column if not exists tags text[] not null default '{}';

create index if not exists profiles_tags_idx on profiles using gin (tags);
