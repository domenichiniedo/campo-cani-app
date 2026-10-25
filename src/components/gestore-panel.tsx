import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Chips, ErrorText, Field, H1, Muted, Row, Screen, Stat, Step } from '@/components/ui';
import {
  adminCall,
  adminConfigured,
  adminDemo,
  adminSignedIn,
  adminSignIn,
  adminSignOut,
  onAdminAuth,
  type AdminCentre,
  type AdminData,
  type Bank,
  type Charge,
  type Movement,
  type PlanRow,
} from '@/lib/gestore-admin';
import { sameOr, useWhenActive } from '@/lib/refresh';
import { useColors } from '@/lib/theme';
import { formatIban, isValidIban, normalizeIban } from '@/lib/transfer';

// "K9 Gestore": il tuo pannello per tutti i centri registrati dall'app. Solo in italiano: lo usi solo tu.

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const PIANI = [
  { value: 'base' as const, label: 'Base' },
  { value: 'professional' as const, label: 'Professional' },
  { value: 'pro' as const, label: 'Pro' },
];
const STATO: Record<AdminCentre['stato'], string> = {
  mandato: 'Registrato col vecchio mandato SEPA',
  progetto: 'In preparazione',
  avvio: 'In preparazione',
  database: 'In preparazione',
  chiavi: 'In preparazione',
  licenza: 'In preparazione',
  pronto: 'Attivo',
  errore: 'Preparazione non riuscita',
};
const ADDEBITO: Record<Charge['stato'], string> = {
  da_fare: 'da fare',
  zero: 'niente da pagare',
  inviato: 'da pagare',
  pagato: 'pagato',
  non_pagato: 'NON pagato',
};

const euro = (cents: number) => `${(cents / 100).toLocaleString('it-IT', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const data = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const meseLabel = (m: string) => `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const mesePrima = (m: string) => {
  const [y, n] = m.split('-').map(Number);
  return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, '0')}`;
};
const giorniA = (oggi: string, d: string) => Math.round((Date.parse(d) - Date.parse(oggi)) / 86400000);
/** "12,50" → 1250; vuoto → null (= prezzo del piano). */
const cents = (s: string) => (s.trim() ? Math.round(Number(s.trim().replace(',', '.')) * 100) : null);
const euroField = (c: number | null) => (c === null ? '' : String(c / 100).replace('.', ','));
const prezzo = (canone: number, quota: number) => (canone ? `${euro(canone)} al mese + ${euro(quota)} a prenotazione` : `${euro(quota)} a prenotazione`);

type Filter = 'tutti' | 'attivi' | 'preparazione' | 'problemi';

export function GestorePanel() {
  const c = useColors();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync();
    adminSignedIn().then((v) => {
      setSignedIn(v);
      setReady(true);
    });
    return onAdminAuth(setSignedIn);
  }, []);

  if (!adminConfigured) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: c.bg }}>
        <H1>Manca il collegamento al gestore</H1>
        <Body>Ricostruisci il pannello con EXPO_PUBLIC_GESTORE_URL ed EXPO_PUBLIC_GESTORE_KEY (vedi gestore/README.md).</Body>
      </View>
    );
  }
  if (!ready) return null;
  return signedIn ? <Dashboard /> : <Login />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setBusy(true);
    setErr('');
    const e = await adminSignIn(email.trim(), password);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <Screen header={false}>
      <H1>K9 Gestore</H1>
      <Card>
        <Muted>
          {adminDemo
            ? 'Demo con centri e addebiti finti: entra con una email e una password qualsiasi.'
            : "Entra con l'utente che hai creato nel progetto Supabase del gestore."}
        </Muted>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />
        <ErrorText>{err}</ErrorText>
        <Button title="Entra" onPress={submit} loading={busy} disabled={!email.includes('@') || !password} />
      </Card>
    </Screen>
  );
}

function Dashboard() {
  const [d, setD] = useState<AdminData | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<Filter>('tutti');
  const [search, setSearch] = useState('');

  const load = useCallback(
    () =>
      adminCall<AdminData>('dati')
        .then((x) => {
          setD(sameOr<AdminData | null>(x));
          setErr('');
        })
        .catch((e: Error) => setErr(e.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);
  useWhenActive(load, 60_000);

  const byCentre = useMemo(() => {
    const m = new Map<string, Charge[]>();
    for (const a of d?.addebiti ?? []) m.set(a.centro, [...(m.get(a.centro) ?? []), a]);
    return m;
  }, [d]);

  if (!d) {
    return (
      <Screen header={false}>
        <H1>K9 Gestore</H1>
        {err ? <ErrorText>{err}</ErrorText> : <Muted>Carico i centri…</Muted>}
        {!!err && <Button kind="ghost" title="Esci" onPress={adminSignOut} />}
      </Screen>
    );
  }

  const ultimo = mesePrima(d.oggi.slice(0, 7));
  const months: string[] = [];
  for (let m = ultimo; months.length < 12; m = mesePrima(m)) months.unshift(m);
  const perMese = months.map((m) => {
    const rows = d.addebiti.filter((a) => a.mese === m);
    return {
      mese: m,
      prenotazioni: rows.reduce((s, a) => s + a.prenotazioni, 0),
      addebitato: rows.reduce((s, a) => s + a.importo_cents, 0),
      incassato: rows.filter((a) => a.stato === 'pagato').reduce((s, a) => s + a.importo_cents, 0),
    };
  });
  const scorso = perMese[perMese.length - 1];
  const daIncassare = d.addebiti.filter((a) => a.stato === 'inviato' || a.stato === 'non_pagato').reduce((s, a) => s + a.importo_cents, 0);
  const piani = Object.fromEntries(d.piani.map((p) => [p.piano, p])) as Record<AdminCentre['piano'], PlanRow | undefined>;

  const problems = (x: AdminCentre) =>
    x.stato === 'errore' ||
    x.sospeso ||
    (byCentre.get(x.id) ?? []).some((a) => a.stato === 'non_pagato' || !!a.errore) ||
    (x.stato === 'pronto' && !!x.scade && giorniA(d.oggi, x.scade) < 7);
  const attivi = d.centri.filter((x) => x.stato === 'pronto' && !x.sospeso);
  const preparazione = d.centri.filter((x) => x.stato !== 'pronto' && x.stato !== 'errore');
  const q = search.trim().toLowerCase();
  const shown = d.centri
    .filter((x) => (filter === 'attivi' ? x.stato === 'pronto' && !x.sospeso : filter === 'preparazione' ? preparazione.includes(x) : filter === 'problemi' ? problems(x) : true))
    .filter((x) => !q || `${x.campo} ${x.codice} ${x.email}`.toLowerCase().includes(q));

  return (
    <Screen header={false}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <H1>K9 Gestore</H1>
          {adminDemo && <Badge tone="warn">Demo, dati finti</Badge>}
        </Row>
        <Button small kind="ghost" title="Esci" onPress={adminSignOut} />
      </Row>
      <ErrorText>{err}</ErrorText>

      <Row>
        <Stat label="Centri attivi" value={attivi.length} />
        <Stat label="In preparazione" value={preparazione.length} />
        <Stat label={`Prenotazioni ${meseLabel(ultimo)}`} value={scorso.prenotazioni} />
        <Stat label={`Addebitato ${meseLabel(ultimo)}`} value={euro(scorso.addebitato)} />
        <Stat label="Da incassare" value={euro(daIncassare)} />
      </Row>

      <Step title="Addebitato per mese" />
      <Card>
        <MonthChart data={perMese} />
      </Card>

      <Step title="Banca" />
      <BankCard bank={d.banca} today={d.oggi} onChange={load} />
      {d.movimenti.length > 0 && (
        <>
          <Step title={`Bonifici da abbinare (${d.movimenti.length})`} />
          {d.movimenti.map((m) => (
            <MovementCard key={m.id} m={m} data={d} onChange={load} />
          ))}
        </>
      )}

      <Step title="Piani" />
      <PricesCard rows={d.piani} onChange={load} />

      <Step title="Centri" />
      <Field label="Cerca" value={search} onChangeText={setSearch} placeholder="Nome, codice o email" autoCapitalize="none" />
      <Chips
        items={[
          { value: 'tutti' as const, label: `Tutti (${d.centri.length})` },
          { value: 'attivi' as const, label: `Attivi (${attivi.length})` },
          { value: 'preparazione' as const, label: `In preparazione (${preparazione.length})` },
          { value: 'problemi' as const, label: `Da guardare (${d.centri.filter(problems).length})` },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {shown.map((x) => (
        <CentreCard key={x.id} centre={x} plan={piani[x.piano]} charges={byCentre.get(x.id) ?? []} today={d.oggi} onChange={load} />
      ))}
      {!shown.length && <Muted>Nessun centro.</Muted>}

      <Step title="Addebito mensile" />
      <ChargeNow onDone={load} />
    </Screen>
  );
}

/** Barre dell'addebitato per mese; toccando una barra si leggono i numeri di quel mese. */
function MonthChart({ data }: { data: { mese: string; prenotazioni: number; addebitato: number; incassato: number }[] }) {
  const c = useColors();
  const [sel, setSel] = useState(data.length - 1);
  const max = Math.max(1, ...data.map((m) => m.addebitato));
  const m = data[sel] ?? data[data.length - 1];
  return (
    <View style={{ gap: 10 }}>
      <Body>
        <Text style={{ fontWeight: '700' }}>{meseLabel(m.mese)}</Text>: {euro(m.addebitato)} addebitati, {euro(m.incassato)} incassati, {m.prenotazioni} prenotazioni
      </Body>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 2, borderBottomWidth: 1, borderColor: c.line }}>
        {data.map((x, i) => (
          <Pressable
            key={x.mese}
            accessibilityRole="button"
            accessibilityLabel={`${meseLabel(x.mese)}: ${euro(x.addebitato)}`}
            onPress={() => setSel(i)}
            onHoverIn={() => setSel(i)}
            style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View
              style={{
                height: `${(x.addebitato / max) * 100}%`,
                minHeight: x.addebitato ? 2 : 0,
                backgroundColor: c.accent,
                opacity: i === sel ? 1 : 0.55,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
              }}
            />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {data.map((x, i) => (
          <Text key={x.mese} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: i === sel ? c.text : c.muted }}>
            {MESI[Number(x.mese.slice(5, 7)) - 1]}
          </Text>
        ))}
      </View>
    </View>
  );
}

function CentreCard({
  centre: x,
  plan,
  charges,
  today,
  onChange,
}: {
  centre: AdminCentre;
  plan: PlanRow | undefined;
  charges: Charge[];
  today: string;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState(euroField(x.tariffa_cents));
  const [rent, setRent] = useState(euroField(x.canone_cents));
  const [iban, setIban] = useState(formatIban(x.iban));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const last = charges[charges.length - 1];
  const unpaid = charges.filter((a) => a.stato === 'inviato' || a.stato === 'non_pagato' || (a.stato === 'da_fare' && !!a.errore));
  const canone = x.canone_cents ?? plan?.canone_cents ?? 0;
  const quota = x.tariffa_cents ?? plan?.tariffa_cents ?? 100;
  const custom = x.canone_cents !== null || x.tariffa_cents !== null;
  const days = x.scade ? giorniA(today, x.scade) : null;

  async function run(azione: string, body: object = {}) {
    setErr('');
    setBusy(azione);
    try {
      await adminCall(azione, { id: x.id, ...body });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flexShrink: 1 }}>
          <Body bold>{x.campo}</Body>
          <Muted style={{ fontSize: 13 }}>
            {x.codice} · {x.email}
          </Muted>
        </View>
        <Badge tone={x.stato === 'errore' || x.sospeso ? 'bad' : x.stato === 'pronto' ? 'ok' : 'warn'}>{x.sospeso ? 'Sospeso' : STATO[x.stato]}</Badge>
      </Row>
      <Row>
        <Badge>{PIANI.find((p) => p.value === x.piano)?.label}</Badge>
        <Badge tone={custom ? 'warn' : 'neutral'}>{`${prezzo(canone, quota)}${custom ? ' (apposta)' : ''}`}</Badge>
        {!!x.iban && <Badge>IBAN {x.iban.slice(0, 4)}…{x.iban.slice(-4)}</Badge>}
        {!!x.stripe_conto && <Badge tone={x.stripe_attivo ? 'ok' : 'warn'}>{x.stripe_attivo ? 'Stripe Connect attivo' : 'Stripe Connect da completare'}</Badge>}
        {x.stato === 'pronto' && <Badge tone={days !== null && days < 7 ? 'bad' : 'neutral'}>Licenza fino al {data(x.scade)}</Badge>}
      </Row>
      {!!x.errore && <ErrorText>{x.errore}</ErrorText>}
      {last && (
        <Muted style={{ fontSize: 13 }}>
          Ultimo mese {meseLabel(last.mese)}: {last.prenotazioni} prenotazioni, {euro(last.importo_cents)}
          {last.canone_cents ? ` (canone ${euro(last.canone_cents)})` : ''}, {ADDEBITO[last.stato]}
          {last.pagato_il ? ` il ${data(last.pagato_il)}` : ''}
          {last.errore ? ` (${last.errore})` : ''}
        </Muted>
      )}
      {unpaid.map((a) => (
        <Row key={a.id} style={{ justifyContent: 'space-between' }}>
          <Body>
            {meseLabel(a.mese)}: {euro(a.importo_cents)} {ADDEBITO[a.stato]}
            {a.scadenza && a.stato === 'inviato' ? ` entro il ${data(a.scadenza)}` : ''}
          </Body>
          <Button small kind="ghost" title="Segna pagato" onPress={() => run('pagato', { addebito: a.id })} loading={busy === 'pagato'} />
        </Row>
      ))}
      <Button small kind="ghost" title={open ? 'Chiudi' : 'Modifica'} onPress={() => setOpen(!open)} />
      {open && (
        <View style={{ gap: 10 }}>
          <Muted style={{ fontSize: 13 }}>Registrato il {data(x.creato)}.</Muted>
          <Body bold>Piano</Body>
          <Chips items={PIANI} value={x.piano} onChange={(piano) => run('piano', { piano })} disabled={!!busy} />
          <Body bold>Prezzi fatti apposta (vuoto = quelli del piano)</Body>
          <Row>
            <Field label="Canone al mese €" value={rent} onChangeText={setRent} keyboardType="decimal-pad" placeholder={euroField(plan?.canone_cents ?? 0)} style={{ flex: 1, minWidth: 120 }} />
            <Field label="Euro a prenotazione" value={fee} onChangeText={setFee} keyboardType="decimal-pad" placeholder={euroField(plan?.tariffa_cents ?? 100)} style={{ flex: 1, minWidth: 120 }} />
            <Button small title="Salva" onPress={() => run('centro', { canone_cents: cents(rent), tariffa_cents: cents(fee) })} loading={busy === 'centro'} />
          </Row>
          <Row>
            <Field label="IBAN da cui paga" value={iban} onChangeText={setIban} autoCapitalize="characters" style={{ flex: 1, minWidth: 220 }} />
            <Button
              small
              title="Salva"
              onPress={() => (normalizeIban(iban) && !isValidIban(normalizeIban(iban)) ? setErr('IBAN non valido.') : run('centro', { iban: normalizeIban(iban) }))}
              loading={busy === 'centro'}
            />
          </Row>
          <Row>
            {x.stato === 'pronto' && <Button small kind="ghost" title="Rinnova la licenza di un mese" onPress={() => run('rinnova')} loading={busy === 'rinnova'} />}
            {x.stato === 'pronto' && (
              <Button
                small
                kind={x.sospeso ? 'ghost' : 'danger'}
                title={x.sospeso ? 'Riattiva i rinnovi' : 'Sospendi i rinnovi'}
                onPress={() => run('sospendi', { sospeso: !x.sospeso })}
                loading={busy === 'sospendi'}
              />
            )}
            {(x.stato === 'errore' || x.stato === 'mandato') && (
              <Button small title={x.stato === 'errore' ? 'Riprova la preparazione' : 'Prepara il centro'} onPress={() => run('riprova')} loading={busy === 'riprova'} />
            )}
          </Row>
          {x.stato === 'pronto' && (
            <Muted style={{ fontSize: 13 }}>
              Sospendendo i rinnovi la licenza non si allunga più quando arriva il bonifico e il centro si blocca alla scadenza ({data(x.scade)}).
              Cambiando piano qui, il conto del mese si divide a giorni come quando lo cambia il centro.
            </Muted>
          )}
        </View>
      )}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

/** Lancia a mano l'addebito di un mese (di solito parte da solo il primo del mese). */
function ChargeNow({ onDone }: { onDone: () => void }) {
  const [month, setMonth] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string[]>([]);
  const [err, setErr] = useState('');

  async function run() {
    setErr('');
    setOut([]);
    setBusy(true);
    try {
      const r = await adminCall<{ mese: string; centri: Record<string, string> }>('addebita', { mese: month.trim() });
      setOut([`Mese ${r.mese}:`, ...Object.entries(r.centri).map(([k, v]) => `${k}: ${v}`)]);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Card>
      <Muted>
        Parte da solo il primo di ogni mese per il mese prima: ogni centro vede nell&apos;app quanto pagare e ti paga con un bonifico
        istantaneo entro il giorno 3. Qui puoi lanciarlo a mano: i centri già addebitati per quel mese vengono saltati.
      </Muted>
      <Field label="Mese (AAAA-MM, vuoto = mese scorso)" value={month} onChangeText={setMonth} autoCapitalize="none" />
      <Button small title="Addebita adesso" onPress={run} loading={busy} />
      <ErrorText>{err}</ErrorText>
      {out.map((l) => (
        <Muted key={l} style={{ fontSize: 13 }}>
          {l}
        </Muted>
      ))}
    </Card>
  );
}

/** Il tuo IBAN per i bonifici dei centri e il collegamento in sola lettura al conto (Enable Banking). */
function BankCard({ bank: b, today, onChange }: { bank: Bank; today: string; onChange: () => void }) {
  const [iban, setIban] = useState(formatIban(b.bonifico_iban));
  const [holder, setHolder] = useState(b.bonifico_intestatario);
  const [banks, setBanks] = useState<{ nome: string; tipi: string[] }[] | null>(null);
  const [find, setFind] = useState('');
  const [business, setBusiness] = useState(b.tipo === 'business');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function run<T>(azione: string, body: object = {}) {
    setErr('');
    setMsg('');
    setBusy(azione);
    try {
      return await adminCall<T>(azione, body);
    } catch (e) {
      setErr((e as Error).message);
      return null;
    } finally {
      setBusy('');
    }
  }

  async function saveIban() {
    const v = normalizeIban(iban);
    if (!isValidIban(v)) return setErr('IBAN non valido.');
    if (await run('conto', { iban: v, intestatario: holder.trim() })) {
      setMsg('Salvato: i centri vedono il nuovo IBAN nell\'app.');
      onChange();
    }
  }

  async function link(nome: string) {
    const r = await run<{ url: string }>('collega_banca', { banca: nome, tipo: business ? 'business' : 'personal' });
    if (r?.url) {
      Linking.openURL(r.url);
      setMsg('Entra nella tua banca e dai il permesso di sola lettura; poi torna qui e aggiorna.');
      setBanks(null);
    }
  }

  async function check() {
    const r = await run<{ letti: number; nuovi: number; abbinati: number; non_riconosciuti: number }>('controlla');
    if (r) {
      setMsg(`${r.letti} accrediti letti, ${r.nuovi} nuovi: ${r.abbinati} pagano un addebito, ${r.non_riconosciuti} da abbinare.`);
      onChange();
    }
  }

  const scaduta = !!b.valido_fino && b.valido_fino.slice(0, 10) < today;
  const q = find.trim().toLowerCase();
  return (
    <Card>
      <Body bold>Il tuo IBAN per i bonifici dei centri</Body>
      <Muted style={{ fontSize: 13 }}>I centri lo vedono nell&apos;app, con importo, causale e codice QR. Puoi cambiarlo quando vuoi.</Muted>
      <Row>
        <Field label="IBAN" value={iban} onChangeText={setIban} autoCapitalize="characters" style={{ flex: 2, minWidth: 220 }} />
        <Field label="Intestatario" value={holder} onChangeText={setHolder} style={{ flex: 1, minWidth: 160 }} />
      </Row>
      <Button
        small
        title="Salva IBAN"
        onPress={saveIban}
        loading={busy === 'conto'}
        disabled={normalizeIban(iban) === b.bonifico_iban && holder.trim() === b.bonifico_intestatario}
      />
      {!b.bonifico_iban && <ErrorText>Senza IBAN i centri non sanno dove pagarti.</ErrorText>}

      <Body bold>Lettura del conto</Body>
      {!b.abilitata ? (
        <Muted>Mancano ENABLE_BANKING_APP_ID e ENABLE_BANKING_CHIAVE nei segreti del gestore (vedi gestore/README.md).</Muted>
      ) : (
        <>
          <Row>
            <Badge tone={b.collegata && !scaduta ? 'ok' : 'bad'}>{b.collegata ? (scaduta ? 'Permesso scaduto' : `Collegato: ${b.banca}`) : 'Non collegato'}</Badge>
            {b.collegata && !!b.iban && <Badge>{formatIban(b.iban)}</Badge>}
            {b.collegata && <Badge tone={scaduta ? 'bad' : 'neutral'}>Permesso fino al {data(b.valido_fino)}</Badge>}
          </Row>
          <Muted style={{ fontSize: 13 }}>
            {b.ultimo_controllo
              ? `Ultimo controllo ${data(b.ultimo_controllo)} alle ${new Date(b.ultimo_controllo).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}. Il gestore legge i bonifici in entrata ogni 6 ore.`
              : 'Il gestore legge i bonifici in entrata ogni 6 ore, solo in lettura: non può muovere soldi.'}
          </Muted>
          {!!b.errore && <ErrorText>{b.errore}</ErrorText>}
          <Row>
            <Button small kind="ghost" title={b.collegata ? 'Ricollega la banca' : 'Collega la banca'} onPress={() => run<{ banche: { nome: string; tipi: string[] }[] }>('banche').then((r) => r && setBanks(r.banche))} loading={busy === 'banche'} />
            {b.collegata && <Button small kind="ghost" title="Controlla adesso" onPress={check} loading={busy === 'controlla'} />}
          </Row>
          {banks && (
            <View style={{ gap: 8 }}>
              <Field label="Cerca la tua banca" value={find} onChangeText={setFind} autoCapitalize="none" />
              <Chips
                items={[
                  { value: 'personal' as const, label: 'Conto personale' },
                  { value: 'business' as const, label: 'Conto aziendale' },
                ]}
                value={business ? 'business' : 'personal'}
                onChange={(v) => setBusiness(v === 'business')}
              />
              {banks
                .filter((x) => !q || x.nome.toLowerCase().includes(q))
                .slice(0, 12)
                .map((x) => (
                  <Button key={x.nome} small kind="ghost" title={x.nome} onPress={() => link(x.nome)} loading={busy === 'collega_banca'} />
                ))}
            </View>
          )}
        </>
      )}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
    </Card>
  );
}

/** Un bonifico non riconosciuto: lo abbini tu a un addebito ancora da pagare. */
function MovementCard({ m, data: d, onChange }: { m: Movement; data: AdminData; onChange: () => void }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const nome = (id: string) => d.centri.find((x) => x.id === id)?.campo ?? '';
  const open = d.addebiti.filter((a) => (a.stato === 'inviato' || a.stato === 'non_pagato') && a.importo_cents > 0 && (!m.centro || a.centro === m.centro));

  async function pick(addebito: string) {
    setErr('');
    setBusy(addebito);
    try {
      await adminCall('abbina', { movimento: m.id, addebito });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold>
          {euro(m.importo_cents)} il {data(m.data)}
        </Body>
        {m.centro && <Badge tone="warn">{nome(m.centro)}</Badge>}
      </Row>
      <Muted style={{ fontSize: 13 }}>
        {[m.nome, m.iban && formatIban(m.iban), m.causale && `"${m.causale}"`].filter(Boolean).join(' · ')}
      </Muted>
      {open.length ? (
        <>
          <Muted style={{ fontSize: 13 }}>Abbinalo a:</Muted>
          {open.map((a) => (
            <Button
              key={a.id}
              small
              kind="ghost"
              title={`${nome(a.centro)}, ${meseLabel(a.mese)}: ${euro(a.importo_cents)}`}
              onPress={() => pick(a.id)}
              loading={busy === a.id}
            />
          ))}
        </>
      ) : (
        <Muted style={{ fontSize: 13 }}>Nessun addebito da pagare a cui abbinarlo.</Muted>
      )}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

/** Canone al mese e quota per prenotazione di ogni piano. */
function PricesCard({ rows, onChange }: { rows: PlanRow[]; onChange: () => void }) {
  const [edit, setEdit] = useState<Record<string, { canone: string; quota: string }>>(() =>
    Object.fromEntries(rows.map((r) => [r.piano, { canone: euroField(r.canone_cents), quota: euroField(r.tariffa_cents) }])),
  );
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function save(piano: string) {
    const e = edit[piano];
    const canone = cents(e.canone) ?? 0;
    const quota = cents(e.quota) ?? 0;
    if (!Number.isFinite(canone) || !Number.isFinite(quota) || canone < 0 || quota < 0) return setErr('Prezzo non valido.');
    setErr('');
    setBusy(piano);
    try {
      await adminCall('prezzi', { piano, canone_cents: canone, tariffa_cents: quota });
      onChange();
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy('');
  }

  return (
    <Card>
      <Muted style={{ fontSize: 13 }}>
        Valgono per tutti i centri del piano (tranne quelli con prezzi fatti apposta) dal prossimo conto del mese. Il canone si divide a giorni
        se il centro cambia piano o si registra a metà mese.
      </Muted>
      {PIANI.map((p) => {
        const r = rows.find((x) => x.piano === p.value);
        const e = edit[p.value] ?? { canone: '', quota: '' };
        const changed = !r || cents(e.canone) !== r.canone_cents || cents(e.quota) !== r.tariffa_cents;
        return (
          <Row key={p.value}>
            <Body bold style={{ minWidth: 100 }}>
              {p.label}
            </Body>
            <Field
              label="Canone al mese €"
              value={e.canone}
              onChangeText={(v) => setEdit({ ...edit, [p.value]: { ...e, canone: v } })}
              keyboardType="decimal-pad"
              style={{ flex: 1, minWidth: 110 }}
            />
            <Field
              label="Euro a prenotazione"
              value={e.quota}
              onChangeText={(v) => setEdit({ ...edit, [p.value]: { ...e, quota: v } })}
              keyboardType="decimal-pad"
              style={{ flex: 1, minWidth: 110 }}
            />
            <Button small title="Salva" onPress={() => save(p.value)} loading={busy === p.value} disabled={!changed} />
          </Row>
        );
      })}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}
