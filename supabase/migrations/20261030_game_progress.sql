-- Per-user progress of the 9e Simulator (completed levels and, later, other preferences).
-- One row per signed-in user; each user can only read and write their own row.
create table if not exists public.game_progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.game_progress enable row level security;

drop policy if exists game_progress_select_own on public.game_progress;
create policy game_progress_select_own on public.game_progress
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists game_progress_insert_own on public.game_progress;
create policy game_progress_insert_own on public.game_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists game_progress_update_own on public.game_progress;
create policy game_progress_update_own on public.game_progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

comment on table public.game_progress is 'Progress of the 9e Simulator per signed-in user (data.levels = { "<n>": { at: ISO timestamp } }).';
