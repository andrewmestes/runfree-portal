-- A client ticks a commitment. Same door as the answers (072): only on groups
-- the template marked client_editable.
create or replace function set_prep_item_done(p_item uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_ok boolean;
begin
  select i.project_id, g.client_editable into v_project, v_ok
    from prep_items i join template_prep_groups g on g.id = i.group_id
   where i.id = p_item;
  if v_project is null then raise exception 'no such item'; end if;
  if not can_see_project(v_project) then raise exception 'not a member of this project'; end if;
  if not coalesce(v_ok, false) then raise exception 'this item is not client-editable'; end if;
  update prep_items set is_done = p_done where id = p_item;
end $$;
revoke all on function set_prep_item_done(uuid, boolean) from public;
grant execute on function set_prep_item_done(uuid, boolean) to authenticated;

-- The Coaching Commitments are the client's to agree to.
update template_prep_groups g set client_editable = true
from templates t where g.template_id = t.id
  and t.slug in ('executive-coaching', 'executive-coaching-team') and g.key = 'ec-commitments';

-- Three Younique tools sat at positions 20-22 and slipped past 072's
-- "position < 20" guard; on the one-on-one template they hide like the rest.
update template_prep_groups g set hidden_by_default = true
from templates t where g.template_id = t.id and t.slug = 'executive-coaching'
  and g.key in ('ec-life-stage', 'ec-passion-funnel', 'ec-offenders');

-- Resources should open on the practices, not on the session list.
update templates set structure = jsonb_build_object('sections', jsonb_build_array(
  'Healthy Practices', 'Additional Resources', 'Optional Life Planning', 'Younique Book by Chapter', 'Coaching Sessions'))
where slug in ('executive-coaching', 'executive-coaching-team');

-- Projects stamped before 072/074 catch up with their template's hidden set.
update projects p set hidden_groups = coalesce((
  select array_agg(g.key) from template_prep_groups g where g.template_id = p.template_id and g.hidden_by_default
), '{}')
from templates t where t.id = p.template_id and t.slug in ('executive-coaching', 'executive-coaching-team');
