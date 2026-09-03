-- Andrew: "For Athena CC and the pivvot template, I want the Preparation
-- Checklist PDF to be one of the highlighted resources." Athena has it by
-- hand; new Pivvot projects get it at creation, matched by title against
-- the template's Drive handouts (see seedDefaultHighlights in the New
-- Project page).
update templates
   set ui = coalesce(ui, '{}'::jsonb) || jsonb_build_object('default_highlights', jsonb_build_array('Preparation Checklist'))
 where slug = 'pivvot-vision-framing';
