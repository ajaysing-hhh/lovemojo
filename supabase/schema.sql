create extension if not exists pgcrypto;

do $$ begin
  create type public.profile_role as enum ('lover', 'friend');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  phone text,
  role public.profile_role not null default 'lover',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  partner_1_id uuid not null references auth.users(id) on delete restrict,
  partner_2_id uuid references auth.users(id) on delete set null,
  anniversary_date date,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  unique (partner_1_id)
);

create table if not exists public.couple_friends (
  couple_id uuid not null references public.couples(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (couple_id, friend_user_id)
);

create table if not exists public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  code_prefix text not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  max_uses int not null default 1 check (max_uses between 1 and 10),
  uses int not null default 0,
  attempt_count int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  media_path text,
  couple_interest_match numeric not null default 0,
  partner_music_rec numeric not null default 0,
  age_decay numeric not null default 0,
  score numeric generated always as ((couple_interest_match * 3) + (partner_music_rec * 2) - age_decay) stored,
  shared_to_friends boolean not null default false,
  revision int not null default 1,
  last_operation_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  shared_to_friends boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.spectator_recommendations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 2000),
  media_path text,
  saved_for date not null default current_date,
  revision int not null default 1,
  last_operation_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.scheduled_calls (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  topic text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.food_snaps (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  media_path text not null,
  captured_for date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.molo_content (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('quote', 'music')),
  body text not null,
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete cascade,
  kind text not null check (kind in ('suggestion', 'ritual', 'wisdom', 'announcement')),
  category text,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden', 'rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.community_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.auth_is_community_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.community_admins where user_id = auth.uid()) $$;

create or replace function public.approve_community_post(target_post_id uuid, target_couple_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare source public.community_posts;
begin
  if not public.auth_is_lover(target_couple_id) then raise exception 'Only a lover can approve into a couple space'; end if;
  select * into source from public.community_posts where id = target_post_id and status = 'pending' for update;
  if not found then raise exception 'Suggestion is unavailable'; end if;
  update public.community_posts set status = 'approved', couple_id = target_couple_id, approved_by = auth.uid() where id = target_post_id;
end;
$$;

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  game_type text not null check (game_type in ('tic_tac_toe', 'ludo', 'vibe_quiz')),
  board_state jsonb not null default '{}'::jsonb,
  current_turn_uid uuid references auth.users(id),
  move_number int not null default 0,
  status text not null default 'active' check (status in ('active', 'won', 'drawn')),
  updated_at timestamptz not null default now()
);

create or replace function public.auth_is_lover(target_couple_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.couples
  where id = target_couple_id
    and (partner_1_id = auth.uid() or partner_2_id = auth.uid())
) $$;

create or replace function public.auth_is_active_friend(target_couple_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.couple_friends
  where couple_id = target_couple_id and friend_user_id = auth.uid() and status = 'active'
) $$;

create or replace function public.feed_belongs_to(feed_id uuid, target_couple_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.feed_items where id = feed_id and couple_id = target_couple_id
) $$;

create or replace function public.redeem_couple_invite(input_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  invite public.couple_invites;
begin
  select * into invite from public.couple_invites
  where code_hash = encode(digest(input_code, 'sha256'), 'hex')
    and revoked = false and expires_at > now() and uses < max_uses
  for update;
  if not found then
    raise exception 'Invite is invalid, expired, revoked, or exhausted';
  end if;
  update public.couple_invites set uses = uses + 1, attempt_count = attempt_count + 1 where id = invite.id;
  update public.couples set partner_2_id = auth.uid(), status = 'active'
    where id = invite.couple_id and partner_2_id is null;
  update public.profiles set role = 'lover', updated_at = now() where id = auth.uid();
  return invite.couple_id;
end;
$$;

create or replace function public.revoke_invite_code(target_invite_id uuid)
returns void language sql security definer set search_path = public
as $$ update public.couple_invites set revoked = true
where id = target_invite_id and exists (
  select 1 from public.couples c where c.id = couple_id and c.partner_1_id = auth.uid()
) $$;

create or replace function public.remove_friend_access(target_couple_id uuid, target_friend uuid)
returns void language sql security definer set search_path = public
as $$ update public.couple_friends set status = 'revoked'
where couple_id = target_couple_id and friend_user_id = target_friend
and exists (select 1 from public.couples where id = target_couple_id and partner_1_id = auth.uid()) $$;

create or replace function public.leave_couple_space(target_couple_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.couples set partner_2_id = null, status = 'pending'
  where id = target_couple_id and partner_2_id = auth.uid();
end;
$$;

create or replace function public.submit_game_move(target_session uuid, move_payload jsonb, expected_move_number int)
returns public.game_sessions language plpgsql security definer set search_path = public
as $$
declare result public.game_sessions;
begin
  update public.game_sessions
  set board_state = move_payload, move_number = move_number + 1,
      current_turn_uid = case when current_turn_uid = (select partner_1_id from public.couples where id = game_sessions.couple_id)
        then (select partner_2_id from public.couples where id = game_sessions.couple_id)
        else (select partner_1_id from public.couples where id = game_sessions.couple_id) end,
      updated_at = now()
  where id = target_session and move_number = expected_move_number
    and current_turn_uid = auth.uid()
    and public.auth_is_lover(couple_id)
  returning * into result;
  if not found then raise exception 'Invalid turn or stale game revision'; end if;
  return result;
end;
$$;

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_friends enable row level security;
alter table public.couple_invites enable row level security;
alter table public.feed_items enable row level security;
alter table public.feed_comments enable row level security;
alter table public.spectator_recommendations enable row level security;
alter table public.memories enable row level security;
alter table public.scheduled_calls enable row level security;
alter table public.food_snaps enable row level security;
alter table public.molo_content enable row level security;
alter table public.game_sessions enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_admins enable row level security;

drop policy if exists "profiles self or household read" on public.profiles;
drop policy if exists "profiles self write" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "couples member read" on public.couples;
drop policy if exists "couples create" on public.couples;
drop policy if exists "friends member read" on public.couple_friends;
drop policy if exists "feed lovers read" on public.feed_items;
drop policy if exists "feed lovers insert" on public.feed_items;
drop policy if exists "feed lovers update" on public.feed_items;
drop policy if exists "comments read" on public.feed_comments;
drop policy if exists "comments insert" on public.feed_comments;
drop policy if exists "recommendations read" on public.spectator_recommendations;
drop policy if exists "recommendations insert" on public.spectator_recommendations;
drop policy if exists "memories lovers read" on public.memories;
drop policy if exists "memories lovers insert" on public.memories;
drop policy if exists "calls lovers access" on public.scheduled_calls;
drop policy if exists "food snaps lovers access" on public.food_snaps;
drop policy if exists "molo public read" on public.molo_content;
drop policy if exists "games lovers access" on public.game_sessions;
drop policy if exists "community posts read" on public.community_posts;
drop policy if exists "community posts create" on public.community_posts;
drop policy if exists "community reports create" on public.community_reports;
drop policy if exists "community admin posts" on public.community_posts;
drop policy if exists "private couple media read" on storage.objects;
drop policy if exists "private couple media upload" on storage.objects;

create policy "profiles self or household read" on public.profiles for select using (
  id = auth.uid() or exists (select 1 from public.couples c where (c.partner_1_id = auth.uid() or c.partner_2_id = auth.uid()) and (c.partner_1_id = id or c.partner_2_id = id))
);
create policy "profiles self write" on public.profiles for insert with check (id = auth.uid());
create policy "profiles self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "couples member read" on public.couples for select using (partner_1_id = auth.uid() or partner_2_id = auth.uid() or public.auth_is_active_friend(id));
create policy "couples create" on public.couples for insert with check (partner_1_id = auth.uid());
create policy "friends member read" on public.couple_friends for select using (public.auth_is_lover(couple_id) or friend_user_id = auth.uid());
create policy "feed lovers read" on public.feed_items for select using (public.auth_is_lover(couple_id) or (shared_to_friends and public.auth_is_active_friend(couple_id)));
create policy "feed lovers insert" on public.feed_items for insert with check (author_id = auth.uid() and public.auth_is_lover(couple_id));
create policy "feed lovers update" on public.feed_items for update using (public.auth_is_lover(couple_id)) with check (public.auth_is_lover(couple_id) and public.feed_belongs_to(id, couple_id));
create policy "comments read" on public.feed_comments for select using (public.auth_is_lover(couple_id) or (shared_to_friends and public.auth_is_active_friend(couple_id)));
create policy "comments insert" on public.feed_comments for insert with check (author_id = auth.uid() and (public.auth_is_lover(couple_id) or public.auth_is_active_friend(couple_id)));
create policy "recommendations read" on public.spectator_recommendations for select using (public.auth_is_lover(couple_id));
create policy "recommendations insert" on public.spectator_recommendations for insert with check (author_id = auth.uid() and public.auth_is_active_friend(couple_id));
create policy "memories lovers read" on public.memories for select using (public.auth_is_lover(couple_id));
create policy "memories lovers insert" on public.memories for insert with check (author_id = auth.uid() and public.auth_is_lover(couple_id));
create policy "calls lovers access" on public.scheduled_calls for all using (public.auth_is_lover(couple_id)) with check (public.auth_is_lover(couple_id));
create policy "food snaps lovers access" on public.food_snaps for all using (public.auth_is_lover(couple_id)) with check (public.auth_is_lover(couple_id));
create policy "molo public read" on public.molo_content for select using (couple_id is null or public.auth_is_lover(couple_id));
create policy "games lovers access" on public.game_sessions for select using (public.auth_is_lover(couple_id));
create policy "community posts read" on public.community_posts for select using (
  (status = 'approved' and (couple_id is null or public.auth_is_lover(couple_id) or public.auth_is_active_friend(couple_id)))
  or author_id = auth.uid() or public.auth_is_community_admin()
);
create policy "community posts create" on public.community_posts for insert with check (
  author_id = auth.uid() and (public.auth_is_active_friend(couple_id) or couple_id is null)
);
create policy "community reports create" on public.community_reports for insert with check (reporter_id = auth.uid());
create policy "community admin posts" on public.community_posts for update using (public.auth_is_community_admin()) with check (public.auth_is_community_admin());

insert into storage.buckets (id, name, public) values ('couple-media', 'couple-media', false)
on conflict (id) do update set public = false;
create policy "private couple media read" on storage.objects for select using (
  bucket_id = 'couple-media' and public.auth_is_lover((storage.foldername(name))[1]::uuid)
);
create policy "private couple media upload" on storage.objects for insert with check (
  bucket_id = 'couple-media' and public.auth_is_lover((storage.foldername(name))[1]::uuid)
);

do $$ begin
  alter publication supabase_realtime add table public.feed_items;
  alter publication supabase_realtime add table public.feed_comments;
  alter publication supabase_realtime add table public.memories;
  alter publication supabase_realtime add table public.scheduled_calls;
  alter publication supabase_realtime add table public.food_snaps;
  alter publication supabase_realtime add table public.game_sessions;
  alter publication supabase_realtime add table public.community_posts;
exception when duplicate_object then null;
end $$;
