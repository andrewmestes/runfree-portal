-- Knowing who is on the team is not the same as giving them a login.
--
-- Andrew: "any time we have a team member on a project, it sends them a
-- welcome email to the portal... I think we want a place where it says Church
-- Team Info [separate from] a section where we add people to this project
-- [which] immediately sends them access."
--
-- Until now the only way to record a person was project_members, which needs
-- a profiles row, which needs an auth.users row. So "Jerry Groce is an elder"
-- and "Jerry Groce can log in" were the same action. There was no way to keep
-- a roster without provisioning an account for everyone on it — and I had
-- already done exactly that to eight Christ Chapel people while importing
-- their project.
--
-- church_contacts is the roster: name, email, title. No account, no invite,
-- no access. project_members stays the access list, and remains the only one
-- of the two that can ever cause an email to be sent.
create table church_contacts (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  full_name  text not null,
  email      text,
  title      text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_church_contacts_project on church_contacts(project_id);

alter table church_contacts enable row level security;

create policy read_church_contacts on church_contacts
  for select using (can_see_project(project_id));

create policy write_church_contacts on church_contacts
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = church_contacts.project_id
        and m.profile_id = auth.uid()
        and m.role in ('editor', 'admin')
    )
    or am_owner()
  );
