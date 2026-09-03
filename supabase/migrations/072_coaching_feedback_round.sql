-- Brooke's feedback on the Executive Coaching template (3 Sept 2026 call
-- with Andrew), and the plumbing it needed.
--
-- What she asked for, in her words where it matters:
--   * two templates — "I think we're gonna need both": one-on-one and team;
--   * "Preparation" is really Onboarding, "The Process" is really Resources
--     ("it's not a process. These are all resources"), and Execution is not
--     a coaching thing at all → per-template nav labels (templates.ui);
--   * the onboarding form inside the portal ("One-Stop shop"), answered by
--     the client → prep items a client can write to (client_editable, and an
--     RPC, because write_prep_items is editors-only);
--   * a baseline — "here's where we start" — drawn from those answers;
--   * the Younique tools hidden until a conversation calls for one — "we
--     would probably want to hide that, maybe not delete it … and then as
--     something serves within a conversation, we can then share it" →
--     hidden_by_default on the template, hidden_groups on the project;
--   * a whiteboard tab — "the price of admission";
--   * the five prep questions before every session, and a feedback form
--     "we use just holistically" → session prep_answers / feedback, written
--     by the client through RPCs;
--   * the Performance Practices cards "less childlike and more RunFree" →
--     layout = 'practice', the steps as text, no more screenshots.

alter table templates add column if not exists ui jsonb not null default '{}'::jsonb;
alter table template_prep_groups
  add column if not exists client_editable boolean not null default false,
  add column if not exists hidden_by_default boolean not null default false;
alter table projects add column if not exists hidden_groups text[] not null default '{}';
alter table sessions
  add column if not exists prep_answers jsonb not null default '{}'::jsonb,
  add column if not exists feedback jsonb not null default '{}'::jsonb;
alter table template_resources
  add column if not exists layout text not null default 'row'
    check (layout in ('row', 'practice'));

-- A member writes an answer. RLS on prep_items is editors-only, and the
-- client is a viewer; this is the one door, and it opens only on groups the
-- template marked as the client's to fill in.
create or replace function set_prep_item_notes(p_item uuid, p_notes text)
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
  update prep_items set notes = nullif(btrim(p_notes), '') where id = p_item;
end $$;

-- Prep answers and feedback, keyed by the person who wrote them, so a team's
-- members do not overwrite each other.
create or replace function submit_session_prep(p_session uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from sessions where id = p_session;
  if v_project is null or not can_see_project(v_project) then
    raise exception 'not a member of this project';
  end if;
  update sessions
     set prep_answers = coalesce(prep_answers, '{}'::jsonb)
       || jsonb_build_object(auth.uid()::text, jsonb_build_object('answers', p_answers, 'at', now()))
   where id = p_session;
end $$;

create or replace function submit_session_feedback(p_session uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from sessions where id = p_session;
  if v_project is null or not can_see_project(v_project) then
    raise exception 'not a member of this project';
  end if;
  update sessions
     set feedback = coalesce(feedback, '{}'::jsonb)
       || jsonb_build_object(auth.uid()::text, jsonb_build_object('answers', p_answers, 'at', now()))
   where id = p_session;
end $$;

revoke all on function set_prep_item_notes(uuid, text) from public;
revoke all on function submit_session_prep(uuid, jsonb) from public;
revoke all on function submit_session_feedback(uuid, jsonb) from public;
grant execute on function set_prep_item_notes(uuid, text) to authenticated;
grant execute on function submit_session_prep(uuid, jsonb) to authenticated;
grant execute on function submit_session_feedback(uuid, jsonb) to authenticated;

-- ───────────────────────── the one-on-one template ─────────────────────────

update templates set
  name = 'Executive Coaching (1-on-1)',
  description = 'One-on-one executive coaching: onboarding, sessions with prep questions and commitments, the tools built along the way, the performance practices, and the optional Younique life-planning tools.',
  ui = jsonb_build_object(
    'nav', jsonb_build_object('prepare', 'Onboarding', 'team', 'Client Info', 'process', 'Resources', 'execution', null),
    'wording', jsonb_build_object(
      'tasks', 'Commitments',
      'task_add', 'Add a commitment',
      'tasks_theirs', 'Your commitments',
      'team_title', 'Your Coach',
      'process_eyebrow', 'The library',
      'materials', 'Coaching materials'),
    'session_prep_note', 'Spend no more than ten minutes on these before each session.',
    'session_prep', jsonb_build_array(
      'What is the current sprint VISION you are working towards? Or what is the most important sprint goal for you right now?',
      'What are the current GAPS between reality and your sprint vision?',
      'What are you frustrated with, avoiding, complaining about, tolerating or scared of (FACTS) as it relates to your current sprint vision?',
      'What is one NUCLEAR action — small, but with the potential to change everything — you can take this week to move closer to your sprint goal?',
      'What is MAX VALUE for the call today?'),
    'feedback_rating', 'How valuable was this session, 1 to 10?',
    'feedback', jsonb_build_array(
      'What was most valuable about this session?',
      'What is one thing your coach could do differently next time?',
      'What are you taking away, and what are you committing to?',
      'Anything else you want your coach to know?'),
    'baseline_group', 'ec-onboarding-form')
where slug = 'executive-coaching';

-- Onboarding: the form, the coach's details, the commitments.
update template_prep_groups g set
  key = 'ec-onboarding-form',
  title = 'Onboarding Form',
  description = 'Your coach reads these before the first session and comes back to them all the way through. Answer in your own words; edit any time.',
  client_editable = true
from templates t where g.template_id = t.id and t.slug = 'executive-coaching' and g.key = 'ec-getting-to-know-you';

delete from template_prep_items i using template_prep_groups g, templates t
 where i.group_id = g.id and g.template_id = t.id and t.slug = 'executive-coaching'
   and g.key in ('ec-onboarding-form', 'ec-forms', 'ec-key-dates');

update template_prep_groups g set
  title = 'Your Coach',
  description = 'How to reach your coach, and where to book time.',
  position = 4
from templates t where g.template_id = t.id and t.slug = 'executive-coaching' and g.key = 'ec-forms';

insert into template_prep_groups (template_id, section, key, title, description, kind, position, client_editable, hidden_by_default)
select t.id, v.section, v.key, v.title, v.description, v.kind::prep_group_kind, v.position, v.client_editable, v.hidden
from templates t
cross join (values
  -- Client Info
  ('TEAM', 'ec-agreement', 'Coaching Agreement',
   'The signed agreement, with its start and end dates. Sessions pushed back do not push the end date.', 'files', 4, false, false),
  ('TEAM', 'ec-milestones', 'Milestones and Mountaintops',
   'The story of the growth: where we began, the milestones along the way, and where we are now. Your coach writes these; you get to read them back at the end.', 'notes', 7, false, false),
  -- Deliverables: the coaching tools, in front
  ('DELIVERABLES', 'ec-vision', 'Your Vision',
   'What do you want to be true about you, your life and your work at the end of our time together? The picture we build backwards from.', 'notes', 1, true, false),
  ('DELIVERABLES', 'ec-gap', 'Vision–Reality Gap',
   'Where you are now against where you want to be, named honestly. We work the gap; we do not pretend it away.', 'notes', 2, true, false),
  ('DELIVERABLES', 'ec-rackets', 'Rackets and Limiting Beliefs',
   'The complaint you keep running, the payoff it gives you, and what it costs. Naming it is most of the work.', 'notes', 3, true, false),
  ('DELIVERABLES', 'ec-sprint', '90-Day Sprint',
   'One sprint at a time: the vision for the next ninety days, the milestones, and the nuclear action that moves it this week.', 'notes', 4, true, false),
  ('DELIVERABLES', 'ec-facts', 'FACTS Inventory',
   'What you are Frustrated with, Avoiding, Complaining about, Tolerating, or Scared of. The list changes; keeping it current is the practice.', 'notes', 5, true, false),
  ('DELIVERABLES', 'ec-coach-tools', 'Coach''s Tools',
   'Anything else we build along the way — a card per tool, added as it comes up.', 'notes', 6, true, false),
  -- Whiteboard
  ('WHITEBOARD', 'ec-whiteboard', 'Whiteboard',
   'Photos of the whiteboard and the sketch wall from our sessions, and the tools we discovered along the way.', 'files', 1, false, false)
) as v(section, key, title, description, kind, position, client_editable, hidden)
where t.slug = 'executive-coaching'
on conflict (template_id, key) do update
  set section = excluded.section, title = excluded.title, description = excluded.description,
      kind = excluded.kind, position = excluded.position,
      client_editable = excluded.client_editable, hidden_by_default = excluded.hidden_by_default;

-- The Younique tools stay, hidden until a conversation calls for one. The
-- client fills them in when they are shown.
update template_prep_groups g set hidden_by_default = true, client_editable = true, position = g.position + 20
from templates t where g.template_id = t.id and t.slug = 'executive-coaching'
  and g.key in ('ec-thrill-professional', 'ec-thrill-personal', 'ec-role-description', 'ec-chronic-complaints',
                'ec-storyboard', 'ec-insights', 'ec-strengths', 'ec-apest', 'ec-motivators',
                'ec-activator-advantage', 'ec-life-stage', 'ec-passion-funnel', 'ec-offenders')
  and g.position < 20;
update template_prep_groups g set client_editable = true
from templates t where g.template_id = t.id and t.slug = 'executive-coaching' and g.section = 'Optional Life Planning';

insert into template_prep_items (group_id, title, notes, external_url, position)
select g.id, v.title, v.notes, v.url, v.position
from template_prep_groups g
join templates t on t.id = g.template_id
join (values
  ('ec-key-dates', 'Coaching engagement — start to finish', 'From the agreement. Set the start and end dates here.', null, 1),

  ('ec-onboarding-form', 'What is your birthday?', null, null, 1),
  ('ec-onboarding-form', 'What is your occupation?', null, null, 2),
  ('ec-onboarding-form', 'What is your marital status?', null, null, 3),
  ('ec-onboarding-form', 'Do you have kids?', null, null, 4),
  ('ec-onboarding-form', 'What are the three biggest changes you are committed to making in your life in the next three months?', null, null, 5),
  ('ec-onboarding-form', 'What are your three biggest accomplishments to date?', null, null, 6),
  ('ec-onboarding-form', 'What is the hardest thing in your life you have had to overcome?', null, null, 7),
  ('ec-onboarding-form', 'Have you worked with a coach before?', null, null, 8),
  ('ec-onboarding-form', 'Have you had any major transitions in the last two years?', null, null, 9),
  ('ec-onboarding-form', 'How do you typically get in your own way?', null, null, 10),
  ('ec-onboarding-form', 'Who are the key people in your life, and what do they provide for you?', null, null, 11),
  ('ec-onboarding-form', 'On a scale of 1 to 10, how much stress is in your life right now?', null, null, 12),
  ('ec-onboarding-form', 'What are your primary stressors?', null, null, 13),
  ('ec-onboarding-form', 'What motivates you?', null, null, 14),
  ('ec-onboarding-form', 'If you reach the age of 95, what regrets do you think you will have?', null, null, 15),
  ('ec-onboarding-form', 'What is your favorite sweet treat?', null, null, 16),
  ('ec-onboarding-form', 'What do you like to do in your free time?', null, null, 17),
  ('ec-onboarding-form', 'What is your favorite vacation spot?', null, null, 18),

  ('ec-forms', 'Your coach', 'Name and email — your coach fills this in.', null, 1),
  ('ec-forms', 'Your coach''s mobile', 'For the quick text between sessions.', null, 2),
  ('ec-forms', 'Book your next session', 'Your coach adds their scheduling link here.', null, 3),
  ('ec-forms', 'Join the coaching call', 'Your coach adds the video-call link here.', null, 4),

  ('ec-milestones', 'Where we began', null, null, 1),
  ('ec-milestones', 'Midpoint', null, null, 2),
  ('ec-milestones', 'Where we are now', null, null, 3),

  ('ec-vision', 'About you', null, null, 1),
  ('ec-vision', 'Your life', null, null, 2),
  ('ec-vision', 'Your work or business', null, null, 3),
  ('ec-vision', 'The one line that sums it up', null, null, 4),

  ('ec-gap', 'Where I am now', null, null, 1),
  ('ec-gap', 'Where I want to be', null, null, 2),
  ('ec-gap', 'The gap, in one sentence', null, null, 3),
  ('ec-gap', 'What closing it would make possible', null, null, 4),

  ('ec-rackets', 'The racket — the story I keep telling', null, null, 1),
  ('ec-rackets', 'What it gets me — the payoff', null, null, 2),
  ('ec-rackets', 'What it costs me', null, null, 3),
  ('ec-rackets', 'The belief underneath it', null, null, 4),
  ('ec-rackets', 'What I choose instead', null, null, 5),

  ('ec-sprint', 'Sprint vision', null, null, 1),
  ('ec-sprint', 'Milestone 1', null, null, 2),
  ('ec-sprint', 'Milestone 2', null, null, 3),
  ('ec-sprint', 'Milestone 3', null, null, 4),
  ('ec-sprint', 'This week''s nuclear action', null, null, 5),

  ('ec-facts', 'Frustrated with', null, null, 1),
  ('ec-facts', 'Avoiding', null, null, 2),
  ('ec-facts', 'Complaining about', null, null, 3),
  ('ec-facts', 'Tolerating', null, null, 4),
  ('ec-facts', 'Scared of', null, null, 5)
) as v(key, title, notes, url, position) on v.key = g.key
where t.slug = 'executive-coaching'
  and not exists (select 1 from template_prep_items x where x.group_id = g.id and x.title = v.title);

-- The Performance Practices as text, drawn by the portal. The screenshots
-- come off in the follow-up script (objects cannot be deleted from SQL).
update template_resources r set layout = 'practice', file_path = null, file_name = null, file_size = null, thumb_path = null,
  description = v.steps
from templates t, (values
  ('Occurrence', E'Notice your occurrence with everything\nStop immediate judgement\nAim to be curious before you respond\nUse occurrence liberally with the team: "It occurs to me that…", "From my perspective…", "What I make of that…"'),
  ('Affirmation', E'Take the first ten minutes in meetings\nOffer it spontaneously\nAffirm the person — be specific\nThe person being affirmed maintains eye contact\nThe person being affirmed responds: "Thank you, John. I receive that."'),
  ('Invitation and On the Hook', E'How do commitments get created?\nA supervisor, peer or coach can invite a commitment\nSay, "I would like to invite you to commit."\nAllow negotiation appropriate to the working relationship\nA person can initiate a commitment: "I would like to put myself on the hook."\nAlways indicate time precisely: "I will complete this by end of day Thursday."'),
  ('Commitment', E'Commitment brings integrity and workability to the team\nThink of it like mechanical integrity: a bridge needs structural integrity; a team needs workability integrity\nEnd conversations and meetings with commitments\nAlways put a time stamp on it\nGet it out of your head and onto paper\nNotify the person as soon as a commitment can''t be kept\nDo the growth or trust process when one is broken'),
  ('Feedback: Giving', E'Ask for their permission\nAlign the feedback to the vision\nMake it specific — vague feedback gives vague results\nUse subjective language: "It occurs to me…", "I am willing to be wrong…"\nInvite curiosity for both of you\nBe solution focused\nCreate agreement: avoid assumption, clarify expectations'),
  ('Feedback: Receiving', E'Grant permission to receive it\nSay, "Thank you for caring enough to give me feedback."\nAsk, "Is there anything else?"\nFocus on the one percent that is true'),
  ('Trust Process', E'Acknowledge the broken commitment\nExplore the impact: "What was the impact of my broken commitment?"\nRequest forgiveness: "Will you forgive me?"\nRestore trust: "How can I restore trust with you?"'),
  ('Growth Process', E'Acknowledge the broken commitment\nWhat was more important?\nThe bull test: would you have kept it with a million dollars at stake?\nSurvival-needs review: look good, feel good, be right, be in control\nIs it a pattern?\nWhat are the costs of the pattern?\nReconnect to your vision\nMake a new commitment')
) as v(title, steps)
where r.template_id = t.id and t.slug = 'executive-coaching' and r.section = 'Healthy Practices' and r.title = v.title;
