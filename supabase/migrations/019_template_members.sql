-- RunFree people on a project are people, not text.
--
-- The team section drew the RunFree side from two places at once: real
-- project_members, and template_resources rows of kind 'team_bio'. On Younique
-- that put Andrew on screen twice — once as the lead navigator with his email,
-- once as the static bio "Andrew Estes — Certified Life Coach". Pivvot only
-- looked right by accident, because its two bios are Will and Brooke, who
-- happen not to be members.
--
-- A bio row also cannot do what Andrew asked for: "adding a headshot… should
-- be easy to do… or even have the option of adding additional team members if
-- I ever need to, or removing team members." A string in a resources table has
-- no face, no address, and nothing to click.
--
-- So the RunFree side is project_members from here on, and a template declares
-- who joins automatically — the same idea as template_deliverables, applied to
-- people. Will and Brooke are on every Pivvot engagement as viewers: visible,
-- contactable, and able to look in without being able to change anything.

create table template_members (
  template_id uuid not null references templates on delete cascade,
  profile_id  uuid not null references profiles on delete cascade,
  role        project_role not null default 'viewer',
  org_role    text,
  position    integer not null default 0,
  primary key (template_id, profile_id)
);

alter table template_members enable row level security;

create policy read_template_members on template_members
  for select using (
    am_owner() or am_staff()
    or exists (
      select 1 from projects pr
      join project_members m on m.project_id = pr.id
      where pr.template_id = template_members.template_id
        and m.profile_id = auth.uid()
    )
  );

create policy manage_template_members on template_members
  for all using (am_owner()) with check (am_owner());

-- Matched on email rather than a pasted uuid: the ids are stable but a typo in
-- one is silent, and an email that does not resolve simply inserts nothing.
insert into template_members (template_id, profile_id, role, org_role, position)
select t.id, p.id, 'viewer'::project_role, v.org_role, v.position
from templates t
cross join (values
  ('will@runfree.co',   'Founder and Process Creator', 1),
  ('brooke@runfree.co', 'Executive Director',          2)
) as v(email, org_role, position)
join profiles p on lower(p.email) = v.email
where t.slug = 'pivvot-vision-framing'
on conflict do nothing;

-- Backfill the projects that already exist.
insert into project_members (project_id, profile_id, role, org_role)
select pr.id, tm.profile_id, tm.role, tm.org_role
from projects pr
join template_members tm on tm.template_id = pr.template_id
on conflict do nothing;

-- The bios are now redundant, and leaving them would reproduce the duplication
-- the moment anyone rendered them again.
delete from template_resources where kind = 'team_bio';
