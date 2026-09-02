-- The Preparation Checklist, as the steps it actually contains.
--
-- Andrew, 2 Sept 2026: "Inside of that PDF, there's actually a lot of steps
-- that people need to take, like order materials, what kind of room setup
-- exists … The way that it's currently displayed just looks like it's a
-- checkbox for the preparation checklist."
--
-- The PDF ("Launch Preparation Checklist", Additional Handouts in Drive) has
-- two lists. They become two checklist groups — the existing one renamed and
-- a second one added after it — with the PDF's own items, so a church sees
-- what to send and what to set up the moment it opens Preparation. The PDF
-- itself stays reachable from the panel for the seating diagram.
--
-- Stamped into the two live Pivvot projects as well: stampTemplatePrepItems
-- only runs when a project is created. The one stale row Athena carried — an
-- item literally titled "Preparation Checklist", a label imported from Asana
-- with nothing behind it — is removed.
--
-- Also here: "Assimilation Funnel" leaves Module 1's "What this module
-- produces". Andrew: "We only need church problem statement, not the
-- Assimilation Funnel." It stays a Paradigm Convictions deliverable on the
-- Vision Stack; it just no longer files under Funnel Fusion.

do $$
declare
  v_t uuid;
  v_before uuid;
  v_room uuid;
  v_pos int;
begin
  select id into v_t from templates where slug = 'pivvot-vision-framing';
  if v_t is null then raise exception 'pivvot template missing'; end if;

  update template_prep_groups
     set title = 'Before the First Visit',
         description = 'Please send these ahead of our first meeting. If any of them cannot be completed, let us know beforehand.'
   where template_id = v_t and key = 'preparation-checklist'
   returning id, position into v_before, v_pos;

  update template_prep_groups set position = position + 1
   where template_id = v_t and position > v_pos and key <> 'room-setup';

  insert into template_prep_groups (template_id, section, key, title, description, kind, position)
  select v_t, g.section, 'room-setup', 'Room and Environment Setup',
         'What the meeting room needs on the day. Plenty of wall space: we hang ten to twenty flip-chart sheets as we go.',
         'checklist', v_pos + 1
    from template_prep_groups g where g.id = v_before
  on conflict (template_id, key) do nothing;
  select id into v_room from template_prep_groups where template_id = v_t and key = 'room-setup';

  create temp table checklist (group_id uuid, title text, notes text, external_url text, position int) on commit drop;
  insert into checklist values
    (v_before, 'Any vision equity material', 'Prior planning documents, vision statements — whatever currently exists in your organization.', null, 1),
    (v_before, 'Attendance and participation numbers', 'As far back as five years, if possible.', null, 2),
    (v_before, 'Financial giving information', 'As far back as five years, if possible.', null, 3),
    (v_before, 'A list of your team members', 'Names, positions, and email addresses.', null, 4),
    (v_before, 'A data file of member and attendee addresses', 'Addresses only. We use it to create a pin-drop map of your geographic area of influence.', null, 5),
    (v_room, 'Name tents in front of each seat', null, null, 1),
    (v_room, 'A white dry-erase board, eraser, and four-colour dry-erase markers', null, null, 2),
    (v_room, 'A notepad and pen for each participant', null, null, 3),
    (v_room, 'Blick 1-inch grid chart paper', 'Order ahead — it takes a few days to arrive.', 'https://www.dickblick.com/products/pacon-heavy-duty-anchor-chart-paper/', 4),
    (v_room, 'Sharpie chisel-tip permanent markers, assorted pack of four', null, 'https://www.amazon.com/Sharpie-Permanent-Marker-Chisel-Black/dp/B01LS0GT8C/', 5),
    (v_room, 'A projector with a small table and screen, or a large TV', 'VGA, or an adapter for it.', null, 6),
    (v_room, 'An extension cord and power strip', null, null, 7),
    (v_room, 'Refreshments available throughout the day', null, null, 8),
    (v_room, 'Seating arranged for team interaction', 'See the seating diagram in the Preparation Checklist PDF. Not a cramped room: subgroups need space to work, ideally with flip-chart sheets on the walls around them. If in doubt, err on the side of a larger room.', null, 9);

  insert into template_prep_items (group_id, title, notes, external_url, position)
  select c.group_id, c.title, c.notes, c.external_url, c.position from checklist c
   where not exists (select 1 from template_prep_items i where i.group_id = c.group_id and i.title = c.title);

  -- The live Pivvot projects.
  delete from prep_items i
   where i.group_id = v_before and i.title = 'Preparation Checklist'
     and i.file_path is null and coalesce(i.notes, '') = '' and i.external_url is null;

  insert into prep_items (project_id, group_id, title, notes, external_url, position)
  select p.id, c.group_id, c.title, c.notes, c.external_url, c.position
    from checklist c
    cross join projects p
   where p.template_id = v_t
     and not exists (select 1 from prep_items i where i.project_id = p.id and i.group_id = c.group_id and i.title = c.title);

  -- Assimilation Funnel: on the stack, not under Module 1.
  update template_deliverables set section = null
   where template_id = v_t and title = 'Assimilation Funnel' and section ilike 'Mod #1%';
  update deliverables d set section = null
    from projects p
   where p.id = d.project_id and p.template_id = v_t
     and d.title = 'Assimilation Funnel' and d.section ilike 'Mod #1%'
     and d.file_path is null and d.image_path is null;
end $$;
