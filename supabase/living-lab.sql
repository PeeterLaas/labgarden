-- PAIvik Living Lab: the lab's public face and its never-ending public seminar series.
--
-- Everything here is PUBLIC by design. Nothing reaches these tables automatically from the lab notebook,
-- the Ticker or the internal Seminar: a person writes each row for the public (later, optionally, through a
-- "Make public" step on the lab server that a PI approves).
--
-- Visitors (roles anon / authenticated, i.e. the publishable key in the browser) can:
--   - read published people, posts and talks, and published (answered, moderated) questions;
--   - ask a question about a talk (insert only: question text and an optional display name).
-- They cannot read unpublished rows, change anything, or see who asked what before it is published.
-- Editing happens in the Supabase dashboard or with the service key on the lab server, never in the browser.
--
-- Run once in the Supabase SQL editor (or with the MCP execute_sql tool), then run the advisors.
-- Example content at the bottom is clearly marked; delete it before going live.

-- People of the lab (only what they agree to show publicly)
create table if not exists public.people (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 120),
  role text not null default '' check (char_length(role) <= 120),
  bio text not null default '' check (char_length(bio) <= 2000),
  link text not null default '' check (link = '' or link ~ '^https://'),
  sort int not null default 100,
  published boolean not null default false
);

-- Lab notes: updates, results, shareable methods, stories
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  kind text not null default 'update' check (kind in ('update', 'result', 'method', 'story')),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 600),
  body_md text not null default '' check (char_length(body_md) <= 40000),
  author_id bigint references public.people (id) on delete set null,
  published_at timestamptz not null default now(),
  published boolean not null default false
);
create index if not exists posts_author_id_idx on public.posts (author_id);
create index if not exists posts_published_idx on public.posts (published_at desc) where published;

-- The public seminar series
create table if not exists public.talks (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  title text not null check (char_length(title) between 1 and 200),
  abstract text not null default '' check (char_length(abstract) <= 6000),
  starts_at timestamptz not null,
  minutes int not null default 60 check (minutes between 5 and 600),
  place text not null default '' check (char_length(place) <= 200),
  online_url text not null default '' check (online_url = '' or online_url ~ '^https://'),
  speaker_name text not null check (char_length(speaker_name) between 1 and 120),
  speaker_affiliation text not null default '' check (char_length(speaker_affiliation) <= 200),
  speaker_id bigint references public.people (id) on delete set null,
  slides_url text not null default '' check (slides_url = '' or slides_url ~ '^https://'),
  recording_url text not null default '' check (recording_url = '' or recording_url ~ '^https://'),
  status text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  published boolean not null default false
);
create index if not exists talks_speaker_id_idx on public.talks (speaker_id);
create index if not exists talks_starts_at_idx on public.talks (starts_at) where published;

-- Questions from the public; shown only once a person has answered and published them
create table if not exists public.questions (
  id bigint generated always as identity primary key,
  talk_id bigint not null references public.talks (id) on delete cascade,
  asked_at timestamptz not null default now(),
  name text not null default '' check (char_length(name) <= 80),
  question text not null check (char_length(question) between 3 and 2000),
  answer text not null default '' check (char_length(answer) <= 6000),
  answered_by text not null default '' check (char_length(answered_by) <= 120),
  answered_at timestamptz,
  published boolean not null default false
);
create index if not exists questions_talk_id_idx on public.questions (talk_id);
create index if not exists questions_published_idx on public.questions (talk_id, answered_at) where published;

-- Row level security on every table (they are in the exposed public schema)
alter table public.people enable row level security;
alter table public.posts enable row level security;
alter table public.talks enable row level security;
alter table public.questions enable row level security;

-- Start from nothing, then grant exactly what visitors need
revoke all on public.people, public.posts, public.talks, public.questions from anon, authenticated;
grant select on public.people, public.posts, public.talks, public.questions to anon, authenticated;
-- asking a question: only these columns can be written; published/answer stay at their defaults
grant insert (talk_id, name, question) on public.questions to anon, authenticated;

drop policy if exists "published people are public" on public.people;
create policy "published people are public" on public.people for select to anon, authenticated using (published);

drop policy if exists "published posts are public" on public.posts;
create policy "published posts are public" on public.posts for select to anon, authenticated using (published);

drop policy if exists "published talks are public" on public.talks;
create policy "published talks are public" on public.talks for select to anon, authenticated using (published);

drop policy if exists "answered questions are public" on public.questions;
create policy "answered questions are public" on public.questions for select to anon, authenticated
  using (published and answer <> '');

drop policy if exists "anyone can ask about a published talk" on public.questions;
create policy "anyone can ask about a published talk" on public.questions for insert to anon, authenticated
  with check (
    published = false and answer = '' and answered_at is null
    and exists (select 1 from public.talks t where t.id = talk_id and t.published and t.status <> 'cancelled')
  );

-- ---------------------------------------------------------------------------------------------
-- EXAMPLE CONTENT (made up). Delete before going live:
--   delete from public.questions; delete from public.talks; delete from public.posts; delete from public.people;
-- ---------------------------------------------------------------------------------------------
do $example$
begin
  if exists (select 1 from public.talks) then
    return;  -- only into an empty database, so running this file twice is safe
  end if;
  insert into public.people (name, role, bio, sort, published) values
    ('Example Researcher', 'Principal investigator', 'Studies the microbes that live in snail guts and soil. (Example person.)', 1, true),
    ('Example Student', 'PhD student', 'Builds DNA sequencing workflows for field samples. (Example person.)', 2, true);

  insert into public.posts (slug, kind, title, summary, body_md, author_id, published_at, published) values
    ('welcome-to-the-living-lab', 'story', 'Welcome to the Living Lab',
     'What this page is: our lab, working in the open, one note at a time.',
     E'We share what we are learning **while** we learn it: methods that work, results we are sure of, and talks anyone can join.\n\n- Lab notes appear here when they are ready to be public.\n- The seminar series below never ends: ask questions, and the speaker answers.\n\n*This is example content.*',
     (select id from public.people where name = 'Example Researcher'), now() - interval '3 days', true),
    ('a-gel-that-always-works', 'method', 'An agarose gel that always works',
     'The 1 % gel recipe we use for every colony PCR, and the three mistakes we stopped making.',
     E'## Recipe\n\n1. 0.5 g agarose in 50 mL 1× TAE\n2. Microwave until fully clear\n3. Cool to hand-warm before adding the stain\n\n*Example content.*',
     (select id from public.people where name = 'Example Student'), now() - interval '1 day', true);

  insert into public.talks (slug, title, abstract, starts_at, place, speaker_name, speaker_affiliation, status, published) values
    ('who-lives-in-a-snail', 'Who lives in a snail? Gut bacteria in 30 minutes',
     'A tour of the bacteria we find in garden snails, how we read their DNA, and what we still cannot explain. No biology background needed. (Example talk.)',
     date_trunc('day', now()) + interval '9 days 16 hours', 'Online and in the lab seminar room', 'Example Researcher', 'Example University', 'planned', true),
    ('sequencing-in-a-backpack', 'Sequencing in a backpack',
     'Taking a pocket-sized DNA sequencer to the field: what worked, what broke, and what we would pack next time. (Example talk.)',
     date_trunc('day', now()) - interval '12 days' + interval '16 hours', 'Online', 'Example Student', 'Example University', 'done', true);

  insert into public.questions (talk_id, name, question, answer, answered_by, answered_at, published) values
    ((select id from public.talks where slug = 'sequencing-in-a-backpack'), 'A curious listener',
     'How long does the battery last in the field?',
     'About six hours of sequencing on one power bank; we carried two. (Example answer.)', 'Example Student', now() - interval '10 days', true);
end
$example$;
