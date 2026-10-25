import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GoogleButton } from '@/components/google-button';
import { Badge, Body, Button, Card, Chips, ErrorText, Field, H1, Muted, Row, Screen, Stat, Step } from '@/components/ui';
import {
  admin,
  adminCall,
  adminConfigured,
  adminDemo,
  adminKey,
  adminSignedIn,
  adminSignIn,
  adminSignOut,
  adminUrl,
  onAdminAuth,
  type AdminCentre,
  type AdminData,
  type Charge,
} from '@/lib/gestore-admin';
import { sameOr, useWhenActive } from '@/lib/refresh';
import { useColors } from '@/lib/theme';

// "K9 Gestore": il tuo pannello per tutti i centri registrati dall'app. Solo in italiano: lo usi solo tu.

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const PIANI = [
  { value: 'base' as const, label: 'Base' },
  { value: 'professional' as const, label: 'Professional' },
  { value: 'pro' as const, label: 'Pro' },
];
const STATO: Record<AdminCentre['stato'], string> = {
  mandato: 'Aspetta il mandato SEPA',
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
  zero: 'nessuna prenotazione',
  inviato: 'addebito in corso',
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
      {/* Con Google entra chiunque abbia un account, ma il pannello risponde solo agli AMMINISTRATORI. */}
      {!adminDemo && <GoogleButton client={admin} url={adminUrl} apiKey={adminKey} />}
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
        <CentreCard key={x.id} centre={x} charges={byCentre.get(x.id) ?? []} today={d.oggi} onChange={load} />
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

function CentreCard({ centre: x, charges, today, onChange }: { centre: AdminCentre; charges: Charge[]; today: string; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState(String(x.tariffa_cents / 100).replace('.', ','));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const last = charges[charges.length - 1];
  const unpaid = charges.filter((a) => a.stato === 'non_pagato' || (a.stato === 'da_fare' && !!a.errore));
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
        <Badge>{euro(x.tariffa_cents)} a prenotazione</Badge>
        <Badge tone={x.stripe_metodo ? 'ok' : 'warn'}>{x.stripe_metodo ? 'Mandato SEPA' : 'Senza mandato'}</Badge>
        {!!x.stripe_conto && <Badge tone={x.stripe_attivo ? 'ok' : 'warn'}>{x.stripe_attivo ? 'Stripe Connect attivo' : 'Stripe Connect da completare'}</Badge>}
        {x.stato === 'pronto' && <Badge tone={days !== null && days < 7 ? 'bad' : 'neutral'}>Licenza fino al {data(x.scade)}</Badge>}
      </Row>
      {!!x.errore && <ErrorText>{x.errore}</ErrorText>}
      {last && (
        <Muted style={{ fontSize: 13 }}>
          Ultimo addebito {meseLabel(last.mese)}: {last.prenotazioni} prenotazioni, {euro(last.importo_cents)}, {ADDEBITO[last.stato]}
          {last.errore ? ` (${last.errore})` : ''}
        </Muted>
      )}
      {unpaid.map((a) => (
        <Row key={a.id} style={{ justifyContent: 'space-between' }}>
          <Body>
            {meseLabel(a.mese)}: {euro(a.importo_cents)} {ADDEBITO[a.stato]}
          </Body>
          <Button small kind="ghost" title="Pagato con bonifico" onPress={() => run('pagato', { addebito: a.id })} loading={busy === 'pagato'} />
        </Row>
      ))}
      <Button small kind="ghost" title={open ? 'Chiudi' : 'Modifica'} onPress={() => setOpen(!open)} />
      {open && (
        <View style={{ gap: 10 }}>
          <Muted style={{ fontSize: 13 }}>Registrato il {data(x.creato)}.</Muted>
          <Body bold>Piano</Body>
          <Chips items={PIANI} value={x.piano} onChange={(piano) => run('piano', { piano })} disabled={!!busy} />
          <Row>
            <Field label="Euro a prenotazione" value={fee} onChangeText={setFee} keyboardType="decimal-pad" style={{ flex: 1, minWidth: 140 }} />
            <Button small title="Salva" onPress={() => run('tariffa', { cents: Math.round(Number(fee.replace(',', '.')) * 100) })} loading={busy === 'tariffa'} />
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
            {x.stato === 'errore' && <Button small title="Riprova la preparazione" onPress={() => run('riprova')} loading={busy === 'riprova'} />}
          </Row>
          {x.stato === 'pronto' && (
            <Muted style={{ fontSize: 13 }}>
              Sospendendo i rinnovi la licenza non si allunga più dopo gli addebiti e il centro si blocca alla scadenza ({data(x.scade)}).
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
        Parte da solo il primo di ogni mese per il mese prima. Qui puoi lanciarlo a mano: i centri già addebitati per quel mese vengono saltati.
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
