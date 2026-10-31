import { useCallback, useEffect, useState } from 'react';

import { dayKey, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Membership, MembershipSettings } from '@/lib/types';

// Il tesseramento dei clienti: il centro sceglie nome, quota e durata della tessera, il cliente la chiede o la
// rinnova dal Profilo e il proprietario la segna pagata quando incassa. Le date sono giorni (AAAA-MM-GG).

export type PayMethod = Exclude<Membership['pay_method'], ''>;

export const PAY_METHODS: PayMethod[] = ['contanti', 'carta', 'bonifico'];

export const payMethodLabel = (m: Membership['pay_method']) =>
  m === 'contanti' ? t('Contanti') : m === 'carta' ? t('Carta') : m === 'bonifico' ? t('Bonifico') : '';

export const periodLabel = (p: MembershipSettings['period']) =>
  p === 'stagione' ? t('Stagione sportiva, dal 1 settembre al 31 agosto') : p === 'mesi' ? t('12 mesi dal pagamento') : t('Anno solare, fino al 31 dicembre');

/** "31/08/2027" da "2027-08-31". */
export const dayText = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');

const todayKey = () => dayKey(today());

/** Le tessere pagate, dalla più recente. */
const paid = (list: Membership[]) =>
  list.filter((m) => m.status === 'active' && m.expires_on).sort((a, b) => (b.expires_on ?? '').localeCompare(a.expires_on ?? ''));

/** L'ultimo giorno coperto dalle tessere pagate (anche quelle che partono più avanti); null se non ne ha. */
export const lastDay = (list: Membership[]) => paid(list)[0]?.expires_on ?? null;

/** La tessera che vale oggi, se c'è. */
export const currentMembership = (list: Membership[], day = todayKey()) =>
  paid(list).find((m) => (m.starts_on ?? '') <= day && day <= (m.expires_on ?? '')) ?? null;

export type MembershipState = 'none' | 'valid' | 'expiring' | 'expired';

/** Senza tessera, valida, in scadenza (entro i giorni di rinnovo) o scaduta. */
export function membershipState(list: Membership[], renewDays: number, day = todayKey()): MembershipState {
  const last = lastDay(list);
  if (!currentMembership(list, day)) return last ? 'expired' : 'none';
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + renewDays);
  // Conta l'ultima tessera pagata: con un rinnovo già fatto non è in scadenza.
  return last && last <= dayKey(d) ? 'expiring' : 'valid';
}

/** Il cliente può chiedere la tessera o il rinnovo: niente richiesta aperta e la scadenza è vicina o passata. */
export const canRequest = (list: Membership[], renewDays: number) =>
  !list.some((m) => m.status === 'requested') && membershipState(list, renewDays) !== 'valid';

/** Le impostazioni della tessera del centro (null finché non arrivano o se il database non le ha ancora). */
export function useMembershipSettings() {
  const [cfg, setCfg] = useState<MembershipSettings | null>(null);
  const load = useCallback(
    () =>
      supabase
        .from('membership_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => setCfg((data as MembershipSettings | null) ?? null)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { cfg, reload: load };
}
