-- ==========================================================================
-- Portfolio backend schema for Supabase
-- Run this whole file in the Supabase dashboard: SQL Editor → New query →
-- paste → Run. (It is safe to run more than once.)
-- ==========================================================================

-- ==========================================================================
--  ADMIN EMAIL — replace 'anshatdesk@gmail.com' in the two policies below
--  with the email of YOUR admin account (the one you log in with via the
--  hidden "AS" logo). It must match window.ADMIN_EMAIL in
--  js/supabase-config.js.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. "messages" — contact form submissions.
--    Inserts happen ONLY through the submit_message RPC below (which rejects
--    blank fields and duplicate emails). Nobody can insert directly, and
--    only the site owner can read.
-- --------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- Backstop: no field may be blank once trimmed.
alter table public.messages drop constraint if exists messages_non_blank;
alter table public.messages add constraint messages_non_blank
  check (length(btrim(name)) > 0 and length(btrim(email)) > 0 and length(btrim(message)) > 0);

-- --------------------------------------------------------------------------
-- 2. "projects" — portfolio projects shown on the public site
--    (public read, owner-only write)
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
-- 3. submit_message RPC — the ONLY way a message can be inserted.
--    security definer: runs as the table owner, so it can read "messages"
--    to enforce the one-per-email rule and insert regardless of RLS.
--    Validates server-side (never trust the client alone) AND requires the
--    caller's JWT email to match p_email — i.e. the sender must have
--    completed the OTP verification for that address first.
-- --------------------------------------------------------------------------
create or replace function public.submit_message(p_name text, p_email text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(btrim(p_email));
  v_name    text := btrim(p_name);
  v_message text := btrim(p_message);
  v_claim   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_existing uuid;
begin
  -- The caller must be signed in with the verified email (OTP flow).
  if v_claim = '' or v_claim <> v_email then
    return jsonb_build_object('ok', false, 'error', 'Please verify your email with the code first.');
  end if;

  -- Non-empty validation.
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'Name is required.');
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'error', 'A valid email is required.');
  end if;
  if v_message = '' then
    return jsonb_build_object('ok', false, 'error', 'Message cannot be empty.');
  end if;

  -- One message per email (case-insensitive).
  select id into v_existing from public.messages where lower(email) = v_email limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'error', 'This email has already sent a message.');
  end if;

  insert into public.messages (name, email, message)
  values (v_name, v_email, v_message);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_message(text, text, text) from public;
grant execute on function public.submit_message(text, text, text) to anon, authenticated;

-- Delete any existing duplicates first (keeps the oldest message per email),
-- so the unique index below can be created cleanly. Remove these 3 lines if
-- you want to keep duplicate rows — the index creation would then fail and
-- you can drop the index statement too.
delete from public.messages m
using public.messages e
where m.email = e.email
  and m.created_at > e.created_at;

-- Hard backstop: never allow two messages from the same email, even through
-- a future code path.
create unique index if not exists messages_unique_email_idx
  on public.messages (lower(email));

-- --------------------------------------------------------------------------
-- 4. Row Level Security
-- --------------------------------------------------------------------------
alter table public.messages enable row level security;
alter table public.projects enable row level security;

-- MESSAGES ----------------------------------------------------------------
-- No direct INSERT for anyone — the submit_message RPC handles inserts.
drop policy if exists "messages_insert_for_anon" on public.messages;

-- Only the site owner's account may read messages. (OTP-verified visitors
-- become "authenticated", so this must NOT be a blanket authenticated rule.)
drop policy if exists "messages_select_for_auth" on public.messages;
drop policy if exists "messages_select_for_admin" on public.messages;
create policy "messages_select_for_admin"
  on public.messages
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'anshatdesk@gmail.com');

-- PROJECTS ----------------------------------------------------------------
-- Anyone may read projects (the public Projects section).
drop policy if exists "projects_select_for_anon" on public.projects;
create policy "projects_select_for_anon"
  on public.projects
  for select
  to anon, authenticated
  using (true);

-- Only the site owner's account may create/edit/delete projects.
-- (Visitors who verify an OTP become authenticated — they must NOT get
-- write access to projects.)
drop policy if exists "projects_write_for_auth" on public.projects;
drop policy if exists "projects_write_for_admin" on public.projects;
create policy "projects_write_for_admin"
  on public.projects
  for all
  to authenticated
  using (auth.jwt() ->> 'email' = 'anshatdesk@gmail.com')
  with check (auth.jwt() ->> 'email' = 'anshatdesk@gmail.com');
