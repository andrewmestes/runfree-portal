-- The name was never missing — it just never arrived.
--
-- GoHighLevel sends the contact's name and the webhook stores it on
-- certified_framers.name ("Megan Estes", "David Saathoff", "Jeremy Horton").
-- But the invite went out with no user metadata, so raw_user_meta_data had no
-- full_name, so handle_new_user wrote null, so every screen fell back to
-- showing the email twice.
--
-- Exactly the shape of the role bug in 033: the fact exists before the profile
-- does, and nothing carried it across. Same fix in the same place — profile
-- creation consults the roster, the one moment guaranteed to come after the
-- roster row was written. lib/invite.ts also passes the name into the invite
-- now, so it does not depend on the roster alone.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_certified boolean;
  v_owner     boolean;
  v_name      text;
begin
  v_owner := new.email = 'andrew@runfree.co';

  select cf.name, true
    into v_name, v_certified
  from public.certified_framers cf
  where lower(cf.email) = lower(new.email)
  limit 1;

  v_certified := coalesce(v_certified, false);

  insert into public.profiles (
    id, email, full_name, is_staff, is_owner, certification_access, account_role
  )
  values (
    new.id,
    new.email,
    -- What the person told us beats what the CRM has; the roster name is the
    -- fallback, and a name equal to the email is no name at all.
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(v_name, new.email)
    ),
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

update profiles p
set full_name = cf.name
from certified_framers cf
where lower(cf.email) = lower(p.email)
  and p.full_name is null
  and cf.name is not null
  and cf.name <> p.email;
