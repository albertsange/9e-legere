-- "My squad": per-squad member lists (web accounts and people without one), uniform level per member,
-- and attendance at events. Administrators only for now; corporals and sergeants will be given access later.

create table if not exists public.squad_rosters (
  squad text primary key,
  settings jsonb not null default '{}'::jsonb, -- {hide: [base column keys], extra: [{id, label}]}
  updated_at timestamptz not null default now()
);

create table if not exists public.squad_members (
  id uuid primary key default gen_random_uuid(),
  squad text not null,
  profile_id uuid references public.profiles(id) on delete set null, -- set when the person has a web account
  first_name text,
  last_name text,
  nom_guerre text,
  rank text,
  birth_date date,
  joined_9e date,
  email text,
  extra jsonb not null default '{}'::jsonb, -- values of the own columns of the squad, keyed by column id
  kit jsonb not null default '{}'::jsonb,   -- uniform level: {"<page id>.<part index>": "ok" | "missing" | "wrong"}
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists squad_members_profile_uq on public.squad_members (profile_id) where profile_id is not null;
create index if not exists squad_members_squad_idx on public.squad_members (squad, sort);

create table if not exists public.squad_events (
  id uuid primary key default gen_random_uuid(),
  squad text not null,
  name text not null,
  year int,
  country text,
  attendees uuid[] not null default '{}', -- squad_members ids
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists squad_events_squad_idx on public.squad_events (squad, year);

create trigger squad_rosters_touch before update on public.squad_rosters for each row execute function public.set_updated_at();
create trigger squad_members_touch before update on public.squad_members for each row execute function public.set_updated_at();
create trigger squad_events_touch before update on public.squad_events for each row execute function public.set_updated_at();

alter table public.squad_rosters enable row level security;
alter table public.squad_members enable row level security;
alter table public.squad_events enable row level security;
create policy "squad_rosters: admin all" on public.squad_rosters for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "squad_members: admin all" on public.squad_members for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "squad_events: admin all" on public.squad_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.squad_rosters, public.squad_members, public.squad_events to authenticated;
