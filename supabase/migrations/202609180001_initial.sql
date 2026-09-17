-- Run once in the NEW development project's SQL Editor as postgres.
-- No demo data, passwords, or existing local uploads are copied.
-- Transactional: existing same-named tables cause a failure, not an overwrite.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 500),
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  parent_id uuid references public.projects(id) on delete set null,
  category text not null check (category in ('novel', 'music', 'game')),
  title text not null check (char_length(title) between 1 and 140),
  summary text not null check (char_length(summary) between 1 and 500),
  content text not null default '' check (char_length(content) <= 20000),
  author_note text not null default '' check (char_length(author_note) <= 5000),
  progress text not null default '' check (char_length(progress) <= 120),
  license text not null default 'derivatives-ok' check (char_length(license) <= 40),
  attribution text not null default '' check (char_length(attribution) <= 300),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  external_url text check (char_length(external_url) <= 2048),
  cover_url text, asset_url text, asset_name text, asset_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id is distinct from parent_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create table public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, message text not null,
  project_id uuid references public.projects(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 80),
  detail text not null default '' check (char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(), resolved_at timestamptz
);

-- Uploads stay quarantined until the API verifies the actual bytes and ownership.
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  object_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 180),
  media_type text not null,
  byte_size integer not null check (byte_size between 1 and 6291456),
  kind text not null check (kind in ('cover','asset')),
  status text not null default 'pending' check (status in ('pending','verified','attached','rejected')),
  project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now()
);

create index projects_parent_idx on public.projects(parent_id);
create index projects_author_idx on public.projects(author_id);
create index projects_feed_idx on public.projects(status, visibility, category, created_at desc);
create index comments_project_idx on public.comments(project_id, created_at);
create index bookmarks_project_idx on public.bookmarks(project_id);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);
create index reports_project_idx on public.reports(project_id);
create index uploads_owner_idx on public.uploads(owner_id, status);

create function public.unfinished_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'displayName'), ''), '新しい作者'), 60));
  -- Never trust user metadata for role or administrative permissions.
  return new;
end;
$$;
revoke all on function public.unfinished_create_profile() from public, anon, authenticated;
create trigger unfinished_auth_user_created after insert on auth.users
for each row execute function public.unfinished_create_profile();

-- Covers accounts created before this migration without copying email/credentials.
insert into public.profiles(id, display_name)
select id, left(coalesce(nullif(btrim(raw_user_meta_data ->> 'displayName'), ''), '新しい作者'), 60)
from auth.users on conflict (id) do nothing;

create function public.unfinished_touch_project()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.unfinished_touch_project() from public, anon, authenticated;
create trigger unfinished_project_updated before update on public.projects
for each row execute function public.unfinished_touch_project();

-- Backend-for-frontend architecture: ALL data access goes through our Node API.
-- RLS deliberately has no client policies. anon/authenticated cannot enumerate
-- unlisted projects or access profiles, roles, notifications, or pending uploads.
-- service_role bypasses RLS: the future API MUST check every request's identity,
-- ownership, visibility, and branch license before using it.
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.comments enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.uploads enable row level security;
revoke all on public.profiles, public.projects, public.comments, public.bookmarks,
  public.notifications, public.reports, public.uploads from public, anon, authenticated;
grant select, insert, update, delete on public.profiles, public.projects, public.comments,
  public.bookmarks, public.notifications, public.reports, public.uploads to service_role;

-- No public read/write storage policy. API-issued signed URLs only.
-- A conflicting pre-existing bucket aborts rather than changing its permissions.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('project-files', 'project-files', false, 6291456, array[
  'image/png','image/jpeg','image/webp','audio/mpeg','audio/wav','audio/ogg',
  'application/pdf','text/plain','application/json'
]);

notify pgrst, 'reload schema';
commit;
