-- Campo Cani: il cliente può cancellare il proprio account dall'app.
-- Le lezioni future vengono annullate (gli orari tornano liberi), poi si cancella
-- l'utente: profilo, cani, prenotazioni, penalità e pacchetti se ne vanno con lui.
-- Il proprietario non può cancellarsi da qui, per non restare senza accesso.
-- Da eseguire nel SQL Editor di Supabase dopo 0004_pacchetti.sql.

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  if public.is_owner() then raise exception 'L''account del proprietario non si può cancellare dall''app'; end if;
  update public.bookings set status = 'cancelled', cancelled_at = now()
  where user_id = auth.uid() and status = 'active' and day >= (now() at time zone 'Europe/Rome')::date;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account from anon;
