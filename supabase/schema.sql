-- =====================================================================
-- 9e Léger uniform guide — Supabase schema
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to run again (idempotent where possible).
-- =====================================================================

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  first_name  text not null default '' check (char_length(first_name) <= 80),
  last_name   text not null default '' check (char_length(last_name) <= 120),
  nom_guerre  text not null default '' check (char_length(nom_guerre) <= 80),
  esquadra    text not null default '' check (char_length(esquadra) <= 80),
  role        text not null default 'member' check (role in ('member', 'admin')),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  created_at  timestamptz not null default now()
);

create table if not exists public.squads (
  id    bigint generated always as identity primary key,
  name  text not null unique check (char_length(name) between 1 and 80)
);

create table if not exists public.pages (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  parent_id   text references public.pages(id) on delete set null,
  sort        integer not null default 0,
  name        text not null default '',
  ib          text not null default '',
  status      text not null default 'pending' check (status in ('proposed', 'pending')),
  image       text not null default '',
  card        text not null default '',
  related     text[] not null default '{}',
  content     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- members-only part of each page: regulations, evidence, downloads
create table if not exists public.page_private (
  page_id     text primary key references public.pages(id) on delete cascade,
  content     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- editable site texts (home, decisions, sources)
create table if not exists public.site (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------- helper functions
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role = 'admin');
$$;

revoke all on function public.is_member() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_member() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- create the profile when someone signs up (data comes from the sign-up form)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, last_name, nom_guerre, esquadra)
  values (
    new.id, new.email,
    left(coalesce(new.raw_user_meta_data->>'first_name', ''), 80),
    left(coalesce(new.raw_user_meta_data->>'last_name', ''), 120),
    left(coalesce(new.raw_user_meta_data->>'nom_guerre', ''), 80),
    left(coalesce(new.raw_user_meta_data->>'esquadra', ''), 80)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep e-mail in sync if the user changes it
create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.handle_user_email();

-- members cannot change their own role, status or e-mail field; only admins can
create or replace function public.protect_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  -- auth.uid() is null in the SQL editor, so the owner can still promote the first admin there
  if auth.uid() is not null and not public.is_admin() then
    new.role   := old.role;
    new.status := old.status;
    new.email  := old.email;
    new.id     := old.id;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- stamp who edited what
create or replace function public.stamp_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists stamp_pages on public.pages;
create trigger stamp_pages before insert or update on public.pages for each row execute function public.stamp_edit();
drop trigger if exists stamp_private on public.page_private;
create trigger stamp_private before insert or update on public.page_private for each row execute function public.stamp_edit();
drop trigger if exists stamp_site on public.site;
create trigger stamp_site before insert or update on public.site for each row execute function public.stamp_edit();

-- a new page always gets its members-only row
create or replace function public.add_private_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.page_private (page_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists add_private_row on public.pages;
create trigger add_private_row after insert on public.pages for each row execute function public.add_private_row();

-- ---------------------------------------------------------------- row level security
alter table public.profiles     enable row level security;
alter table public.squads       enable row level security;
alter table public.pages        enable row level security;
alter table public.page_private enable row level security;
alter table public.site         enable row level security;

drop policy if exists "profiles: read own or admin"   on public.profiles;
drop policy if exists "profiles: update own or admin" on public.profiles;
drop policy if exists "profiles: admin delete"        on public.profiles;
create policy "profiles: read own or admin"   on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles: update own or admin" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "profiles: admin delete"        on public.profiles for delete to authenticated using (public.is_admin());

drop policy if exists "squads: read all"    on public.squads;
drop policy if exists "squads: admin write" on public.squads;
create policy "squads: read all"    on public.squads for select to anon, authenticated using (true);
create policy "squads: admin write" on public.squads for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pages: read all"    on public.pages;
drop policy if exists "pages: admin write" on public.pages;
create policy "pages: read all"    on public.pages for select to anon, authenticated using (true);
create policy "pages: admin write" on public.pages for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "private: members read" on public.page_private;
drop policy if exists "private: admin write"  on public.page_private;
create policy "private: members read" on public.page_private for select to authenticated using (public.is_member());
create policy "private: admin write"  on public.page_private for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "site: read all"    on public.site;
drop policy if exists "site: admin write" on public.site;
create policy "site: read all"    on public.site for select to anon, authenticated using (true);
create policy "site: admin write" on public.site for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.pages, public.site, public.squads to anon;
grant select, insert, update, delete on public.pages, public.page_private, public.site, public.squads, public.profiles to authenticated;

-- ---------------------------------------------------------------- storage (images and files)
-- public-media: images shown to everyone (infobox, cards, images inside the text)
-- private-media: evidence images and downloads, members only (served with short-lived signed links)
insert into storage.buckets (id, name, public) values ('public-media', 'public-media', true)  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('private-media', 'private-media', false) on conflict (id) do nothing;

drop policy if exists "public-media: admin insert"  on storage.objects;
drop policy if exists "public-media: admin update"  on storage.objects;
drop policy if exists "public-media: admin delete"  on storage.objects;
drop policy if exists "private-media: members read" on storage.objects;
drop policy if exists "private-media: admin insert" on storage.objects;
drop policy if exists "private-media: admin update" on storage.objects;
drop policy if exists "private-media: admin delete" on storage.objects;

create policy "public-media: admin insert"  on storage.objects for insert to authenticated with check (bucket_id = 'public-media' and public.is_admin());
create policy "public-media: admin update"  on storage.objects for update to authenticated using (bucket_id = 'public-media' and public.is_admin());
create policy "public-media: admin delete"  on storage.objects for delete to authenticated using (bucket_id = 'public-media' and public.is_admin());
create policy "private-media: members read" on storage.objects for select to authenticated using (bucket_id = 'private-media' and public.is_member());
create policy "private-media: admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'private-media' and public.is_admin());
create policy "private-media: admin update" on storage.objects for update to authenticated using (bucket_id = 'private-media' and public.is_admin());
create policy "private-media: admin delete" on storage.objects for delete to authenticated using (bucket_id = 'private-media' and public.is_admin());

-- ---------------------------------------------------------------- squads of the 9e
insert into public.squads (name) values
  ('1er Escouade - France'), ('2e Escouade - Belgium'), ('3e Escouade - Italy'), ('4e Escouade - Germany'),
  ('5e Escouade - Catalonia'), ('6e Escouade - England'), ('7e Escouade - Catalonia 2'), ('8e Escouade - Russia')
on conflict (name) do nothing;
revoke execute on function public.handle_new_user(), public.handle_user_email(), public.stamp_edit(), public.add_private_row() from public, anon, authenticated;

-- ---------------------------------------------------------------- storage usage (shown to administrators)
create or replace function public.storage_usage() returns json
language sql stable security definer set search_path = public, storage as $$
  select case when public.is_admin() then
    json_build_object('bytes', coalesce(sum((o.metadata->>'size')::bigint), 0), 'files', count(*))
  end
  from storage.objects o;
$$;
revoke all on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;
