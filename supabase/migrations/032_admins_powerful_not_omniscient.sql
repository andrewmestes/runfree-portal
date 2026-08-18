-- Andrew: "let's go with powerful but not-omniscient. There's still privacy
-- we'd like to keep for runfree team members' projects. However, for a
-- subscribed certified vision framer, we should be able to see their projects
-- if needed to help them troubleshoot."
--
-- Making Brooke, Krista and Will 'admin' had set is_owner, and am_owner() is
-- a total bypass gating ~30 policies across every project's sessions,
-- deliverables and prep work. That is omniscient. But simply dropping
-- is_owner would also strip the ability to edit templates, prep groups and
-- vision stack layers, which admins plainly should have. So the one flag
-- splits in two:
--
--   am_owner()  — Andrew alone. The escape hatch. Unchanged.
--   am_admin()  — Andrew plus account_role 'admin'. Content and configuration
--                 authority, without blanket sight of every engagement.
create or replace function am_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and (is_owner or account_role = 'admin')
  );
$$;

-- is_owner is no longer something a role grants; without this the trigger
-- would hand it back the next time anyone's role was touched.
create or replace function sync_role_flags()
returns trigger language plpgsql as $$
begin
  if new.account_role is distinct from old.account_role then
    new.is_staff := new.account_role in ('admin', 'runfree_team');
    new.certification_access :=
      new.account_role in ('admin', 'runfree_team', 'framer', 'framer_subscribed');
    -- is_owner deliberately untouched.
  end if;
  return new;
end;
$$;

update profiles set is_owner = false
where account_role = 'admin' and lower(email) <> 'andrew@runfree.co';

-- Support access, and only that: an admin can SEE a project owned by a
-- subscribed framer, because that is the tier RunFree sells and has to
-- support. A RunFree team member's own private project stays private to its
-- members. tests/rls.test.ts 20a/20b pin both halves.
create or replace function can_see_project(p uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from project_members m
    where m.project_id = p and m.profile_id = auth.uid()
  )
  or exists (
    select 1 from projects pr where pr.id = p and pr.created_by = auth.uid()
  )
  or exists (
    select 1 from projects pr, profiles me
    where pr.id = p and me.id = auth.uid() and pr.visibility = 'team'
      and (
        me.account_role in ('admin', 'runfree_team')
        or ((me.is_staff or me.is_owner) and me.account_role <> 'framer_subscribed')
      )
  )
  or exists (
    select 1 from projects pr
    join profiles owner on owner.id = pr.created_by
    join profiles me on me.id = auth.uid()
    where pr.id = p
      and owner.account_role = 'framer_subscribed'
      and (me.is_owner or me.account_role = 'admin')
  );
$$;

alter policy manage_templates on templates using (am_admin()) with check (am_admin());
alter policy manage_template_resources on template_resources using (am_admin()) with check (am_admin());
alter policy manage_template_deliverables on template_deliverables using (am_admin()) with check (am_admin());
alter policy manage_template_members on template_members using (am_admin()) with check (am_admin());
alter policy manage_template_prep_groups on template_prep_groups using (am_admin()) with check (am_admin());
alter policy manage_template_prep_items on template_prep_items using (am_admin()) with check (am_admin());
alter policy manage_vision_stack_layers on vision_stack_layers using (am_admin()) with check (am_admin());

alter policy read_profiles on profiles using (
  id = auth.uid()
  or am_admin()
  or exists (
    select 1 from project_members mine
    join project_members theirs on theirs.project_id = mine.project_id
    where mine.profile_id = auth.uid() and theirs.profile_id = profiles.id
  )
);
alter policy manage_profiles on profiles using (am_admin()) with check (am_admin());

alter policy read_feedback on feedback using (profile_id = auth.uid() or am_admin());
alter policy manage_feedback on feedback using (am_admin()) with check (am_admin());
