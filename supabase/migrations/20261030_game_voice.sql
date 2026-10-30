-- 9e Simulator: shared pronunciation dictionary and anonymous voice-recognition log.
-- Already applied to the Supabase project on 30 October 2026 (migration "game_voice_tables"). Safe to run again.

create table if not exists public.voice_aliases (
  id bigserial primary key,
  kind text not null check (kind in ('phr', 'ex')),
  heard text not null check (char_length(heard) between 1 and 80 and heard ~ '^[A-Za-z0-9 ]+$'),
  key text not null check (char_length(key) between 1 and 40 and key ~ '^[A-Za-z0-9|_-]+$'),
  n integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (kind, heard, key)
);
alter table public.voice_aliases enable row level security;
drop policy if exists voice_aliases_read on public.voice_aliases;
create policy voice_aliases_read on public.voice_aliases for select to anon, authenticated using (true);

create or replace function public.voice_learn(p_kind text, p_heard text, p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind is null or p_kind not in ('phr', 'ex')
     or p_heard is null or char_length(p_heard) not between 1 and 80 or p_heard !~ '^[A-Za-z0-9 ]+$'
     or p_key is null or char_length(p_key) not between 1 and 40 or p_key !~ '^[A-Za-z0-9|_-]+$' then
    return;
  end if;
  insert into public.voice_aliases (kind, heard, key) values (p_kind, p_heard, p_key)
  on conflict (kind, heard, key) do update set n = public.voice_aliases.n + 1, updated_at = now();
end;
$$;
revoke all on function public.voice_learn(text, text, text) from public;
grant execute on function public.voice_learn(text, text, text) to anon, authenticated;

create table if not exists public.voice_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  session text check (char_length(session) <= 40),
  version text check (char_length(version) <= 20),
  engine text check (char_length(engine) <= 10),
  level text check (char_length(level) <= 20),
  state text check (char_length(state) <= 20),
  kind text not null check (char_length(kind) <= 12),
  heard text check (char_length(heard) <= 300),
  detail text check (char_length(detail) <= 300),
  data jsonb check (data is null or pg_column_size(data) <= 4000)
);
alter table public.voice_events enable row level security;
drop policy if exists voice_events_insert on public.voice_events;
create policy voice_events_insert on public.voice_events for insert to anon, authenticated with check (true);
drop policy if exists voice_events_admin_read on public.voice_events;
create policy voice_events_admin_read on public.voice_events for select to authenticated using (public.is_admin());
create index if not exists voice_events_created_idx on public.voice_events (created_at desc);
