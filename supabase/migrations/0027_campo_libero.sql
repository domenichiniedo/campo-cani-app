-- Campo Cani: il campo libero.
-- Un tipo di lezione può essere "campo libero": il cliente prenota il campo per il suo turno e lo paga come una
-- lezione (al campo, con carta, bonifico o pacchetto), ma senza trainer. Non conta tra le lezioni da assegnare e
-- non si fa in gruppo.
-- Da eseguire nel SQL Editor di Supabase dopo 0026_bacheca_spese.sql.

alter table public.lesson_types add column free_field boolean not null default false;
alter table public.lesson_types add constraint lesson_types_free_field_single check (not free_field or group_seats is null);

-- Sul campo libero non c'è trainer: se arriva, si toglie.
create function public.guard_free_field() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_id is not null and exists (select 1 from public.lesson_types where id = new.lesson_type and free_field) then
    new.trainer_id := null;
  end if;
  return new;
end $$;
create trigger bookings_free_field before insert or update of trainer_id, lesson_type on public.bookings
  for each row execute function public.guard_free_field();
