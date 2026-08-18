-- A profile is born knowing whether its owner is already certified.
--
-- Andrew tagged Megan Estes in GoHighLevel. She landed on the certified list
-- and in the portal as a plain 'client'. The timestamps show a 377ms race:
--
--   18:47:52.890  certified_framers row created
--   18:47:53.267  profile created by handle_new_user
--
-- syncCertificationRole ran between the two, found no profile, and returned.
-- Then the invite created the auth user, the trigger created the profile, and
-- the 'client' default won. The app-side comment even acknowledged that
-- someone can be on the roster before they ever sign in — but nothing made
-- the profile appear with the right role when it finally did.
--
-- Reordering the app calls alone would not fix it. Someone can be rostered
-- months before they accept an invitation, and a self-signup has no app code
-- in the path at all. The durable answer is for profile creation itself to
-- consult the roster — the one moment guaranteed to come after the roster row
-- exists. tests/rls.test.ts 21a-21c pin it.
--
-- The legacy booleans are set alongside account_role because the CVF app
-- still reads them.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_certified boolean;
  v_owner     boolean;
begin
  v_owner := new.email = 'andrew@runfree.co';

  select exists (
    select 1 from public.certified_framers cf
    where lower(cf.email) = lower(new.email)
  ) into v_certified;

  insert into public.profiles (
    id, email, full_name, is_staff, is_owner, certification_access, account_role
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    v_owner,
    v_owner,
    v_owner or v_certified,
    case
      when v_owner then 'admin'::account_role
      when v_certified then 'framer'::account_role
      else 'client'::account_role
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Repair anyone already caught: on the roster, sitting as a client because
-- their profile was created in the gap.
update profiles p
set account_role = 'framer', certification_access = true
from certified_framers cf
where lower(cf.email) = lower(p.email)
  and p.account_role = 'client';
