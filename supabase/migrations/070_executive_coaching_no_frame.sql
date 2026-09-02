-- Executive Coaching has no Vision Frame sheet. Its deliverables are the
-- coaching tools (thrill lists, role description, the Younique exercises), and
-- the church-voiced frame — Kingdom Concept and all — had appeared above them
-- on the Deliverables panel because a null frame_elements means "all seven".
-- An empty list now means "none", and the page hides the sheet for it.
update templates set frame_elements = '{}'::text[] where slug = 'executive-coaching';
