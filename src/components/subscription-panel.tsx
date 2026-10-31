import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { PayNow } from '@/components/pay-now';
import { TransferBox } from '@/components/transfer';
import { Badge, Body, Button, Card, Chips, ErrorText, Field, Muted, Row } from '@/components/ui';
import { storeApp } from '@/lib/edition';
import { dayKey, euro, monthName, today } from '@/lib/format';
import { cancelSubscription, changePlan, gestoreEnabled, keepSubscription, isCentreCode, setCentreIban, subscription, subscriptionCode, type Due, type Formula, type PastCharge, type PlanPrice, type Subscription } from '@/lib/gestore';
import { t } from '@/lib/i18n';
import { useLicense } from '@/lib/license-gate';
import { PLAN_IDS, PLANS, usePlan, type PlanId } from '@/lib/plans';
import { supabase } from '@/lib/supabase';
import { formatIban, isValidIban, normalizeIban } from '@/lib/transfer';

const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? '';

const date = (d: string) => d.split('-').reverse().join('/');
const month = (m: string) => m.split('-').reverse().join('/');
const limit = (n: number | null) => (n === null ? t('senza limite') : String(n));

/** Canone e quote di un piano, o il suo prezzo fisso, in una riga. */
export function priceText(p: PlanPrice, formula: Formula = 'consumo') {
  if (formula === 'fisso' && p.fisso_cents != null) return t('{fisso} al mese, prenotazioni comprese', { fisso: euro(p.fisso_cents) });
  const base =
    p.canone_cents > 0
      ? t('{canone} al mese + {quota} a prenotazione', { canone: euro(p.canone_cents), quota: euro(p.tariffa_cents) })
      : t('{quota} a prenotazione, senza canone', { quota: euro(p.tariffa_cents) });
  return p.pacchetti_bp ? `${base} + ${t('{pct} del prezzo dei pacchetti', { pct: `${String(p.pacchetti_bp / 100).replace('.', ',')}%` })}` : base;
}

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
function DueTransfer({ due, to, code }: { due: Due; to: Subscription['bonifico']; code: string }) {
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
      reason={due.causale}>
      <PayNow code={code} due={due} />
    </TransferBox>
  );
}

/** "ottobre 2026" da "2026-10". */
const monthYear = (m: string) => `${monthName(Number(m.slice(5, 7)) - 1)} ${m.slice(0, 4)}`;

/** Lo storico dei conti del gestore, mese per mese: quanto, se è pagato e quando. */
function PaymentHistory({ list }: { list: PastCharge[] | undefined }) {
  if (!list) return null;
  const late = (a: PastCharge) => a.stato === 'non_pagato' || (a.stato === 'inviato' && !!a.scadenza && a.scadenza < dayKey(today()));
  return (
    <Card>
      <Body bold>{t('Storico dei pagamenti')}</Body>
      {list.length === 0 && <Muted>{t('Ancora nessun conto: il primo arriva il primo del mese.')}</Muted>}
      {list.map((a) => (
        <Row key={a.id} style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 160 }}>
            <Body>{monthYear(a.mese)}</Body>
            <Muted style={{ fontSize: 13 }}>
              {[
                t('{n} prenotazioni', { n: a.prenotazioni }),
                a.bonus_cents ? t('bonus scalato {importo}', { importo: euro(a.bonus_cents) }) : '',
                a.stato === 'pagato' && a.pagato_il ? t('pagato il {data}', { data: date(a.pagato_il) }) : '',
                a.stato === 'inviato' && a.scadenza ? t('da pagare entro il {data}', { data: date(a.scadenza) }) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Muted>
          </View>
          <Body bold>{euro(a.importo_cents)}</Body>
          {a.stato === 'pagato' || a.stato === 'zero' ? (
            <Badge tone="ok">{a.stato === 'zero' ? t('Niente da pagare') : t('Pagato')}</Badge>
          ) : (
            <Badge tone={late(a) ? 'bad' : 'warn'}>{late(a) ? t('Non pagato') : t('Da pagare')}</Badge>
          )}
        </Row>
      ))}
    </Card>
  );
}

/** Il piano di un centro con la licenza fatta a mano: si cambia con un codice nuovo del gestore. */
function ManualPlan() {
  const p = usePlan();
  return (
    <Card>
      <Body bold>{t('Piano {piano}', { piano: p.label })}</Body>
      <Muted style={{ fontSize: 13 }}>
        {[t('Clienti: {n}', { n: limit(p.maxClients) }), t('Trainer: {n}', { n: limit(p.maxTrainers) }), t('Proprietari: {n}', { n: limit(p.maxOwners) }), t('Campi: {n}', { n: limit(p.maxFields) })].join(' · ')}
      </Muted>
      <Muted>{t('Per cambiare piano chiedi al gestore un nuovo codice di licenza e incollalo in Licenza.')}</Muted>
    </Card>
  );
}

/** Nell'app installata dagli store: piano e conti da pagare, senza pagamenti né cambi di piano. */
function StorePlan({ sub }: { sub: Subscription }) {
  const current = (sub.piano as PlanId) in PLANS ? (sub.piano as PlanId) : 'pro';
  const due = sub.da_pagare.reduce((n, d) => n + d.importo_cents, 0);
  return (
    <>
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold>{t('Abbonamento')}</Body>
        {due === 0 && <Badge tone="ok">{t('Tutto pagato')}</Badge>}
      </Row>
      <Body>{t('Piano {piano}', { piano: PLANS[current].label })}</Body>
      {due > 0 && <Badge tone="warn">{t('Da pagare: {importo}', { importo: euro(due) })}</Badge>}
      {!!sub.disdetta && <Badge tone="bad">{t('Abbonamento disdetto: il servizio finisce il {data}.', { data: date(sub.disdetta) })}</Badge>}
      <Muted style={{ fontSize: 13 }}>{t('Pagamenti, cambio di piano e disdetta si fanno dal programma K9 Manager per computer.')}</Muted>
    </Card>
    <PaymentHistory list={sub.storico} />
    </>
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
  const [busy, setBusy] = useState<'plan' | 'iban' | 'quit' | null>(null);
  const [armedQuit, setArmedQuit] = useState(false);
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

  if (!code) return <ManualPlan />;
  if (!sub) return err ? <ErrorText>{err}</ErrorText> : null;
  if (storeApp) return <StorePlan sub={sub} />;

  const current = (sub.piano as PlanId) in PLANS ? (sub.piano as PlanId) : 'pro';
  // Il piano più piccolo già scelto, che parte dal mese prossimo.
  const next = sub.piano_prossimo && sub.piano_prossimo in PLANS ? (sub.piano_prossimo as PlanId) : null;
  const target = next ?? current;
  const chosen = pick ?? target;
  const formula: Formula = sub.formula ?? 'consumo';
  const nextFormula = sub.formula_prossima ?? null;
  const chosenFormula = pickFormula ?? nextFormula ?? formula;
  const changed = chosen !== target || chosenFormula !== (nextFormula ?? formula);
  // Un piano superiore vale da oggi; un piano più piccolo e il passaggio fra consumo e fisso dal mese prossimo.
  const bigger = PLAN_IDS.indexOf(chosen) > PLAN_IDS.indexOf(current);
  const later = !bigger && (chosen !== current || chosenFormula !== formula);
  const formulaText = (f: Formula) => (f === 'fisso' ? t('Prezzo fisso') : t('A consumo'));

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
      const e = r.piano !== current ? await activate(r.licenza) : '';
      if (e) setErr(e);
      else
        setMsg(
          [
            r.piano !== current ? t("Piano {piano} attivo da oggi: i tuoi clienti lo ricevono alla prossima apertura dell'app.", { piano: PLANS[chosen].label }) : '',
            r.piano_dal && (r.piano_prossimo || r.formula_prossima)
              ? t('Dal {data}: {cosa}.', {
                  data: date(r.piano_dal),
                  cosa: [r.piano_prossimo ? t('piano {piano}', { piano: PLANS[r.piano_prossimo as PlanId]?.label ?? r.piano_prossimo }) : '', r.formula_prossima ? formulaText(r.formula_prossima).toLowerCase() : '']
                    .filter(Boolean)
                    .join(', '),
                })
              : '',
            !r.piano_prossimo && !r.formula_prossima && r.piano === current ? t('Cambio annullato: resta tutto com\'è.') : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
    } catch (e) {
      setErr(t((e as Error).message));
    }
    setBusy(null);
  }

  async function quit() {
    if (!armedQuit) {
      setArmedQuit(true);
      setTimeout(() => setArmedQuit(false), 4000);
      return;
    }
    setArmedQuit(false);
    setErr('');
    setMsg('');
    setBusy('quit');
    try {
      setSub(await (sub!.disdetta ? keepSubscription : cancelSubscription)(code!, await token()));
    } catch (e) {
      setErr(t((e as Error).message));
    }
    setBusy(null);
  }

  async function saveIban() {
    setErr('');
    setMsg('');
    const v = normalizeIban(iban);
    if (!v) return setErr(t("Scrivi l'IBAN da cui paghi il piano."));
    if (!isValidIban(v)) return setErr(t('IBAN non valido.'));
    setBusy('iban');
    try {
      setSub(await setCentreIban(code!, v, await token()));
      setMsg(t('IBAN salvato: i tuoi bonifici vengono riconosciuti anche senza causale.'));
    } catch (e) {
      setErr(t((e as Error).message));
    }
    setBusy(null);
  }

  const p = PLANS[chosen];
  return (
    <>
      {sub.da_pagare.map((d) => (
        <DueTransfer key={d.id} due={d} to={sub.bonifico} code={code} />
      ))}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body bold>{t('Abbonamento')}</Body>
          {sub.da_pagare.length === 0 && <Badge tone="ok">{t('Tutto pagato')}</Badge>}
        </Row>
        <Body>{t('Piano {piano}: {prezzo}', { piano: PLANS[current].label, prezzo: priceText(sub.piani[current], formula) })}</Body>
        {!!next && !!sub.piano_dal && (
          <Badge tone="warn">{t('Dal {data} passi al piano {piano}.', { data: date(sub.piano_dal), piano: PLANS[next].label })}</Badge>
        )}
        {!!nextFormula && !!sub.piano_dal && (
          <Badge tone="warn">{t('Dal {data} paghi: {come}.', { data: date(sub.piano_dal), come: formulaText(nextFormula).toLowerCase() })}</Badge>
        )}
        {!!sub.disdetta && <Badge tone="bad">{t('Abbonamento disdetto: il servizio finisce il {data}.', { data: date(sub.disdetta) })}</Badge>}
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
              {bigger
                ? t('Il piano superiore vale da oggi: il canone e le prenotazioni di questo mese si dividono a giorni fra il piano di prima e quello nuovo.') +
                  (chosenFormula !== formula ? ' ' + t('Il passaggio fra consumo e fisso parte dal primo del mese prossimo.') : '')
                : later
                  ? t('Il cambio parte dal primo del mese prossimo: fino ad allora resta tutto com\'è.')
                  : t('Annulli il cambio già scelto: resta tutto com\'è.')}
            </Muted>
            <Button
              small
              title={
                chosen === current
                  ? armed
                    ? t('Confermi?')
                    : chosenFormula === formula
                      ? t('Annulla il cambio')
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
          label={t('IBAN da cui paghi')}
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
        <Body bold>{t('Disdetta')}</Body>
        <Muted style={{ fontSize: 13 }}>
          {sub.disdetta
            ? t("Fino al {data} l'app funziona come sempre e il conto dell'ultimo mese arriva come gli altri. Puoi annullare la disdetta fino a quel giorno.", { data: date(sub.disdetta) })
            : t("Il preavviso è di un mese: disdicendo oggi il servizio finisce il {data}, e il conto dell'ultimo mese arriva come gli altri. Si può disdire solo con tutti i conti pagati.", {
                data: date(sub.disdetta_se_oggi ?? ''),
              })}
        </Muted>
        <Button
          small
          kind="ghost"
          title={armedQuit ? (sub.disdetta ? t('Confermi?') : t('Confermi la disdetta?')) : sub.disdetta ? t('Annulla la disdetta') : t("Disdici l'abbonamento")}
          onPress={quit}
          loading={busy === 'quit'}
          disabled={!sub.disdetta && sub.da_pagare.length > 0}
        />
        <ErrorText>{err}</ErrorText>
        {!!msg && <Muted>{msg}</Muted>}
      </Card>
      <PaymentHistory list={sub.storico} />
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
        <DueTransfer key={d.id} due={d} to={sub.bonifico} code={code} />
      ))}
    </>
  );
}
