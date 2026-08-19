-- is_owner cannot be handed out by anyone who does not already have it.
--
-- 032 split am_owner() from am_admin() precisely so Brooke, Krista and Will
-- would be powerful without being omniscient, and set their is_owner to
-- false. But the same migration widened manage_profiles from am_owner() to
-- am_admin() so admins could manage people — and Postgres RLS has no
-- column-level check. A policy that permits UPDATE permits UPDATE of every
-- column, is_owner included.
--
-- So any of the three could have run, from the browser console of a page they
-- are already authenticated on:
--
--   supabase.from('profiles').update({ is_owner: true }).eq('id', <self>)
--
-- and restored the total bypass 032 exists to remove. /admin already writes
-- to this table through the same policy, so nothing extra was needed.
--
-- RLS cannot express "every column except this one", so the constraint moves
-- to a trigger, which can compare OLD and NEW. tests/rls.test.ts 22a/22b pin
-- that the escalation fails and that the legitimate power — changing someone
-- else's account_role — still works.
create or replace function guard_owner_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_owner is distinct from old.is_owner then
    -- Service-role callers have no auth.uid() and pass deliberately: that is
    -- the migration and scripting path, not a user action.
    if auth.uid() is not null and not exists (
      select 1 from profiles where id = auth.uid() and is_owner
    ) then
      raise exception 'Only the portal owner can change ownership';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_owner_flag_on_update on profiles;
create trigger guard_owner_flag_on_update
  before update on profiles
  for each row execute function guard_owner_flag();
