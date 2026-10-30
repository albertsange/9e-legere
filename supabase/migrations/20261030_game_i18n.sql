-- Translations of the 9e Simulator interface. The Catalan text is the key; the game reads this table at start-up
-- when a language other than Catalan is chosen.
create table if not exists public.game_i18n (
  lang text not null check (lang ~ '^[a-z]{2}$'),
  src text not null check (char_length(src) between 1 and 2000),
  dst text not null check (char_length(dst) between 1 and 4000),
  updated_at timestamptz not null default now(),
  primary key (lang, src)
);
alter table public.game_i18n enable row level security;
drop policy if exists game_i18n_read on public.game_i18n;
create policy game_i18n_read on public.game_i18n for select to anon, authenticated using (true);
-- No insert, update or delete policies: only the service role (and administrators through SQL) can change translations.
