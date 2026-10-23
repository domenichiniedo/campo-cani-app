-- Campo Cani: il titolare diventa proprietario da solo, senza SQL a mano.
-- L'email del titolare sta in owner_setup (la scrive tools/nuovo-centro.mjs, o l'ultima riga di
-- supabase/setup.sql). Chi si iscrive dall'app con quell'email entra già come proprietario;
-- se l'account esiste già, set_owner_email lo rende proprietario subito.
-- La tabella non ha regole di lettura: l'email del titolare non la vede nessun cliente.
-- Da eseguire nel SQL Editor di Supabase dopo 0014_foto_e_penalita.sql.

create table public.owner_setup (
  id int primary key default 1 check (id = 1),
  email text not null check (email = lower(trim(email)) and email <> '')
);
alter table public.owner_setup enable row level security;

create function public.profiles_auto_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.owner_setup where email = lower(trim(new.email))) then
    new.role := 'owner';
  end if;
  return new;
end $$;
create trigger profiles_auto_owner before insert on public.profiles
  for each row execute function public.profiles_auto_owner();

-- Solo dal SQL Editor o dagli strumenti del fornitore: nessun utente dell'app può chiamarla.
create function public.set_owner_email(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(p_email));
begin
  if e = '' or e not like '%@%' then raise exception 'Email del titolare non valida.'; end if;
  insert into public.owner_setup (id, email) values (1, e) on conflict (id) do update set email = excluded.email;
  update public.profiles set role = 'owner' where lower(email) = e;
end $$;
revoke execute on function public.set_owner_email(text) from public, anon, authenticated;
