-- Edit history of the guide pages: who changed which part of a page, and when.
-- One row per editing session: saves by the same person within 10 minutes are merged.

create table if not exists public.page_edits (
  id           bigint generated always as identity primary key,
  page_id      text not null references public.pages(id) on delete cascade on update cascade,
  editor       uuid references auth.users(id) on delete set null,
  editor_name  text not null,
  edited_at    timestamptz not null default now(),
  fields       text[] not null default '{}'
);
create index if not exists page_edits_page_idx on public.page_edits (page_id, edited_at desc);

alter table public.page_edits enable row level security;
create policy "page_edits: read all" on public.page_edits for select to anon, authenticated using (true);
grant select on public.page_edits to anon, authenticated;

create or replace function public.log_page_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nm text;
  pid text;
  changed text[] := '{}';
  oldc jsonb;
  newc jsonb;
  prev public.page_edits%rowtype;
begin
  if uid is null then
    return new;
  end if;
  if tg_table_name = 'pages' then
    pid := new.id;
    oldc := coalesce(old.content, '{}'::jsonb);
    newc := coalesce(new.content, '{}'::jsonb);
    if new.name is distinct from old.name or new.ib is distinct from old.ib then changed := changed || 'name'::text; end if;
    if new.image is distinct from old.image or new.card is distinct from old.card then changed := changed || 'image'::text; end if;
    if new.parent_id is distinct from old.parent_id or new.sort is distinct from old.sort or new.related is distinct from old.related then
      changed := changed || 'settings'::text;
    end if;
  else
    pid := new.page_id;
    oldc := case when tg_op = 'INSERT' then '{}'::jsonb else coalesce(old.content, '{}'::jsonb) end;
    newc := coalesce(new.content, '{}'::jsonb);
  end if;
  changed := changed || coalesce((
    select array_agg(k order by k) from (
      select jsonb_object_keys(newc) as k union select jsonb_object_keys(oldc)
    ) s where (newc -> k) is distinct from (oldc -> k)
  ), '{}');
  if cardinality(changed) = 0 then
    return new;
  end if;
  select coalesce(nullif(p.nom_guerre, ''), nullif(p.first_name, ''), 'Admin') into nm from public.profiles p where p.id = uid;
  select * into prev from public.page_edits e where e.page_id = pid order by e.edited_at desc limit 1;
  if found and prev.editor = uid and prev.edited_at > now() - interval '10 minutes' then
    update public.page_edits
       set edited_at = now(),
           fields = array(select distinct f from unnest(prev.fields || changed) f order by f)
     where id = prev.id;
  else
    insert into public.page_edits (page_id, editor, editor_name, fields) values (pid, uid, coalesce(nm, 'Admin'), changed);
  end if;
  return new;
end;
$$;
revoke execute on function public.log_page_edit() from public, anon, authenticated;

create trigger log_page_edit after update on public.pages for each row execute function public.log_page_edit();
create trigger log_private_edit after insert or update on public.page_private for each row execute function public.log_page_edit();
