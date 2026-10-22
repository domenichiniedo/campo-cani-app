-- Campo Cani: area dei trainer e diario di allenamento dei cani.
-- Il proprietario collega un trainer a un account con la sua email: se l'account esiste diventa
-- subito "trainer", altrimenti lo diventa quando quella persona si iscrive dall'app.
-- Il trainer vede le sue lezioni con cane e cliente, gestisce i suoi orari, fa entrare il cane
-- in campo e scrive nel diario del cane cosa si è fatto e i suoi commenti.
-- Il diario lo leggono il cliente (per i suoi cani), il proprietario e i trainer del cane.
-- Da eseguire nel SQL Editor di Supabase dopo 0012_documento_pacchetti.sql.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('client', 'owner', 'trainer'));

-- Collegamento trainer-account in una tabella a parte: i trainer sono leggibili da tutti,
-- le loro email no.
create table public.trainer_accounts (
  trainer_id uuid primary key references public.trainers on delete cascade,
  email text not null unique check (email = lower(trim(email)) and email <> ''),
  user_id uuid unique references public.profiles on delete set null
);
alter table public.trainer_accounts enable row level security;
create policy "account trainer proprietario" on public.trainer_accounts for select using (public.is_owner());
create policy "account trainer proprio" on public.trainer_accounts for select using (user_id = auth.uid());

-- Il trainer dell'utente connesso, se è un trainer.
create function public.my_trainer() returns uuid
language sql stable security definer set search_path = public as $$
  select a.trainer_id from public.trainer_accounts a join public.profiles p on p.id = a.user_id
  where a.user_id = auth.uid() and p.role = 'trainer'
$$;

-- Clienti e cani che un trainer può vedere: quelli che hanno o hanno avuto lezioni con lui.
create function public.trainer_sees_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_trainer() is not null and exists (
    select 1 from public.bookings where user_id = p_user and trainer_id = public.my_trainer())
$$;
create function public.trainer_sees_dog(p_dog uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_trainer() is not null and exists (
    select 1 from public.bookings where dog_id = p_dog and trainer_id = public.my_trainer())
$$;

create policy "lezioni del trainer" on public.bookings for select using (trainer_id = public.my_trainer());
create policy "clienti del trainer" on public.profiles for select using (public.trainer_sees_user(id));
create policy "cani del trainer" on public.dogs for select using (public.trainer_sees_dog(id));
create policy "orari propri del trainer" on public.trainer_availability for all
  using (trainer_id = public.my_trainer()) with check (trainer_id = public.my_trainer());

-- Il proprietario collega (o scollega, con email vuota) un trainer a un account.
create function public.link_trainer(p_trainer uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.trainer_accounts; pr public.profiles; e text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_owner() then raise exception 'Solo il proprietario'; end if;
  if not exists (select 1 from public.trainers where id = p_trainer) then raise exception 'Trainer non trovato'; end if;
  select * into a from public.trainer_accounts where trainer_id = p_trainer for update;
  if a.user_id is not null then
    update public.profiles set role = 'client' where id = a.user_id and role = 'trainer';
  end if;
  delete from public.trainer_accounts where trainer_id = p_trainer;
  if e = '' then return; end if;
  if exists (select 1 from public.trainer_accounts where email = e) then
    raise exception 'Questa email è già collegata a un altro trainer';
  end if;
  select * into pr from public.profiles where lower(email) = e;
  if pr.role = 'owner' then raise exception 'Questa è l''email del proprietario'; end if;
  if pr.id is not null then update public.profiles set role = 'trainer' where id = pr.id; end if;
  insert into public.trainer_accounts (trainer_id, email, user_id) values (p_trainer, e, pr.id);
end $$;

-- Chi si iscrive con l'email di un trainer diventa trainer.
create function public.link_new_trainer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.trainer_accounts set user_id = new.id where email = lower(trim(new.email)) and user_id is null;
  if found then update public.profiles set role = 'trainer' where id = new.id; end if;
  return new;
end $$;
create trigger profiles_link_trainer after insert on public.profiles
  for each row execute function public.link_new_trainer();

-- Ingresso in campo: il trainer della lezione, il giorno stesso; il proprietario sempre.
create function public.trainer_check_in(p_booking uuid, p_in boolean default true) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings; d public.dogs;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.status <> 'active' then raise exception 'Lezione non trovata'; end if;
  if not public.is_owner() then
    if b.trainer_id is null or b.trainer_id is distinct from public.my_trainer() then raise exception 'Non è una tua lezione'; end if;
    if b.day <> (now() at time zone 'Europe/Rome')::date then raise exception 'Il cane si fa entrare il giorno della lezione'; end if;
  end if;
  select * into d from public.dogs where id = b.dog_id;
  if p_in and d.blocked then raise exception '% è sospeso: non può entrare in campo', d.name; end if;
  update public.bookings set checked_in_at = case when p_in then coalesce(checked_in_at, now()) end
  where id = b.id returning * into b;
  return b;
end $$;

-- Diario di allenamento: una pagina per lezione, attaccata al cane.
create table public.dog_notes (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs on delete cascade,
  booking_id uuid unique references public.bookings on delete set null,
  trainer_id uuid references public.trainers on delete set null,
  author_name text not null default '',
  day date not null,
  lesson text not null default '',
  work text not null default '',
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.dog_notes (dog_id, day desc);
alter table public.dog_notes enable row level security;
create policy "diario leggibile" on public.dog_notes for select using (
  public.is_owner()
  or exists (select 1 from public.dogs where id = dog_id and owner_id = auth.uid())
  or public.trainer_sees_dog(dog_id));
create policy "diario proprietario" on public.dog_notes for delete using (public.is_owner());

-- Il trainer scrive (o corregge) la pagina di una sua lezione; il proprietario di qualunque lezione.
create function public.save_dog_note(p_booking uuid, p_work text, p_comment text) returns public.dog_notes
language plpgsql security definer set search_path = public as $$
declare b public.bookings; lt public.lesson_types; tr public.trainers; pr public.profiles; n public.dog_notes;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.status <> 'active' then raise exception 'Lezione non trovata'; end if;
  if not public.is_owner() and (b.trainer_id is null or b.trainer_id is distinct from public.my_trainer()) then
    raise exception 'Non è una tua lezione';
  end if;
  if length(trim(coalesce(p_work, ''))) = 0 and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Scrivi cosa avete fatto o un commento';
  end if;
  select * into lt from public.lesson_types where id = b.lesson_type;
  select * into tr from public.trainers where id = b.trainer_id;
  select * into pr from public.profiles where id = auth.uid();
  insert into public.dog_notes (dog_id, booking_id, trainer_id, author_name, day, lesson, work, comment)
  values (b.dog_id, b.id, b.trainer_id,
    case when pr.role = 'owner' then coalesce(nullif(trim(pr.first_name || ' ' || pr.last_name), ''), 'Il campo') else coalesce(tr.name, '') end,
    b.day, concat_ws(' · ', coalesce(lt.label, b.lesson_type), nullif(b.lesson_option, '')), trim(coalesce(p_work, '')), trim(coalesce(p_comment, '')))
  on conflict (booking_id) do update set work = excluded.work, comment = excluded.comment, author_name = excluded.author_name, updated_at = now()
  returning * into n;
  return n;
end $$;

revoke all on function public.link_trainer, public.trainer_check_in, public.save_dog_note from anon;
grant execute on function public.link_trainer(uuid, text) to authenticated;
grant execute on function public.trainer_check_in(uuid, boolean) to authenticated;
grant execute on function public.save_dog_note(uuid, text, text) to authenticated;
