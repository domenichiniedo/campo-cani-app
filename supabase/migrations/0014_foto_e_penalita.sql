-- Campo Cani: foto di trainer e clienti, penalità date dal trainer.
-- Le foto stanno nello spazio "foto": si aprono con il loro indirizzo, ma l'elenco dei file lo vede
-- solo il proprietario. Il nome dice di chi è la foto: "trainer-<id del trainer>-..." oppure
-- "cliente-<id dell'utente>-...". Ognuno carica e toglie solo le sue; il proprietario tutte.
-- Il trainer dà una penalità al cane di una sua lezione, come il proprietario dal piano del giorno.
-- Da eseguire nel SQL Editor di Supabase dopo 0013_area_trainer.sql.

alter table public.trainers add column photo_path text;
alter table public.profiles add column photo_path text;

insert into storage.buckets (id, name, public) values ('foto', 'foto', true) on conflict (id) do nothing;

-- Di chi è il file: il proprietario tutti, il trainer i suoi, il cliente i suoi.
create function public.my_photo_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner()
    or (public.my_trainer() is not null and p_name like 'trainer-' || public.my_trainer()::text || '-%')
    or (auth.uid() is not null and p_name like 'cliente-' || auth.uid()::text || '-%')
$$;

create policy "foto proprie leggibili" on storage.objects for select to authenticated
  using (bucket_id = 'foto' and public.my_photo_file(name));
create policy "foto proprie inserisce" on storage.objects for insert to authenticated
  with check (bucket_id = 'foto' and public.my_photo_file(name));
create policy "foto proprie elimina" on storage.objects for delete to authenticated
  using (bucket_id = 'foto' and public.my_photo_file(name));

-- Il trainer cambia la sua foto senza poter toccare nome e lezioni (quelli li decide il centro).
create function public.set_my_photo(p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.my_trainer();
begin
  if me is null then raise exception 'Solo un trainer collegato può cambiare la sua foto.'; end if;
  if p_path is not null and p_path not like 'trainer-' || me::text || '-%' then
    raise exception 'Foto non valida.';
  end if;
  update public.trainers set photo_path = p_path where id = me;
end $$;

-- La foto del cliente la cambia lui stesso dal profilo (modifica profilo proprio), ma solo con un suo file.
alter table public.profiles add constraint profiles_photo_own
  check (photo_path is null or photo_path like 'cliente-' || id::text || '-%');

-- Il trainer vede le penalità dei cani che ha avuto a lezione.
create policy "penalità del trainer" on public.penalties for select using (public.trainer_sees_dog(dog_id));

-- Penalità dal trainer: solo sulle sue lezioni, già iniziate o di oggi. Alla soglia il cane
-- viene sospeso come sempre (trigger penalties_auto_block).
create function public.trainer_penalty(p_booking uuid, p_reason text) returns public.penalties
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  r public.penalties;
begin
  select * into b from public.bookings where id = p_booking and status = 'active';
  if b.id is null then raise exception 'Lezione non trovata.'; end if;
  if not public.is_owner() then
    if b.trainer_id is null or b.trainer_id is distinct from public.my_trainer() then raise exception 'Non è una tua lezione.'; end if;
    if b.day > current_date then raise exception 'La penalità si dà il giorno della lezione o dopo.'; end if;
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Scegli il motivo della penalità.'; end if;
  insert into public.penalties (dog_id, booking_id, reason) values (b.dog_id, b.id, trim(p_reason)) returning * into r;
  return r;
end $$;

-- Il trainer può togliere una penalità data per sbaglio su una sua lezione.
-- Se il cane era già stato sospeso, lo riattiva il proprietario da Clienti.
create function public.trainer_remove_penalty(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() and not exists (
    select 1 from public.penalties p join public.bookings b on b.id = p.booking_id
    where p.id = p_id and b.trainer_id = public.my_trainer()) then
    raise exception 'Non è una penalità di una tua lezione.';
  end if;
  delete from public.penalties where id = p_id;
end $$;

grant execute on function public.set_my_photo(text) to authenticated;
grant execute on function public.trainer_penalty(uuid, text) to authenticated;
grant execute on function public.trainer_remove_penalty(uuid) to authenticated;
