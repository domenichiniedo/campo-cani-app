import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { TransferBox } from '@/components/transfer';
import { Badge, Body, Button, Card, Chips, ConfirmButton, ErrorText, Field, Muted, Row } from '@/components/ui';
import { euro } from '@/lib/format';
import { t } from '@/lib/i18n';
import { canRequest, currentMembership, dayText, lastDay, membershipState, PAY_METHODS, payMethodLabel, periodLabel, useMembershipSettings, type PayMethod } from '@/lib/membership';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useTransfer } from '@/lib/transfer';
import type { Membership, MembershipSettings } from '@/lib/types';

type Act = (fn: () => PromiseLike<{ error: unknown }>) => Promise<void>;

/** Il pallino della tessera nella lista dei clienti: niente se è valida. */
export function MembershipBadge({ list, cfg }: { list: Membership[]; cfg: MembershipSettings }) {
  if (list.some((m) => m.status === 'requested')) return <Badge tone="warn">{t('Tessera da incassare')}</Badge>;
  const state = membershipState(list, cfg.renew_days);
  if (state === 'valid') return null;
  if (state === 'expiring') return <Badge tone="warn">{t('Tessera in scadenza')}</Badge>;
  return <Badge tone="bad">{state === 'expired' ? t('Tessera scaduta') : t('Senza tessera')}</Badge>;
}

/** Una riga dello storico delle tessere: periodo, quota, come è stata pagata e quando. */
export function MembershipLine({ m }: { m: Membership }) {
  return (
    <Muted style={{ fontSize: 13, flex: 1 }}>
      {m.status === 'requested'
        ? t('Chiesta il {data}, {importo} da pagare', { data: dayText(m.requested_at.slice(0, 10)), importo: euro(m.price_cents) })
        : [
            t('Dal {dal} al {al}', { dal: dayText(m.starts_on), al: dayText(m.expires_on) }),
            euro(m.price_cents),
            [payMethodLabel(m.pay_method), m.paid_at ? t('pagata il {data}', { data: dayText(m.paid_at.slice(0, 10)) }) : ''].filter(Boolean).join(', '),
            m.number ? t('n. {numero}', { numero: m.number }) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
    </Muted>
  );
}

/**
 * La tessera nella scheda del cliente: com'è messo, l'incasso di una richiesta o di un rinnovo fatto al campo e lo
 * storico di tutte le tessere pagate.
 */
export function OwnerMembership({ userId, list, cfg, act }: { userId: string; list: Membership[]; cfg: MembershipSettings; act: Act }) {
  const [method, setMethod] = useState<PayMethod>('contanti');
  const [number, setNumber] = useState('');
  const [price, setPrice] = useState((cfg.price_cents / 100).toString().replace('.', ','));
  const cur = currentMembership(list);
  const last = lastDay(list);
  const state = membershipState(list, cfg.renew_days);
  const request = list.find((m) => m.status === 'requested');
  const history = list
    .filter((m) => m.status === 'active')
    .sort((a, b) => (b.starts_on ?? '').localeCompare(a.starts_on ?? ''));
  const cents = Math.round(Number(price.replace(',', '.')) * 100);
  const priceOk = Number.isFinite(cents) && cents >= 0;

  // Incassata: la richiesta del cliente diventa pagata; senza richiesta se ne registra una nuova, già pagata.
  const collect = () =>
    act(() =>
      request
        ? supabase.from('memberships').update({ status: 'active', pay_method: method, number: number.trim(), price_cents: cents }).eq('id', request.id)
        : supabase.from('memberships').insert({ user_id: userId, status: 'active', pay_method: method, number: number.trim(), price_cents: cents }),
    ).then(() => setNumber(''));

  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold>{cfg.name}</Body>
        {cur && state === 'valid' && <Badge tone="ok">{t('Valida fino al {data}', { data: dayText(last) })}</Badge>}
        {cur && state === 'expiring' && <Badge tone="warn">{t('Scade il {data}', { data: dayText(last) })}</Badge>}
        {!cur && <Badge tone="bad">{last ? t('Scaduta il {data}', { data: dayText(last) }) : t('Senza tessera')}</Badge>}
      </Row>
      {!!request && <Muted style={{ fontSize: 13 }}>{t('Il cliente ha chiesto la tessera il {data}: segnala pagata quando incassi.', { data: dayText(request.requested_at.slice(0, 10)) })}</Muted>}
      {(!!request || state !== 'valid') && (
        <>
          <Chips items={PAY_METHODS.map((m) => ({ value: m, label: payMethodLabel(m) }))} value={method} onChange={setMethod} />
          <Row>
            <Field label={t('Quota (€)')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={{ width: 110 }} />
            <Field label={t('Numero tessera (facoltativo)')} value={number} onChangeText={setNumber} style={{ flex: 1, minWidth: 160 }} />
          </Row>
          <Row>
            <Button small title={cur || last ? t('Rinnovo incassato') : t('Tessera incassata')} onPress={collect} disabled={!priceOk} />
            {!!request && (
              <ConfirmButton title={t('Rifiuta')} onConfirm={() => act(() => supabase.from('memberships').update({ status: 'cancelled' }).eq('id', request.id))} />
            )}
          </Row>
        </>
      )}
      {history.length > 0 && <Muted style={{ fontSize: 12 }}>{t('Storico delle tessere')}</Muted>}
      {history.map((m) => (
        <Row key={m.id} style={{ justifyContent: 'space-between' }}>
          <MembershipLine m={m} />
          <ConfirmButton title={t('Annulla')} onConfirm={() => act(() => supabase.from('memberships').update({ status: 'cancelled' }).eq('id', m.id))} />
        </Row>
      ))}
    </View>
  );
}

/**
 * La tessera nel Profilo del cliente: se vale e fino a quando, la richiesta o il rinnovo con i dati per pagarla e lo
 * storico. Non si vede se il centro non usa la tessera.
 */
export function ClientMembership() {
  const { profile } = useSession();
  const { cfg } = useMembershipSettings();
  const transfer = useTransfer();
  const plan = usePlan();
  const [list, setList] = useState<Membership[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('memberships').select('*').eq('user_id', profile.id).neq('status', 'cancelled');
    setList((data ?? []) as Membership[]);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!cfg?.enabled || !profile) return null;

  const cur = currentMembership(list);
  const last = lastDay(list);
  const state = membershipState(list, cfg.renew_days);
  const request = list.find((m) => m.status === 'requested');
  const history = list.filter((m) => m.status === 'active').sort((a, b) => (b.starts_on ?? '').localeCompare(a.starts_on ?? ''));
  const who = `${profile.first_name} ${profile.last_name}`.trim();

  async function ask() {
    setErr('');
    setBusy(true);
    const { error } = await supabase.rpc('request_membership');
    setBusy(false);
    if (error) return setErr(errorText(error));
    load();
  }

  return (
    <>
      <Card accent={state !== 'valid'}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body bold>{cfg.name}</Body>
          {request ? (
            <Badge tone="warn">{t('In attesa di pagamento')}</Badge>
          ) : state === 'valid' ? (
            <Badge tone="ok">{t('Valida fino al {data}', { data: dayText(last) })}</Badge>
          ) : state === 'expiring' ? (
            <Badge tone="warn">{t('Scade il {data}', { data: dayText(last) })}</Badge>
          ) : (
            <Badge tone="bad">{state === 'expired' ? t('Scaduta il {data}', { data: dayText(last) }) : t('Non ancora fatta')}</Badge>
          )}
        </Row>
        {!!cur?.number && <Muted>{t('Tessera n. {numero}', { numero: cur.number })}</Muted>}
        <Muted style={{ fontSize: 13 }}>
          {[t('Quota {importo}', { importo: euro(cfg.price_cents) }), periodLabel(cfg.period)].join(' · ')}
          {cfg.required ? `. ${t('Serve per prenotare le lezioni.')}` : ''}
          {cfg.vat && plan.invoices ? `. ${t('Al pagamento ricevi fattura o scontrino.')}` : ''}
        </Muted>
        {request ? (
          <Muted>
            {transfer?.enabled
              ? t('Paga {importo} al campo o con il bonifico qui sotto: la tessera vale appena il campo segna il pagamento.', { importo: euro(request.price_cents) })
              : t('Paga {importo} al campo: la tessera vale appena il campo segna il pagamento.', { importo: euro(request.price_cents) })}
          </Muted>
        ) : (
          canRequest(list, cfg.renew_days) && (
            <Button
              small
              title={last ? t('Rinnova la tessera') : t('Richiedi la tessera')}
              onPress={ask}
              loading={busy}
            />
          )
        )}
        {state === 'expiring' && !request && (
          <Muted style={{ fontSize: 13 }}>{t('Rinnovando ora la nuova tessera parte dal giorno dopo la scadenza: non perdi giorni.')}</Muted>
        )}
        <ErrorText>{err}</ErrorText>
        {history.length > 0 && <Muted style={{ fontSize: 12 }}>{t('Le tue tessere')}</Muted>}
        {history.map((m) => (
          <MembershipLine key={m.id} m={m} />
        ))}
      </Card>
      {request && transfer?.enabled && request.price_cents > 0 && (
        <TransferBox
          title={t('Paga la tessera con bonifico istantaneo')}
          intro={t("Inquadra il codice con l'app della tua banca, oppure copia i dati. Il centro vede l'accredito e segna la tessera pagata.")}
          holder={transfer.holder}
          iban={transfer.iban}
          cents={request.price_cents}
          reason={`${cfg.name} ${who}`.slice(0, 140)}
        />
      )}
    </>
  );
}
