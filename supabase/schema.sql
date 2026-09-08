-- ==========================================================================
-- Portfolio backend schema for Supabase
-- Run this whole file in the Supabase dashboard: SQL Editor → New query →
-- paste → Run. (It is safe to run more than once.)
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. "messages" — contact form submissions (public INSERT, private read)
-- --------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 2. "projects" — portfolio projects shown on the public site
--    (public read, private write)
-- --------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  tech_tags text[] not null default '{}',
  link text,
  image_url text,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 3. Row Level Security
-- --------------------------------------------------------------------------
alter table public.messages enable row level security;
alter table public.projects enable row level security;

-- MESSAGES ----------------------------------------------------------------
-- Policy 1a (public): anyone may INSERT a message (the contact form works),
-- but may never read other people's messages.
drop policy if exists "messages_insert_for_anon" on public.messages;
create policy "messages_insert_for_anon"
  on public.messages
  for insert
  to anon, authenticated
  with check (true);

-- Policy 1b (private): only logged-in users (you, via the admin panel) may
-- read messages.
drop policy if exists "messages_select_for_auth" on public.messages;
create policy "messages_select_for_auth"
  on public.messages
  for select
  to authenticated
  using (true);

-- PROJECTS ----------------------------------------------------------------
-- Policy 2a (public): anyone may read projects (the public Projects section).
drop policy if exists "projects_select_for_anon" on public.projects;
create policy "projects_select_for_anon"
  on public.projects
  for select
  to anon, authenticated
  using (true);

-- Policy 2b (private): only logged-in users (you) may create, edit or delete
-- projects (the admin panel's "Add Project" form).
drop policy if exists "projects_write_for_auth" on public.projects;
create policy "projects_write_for_auth"
  on public.projects
  for all
  to authenticated
  using (true)
  with check (true);

-- --------------------------------------------------------------------------
-- 4. Admin user (choose ONE method — the SQL one is below, the click-through
--    alternative is documented in the walkthrough):
--
--    Method A — Supabase dashboard (recommended):
--      Authentication → Users → "Add user" → enter email + password → save.
--      That user can then log in via the site's hidden login modal.
--
--    Method B — SQL (uncomment and replace the email/password):
--        select supabase_auth.admin.create_user(
--          email => 'you@example.com',
--          password => 'a-strong-password',
--          email_confirm => true
--        );
-- ==========================================================================
