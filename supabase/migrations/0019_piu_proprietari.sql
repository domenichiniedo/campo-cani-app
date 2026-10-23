-- Campo Cani: più proprietari. Un proprietario ne nomina altri con la loro email (Impostazioni → Proprietari):
-- se l'account esiste diventa subito proprietario, altrimenti lo diventa quando si iscrive dall'app.
-- Toglierlo lo riporta cliente (o trainer, se è collegato a un trainer). Nessuno può togliere sé stesso,
-- così resta sempre almeno un proprietario.
-- Da eseguire nel SQL Editor di Supabase dopo 0018_schede_valutazione.sql.

create table public.owner_emails (
  email text primary key check (email = lower(trim(email)) and email like '%@%')
);
alter table public.owner_emails enable row level security;
create policy "proprietari letti dai proprietari" on public.owner_emails for select using (public.is_owner());

-- Il titolare di owner_setup e chi è già proprietario.
insert into public.owner_emails (email) select email from public.owner_setup where email <> 'titolare@esempio.it' on conflict do nothing;
insert into public.owner_emails (email)
  select distinct lower(trim(email)) from public.profiles where role = 'owner' and email like '%@%'
  on conflict do nothing;

create or replace function public.profiles_auto_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.owner_emails where email = lower(trim(new.email)))
    or exists (select 1 from public.owner_setup where email = lower(trim(new.email))) then
    new.role := 'owner';
  end if;
  return new;
end $$;

-- Come prima per il titolare, e in più lo mette fra i proprietari. Se cambia l'email del titolare, quella
-- vecchia esce dall'elenco quando nessuno si era ancora iscritto con lei (era un errore di battitura).
create or replace function public.set_owner_email(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(p_email));
begin
  if e = '' or e not like '%@%' then raise exception 'Email del titolare non valida.'; end if;
  delete from public.owner_emails o using public.owner_setup s
    where o.email = s.email and s.email <> e and not exists (select 1 from public.profiles p where lower(p.email) = o.email);
  insert into public.owner_setup (id, email) values (1, e) on conflict (id) do update set email = excluded.email;
  insert into public.owner_emails (email) values (e) on conflict do nothing;
  update public.profiles set role = 'owner' where lower(email) = e;
end $$;
revoke execute on function public.set_owner_email(text) from public, anon, authenticated;

create function public.add_owner(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_owner() then raise exception 'Solo un proprietario può aggiungere proprietari'; end if;
  if e not like '%_@_%' then raise exception 'Email non valida'; end if;
  insert into public.owner_emails (email) values (e) on conflict do nothing;
  update public.profiles set role = 'owner' where lower(email) = e;
end $$;

create function public.remove_owner(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_owner() then raise exception 'Solo un proprietario può togliere proprietari'; end if;
  if e = (select lower(email) from public.profiles where id = auth.uid()) then
    raise exception 'Non puoi togliere te stesso dai proprietari';
  end if;
  delete from public.owner_emails where email = e;
  delete from public.owner_setup where email = e;
  update public.profiles p
    set role = case when exists (select 1 from public.trainer_accounts a where a.email = e) then 'trainer' else 'client' end
    where lower(p.email) = e and p.role = 'owner';
end $$;
revoke execute on function public.add_owner(text) from public, anon;
revoke execute on function public.remove_owner(text) from public, anon;
grant execute on function public.add_owner(text) to authenticated;
grant execute on function public.remove_owner(text) to authenticated;
