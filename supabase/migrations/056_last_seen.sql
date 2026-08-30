-- Whether anyone is actually using the portal.
--
-- Andrew: "just some kind of indicator that the project admin sees either on
-- the team page, or in the project access section."
--
-- There was no signal at all — no way to know whether a church team watched
-- the orientation videos before the launch retreat, or whether the person you
-- invited ever got in. "Hasn't signed in yet" is the most useful fact of the
-- lot and the one you cannot get anywhere else.
--
-- Deliberately last-SEEN, not a per-resource read log. A church board is no
-- place for read receipts on individuals, and the question an admin actually
-- has is "did this land", which a coarse timestamp answers.
alter table profiles add column if not exists last_seen_at timestamptz;

comment on column profiles.last_seen_at is
  'Last time this person loaded the portal. Coarse on purpose — see 056.';

-- Written through a function, not a policy: update_profiles only lets you
-- write your own row and widening it invites more, and the throttle belongs
-- next to the write so every caller gets it.
create or replace function touch_last_seen()
returns void language plpgsql security definer set search_path = public
as $$
begin
  update profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '1 hour');
end;
$$;

revoke all on function touch_last_seen() from public;
grant execute on function touch_last_seen() to authenticated;
