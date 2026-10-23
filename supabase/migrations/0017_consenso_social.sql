-- K9 Manager: consenso facoltativo alla pubblicazione delle foto sui social del centro.
-- Si dà all'iscrizione (casella non obbligatoria) e il cliente può cambiarlo dal Profilo quando vuole;
-- il proprietario lo vede nella scheda del cliente, con la data dell'ultima scelta.
-- Da eseguire nel SQL Editor di Supabase dopo 0016_lezioni_di_gruppo.sql.

alter table public.profiles add column social_consent boolean not null default false;
alter table public.profiles add column social_consent_at timestamptz;

-- La data si aggiorna da sola a ogni cambio, così resta traccia di quando è stato dato o tolto.
create function public.stamp_social_consent() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.social_consent then new.social_consent_at := now(); end if;
  elsif new.social_consent is distinct from old.social_consent then
    new.social_consent_at := now();
  else
    new.social_consent_at := old.social_consent_at;
  end if;
  return new;
end $$;
create trigger profiles_social_consent before insert or update on public.profiles
  for each row execute function public.stamp_social_consent();

-- L'iscrizione salva anche la scelta sulle foto inviata dall'app (come in 0003, più social_consent).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  d jsonb;
begin
  insert into public.profiles (id, first_name, last_name, phone, email, rules_ver, privacy_ver, rules_accepted_at, privacy_accepted_at,
                               tax_code, billing_street, billing_zip, billing_city, billing_province, social_consent)
  values (new.id, coalesce(m->>'first_name',''), coalesce(m->>'last_name',''), coalesce(m->>'phone',''), coalesce(new.email,''),
          (m->>'rules_ver')::int, (m->>'privacy_ver')::int,
          case when m ? 'rules_ver' then now() end, case when m ? 'privacy_ver' then now() end,
          upper(regexp_replace(coalesce(m->>'tax_code',''), '\s', '', 'g')),
          trim(coalesce(m->>'billing_street','')), trim(coalesce(m->>'billing_zip','')),
          trim(coalesce(m->>'billing_city','')), upper(trim(coalesce(m->>'billing_province',''))),
          coalesce((m->>'social_consent')::boolean, false));
  for d in select * from jsonb_array_elements(coalesce(m->'dogs','[]'::jsonb)) loop
    if length(trim(coalesce(d->>'name',''))) > 0 then
      insert into public.dogs (owner_id, name, breed, birth)
      values (new.id, trim(d->>'name'), coalesce(d->>'breed',''), nullif(d->>'birth','')::date);
    end if;
  end loop;
  return new;
end $$;
