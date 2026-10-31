import { useCallback, useEffect, useState } from 'react';

import { dayKey, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Membership, MembershipSettings } from '@/lib/types';

// Le quote periodiche dei clienti, la tessera e la quota campo: il centro sceglie nome, importo e durata, il cliente
// la chiede o la rinnova dal Profilo e il proprietario la segna pagata quando incassa. Le date sono giorni (AAAA-MM-GG).

export type MembershipKind = MembershipSettings['kind'];

/** Prima la tessera, poi la quota campo. */
export const KINDS: MembershipKind[] = ['tessera', 'campo'];

export type PayMethod = Exclude<Membership['pay_method'], ''>;

export const PAY_METHODS: PayMethod[] = ['contanti', 'carta', 'bonifico'];

export const payMethodLabel = (m: Membership['pay_method']) =>
  m === 'contanti' ? t('Contanti') : m === 'carta' ? t('Carta') : m === 'bonifico' ? t('Bonifico') : '';

export const periodLabel = (p: MembershipSettings['period'], months = 12) =>
  p === 'stagione'
    ? t('Stagione sportiva, dal 1 settembre al 31 agosto')
    : p === 'mesi'
      ? months === 1
        ? t('1 mese dal pagamento')
        : t('{n} mesi dal pagamento', { n: months })
      : t('Anno solare, fino al 31 dicembre');

/** "31/08/2027" da "2027-08-31". */
export const dayText = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');

const todayKey = () => dayKey(today());

/** Le quote pagate, dalla più recente. */
const paid = (list: Membership[]) =>
  list.filter((m) => m.status === 'active' && m.expires_on).sort((a, b) => (b.expires_on ?? '').localeCompare(a.expires_on ?? ''));

/** L'ultimo giorno coperto dalle quote pagate (anche quelle che partono più avanti); null se non ne ha. */
export const lastDay = (list: Membership[]) => paid(list)[0]?.expires_on ?? null;

/** La quota che vale oggi, se c'è. */
export const currentMembership = (list: Membership[], day = todayKey()) =>
  paid(list).find((m) => (m.starts_on ?? '') <= day && day <= (m.expires_on ?? '')) ?? null;

export type MembershipState = 'none' | 'valid' | 'expiring' | 'expired';

/** Mai fatta, valida, in scadenza (entro i giorni di rinnovo) o scaduta. */
export function membershipState(list: Membership[], renewDays: number, day = todayKey()): MembershipState {
  const last = lastDay(list);
  if (!currentMembership(list, day)) return last ? 'expired' : 'none';
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + renewDays);
  // Conta l'ultima quota pagata: con un rinnovo già fatto non è in scadenza.
  return last && last <= dayKey(d) ? 'expiring' : 'valid';
}

/** Il cliente può chiedere la quota o il rinnovo: niente richiesta aperta e la scadenza è vicina o passata. */
export const canRequest = (list: Membership[], renewDays: number) =>
  !list.some((m) => m.status === 'requested') && membershipState(list, renewDays) !== 'valid';

/** Le quote di un tipo, fra tutte quelle di un cliente. */
export const ofKind = (list: Membership[], kind: MembershipKind) => list.filter((m) => (m.kind ?? 'tessera') === kind);

/**
 * Le impostazioni della tessera e della quota campo del centro, in ordine (vuoto finché non arrivano o se il database
 * non le ha ancora). active: solo quelle accese.
 */
export function useMembershipSettings() {
  const [all, setAll] = useState<MembershipSettings[] | null>(null);
  const load = useCallback(
    () =>
      supabase
        .from('membership_settings')
        .select('*')
        .then(({ data, error }) =>
          setAll(error ? [] : ((data ?? []) as MembershipSettings[]).sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind))),
        ),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { all, active: (all ?? []).filter((c) => c.enabled), reload: load };
}
