-- 078 — bring every template up to the pattern the best one already uses.
--
-- A pass over all six templates found four things that were true of some and
-- not of others, with no reason for the difference. None of this is schema;
-- it is the template data itself.

-- 1. A crashed RLS test run left its template behind. tests/rls.test.ts does
--    clean up (cleanupTemplateIds), so this is litter from an interrupted
--    run — and litter that shows up in the New Project picker as a template
--    anyone could stamp a real church from.
delete from template_resources
 where template_id in (select id from templates where slug like 'rls-test-template-%');
delete from template_prep_items
 where group_id in (select g.id from template_prep_groups g
                     join templates t on t.id = g.template_id
                    where t.slug like 'rls-test-template-%');
delete from template_prep_groups
 where template_id in (select id from templates where slug like 'rls-test-template-%');
delete from templates where slug like 'rls-test-template-%';

-- 2. Younique showed a church Vision Frame sheet.
--    070 made an EMPTY frame_elements mean "no Vision Frame sheet"; null
--    still means all seven. Both coaching templates were set to empty; the
--    Younique 1-1 Life Plan was left at null, so a personal life plan opened
--    its Deliverables panel with Mission / Values / Strategy / Measures for a
--    church the client does not have. Same reasoning as 070's own note about
--    not sitting a church frame above a coaching client's thrill lists.
update templates set frame_elements = '{}'::text[] where slug = 'younique-lifeplan';

-- 3. ...and it spoke to that client as a church.
--    `voice` rewrites the prompts, the roster card and the session publish
--    checkbox that name a church. Younique is one person's life plan.
update templates set voice = 'organization' where slug = 'younique-lifeplan';

-- 4. Two templates started a project with no RunFree person on it.
--    Every other template seeds Will and Brooke as viewers, so a new project
--    already has its coach. Executive Team Coaching had only Brooke, and
--    Younique had nobody at all — both are Will's work (Brooke does not use
--    the Younique tools; Will does, and he runs the team engagements).
insert into template_members (template_id, profile_id, role)
select t.id, p.id, 'viewer'
  from templates t
  join profiles p on p.email = 'will@runfree.co'
 where t.slug in ('executive-coaching-team', 'younique-lifeplan')
   and not exists (
     select 1 from template_members m
      where m.template_id = t.id and m.profile_id = p.id
   );

-- 5. A default Read & Watch shelf for Younique.
--    075 gave Pivvot one ("Preparation Checklist") but could only match Drive
--    handouts, so a template whose material is stored files could not have a
--    default at all. seedDefaultHighlights now also matches the template's own
--    resources, so Younique opens on the two things a client meets first: the
--    worksheet the prework asks for, and the one-page picture of the cycle.
update templates
   set ui = coalesce(ui, '{}'::jsonb)
            || jsonb_build_object(
                 'default_highlights',
                 jsonb_build_array('Life Discovery Grid', 'Life-Making Cycle 1-Pager')
               )
 where slug = 'younique-lifeplan';
