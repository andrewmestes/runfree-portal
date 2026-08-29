-- Group descriptions are read by the church, not only by the coach.
--
-- Both of these were written as instructions to whoever uploads — "Upload each
-- team member's Insights Discovery profile", "upload the final PDF of each one
-- here as it is signed off" — and a viewer cannot upload anything. Naming an
-- action someone cannot take is how a portal reads as not-for-them.
--
-- Neutral wording is correct for both audiences, which is why this is a copy
-- change rather than a second role-branched string.
update template_prep_groups
   set description = 'Insights Discovery profiles for the team.'
 where title = 'Team Building Profiles';

update template_prep_groups
   set description = 'The finished pieces, added as each one is signed off.'
 where title = 'Final Documents';
