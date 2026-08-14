-- handle_new_user() only fires on INSERT into auth.users. Andrew (and any
-- other certified framer who already had a login before this portal's
-- schema existed) has an auth.users row that predates the trigger, so it
-- never fired for them — profiles had 0 rows even after migrations 001-007.
-- One-time backfill, using the exact same logic the trigger uses. Idempotent
-- via ON CONFLICT, safe to re-run.

insert into public.profiles (id, email, full_name, is_staff, is_owner)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  u.email = 'andrew@runfree.co',
  u.email = 'andrew@runfree.co'
from auth.users u
on conflict (id) do nothing;
