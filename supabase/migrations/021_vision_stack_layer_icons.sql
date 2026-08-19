-- Reconstructed alongside 020 — see that file's note on why both were missing.
--
-- Three of the four Vision Stack layers are the output of a process tool that
-- already has an icon in the portal, so they reuse it rather than inventing a
-- second visual language for the same idea. The Application Toolbox has none
-- yet and stays null, which the page renders as its layer number.
alter table vision_stack_layers add column if not exists icon_path text;

update vision_stack_layers set icon_path = '/brand/modules/1.png' where slug = 'paradigm-convictions';
update vision_stack_layers set icon_path = '/brand/modules/5.png' where slug = 'vision-frame';
update vision_stack_layers set icon_path = '/brand/modules/6.png' where slug = 'horizon-storyline';
