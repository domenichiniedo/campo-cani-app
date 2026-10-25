-- Campo Cani: il numero di microchip del cane, facoltativo ma consigliato all'iscrizione.
-- Da eseguire nel SQL Editor di Supabase dopo 0022_voto_lezioni.sql.

-- 15 cifre (ISO 11784), vuoto se il cliente non lo mette.
alter table public.dogs add column chip text not null default '' check (chip = '' or chip ~ '^[0-9]{15}$');

-- L'iscrizione con email e password: i cani arrivano con il microchip, se c'è.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  d jsonb;
  ch text;
begin
  insert into public.profiles (id, first_name, last_name, phone, email, rules_ver, privacy_ver, rules_accepted_at, privacy_accepted_at,
                               tax_code, billing_street, billing_zip, billing_city, billing_province, social_consent, doc_pref, phone_ok)
  values (new.id, coalesce(m->>'first_name',''), coalesce(m->>'last_name',''), coalesce(m->>'phone',''), coalesce(new.email,''),
          (m->>'rules_ver')::int, (m->>'privacy_ver')::int,
          case when m ? 'rules_ver' then now() end, case when m ? 'privacy_ver' then now() end,
          upper(regexp_replace(coalesce(m->>'tax_code',''), '\s', '', 'g')),
          trim(coalesce(m->>'billing_street','')), trim(coalesce(m->>'billing_zip','')),
          trim(coalesce(m->>'billing_city','')), upper(trim(coalesce(m->>'billing_province',''))),
          coalesce((m->>'social_consent')::boolean, false),
          case when m->>'doc_pref' = 'receipt' then 'receipt' else 'invoice' end,
          not coalesce((select sms_check from public.settings where id = 1), false));
  for d in select * from jsonb_array_elements(coalesce(m->'dogs','[]'::jsonb)) loop
    if length(trim(coalesce(d->>'name',''))) > 0 then
      -- Un microchip scritto male non blocca l'iscrizione: si lascia vuoto e si corregge dal Profilo.
      ch := regexp_replace(coalesce(d->>'chip',''), '\s', '', 'g');
      insert into public.dogs (owner_id, name, breed, birth, chip)
      values (new.id, trim(d->>'name'), coalesce(d->>'breed',''), nullif(d->>'birth','')::date,
              case when ch ~ '^[0-9]{15}$' then ch else '' end);
    end if;
  end loop;
  return new;
end $$;
