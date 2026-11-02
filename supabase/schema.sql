create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid references public.couples(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null,
  primary key (couple_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  sender_id uuid references auth.users(id) on delete cascade not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_posts (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  title text not null,
  body text not null,
  author_id uuid references auth.users(id) on delete cascade not null,
  published_for date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  author_id uuid references auth.users(id) on delete cascade not null,
  note text not null check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  author_id uuid references auth.users(id) on delete cascade not null,
  category text not null check (category in ('food', 'movie', 'travel', 'business', 'money split', 'other')),
  body text not null check (char_length(body) between 1 and 1000),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_couple_member(target_couple uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.couple_members
  where couple_id = target_couple and user_id = auth.uid()
) $$;

alter table public.couple_members enable row level security;
alter table public.messages enable row level security;
alter table public.daily_posts enable row level security;
alter table public.memories enable row level security;
alter table public.recommendations enable row level security;

create policy "members can read their couple members" on public.couple_members
for select using (user_id = auth.uid() or public.is_couple_member(couple_id));
create policy "members can read messages" on public.messages
for select using (public.is_couple_member(couple_id));
create policy "members can send messages" on public.messages
for insert with check (sender_id = auth.uid() and public.is_couple_member(couple_id));
create policy "members can read daily posts" on public.daily_posts
for select using (public.is_couple_member(couple_id));
create policy "members can publish daily posts" on public.daily_posts
for insert with check (author_id = auth.uid() and public.is_couple_member(couple_id));
create policy "members can read memories" on public.memories
for select using (public.is_couple_member(couple_id));
create policy "members can add memories" on public.memories
for insert with check (author_id = auth.uid() and public.is_couple_member(couple_id));
create policy "members can read recommendations" on public.recommendations
for select using (public.is_couple_member(couple_id));
create policy "members can add recommendations" on public.recommendations
for insert with check (author_id = auth.uid() and public.is_couple_member(couple_id));
create policy "members can accept recommendations" on public.recommendations
for update using (public.is_couple_member(couple_id))
with check (public.is_couple_member(couple_id));

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.daily_posts;
alter publication supabase_realtime add table public.memories;
alter publication supabase_realtime add table public.recommendations;
