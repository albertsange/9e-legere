alter table public.inspections add column if not exists own_unit boolean not null default true;
comment on column public.inspections.own_unit is 'true when the inspection concerns the 9e Leger itself; false for other units (shown with less weight).';

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.inspection_findings (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null references public.inspections(id) on delete cascade,
  page_id text not null references public.pages(id) on delete cascade,
  sheet text,
  attribute text not null,
  observation text not null default 'worn' check (observation in ('worn','stock','unspecified')),
  value jsonb not null default '{}'::jsonb,
  quote_fr text,
  certainty text not null default 'certain' check (certainty in ('certain','probable','doubtful')),
  against jsonb,
  verdict text not null default 'unreviewed' check (verdict in ('matches','differs','silent','doubtful','unreviewed')),
  note jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inspection_findings is 'One observation from an inspection about one item and one attribute. Members only.';
comment on column public.inspection_findings.sheet is 'State or sheet number inside the inspection (for example no. 10 regiment, no. 11 store).';
comment on column public.inspection_findings.attribute is 'Free key such as colour, material, trim, buttons, quantity, condition, presence, other.';
comment on column public.inspection_findings.observation is 'worn = what the men wore; stock = what was held in store; unspecified = the document does not say.';
comment on column public.inspection_findings.value is 'Observed value as a per-language dictionary {ca,en,it,fr,de}.';
comment on column public.inspection_findings.quote_fr is 'Original French wording from the document.';
comment on column public.inspection_findings.certainty is 'How sure the reading of the document is.';
comment on column public.inspection_findings.against is 'Regulation compared with, as {year, name}; null when none applies.';
comment on column public.inspection_findings.verdict is 'matches / differs from the regulation in force at the date; silent = the document does not mention it; doubtful; unreviewed = not yet compared.';

create index if not exists inspection_findings_page_idx on public.inspection_findings (page_id, sort);
create index if not exists inspection_findings_insp_idx on public.inspection_findings (inspection_id);

create trigger inspection_findings_touch before update on public.inspection_findings
  for each row execute function public.set_updated_at();

alter table public.inspection_findings enable row level security;

create policy "findings: members read" on public.inspection_findings for select using (public.is_member());
create policy "findings: admin write" on public.inspection_findings for all using (public.is_admin()) with check (public.is_admin());
