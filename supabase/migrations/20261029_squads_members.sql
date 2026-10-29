-- "My squad" opened to every approved member (read and write), in addition to administrators.
create policy "squad_rosters: member all" on public.squad_rosters for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "squad_members: member all" on public.squad_members for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "squad_events: member all" on public.squad_events for all to authenticated using (public.is_member()) with check (public.is_member());

-- Approved accounts as needed by the squad lists; members cannot read other profiles directly.
create or replace function public.squad_directory()
returns table (id uuid, first_name text, last_name text, nom_guerre text, rank text, birth_date date, joined_9e date, email text, esquadra text, status text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.nom_guerre, p.rank, p.birth_date, p.joined_9e, p.email, p.esquadra, p.status
  from public.profiles p
  where p.status = 'approved' and public.is_member();
$$;
revoke all on function public.squad_directory() from public, anon;
grant execute on function public.squad_directory() to authenticated;
