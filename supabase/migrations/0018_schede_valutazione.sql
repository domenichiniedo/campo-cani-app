-- Campo Cani: schede di valutazione nel diario dei cani (piano Pro).
-- Il proprietario prepara le schede con le sue voci (voto da 1 a 5, sì/no, scelta tra risposte, testo),
-- per esempio "Primo incontro" o "Ipersensibilità al tatto". La scheda valuta
-- il cane: trainer e proprietario la compilano dal diario del cane quando vogliono, oppure nella
-- pagina del diario di una lezione. La vedono il cliente e il campo.
-- Nella pagina si salva una copia della scheda con i valori: cambiare la scheda dopo non cambia
-- le pagine già scritte.
-- Da eseguire nel SQL Editor di Supabase dopo 0017_consenso_social.sql.

-- Voci della scheda: [{"label": "Approccio alle persone", "kind": "score" | "yesno" | "text" | "choice"}, ...].
-- Le voci "choice" hanno anche le risposte tra cui scegliere: "options": ["Accetta", "Tollera", "Evita"].
create function public.eval_items_ok(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 40 and not exists (
    select 1 from jsonb_array_elements(p) e
    where jsonb_typeof(e) <> 'object' or coalesce(trim(e->>'label'), '') = ''
      or coalesce(e->>'kind', '') not in ('score', 'yesno', 'text', 'choice')
      or (e->>'kind' = 'choice' and not (
        jsonb_typeof(e->'options') = 'array' and jsonb_array_length(e->'options') between 2 and 20
        and not exists (select 1 from jsonb_array_elements(e->'options') o
          where jsonb_typeof(o) <> 'string' or trim(o #>> '{}') = ''))))
$$;

create table public.eval_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (trim(name) <> ''),
  items jsonb not null check (public.eval_items_ok(items)),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.eval_forms enable row level security;
create policy "schede leggibili" on public.eval_forms for select using (auth.uid() is not null);
create policy "schede proprietario" on public.eval_forms for all using (public.is_owner()) with check (public.is_owner());

-- La scheda compilata: {"form_id", "name", "items": [{"label", "kind", "value"}]}.
alter table public.dog_notes add column evaluation jsonb;

-- Dalla scheda scelta e dai valori ({"form_id", "values": [...]}, uno per voce, null se vuota)
-- alla copia da salvare nella pagina, con i controlli sui valori.
create function public.eval_filled(p_eval jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f public.eval_forms; vals jsonb; it jsonb; v jsonb; res jsonb := '[]'; i int := 0; filled boolean := false;
begin
  if p_eval is null or jsonb_typeof(p_eval) = 'null' then return null; end if;
  select * into f from public.eval_forms where id::text = p_eval->>'form_id';
  if f.id is null then raise exception 'Scheda di valutazione non trovata'; end if;
  vals := coalesce(p_eval->'values', '[]');
  if jsonb_typeof(vals) <> 'array' then raise exception 'Scheda di valutazione non valida'; end if;
  for it in select * from jsonb_array_elements(f.items) loop
    v := coalesce(vals->i, 'null');
    if it->>'kind' = 'text' and jsonb_typeof(v) = 'string' then
      v := case when trim(v #>> '{}') = '' then 'null' else to_jsonb(left(trim(v #>> '{}'), 2000)) end;
    end if;
    if jsonb_typeof(v) <> 'null' and not (
      (it->>'kind' = 'score' and jsonb_typeof(v) = 'number' and (v #>> '{}') in ('1', '2', '3', '4', '5'))
      or (it->>'kind' = 'yesno' and jsonb_typeof(v) = 'boolean')
      or (it->>'kind' = 'text' and jsonb_typeof(v) = 'string')
      or (it->>'kind' = 'choice' and jsonb_typeof(v) = 'string' and coalesce(it->'options', '[]') ? (v #>> '{}'))) then
      raise exception 'Scheda di valutazione non valida';
    end if;
    filled := filled or jsonb_typeof(v) <> 'null';
    res := res || jsonb_build_array(jsonb_build_object('label', it->>'label', 'kind', it->>'kind', 'value', v));
    i := i + 1;
  end loop;
  if not filled then raise exception 'Compila almeno una voce della scheda'; end if;
  return jsonb_build_object('form_id', f.id, 'name', f.name, 'items', res);
end $$;

-- Come in 0013, con la scheda: una pagina può avere solo la scheda, senza testo.
drop function public.save_dog_note(uuid, text, text);
create function public.save_dog_note(p_booking uuid, p_work text, p_comment text, p_eval jsonb default null) returns public.dog_notes
language plpgsql security definer set search_path = public as $$
declare b public.bookings; lt public.lesson_types; tr public.trainers; pr public.profiles; n public.dog_notes; ev jsonb;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.status <> 'active' then raise exception 'Lezione non trovata'; end if;
  if not public.is_owner() and (b.trainer_id is null or b.trainer_id is distinct from public.my_trainer()) then
    raise exception 'Non è una tua lezione';
  end if;
  -- {"keep": true}: resta la scheda già compilata (per esempio una scheda che non è più in uso).
  if coalesce(p_eval ? 'keep', false) then
    select evaluation into ev from public.dog_notes where booking_id = b.id;
  else
    ev := public.eval_filled(p_eval);
  end if;
  if length(trim(coalesce(p_work, ''))) = 0 and length(trim(coalesce(p_comment, ''))) = 0 and ev is null then
    raise exception 'Scrivi cosa avete fatto o un commento';
  end if;
  select * into lt from public.lesson_types where id = b.lesson_type;
  select * into tr from public.trainers where id = b.trainer_id;
  select * into pr from public.profiles where id = auth.uid();
  insert into public.dog_notes (dog_id, booking_id, trainer_id, author_name, day, lesson, work, comment, evaluation)
  values (b.dog_id, b.id, b.trainer_id,
    case when pr.role = 'owner' then coalesce(nullif(trim(pr.first_name || ' ' || pr.last_name), ''), 'Il campo') else coalesce(tr.name, '') end,
    b.day, concat_ws(' · ', coalesce(lt.label, b.lesson_type), nullif(b.lesson_option, '')), trim(coalesce(p_work, '')), trim(coalesce(p_comment, '')), ev)
  on conflict (booking_id) do update set work = excluded.work, comment = excluded.comment, evaluation = excluded.evaluation,
    author_name = excluded.author_name, updated_at = now()
  returning * into n;
  return n;
end $$;

-- Valutazione del cane fuori dalle lezioni: una pagina del diario di oggi con la scheda e un commento.
create function public.add_dog_eval(p_dog uuid, p_eval jsonb, p_comment text default '') returns public.dog_notes
language plpgsql security definer set search_path = public as $$
declare pr public.profiles; tr public.trainers; n public.dog_notes; ev jsonb;
begin
  if not exists (select 1 from public.dogs where id = p_dog) then raise exception 'Cane non trovato'; end if;
  if not public.is_owner() and not public.trainer_sees_dog(p_dog) then raise exception 'Non è un cane delle tue lezioni'; end if;
  ev := public.eval_filled(p_eval);
  if ev is null then raise exception 'Scegli una scheda di valutazione'; end if;
  select * into pr from public.profiles where id = auth.uid();
  select * into tr from public.trainers where id = public.my_trainer();
  insert into public.dog_notes (dog_id, trainer_id, author_name, day, comment, evaluation)
  values (p_dog, tr.id,
    case when pr.role = 'owner' then coalesce(nullif(trim(pr.first_name || ' ' || pr.last_name), ''), 'Il campo') else coalesce(tr.name, '') end,
    (now() at time zone 'Europe/Rome')::date, trim(coalesce(p_comment, '')), ev)
  returning * into n;
  return n;
end $$;

revoke all on function public.eval_filled(jsonb) from public, anon, authenticated;
revoke all on function public.add_dog_eval(uuid, jsonb, text) from public, anon;
grant execute on function public.add_dog_eval(uuid, jsonb, text) to authenticated;
revoke all on function public.save_dog_note(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_dog_note(uuid, text, text, jsonb) to authenticated;
