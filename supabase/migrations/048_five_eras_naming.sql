-- "5 Era's" was a possessive where a plural was meant, and the four/five
-- confusion on top of it was real. Andrew: "In one of the chapters in Will's
-- books, he defines four previous eras of church growth from the 40s until
-- 2020. He then projects forward the future era of church, which goes from
-- 2020 to 2040. That's the fifth era... It's still saying and talking about
-- the exact same content." And: "5 eras is good."
--
-- So: five everywhere, with the backward-looking scope said out loud on the
-- assessment so nobody has to rediscover why it only lists four.
update template_resources
   set title = replace(title, '5 Era''s', '5 Eras')
 where title like '%5 Era''s%';

update deliverables
   set title = replace(title, '5 Era''s', '5 Eras')
 where title like '%5 Era''s%';

update template_resources
   set description = 'Four eras of church growth from the 1940s to 2020, plus the fifth — the era we are in now, 2020 to 2040. The assessment looks back at the four; the teaching carries all five.'
 where title = '5 Eras Assessment'
   and (description is null or description = '');
