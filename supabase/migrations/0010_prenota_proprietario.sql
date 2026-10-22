-- Campo Cani: il proprietario prenota per un cliente già iscritto (dal programma Windows o dall'app).
-- Valgono i controlli sul campo, sul cane e sulle sovrapposizioni; il proprietario può invece
-- prenotare anche fuori dagli orari aperti o nel passato (per segnare una lezione già fatta).
-- Se il cliente ha un pacchetto valido per quella lezione, si scala da lì come quando prenota lui.
-- Il trainer è facoltativo; il controllo che non abbia due lezioni alla stessa ora resta quello di 0002.
-- Da eseguire nel SQL Editor di Supabase dopo 0009_piani.sql.

create function public.owner_book(p_user uuid, p_field uuid, p_dog uuid, p_type text, p_option text, p_day date, p_start int,
  p_trainer uuid default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  t public.lesson_types; f public.fields; dg public.dogs; cp public.client_packages; res public.bookings;
begin
  if not public.is_owner() then raise exception 'Solo il proprietario può prenotare per un cliente'; end if;
  select * into f from public.fields where id = p_field and active;
  if f.id is null then raise exception 'Campo non disponibile'; end if;
  select * into dg from public.dogs where id = p_dog and owner_id = p_user and not archived;
  if dg.id is null then raise exception 'Cane non trovato per questo cliente'; end if;
  select * into t from public.lesson_types where id = p_type;
  if t.id is null then raise exception 'Tipo di lezione non valido'; end if;
  if cardinality(t.options) > 0 and not (p_option = any(t.options)) then raise exception 'Specialità non valida'; end if;
  if p_start % 30 <> 0 or p_start < 0 or p_start + t.duration_min > 1440 then raise exception 'Orario non valido'; end if;

  perform pg_advisory_xact_lock(hashtext('book-' || p_field::text || '-' || p_day::text));
  if exists (select 1 from public.bookings b where b.status = 'active' and b.field_id = p_field and b.day = p_day
             and b.start_min < p_start + t.duration_min and p_start < b.start_min + b.dur_min) then
    raise exception 'Il campo è già occupato a quell''ora';
  end if;

  select * into cp from public.client_packages
  where user_id = p_user and status = 'active' and lessons_used < lessons_total
    and (lesson_type is null or lesson_type = p_type)
    and (expires_at is null or expires_at > now())
  order by expires_at nulls last, activated_at
  limit 1
  for update;

  if cp.id is not null then
    update public.client_packages set lessons_used = lessons_used + 1 where id = cp.id;
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid, package_id, trainer_id)
    values (p_user, p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, 0, 'package', true, cp.id, p_trainer)
    returning * into res;
  else
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid, trainer_id)
    values (p_user, p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, t.price_cents, 'onsite', false, p_trainer)
    returning * into res;
  end if;
  return res;
end $$;
grant execute on function public.owner_book(uuid, uuid, uuid, text, text, date, int, uuid) to authenticated;
