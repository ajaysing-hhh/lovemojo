create extension if not exists pgcrypto;

do $$ begin
  create type public.profile_role as enum ('lover', 'spectator');
exception when duplicate_object then null;
end $$;

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.profile_role not null default 'lover',
  couple_id uuid references public.couples(id) on delete set null,
  interests text[] not null default '{}',
  online_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  author_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  body text not null,
  source_url text,
  couple_interest_match numeric not null default 0,
  partner_music_rec numeric not null default 0,
  age_decay numeric not null default 0,
  score numeric generated always as ((couple_interest_match * 3) + (partner_music_rec * 2) - age_decay) stored,
  shared_to_spectators boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  feed_item_id uuid references public.feed_items(id) on delete cascade not null,
  couple_id uuid references public.couples(id) on delete cascade not null,
  author_id uuid references auth.users(id) on delete cascade not null,
  body text not null check (char_length(body) between 1 and 2000),
  shared_to_spectators boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.spectator_recommendations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  author_id uuid references auth.users(id) on delete cascade not null,
  category text not null,
  body text not null check (char_length(body) between 1 and 1000),
  shared_to_spectators boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  author_id uuid references auth.users(id) on delete cascade not null,
  note text not null check (char_length(note) between 1 and 2000),
  photo_url text,
  saved_for date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.molo_content (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade,
  author_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('quote', 'music')),
  body text not null,
  source_url text,
  created_at timestamptz not null default now()
);

create or replace function public.is_couple_member(target_couple uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where couple_id = target_couple and id = auth.uid()) $$;

create or replace function public.is_spectator(target_couple uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where couple_id = target_couple and id = auth.uid() and role = 'spectator') $$;

do $$ declare table_name text; begin
  foreach table_name in array array['profiles','feed_items','feed_comments','spectator_recommendations','memories','molo_content'] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

drop policy if exists "profiles read in couple" on public.profiles;
create policy "profiles read in couple" on public.profiles for select using (id = auth.uid() or public.is_couple_member(couple_id));
drop policy if exists "couple feed read" on public.feed_items;
create policy "couple feed read" on public.feed_items for select using (public.is_couple_member(couple_id) or (shared_to_spectators and public.is_spectator(couple_id)));
drop policy if exists "couple feed insert" on public.feed_items;
create policy "couple feed insert" on public.feed_items for insert with check (author_id = auth.uid() and public.is_couple_member(couple_id));
drop policy if exists "comments read" on public.feed_comments;
create policy "comments read" on public.feed_comments for select using (public.is_couple_member(couple_id) or (shared_to_spectators and public.is_spectator(couple_id)));
drop policy if exists "comments insert" on public.feed_comments;
create policy "comments insert" on public.feed_comments for insert with check (author_id = auth.uid() and public.is_couple_member(couple_id));
drop policy if exists "spectator recommendations read" on public.spectator_recommendations;
create policy "spectator recommendations read" on public.spectator_recommendations for select using (public.is_couple_member(couple_id));
drop policy if exists "spectator recommendations insert" on public.spectator_recommendations;
create policy "spectator recommendations insert" on public.spectator_recommendations for insert with check (author_id = auth.uid() and public.is_spectator(couple_id));
drop policy if exists "memories shared read" on public.memories;
create policy "memories shared read" on public.memories for select using (public.is_couple_member(couple_id));
drop policy if exists "memories shared insert" on public.memories;
create policy "memories shared insert" on public.memories for insert with check (author_id = auth.uid() and public.is_couple_member(couple_id));
drop policy if exists "molo public read" on public.molo_content;
create policy "molo public read" on public.molo_content for select using (couple_id is null or public.is_couple_member(couple_id));
drop policy if exists "molo couple insert" on public.molo_content;
create policy "molo couple insert" on public.molo_content for insert with check (author_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.feed_items;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.feed_comments;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.spectator_recommendations;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.memories;
exception when duplicate_object then null;
end $$;
