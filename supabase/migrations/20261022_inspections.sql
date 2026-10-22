-- Inspection reports (members only) and a helper that inserts a regulation into a page
-- in chronological order, renumbering the positional [[n]] references.

create table if not exists public.inspections (
  id text primary key,
  sort int not null default 0,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.inspections enable row level security;
create policy "inspections: members read" on public.inspections for select to authenticated using (public.is_member());
create policy "inspections: admin write" on public.inspections for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.inspections to authenticated;

create or replace function public.insert_reg(pid text, reg jsonb, narr_add jsonb default null)
returns int language plpgsql as $$
declare
  k int; n int; i int; c text; pc text; cj jsonb; lg text;
begin
  select count(*) into k from public.page_private pp, jsonb_array_elements(coalesce(pp.content->'regs', '[]'::jsonb)) r
    where pp.page_id = pid and (r->>'year') < (reg->>'year');
  select coalesce(jsonb_array_length(content->'regs'), 0), content::text into n, c from public.page_private where page_id = pid;
  select content::text into pc from public.pages where id = pid;
  for i in reverse n..(k + 1) loop
    c := replace(c, '[[' || i || ']]', '[[' || (i + 1) || ']]');
    pc := replace(pc, '[[' || i || ']]', '[[' || (i + 1) || ']]');
  end loop;
  update public.pages set content = pc::jsonb where id = pid;
  cj := c::jsonb;
  if cj->'regs' is null then cj := jsonb_set(cj, '{regs}', '[]'::jsonb); end if;
  cj := jsonb_insert(cj, array['regs', k::text], reg);
  if narr_add is not null then
    if jsonb_typeof(cj->'narr') is distinct from 'object' then cj := jsonb_set(cj, '{narr}', '{}'::jsonb); end if;
    for lg in select jsonb_object_keys(narr_add) loop
      cj := jsonb_set(cj, array['narr', lg], to_jsonb(trim(coalesce(cj->'narr'->>lg, '') || ' ' || replace(narr_add->>lg, '#R', '[[' || (k + 1) || ']]'))));
    end loop;
  end if;
  update public.page_private set content = cj where page_id = pid;
  return k + 1;
end $$;
revoke all on function public.insert_reg(text, jsonb, jsonb) from public, anon, authenticated;
