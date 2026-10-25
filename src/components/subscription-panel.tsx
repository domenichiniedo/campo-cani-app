import { useCallback, useEffect, useState } from 'react';

import { TransferBox } from '@/components/transfer';
import { Badge, Body, Button, Card, Chips, ErrorText, Field, Muted, Row } from '@/components/ui';
import { dayKey, euro, today } from '@/lib/format';
import { changePlan, gestoreEnabled, isCentreCode, setCentreIban, subscription, subscriptionCode, type Due, type Formula, type PlanPrice, type Subscription } from '@/lib/gestore';
import { t } from '@/lib/i18n';
import { useLicense } from '@/lib/license-gate';
import { PLAN_IDS, PLANS, type PlanId } from '@/lib/plans';
import { supabase } from '@/lib/supabase';
import { formatIban, isValidIban, normalizeIban } from '@/lib/transfer';

const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? '';

const date = (d: string) => d.split('-').reverse().join('/');
const month = (m: string) => m.split('-').reverse().join('/');
const limit = (n: number | null) => (n === null ? t('senza limite') : String(n));

/** Canone e quota di un piano, o il suo prezzo fisso, in una riga. */
export const priceText = (p: PlanPrice, formula: Formula = 'consumo') =>
  formula === 'fisso' && p.fisso_cents != null
    ? t('{fisso} al mese, prenotazioni comprese', { fisso: euro(p.fisso_cents) })
    : p.canone_cents > 0
      ? t('{canone} al mese + {quota} a prenotazione', { canone: euro(p.canone_cents), quota: euro(p.tariffa_cents) })
      : t('{quota} a prenotazione, senza canone', { quota: euro(p.tariffa_cents) });

/** Il gestore ha il prezzo fisso (per i gestori non ancora aggiornati si paga solo a consumo). */
export const hasFixed = (prices: Partial<Record<string, PlanPrice>>) => Object.values(prices).some((p) => p?.fisso_cents != null);

/** A consumo o fisso: la scelta, con cosa vuol dire. */
export function FormulaPick({ value, onChange, price }: { value: Formula; onChange: (f: Formula) => void; price?: PlanPrice }) {
  return (
    <>
      <Chips
        items={[
          { value: 'consumo' as Formula, label: t('A consumo') },
          { value: 'fisso' as Formula, label: t('Prezzo fisso') },
        ]}
        value={value}
        onChange={onChange}
      />
      <Muted style={{ fontSize: 13 }}>
        {value === 'fisso'
          ? t('Paghi sempre la stessa cifra ogni mese, quante che siano le prenotazioni.')
          : t('Paghi il canone del piano più una quota per ogni prenotazione: conviene se le prenotazioni sono poche.')}
        {price && price.fisso_cents != null ? ' ' + t('A consumo: {consumo}. Fisso: {fisso}.', { consumo: priceText(price), fisso: priceText(price, 'fisso') }) : ''}
      </Muted>
    </>
  );
}

/** Un addebito del mese da pagare con il bonifico istantaneo sul conto del gestore. */
function DueTransfer({ due, to }: { due: Due; to: Subscription['bonifico'] }) {
  const late = due.stato === 'non_pagato' || (!!due.scadenza && due.scadenza < dayKey(today()));
  const intro = [
    t('Canone e prenotazioni di {mese}: {n} prenotazioni.', { mese: month(due.mese), n: due.prenotazioni }),
    late
      ? t("Il pagamento è in ritardo e l'app del centro è bloccata: si sblocca da sola qualche ora dopo l'arrivo del bonifico.")
      : due.scadenza
        ? t("Paga con un bonifico istantaneo entro il {data}: dopo quel giorno l'app del centro si blocca finché il pagamento non arriva.", { data: date(due.scadenza) })
        : '',
    t("Usa esattamente questa causale: il bonifico viene riconosciuto da solo e la licenza si rinnova."),
  ]
    .filter(Boolean)
    .join(' ');
  if (!to.iban) {
    return (
      <Card>
        <Body bold>{t('Da pagare: {importo}', { importo: euro(due.importo_cents) })}</Body>
        <Muted>{t("Il gestore non ha ancora indicato l'IBAN per il pagamento. Riprova più tardi.")}</Muted>
      </Card>
    );
  }
  return (
    <TransferBox
      title={t('Da pagare: {importo}', { importo: euro(due.importo_cents) })}
      intro={intro}
      holder={to.intestatario}
      iban={to.iban}
      cents={due.importo_cents}
      reason={due.causale}
    />
  );
}

/** Abbonamento del centro registrato dall'app: piano (anche da cambiare), cosa pagare e IBAN da cui paga. */
export function SubscriptionPanel() {
  const { license, activate } = useLicense();
  const code = license ? subscriptionCode(license.id) : null;
  const [sub, setSub] = useState<Subscription | null>(null);
  const [pick, setPick] = useState<PlanId | null>(null);
  const [pickFormula, setPickFormula] = useState<Formula | null>(null);
  const [armed, setArmed] = useState(false);
  const [iban, setIban] = useState('');
  const [busy, setBusy] = useState<'plan' | 'iban' | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    if (!code) return;
    token()
      .then((tk) => subscription(code, tk))
      .then(
        (s) => {
          setSub(s);
          setIban(formatIban(s.iban_centro));
        },
        (e: Error) => setErr(t(e.message)),
      );
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  if (!code) return null;
  if (!sub) return err ? <ErrorText>{err}</ErrorText> : null;

  const current = (sub.piano as PlanId) in PLANS ? (sub.piano as PlanId) : 'pro';
  const chosen = pick ?? current;
  const formula: Formula = sub.formula ?? 'consumo';
  const chosenFormula = pickFormula ?? formula;
  const changed = chosen !== current || chosenFormula !== formula;

  async function change() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    setErr('');
    setMsg('');
    setBusy('plan');
    try {
      const r = await changePlan(code!, chosen, chosenFormula, await token());
      setSub(r);
      setPick(null);
      setPickFormula(null);
      const e = chosen !== current ? await activate(r.licenza) : '';
      if (e) setErr(e);
      else if (chosen !== current)
        setMsg(t("Piano {piano} attivo da oggi: i tuoi clienti lo ricevono alla prossima apertura dell'app.", { piano: PLANS[chosen].label }));
      else setMsg(chosenFormula === 'fisso' ? t('Da oggi paghi il prezzo fisso.') : t('Da oggi paghi a consumo.'));
    } catch (e) {
      setErr(t((e as Error).message));
    }
    setBusy(null);
  }

  async function saveIban() {
    setErr('');
    setMsg('');
    const v = normalizeIban(iban);
    if (v && !isValidIban(v)) return setErr(t('IBAN non valido.'));
    setBusy('iban');
    try {
      setSub(await setCentreIban(code!, v, await token()));
      setMsg(v ? t('IBAN salvato: i tuoi bonifici vengono riconosciuti anche senza causale.') : t('IBAN tolto.'));
    } catch (e) {
      setErr(t((e as Error).message));
    }
    setBusy(null);
  }

  const p = PLANS[chosen];
  return (
    <>
      {sub.da_pagare.map((d) => (
        <DueTransfer key={d.id} due={d} to={sub.bonifico} />
      ))}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body bold>{t('Abbonamento')}</Body>
          {sub.da_pagare.length === 0 && <Badge tone="ok">{t('Tutto pagato')}</Badge>}
        </Row>
        <Body>{t('Piano {piano}: {prezzo}', { piano: PLANS[current].label, prezzo: priceText(sub.piani[current], formula) })}</Body>
        {!!sub.credito_cents && (
          <Badge tone="ok">{t('Bonus da scalare dai prossimi conti: {importo}', { importo: euro(sub.credito_cents) })}</Badge>
        )}
        <Muted style={{ fontSize: 13 }}>
          {t("Il primo del mese ricevi qui il conto del mese prima e lo paghi con un bonifico istantaneo entro il giorno 3. Se il pagamento non arriva, l'app del centro si blocca finché non arriva.")}
        </Muted>
        <Body bold>{t('Cambia piano')}</Body>
        <Chips items={PLAN_IDS.map((id) => ({ value: id, label: PLANS[id].label }))} value={chosen} onChange={(v) => (setPick(v), setArmed(false))} />
        <Muted style={{ fontSize: 13 }}>
          {[
            priceText(sub.piani[chosen], chosenFormula),
            t('Clienti: {n}', { n: limit(p.maxClients) }),
            t('Trainer: {n}', { n: limit(p.maxTrainers) }),
            t('Proprietari: {n}', { n: limit(p.maxOwners) }),
            t('Campi: {n}', { n: limit(p.maxFields) }),
          ].join(' · ')}
        </Muted>
        {hasFixed(sub.piani) && (
          <>
            <Body bold>{t('Come paghi')}</Body>
            <FormulaPick value={chosenFormula} onChange={(v) => (setPickFormula(v), setArmed(false))} price={sub.piani[chosen]} />
          </>
        )}
        {changed && (
          <>
            <Muted style={{ fontSize: 13 }}>
              {t('Il cambio vale da oggi: il canone e le prenotazioni di questo mese si dividono a giorni fra il piano di prima e quello nuovo.')}
            </Muted>
            <Button
              small
              title={
                chosen === current
                  ? armed
                    ? t('Confermi?')
                    : chosenFormula === 'fisso'
                      ? t('Passa al prezzo fisso')
                      : t('Passa a consumo')
                  : armed
                    ? t('Confermi il piano {piano}?', { piano: p.label })
                    : t('Passa al piano {piano}', { piano: p.label })
              }
              onPress={change}
              loading={busy === 'plan'}
            />
          </>
        )}
        <Field
          label={t('IBAN da cui paghi (facoltativo)')}
          value={iban}
          onChangeText={setIban}
          placeholder="IT60 X054 2811 1010 0000 0123 456"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button
          small
          kind="ghost"
          title={t("Salva l'IBAN")}
          onPress={saveIban}
          loading={busy === 'iban'}
          disabled={normalizeIban(iban) === sub.iban_centro}
        />
        <ErrorText>{err}</ErrorText>
        {!!msg && <Muted>{msg}</Muted>}
      </Card>
    </>
  );
}

/** Con l'app bloccata il proprietario vede comunque cosa pagare per sbloccarla (se è ancora collegato). */
export function BlockedDues({ code }: { code: string }) {
  const [sub, setSub] = useState<Subscription | null>(null);
  useEffect(() => {
    if (!gestoreEnabled || !isCentreCode(code)) return;
    token()
      .then((tk) => (tk ? subscription(code, tk) : null))
      .then(setSub, () => {});
  }, [code]);
  if (!sub?.da_pagare.length) return null;
  return (
    <>
      {sub.da_pagare.map((d) => (
        <DueTransfer key={d.id} due={d} to={sub.bonifico} />
      ))}
    </>
  );
}
