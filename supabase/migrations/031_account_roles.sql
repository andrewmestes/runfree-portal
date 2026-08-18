-- One account role per person, replacing three loose booleans.
--
-- Andrew proposed: admin, RunFree team member, certified vision framer,
-- project editor, project viewer — plus a possible "certified vision framer
-- subscribed" for letting framers run their own clients.
--
-- Two of those are not account roles. "Project editor" and "project viewer"
-- describe a MEMBERSHIP, not a person: the same human is an editor on one
-- project and a viewer on another, which project_members.role already
-- models. And being a certified framer says nothing about which projects
-- someone is on — Andrew noted this himself: "a certified vision framer
-- would still need access to specific projects that they're invited to." So
-- the two axes stay separate and this enum is only the first one.
--
-- framer_subscribed is the tier behind the subscription idea: a framer who
-- may CREATE and own projects for their own clients. The distinction from
-- runfree_team is what they can SEE — see can_see_project below.
create type account_role as enum (
  'admin',
  'runfree_team',
  'framer_subscribed',
  'framer',
  'client'
);

alter table profiles add column account_role account_role not null default 'client';

update profiles set account_role =
  case
    when is_owner then 'admin'::account_role
    when is_staff then 'runfree_team'::account_role
    when certification_access then 'framer'::account_role
    else 'client'::account_role
  end;

-- The CVF app is still live and still reads is_owner / is_staff /
-- certification_access. Until it is retired, account_role is the source of
-- truth and the booleans follow it, so the new admin can write one field
-- without breaking an app it does not control.
create or replace function sync_role_flags()
returns trigger
language plpgsql
as $$
begin
  if new.account_role is distinct from old.account_role then
    new.is_owner := (new.account_role = 'admin');
    new.is_staff := new.account_role in ('admin', 'runfree_team');
    new.certification_access :=
      new.account_role in ('admin', 'runfree_team', 'framer', 'framer_subscribed');
  end if;
  return new;
end;
$$;

create trigger sync_role_flags_on_update
  before update on profiles
  for each row execute function sync_role_flags();

-- Both functions accept EITHER account_role or the legacy booleans, because
-- the CVF app still writes the booleans directly and those writes do not set
-- account_role. Failing closed on a stale boolean would silently demote real
-- staff. Drop the boolean half once the CVF app is retired.
create or replace function can_create_projects()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (
        account_role in ('admin', 'runfree_team', 'framer_subscribed')
        or is_staff
        or is_owner
      )
  );
$$;

-- A subscribed framer's clients are THEIR clients. "Team-wide" is a RunFree
-- concept: it must not leak a framer's projects to RunFree staff, nor
-- RunFree's projects to a framer. Membership stays the only way in for
-- anyone who is not RunFree. tests/rls.test.ts 19a-19d pin this.
create or replace function can_see_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members m
    where m.project_id = p and m.profile_id = auth.uid()
  )
  or exists (
    select 1 from projects pr
    where pr.id = p and pr.created_by = auth.uid()
  )
  or exists (
    select 1 from projects pr, profiles me
    where pr.id = p
      and me.id = auth.uid()
      and pr.visibility = 'team'
      and (
        me.account_role in ('admin', 'runfree_team')
        or ((me.is_staff or me.is_owner) and me.account_role <> 'framer_subscribed')
      )
  );
$$;
