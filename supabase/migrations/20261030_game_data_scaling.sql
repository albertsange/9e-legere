-- 9e Simulator: data-layer clean-up for scale.
-- 1) Voice dictionary keys: commands without an argument are stored as "ID" instead of "ID|undefined".
-- 2) voice_dictionary(): returns only the best-confirmed command per heard phrase, so clients no longer download every row.
-- 3) game_progress: schema v2 (levels + learned pronunciations) with a size limit per user.
-- 4) voice_events: anonymous recognition log is kept for 180 days (weekly clean-up job).

-- 1) Normalise legacy keys, merging counts where both spellings exist.
insert into public.voice_aliases (kind, heard, key, n, updated_at)
select kind, heard, regexp_replace(key, '\|undefined$', ''), n, updated_at
from public.voice_aliases where key like '%|undefined'
on conflict (kind, heard, key) do update
  set n = public.voice_aliases.n + excluded.n,
      updated_at = greatest(public.voice_aliases.updated_at, excluded.updated_at);
delete from public.voice_aliases where key like '%|undefined';

-- 2) Server-side de-duplication of the shared dictionary.
create index if not exists voice_aliases_best_idx on public.voice_aliases (kind, heard, n desc, updated_at desc);

create or replace function public.voice_dictionary(p_limit integer default 5000)
returns table (kind text, heard text, key text, n integer)
language sql stable security invoker set search_path = public as $$
  select d.kind, d.heard, d.key, d.n from (
    select distinct on (a.kind, a.heard) a.kind, a.heard, a.key, a.n
    from public.voice_aliases a
    order by a.kind, a.heard, a.n desc, a.updated_at desc
  ) d
  order by d.n desc
  limit least(greatest(coalesce(p_limit, 5000), 1), 10000);
$$;
revoke all on function public.voice_dictionary(integer) from public;
grant execute on function public.voice_dictionary(integer) to anon, authenticated;

-- 3) One row per user, bounded in size.
alter table public.game_progress drop constraint if exists game_progress_data_size;
alter table public.game_progress add constraint game_progress_data_size check (pg_column_size(data) <= 262144);
comment on table public.game_progress is
  'Per-user data of the 9e Simulator that should follow the user across devices. data = { v: 2, levels: { "<n>": { at } }, voice: { learn: { phr: { heard: { key } }, ex: { heard: key } }, resetAt } }. Device settings (volume, language, voice engine) stay in the browser.';

-- 4) Retention of the anonymous voice-recognition log.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'voice_events_retention';
select cron.schedule('voice_events_retention', '17 3 * * 0',
  $$delete from public.voice_events where created_at < now() - interval '180 days'$$);
