-- Campo Cani: il cliente dà un voto da 1 a 5 alla lezione fatta, con un commento facoltativo.
-- Il proprietario vede voti e commenti nella pagina Incassi.
-- Da eseguire nel SQL Editor di Supabase dopo 0021_nexi.sql.

-- Un voto per lezione. Il giorno è copiato dalla lezione per leggere i voti di un periodo.
create table public.lesson_ratings (
  booking_id uuid primary key references public.bookings on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  day date not null,
  score int not null check (score between 1 and 5),
  comment text not null default '' check (length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.lesson_ratings (day);
alter table public.lesson_ratings enable row level security;
create policy "voti propri o proprietario" on public.lesson_ratings for select using (user_id = auth.uid() or public.is_owner());
create policy "voti proprietario" on public.lesson_ratings for delete using (public.is_owner());

-- Il cliente vota una sua lezione già cominciata; votando di nuovo cambia il voto.
create function public.rate_lesson(p_booking uuid, p_score int, p_comment text default '') returns public.lesson_ratings
language plpgsql security definer set search_path = public as $$
declare b public.bookings; r public.lesson_ratings;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid() and status = 'active';
  if b.id is null then raise exception 'Lezione non trovata'; end if;
  if (b.day + make_interval(mins => b.start_min)) > (now() at time zone 'Europe/Rome') then
    raise exception 'Si vota la lezione dopo averla fatta';
  end if;
  if p_score is null or p_score not between 1 and 5 then raise exception 'Scegli un voto da 1 a 5'; end if;
  insert into public.lesson_ratings (booking_id, user_id, day, score, comment)
  values (b.id, b.user_id, b.day, p_score, left(trim(coalesce(p_comment, '')), 500))
  on conflict (booking_id) do update set score = excluded.score, comment = excluded.comment, updated_at = now()
  returning * into r;
  return r;
end $$;
grant execute on function public.rate_lesson(uuid, int, text) to authenticated;
