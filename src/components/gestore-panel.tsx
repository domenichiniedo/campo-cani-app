import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { CentreBillingFields } from '@/components/centre-billing-fields';
import { GoogleButton } from '@/components/google-button';
import { Badge, Body, Button, Card, Chips, ErrorText, Field, H1, Muted, Row, Screen, Stat, Step } from '@/components/ui';
import {
  admin,
  adminCall,
  adminConfigured,
  adminDemo,
  adminKey,
  adminSignedIn,
  adminChangePassword,
  adminEmail,
  adminResetPassword,
  adminSendReset,
  adminSignIn,
  adminSignOut,
  adminUrl,
  onAdminAuth,
  type AdminCentre,
  type AdminData,
  type AppVersions,
  type BonusCode,
  type Bank,
  type CentreDatabase,
  type DbProject,
  type Charge,
  type Movement,
  type PlanRow,
} from '@/lib/gestore-admin';
import { centreBillingError, centreBillingLines, cleanCentreBilling, type CentreBilling } from '@/lib/billing';
import { sameOr, useWhenActive } from '@/lib/refresh';
import { copyText } from '@/lib/share';
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
const STATO_DB: Record<string, string> = { ACTIVE_HEALTHY: 'Acceso', COMING_UP: 'Si accende', INACTIVE: 'Spento', PAUSING: 'Si spegne', RESTORING: 'Si riaccende', UNKNOWN: 'Stato sconosciuto' };

const RUOLO: Record<string, string> = { owner: 'titolare', trainer: 'trainer', client: 'cliente' };

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
const FORMULE: { value: AdminCentre['formula']; label: string }[] = [
  { value: 'consumo', label: 'A consumo' },
  { value: 'fisso', label: 'Prezzo fisso' },
];
/** Quello che il centro paga ogni mese anche senza prenotazioni: il canone, o il fisso. */
const fixedPart = (x: AdminCentre, plan: PlanRow | undefined) =>
  x.formula === 'fisso' ? (x.fisso_cents ?? plan?.fisso_cents ?? 0) : (x.canone_cents ?? plan?.canone_cents ?? 0);

type Filter = 'tutti' | 'da_pagare' | 'attivi' | 'preparazione' | 'problemi';

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
  const [forgot, setForgot] = useState(false);

  async function submit() {
    setBusy(true);
    setErr('');
    const e = await adminSignIn(email.trim(), password);
    setBusy(false);
    if (e) setErr(e);
  }

  if (forgot) return <Forgot email={email} onBack={() => setForgot(false)} />;

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
        <Button title="Password dimenticata?" kind="ghost" small onPress={() => setForgot(true)} />
      </Card>
      {/* Con Google entra chiunque abbia un account, ma il pannello risponde solo agli AMMINISTRATORI. */}
      {!adminDemo && <GoogleButton client={admin} url={adminUrl} apiKey={adminKey} />}
    </Screen>
  );
}

/** Password dimenticata: un codice all'email, poi la password nuova. Si entra subito, senza rilanciare action. */
function Forgot(p: { email: string; onBack: () => void }) {
  const [email, setEmail] = useState(p.email);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send() {
    setErr('');
    setBusy(true);
    const e = await adminSendReset(email.trim());
    setBusy(false);
    if (e) return setErr(e);
    setSent(true);
  }

  async function save() {
    setErr('');
    setBusy(true);
    const e = await adminResetPassword(email.trim(), code.trim(), password);
    setBusy(false);
    // Se va bene la sessione è già aperta e il pannello passa da solo ai centri.
    if (e) setErr(e);
  }

  return (
    <Screen header={false}>
      <H1>Nuova password</H1>
      {!sent ? (
        <Card>
          <Muted>{"Scrivi l'email con cui entri nel pannello: ti mandiamo un codice per scegliere una password nuova."}</Muted>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <ErrorText>{err}</ErrorText>
          <Button title="Mandami il codice" onPress={send} loading={busy} disabled={!email.includes('@')} />
        </Card>
      ) : (
        <Card>
          <Muted>{`Abbiamo mandato un codice a ${email.trim()}. Scrivilo qui con la password nuova (almeno 8 caratteri).`}</Muted>
          <Field label="Codice ricevuto" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />
          <Field label="Password nuova" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" onSubmitEditing={save} />
          <ErrorText>{err}</ErrorText>
          <Button title="Salva ed entra" onPress={save} loading={busy} disabled={!code.trim() || !password} />
          <Button title="Rimanda il codice" kind="ghost" small onPress={send} disabled={busy} />
        </Card>
      )}
      <Muted style={{ fontSize: 13 }}>
        Il codice arriva solo se il progetto del gestore manda le email (i secret SMTP_USER e SMTP_PASS di Prova generale). Se non
        arriva, guarda anche nello spam.
      </Muted>
      <Button title="Torna all'accesso" kind="ghost" onPress={p.onBack} />
    </Screen>
  );
}

/** Il tuo accesso al pannello: con che email sei dentro e il cambio della password. */
function AccountSection() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    adminEmail().then(setEmail);
  }, []);

  async function save() {
    setErr('');
    setMsg('');
    if (password !== again) return setErr('Le due password non sono uguali.');
    setBusy(true);
    const e = await adminChangePassword(password);
    setBusy(false);
    if (e) return setErr(e);
    setPassword('');
    setAgain('');
    setMsg('Password cambiata: la prossima volta entri con quella nuova.');
  }

  return (
    <>
      <Card>
        <Muted>{`Sei dentro come ${email || '…'}.`}</Muted>
      </Card>
      <Step title="Cambia la password" />
      <Card>
        <Field label="Password nuova (almeno 8 caratteri)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        <Field label="Ripeti la password nuova" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" onSubmitEditing={save} />
        <ErrorText>{err}</ErrorText>
        {!!msg && <Body>{msg}</Body>}
        <Button title="Salva la password" onPress={save} loading={busy} disabled={!password || !again} />
      </Card>
      <Button title="Esci" kind="ghost" onPress={adminSignOut} />
    </>
  );
}

/** Addebiti non ancora pagati: mandati e in attesa, scaduti, o da rifare per un errore. */
const owed = (charges: Charge[]) => charges.filter((a) => a.stato === 'inviato' || a.stato === 'non_pagato' || (a.stato === 'da_fare' && !!a.errore));

type Section = 'centri' | 'database' | 'statistiche' | 'banca' | 'piani' | 'bonus' | 'app' | 'accesso';

function Dashboard() {
  const c = useColors();
  const wide = useWindowDimensions().width >= 820;
  const [d, setD] = useState<AdminData | null>(null);
  const [err, setErr] = useState('');
  const [section, setSection] = useState<Section>('centri');
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

  const piani = Object.fromEntries(d.piani.map((p) => [p.piano, p])) as Record<AdminCentre['piano'], PlanRow | undefined>;
  const charges = (x: AdminCentre) => byCentre.get(x.id) ?? [];
  const problems = (x: AdminCentre) =>
    x.stato === 'errore' ||
    x.db_stato === 'MANCANTE' ||
    x.sospeso ||
    charges(x).some((a) => a.stato === 'non_pagato' || !!a.errore) ||
    (x.stato === 'pronto' && !!x.scade && giorniA(d.oggi, x.scade) < 7);
  const attivi = d.centri.filter((x) => x.stato === 'pronto' && !x.sospeso);
  const preparazione = d.centri.filter((x) => x.stato !== 'pronto' && x.stato !== 'errore');
  const daPagare = d.centri.filter((x) => owed(charges(x)).length > 0);
  const q = search.trim().toLowerCase();
  // Prima chi deve pagare, poi in ordine di nome.
  const shown = d.centri
    .filter((x) =>
      filter === 'attivi'
        ? x.stato === 'pronto' && !x.sospeso
        : filter === 'preparazione'
          ? preparazione.includes(x)
          : filter === 'problemi'
            ? problems(x)
            : filter === 'da_pagare'
              ? daPagare.includes(x)
              : true,
    )
    .filter((x) => !q || `${x.campo} ${x.codice} ${x.email} ${x.ragione_sociale}`.toLowerCase().includes(q))
    .sort((a, b) => Number(daPagare.includes(b)) - Number(daPagare.includes(a)) || a.campo.localeCompare(b.campo, 'it'));

  const sections: { value: Section; label: string; icon: string; count?: number }[] = [
    { value: 'centri', label: 'Centri', icon: '☺', count: daPagare.length },
    { value: 'database', label: 'Database', icon: '◫', count: d.centri.filter((x) => x.db_stato === 'MANCANTE').length },
    { value: 'statistiche', label: 'Statistiche', icon: '▦' },
    { value: 'banca', label: 'Banca e bonifici', icon: '€', count: d.movimenti.length },
    { value: 'piani', label: 'Piani e addebiti', icon: '⚙' },
    { value: 'bonus', label: 'Bonus', icon: '★' },
    { value: 'app', label: 'App e versioni', icon: '⇩' },
    { value: 'accesso', label: 'Il tuo accesso', icon: '⚿' },
  ];
  const title = sections.find((s) => s.value === section)!.label;

  const body = (
    <Screen header={false}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <H1>{wide ? title : 'K9 Gestore'}</H1>
          {adminDemo && !wide && <Badge tone="warn">Demo, dati finti</Badge>}
        </Row>
        {!wide && <Button small kind="ghost" title="Esci" onPress={adminSignOut} />}
      </Row>
      {!wide && (
        <Chips
          items={sections.map((s) => ({ value: s.value, label: s.count ? `${s.label} (${s.count})` : s.label }))}
          value={section}
          onChange={setSection}
        />
      )}
      <ErrorText>{err}</ErrorText>

      {section === 'centri' && (
        <>
          <Field label="Cerca" value={search} onChangeText={setSearch} placeholder="Nome, ragione sociale, codice o email" autoCapitalize="none" />
          <Chips
            items={[
              { value: 'tutti' as const, label: `Tutti (${d.centri.length})` },
              { value: 'da_pagare' as const, label: `Da pagare (${daPagare.length})` },
              { value: 'attivi' as const, label: `Attivi (${attivi.length})` },
              { value: 'preparazione' as const, label: `In preparazione (${preparazione.length})` },
              { value: 'problemi' as const, label: `Da guardare (${d.centri.filter(problems).length})` },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Row style={{ gap: 16 }}>
            <Row style={{ gap: 6 }}>
              <Dot paid />
              <Muted style={{ fontSize: 13 }}>Pagato, niente in sospeso</Muted>
            </Row>
            <Row style={{ gap: 6 }}>
              <Dot paid={false} />
              <Muted style={{ fontSize: 13 }}>Da pagare</Muted>
            </Row>
            <Muted style={{ fontSize: 13 }}>Tocca un centro per i dettagli.</Muted>
          </Row>
          <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 8, overflow: 'hidden' }}>
            {shown.map((x, i) => (
              <CentreRow
                key={x.id}
                first={i === 0}
                centre={x}
                plan={piani[x.piano]}
                charges={charges(x)}
                credit={d.crediti.filter((k) => k.centro === x.id).reduce((s, k) => s + k.residuo_cents, 0)}
                today={d.oggi}
                onChange={load}
              />
            ))}
            {!shown.length && <Muted style={{ padding: 14 }}>Nessun centro.</Muted>}
          </View>
        </>
      )}

      {section === 'database' && <DatabaseSection centri={d.centri} />}

      {section === 'statistiche' && <Stats d={d} />}

      {section === 'banca' && (
        <>
          <BankCard bank={d.banca} today={d.oggi} onChange={load} />
          <Step title={d.movimenti.length ? `Bonifici da abbinare (${d.movimenti.length})` : 'Bonifici da abbinare'} />
          {d.movimenti.map((m) => (
            <MovementCard key={m.id} m={m} data={d} onChange={load} />
          ))}
          {!d.movimenti.length && <Muted>Nessun bonifico da abbinare: quelli arrivati sono già tutti collegati a un addebito.</Muted>}
        </>
      )}

      {section === 'bonus' && <BonusSection d={d} onChange={load} />}

      {section === 'app' && <VersionsSection />}

      {section === 'accesso' && <AccountSection />}

      {section === 'piani' && (
        <>
          <Step title="Prezzi dei piani" />
          <PricesCard rows={d.piani} onChange={load} />
          <Step title="Addebito mensile" />
          <ChargeNow onDone={load} />
        </>
      )}
    </Screen>
  );

  if (!wide) return body;
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <PanelMenu sections={sections} value={section} onChange={setSection} />
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );
}

// Menu a sinistra sulla fascia verde, come nel programma del proprietario.
const WHITE = '#ffffff';
const SOFT = 'rgba(255,255,255,0.72)';

function PanelMenu({
  sections,
  value,
  onChange,
}: {
  sections: { value: Section; label: string; icon: string; count?: number }[];
  value: Section;
  onChange: (s: Section) => void;
}) {
  const c = useColors();
  return (
    <View style={{ width: 232, backgroundColor: c.pitch, paddingVertical: 18, paddingHorizontal: 10, gap: 2 }}>
      <Text style={{ color: WHITE, fontSize: 20, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 12, marginBottom: 4 }}>
        K9 Gestore
      </Text>
      {adminDemo && <Text style={{ color: SOFT, fontSize: 12, paddingHorizontal: 12, marginBottom: 8 }}>Demo, dati finti</Text>}
      {sections.map((s) => {
        const on = s.value === value;
        return (
          <Pressable
            key={s.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(s.value)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: on ? 'rgba(255,255,255,0.14)' : pressed ? 'rgba(255,255,255,0.08)' : 'transparent',
            })}>
            <Text style={{ color: on ? WHITE : SOFT, fontSize: 18, fontWeight: '800', width: 22, textAlign: 'center' }}>{s.icon}</Text>
            <Text style={{ color: on ? WHITE : SOFT, fontSize: 15, fontWeight: on ? '800' : '600', flex: 1 }}>{s.label}</Text>
            {!!s.count && (
              <View style={{ backgroundColor: c.danger, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, alignItems: 'center' }}>
                <Text style={{ color: WHITE, fontSize: 12, fontWeight: '800' }}>{s.count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" onPress={adminSignOut} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
        <Text style={{ color: SOFT, fontSize: 15, fontWeight: '600' }}>Esci</Text>
      </Pressable>
    </View>
  );
}

// Prezzi di Supabase (supabase.com/pricing): il piano Pro costa 25 $ al mese con 10 $ di crediti, che pagano
// il primo database Micro; ogni altro database acceso costa da 10 $ al mese. Il piano gratuito tiene 2 database accesi.
const PRO_DOLLARI = 25;
const MICRO_DOLLARI = 10;
const GRATIS_ACCESI = 2;
const acceso = (p: DbProject) => p.stato !== 'INACTIVE' && p.stato !== 'PAUSING' && p.stato !== 'REMOVED';

/** Tutti i database del tuo account Supabase: quanti sono, quanto costano e il bottone per accenderli e spegnerli. */
function DatabaseSection({ centri }: { centri: AdminCentre[] }) {
  const c = useColors();
  const [list, setList] = useState<DbProject[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [sure, setSure] = useState('');

  const load = useCallback(
    () =>
      adminCall<{ progetti: DbProject[] }>('database_tutti')
        .then((r) => (setList(r.progetti), setErr('')))
        .catch((e: Error) => setErr(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  useWhenActive(load, 30_000);

  async function toggle(p: DbProject) {
    if (!p.centro) return;
    if (acceso(p) && sure !== p.ref) return setSure(p.ref);
    setSure('');
    setErr('');
    setBusy(p.ref);
    try {
      await adminCall('database_accendi', { id: p.centro.id, acceso: !acceso(p) });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  }

  if (!list) return err ? <ErrorText>{err}</ErrorText> : <Muted>Carico i database…</Muted>;
  const accesi = list.filter(acceso).length;
  // I centri il cui progetto non è più fra quelli dell'account: cancellati o spostati.
  const missing = centri.filter((x) => x.progetto && !list.some((p) => p.ref === x.progetto));
  const deiCentri = list.filter((p) => p.centro).length;
  const pro = PRO_DOLLARI + Math.max(0, accesi - 1) * MICRO_DOLLARI;
  return (
    <>
      <Row>
        <Stat label="Database" value={String(list.length)} />
        <Stat label="Accesi" value={String(accesi)} />
        <Stat label="Spenti" value={String(list.length - accesi)} />
        <Stat label="Dei centri" value={String(deiCentri)} />
      </Row>
      <Card>
        <Body bold>Costo di Supabase (stima)</Body>
        <Body>
          Piano gratuito: 0 $ al mese, ma tiene al massimo {GRATIS_ACCESI} database accesi
          {accesi > GRATIS_ACCESI ? ` (ora ne hai ${accesi})` : ''}.
        </Body>
        <Body>
          Piano Pro: circa {pro} $ al mese ({PRO_DOLLARI} $ del piano{accesi > 1 ? ` + ${accesi - 1} database × ${MICRO_DOLLARI} $` : ''}), con database Micro.
        </Body>
        <Muted style={{ fontSize: 13 }}>
          Supabase non dà il conto dalle sue API: la cifra vera, con tasse e consumi oltre i limiti, la trovi su Supabase nella tua organizzazione, alla voce Billing.
        </Muted>
        <Row>
          <Button small kind="ghost" title="Apri il conto su Supabase" onPress={() => Linking.openURL('https://supabase.com/dashboard/organizations')} />
        </Row>
      </Card>
      <Muted style={{ fontSize: 13 }}>
        Mettere in pausa un database lo spegne: i dati restano, ma l&apos;app di quel centro non funziona finché non lo riaccendi (ci vuole qualche minuto).
        Supabase lascia mettere in pausa solo i database del piano gratuito. Il gestore non si spegne da qui.
      </Muted>
      <ErrorText>{err}</ErrorText>
      {missing.length > 0 && (
        <Card>
          <ErrorText>{missing.length === 1 ? 'Un centro non ha più il suo database' : `${missing.length} centri non hanno più il loro database`}</ErrorText>
          {missing.map((x) => (
            <Body key={x.id}>
              {x.campo} ({x.codice}): il progetto {x.progetto} non c&apos;è più su Supabase. L&apos;app di questo centro non funziona.
            </Body>
          ))}
        </Card>
      )}
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 8, overflow: 'hidden' }}>
        {list.map((p, i) => (
          <Row key={p.ref} style={{ padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, justifyContent: 'space-between' }}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Body bold>{p.centro ? p.centro.campo : p.gestore ? 'Gestore' : p.nome}</Body>
              <Muted style={{ fontSize: 13 }}>{[p.centro?.codice, p.nome, p.ref, p.regione].filter(Boolean).join(' · ')}</Muted>
            </View>
            <Badge tone={p.stato === 'ACTIVE_HEALTHY' ? 'ok' : acceso(p) ? 'warn' : 'bad'}>{STATO_DB[p.stato] ?? p.stato}</Badge>
            {p.centro && (
              <Button
                small
                kind={acceso(p) ? 'danger' : 'primary'}
                title={acceso(p) ? (sure === p.ref ? 'Sicuro? Metti in pausa' : 'Metti in pausa') : 'Accendi'}
                onPress={() => toggle(p)}
                loading={busy === p.ref}
                disabled={!!busy || p.stato === 'COMING_UP' || p.stato === 'RESTORING' || p.stato === 'PAUSING'}
              />
            )}
            <Button small kind="ghost" title="Apri" onPress={() => Linking.openURL(`https://supabase.com/dashboard/project/${p.ref}`)} />
          </Row>
        ))}
        {!list.length && <Muted style={{ padding: 14 }}>Nessun database.</Muted>}
      </View>
    </>
  );
}

/** Un codice bonus a caso, facile da dettare: niente lettere e cifre che si confondono. */
const nuovoCodiceBonus = () => {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return `BONUS-${Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => a[b % a.length]).join('')}`;
};

/** I bonus: codici per i centri nuovi e crediti già dati, che si scalano dai conti del mese. */
function BonusSection({ d, onChange }: { d: AdminData; onChange: () => void }) {
  const c = useColors();
  const [codice, setCodice] = useState(nuovoCodiceBonus);
  const [importo, setImporto] = useState('30');
  const [usi, setUsi] = useState('');
  const [scade, setScade] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const nome = (id: string) => d.centri.find((x) => x.id === id)?.campo ?? id;
  const daScalare = d.crediti.reduce((s, x) => s + x.residuo_cents, 0);
  const scalati = d.addebiti.reduce((s, a) => s + (a.bonus_cents ?? 0), 0);

  async function run(azione: string, body: object, done = '') {
    setErr('');
    setMsg('');
    setBusy(azione);
    try {
      await adminCall(azione, body);
      if (done) setMsg(done);
      onChange();
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy('');
    }
  }

  async function create() {
    const cents = Math.round(Number(importo.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setErr('Scrivi quanto vale il bonus.');
    const ok = await run(
      'bonus_codice_crea',
      { codice, importo_cents: cents, usi_max: usi.trim() ? Number(usi) : null, scade: scade.trim() || null, nota },
      `Codice ${codice.toUpperCase()} creato: dallo ai centri, lo scrivono quando si registrano dall'app.`,
    );
    if (ok) {
      setCodice(nuovoCodiceBonus());
      setNota('');
    }
  }

  const statoCodice = (x: BonusCode): [string, 'ok' | 'warn' | 'bad' | 'neutral'] =>
    !x.attivo
      ? ['Spento', 'neutral']
      : x.scade && x.scade < d.oggi
        ? ['Scaduto', 'bad']
        : x.usi_max !== null && x.usati >= x.usi_max
          ? ['Esaurito', 'warn']
          : ['Attivo', 'ok'];

  return (
    <>
      <Row>
        <Stat label="Bonus da scalare" value={euro(daScalare)} />
        <Stat label="Bonus già scalati (13 mesi)" value={euro(scalati)} />
        <Stat label="Codici attivi" value={d.codici.filter((x) => statoCodice(x)[0] === 'Attivo').length} />
      </Row>
      <Muted style={{ fontSize: 13 }}>
        Un bonus è un credito in euro del centro: si scala da solo dai suoi conti del mese finché non finisce. Lo dai con un codice, che il centro
        nuovo scrive quando si registra dall&apos;app, oppure a mano a un centro (Centri → il centro → Dai un bonus).
      </Muted>

      <Step title="Nuovo codice bonus" />
      <Card>
        <Row>
          <Field label="Codice" value={codice} onChangeText={(v) => setCodice(v.toUpperCase())} autoCapitalize="characters" style={{ flex: 2, minWidth: 180 }} />
          <Button small kind="ghost" title="Genera" onPress={() => setCodice(nuovoCodiceBonus())} />
        </Row>
        <Row>
          <Field label="Valore €" value={importo} onChangeText={setImporto} keyboardType="decimal-pad" style={{ flex: 1, minWidth: 100 }} />
          <Field label="Quanti centri (vuoto = senza limite)" value={usi} onChangeText={setUsi} keyboardType="number-pad" style={{ flex: 1, minWidth: 160 }} />
          <Field label="Valido fino al (AAAA-MM-GG)" value={scade} onChangeText={setScade} placeholder="sempre" style={{ flex: 1, minWidth: 160 }} />
        </Row>
        <Field label="Nota (la vedi solo tu)" value={nota} onChangeText={setNota} placeholder="Es. Fiera di Bologna" />
        <Button small title="Crea il codice" onPress={create} loading={busy === 'bonus_codice_crea'} />
        <ErrorText>{err}</ErrorText>
        {!!msg && <Muted>{msg}</Muted>}
      </Card>

      <Step title="Codici" />
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 8, overflow: 'hidden' }}>
        {d.codici.map((x, i) => {
          const [stato, tone] = statoCodice(x);
          return (
            <Row key={x.codice} style={{ paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, justifyContent: 'space-between' }}>
              <View style={{ flexShrink: 1 }}>
                <Row>
                  <Body bold>{x.codice}</Body>
                  <Badge tone={tone}>{stato}</Badge>
                </Row>
                <Muted style={{ fontSize: 13 }}>
                  {euro(x.importo_cents)} · usato {x.usi_max === null ? `${x.usati} volte` : `${x.usati} su ${x.usi_max}`}
                  {x.scade ? ` · fino al ${data(x.scade)}` : ''}
                  {x.nota ? ` · ${x.nota}` : ''}
                </Muted>
              </View>
              <Row>
                <Button small kind="ghost" title="Copia" onPress={() => copyText(x.codice).then(() => setMsg(`Codice ${x.codice} copiato.`))} />
                <Button
                  small
                  kind={x.attivo ? 'danger' : 'ghost'}
                  title={x.attivo ? 'Spegni' : 'Riaccendi'}
                  onPress={() => run('bonus_codice', { codice: x.codice, attivo: !x.attivo })}
                  disabled={!!busy}
                />
              </Row>
            </Row>
          );
        })}
        {!d.codici.length && <Muted style={{ padding: 14 }}>Ancora nessun codice.</Muted>}
      </View>

      <Step title="Bonus dei centri" />
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 8, overflow: 'hidden' }}>
        {d.crediti.map((x, i) => (
          <Row key={x.id} style={{ paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, justifyContent: 'space-between' }}>
            <View style={{ flexShrink: 1 }}>
              <Body bold>{nome(x.centro)}</Body>
              <Muted style={{ fontSize: 13 }}>
                {data(x.creato)} · {x.codice ? `codice ${x.codice}` : 'dato a mano'}
                {x.nota ? ` · ${x.nota}` : ''}
              </Muted>
            </View>
            <Text style={{ color: x.residuo_cents ? c.accent : c.muted, fontWeight: '700' }}>
              {x.residuo_cents ? `${euro(x.residuo_cents)} rimasti di ${euro(x.importo_cents)}` : `${euro(x.importo_cents)} usati tutti`}
            </Text>
          </Row>
        ))}
        {!d.crediti.length && <Muted style={{ padding: 14 }}>Nessun bonus dato.</Muted>}
      </View>
    </>
  );
}

const quando = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Le app su GitHub: rifarle, seguire le build e scaricare i file delle Releases. */
function VersionsSection() {
  const c = useColors();
  const [v, setV] = useState<AppVersions | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [campo, setCampo] = useState('');
  const [email, setEmail] = useState('');
  const [giorni, setGiorni] = useState('30');
  const [files, setFiles] = useState({ android: true, windows: true });
  const [sure, setSure] = useState('');

  const load = useCallback(
    () =>
      adminCall<AppVersions>('versioni')
        .then((x) => {
          setV(x);
          setErr('');
        })
        .catch((e: Error) => setErr(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  // Le build cambiano in fretta: si ricontrolla ogni 30 secondi.
  useWhenActive(load, 30_000);

  async function start(quale: string, body: object = {}) {
    setErr('');
    setMsg('');
    setBusy(quale);
    try {
      await adminCall('lancia', { quale, ...body });
      setMsg('Build partita: la vedi qui sotto. Quando finisce i file nuovi sono nelle Releases.');
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  }

  /** Cancella una versione intera o un suo file: il primo tocco chiede conferma. */
  async function remove(key: string, body: { rilascio: number } | { file: number }, what: string) {
    if (sure !== key) return setSure(key);
    setSure('');
    setErr('');
    setMsg('');
    setBusy(key);
    try {
      await adminCall('cancella_versione', body);
      setMsg(`Cancellato: ${what}.`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  }

  if (!v) return err ? <ErrorText>{err}</ErrorText> : <Muted>Carico le versioni…</Muted>;
  if (!v.abilitato) {
    return (
      <Card>
        <Body bold>Collega GitHub al gestore</Body>
        <Muted>
          Per vedere e rifare le app da qui serve un token di GitHub sul gestore: su github.com → Settings → Developer settings → Fine-grained tokens
          creane uno solo per il repository dell&apos;app, con i permessi Actions (lettura e scrittura) e Contents (lettura e scrittura, per cancellare le versioni). Poi salvalo nei segreti del
          gestore con il nome GITHUB_TOKEN (gestore/README.md, passo 3). Con la prova generale basta salvarlo su GitHub, in Settings → Secrets and
          variables → Actions, con il nome GESTORE_GITHUB_TOKEN, e rilanciare Actions → Prova generale. Non scriverlo in chat né nel codice.
        </Muted>
      </Card>
    );
  }

  const dot = (b: AppVersions['build'][number]) =>
    b.stato !== 'completed' ? c.brass : b.esito === 'success' ? '#2e9e5b' : b.esito === 'failure' ? '#d0453a' : c.muted;
  const esito = (b: AppVersions['build'][number]) =>
    b.stato === 'queued' ? 'in coda' : b.stato !== 'completed' ? 'in corso' : b.esito === 'success' ? 'riuscita' : b.esito === 'failure' ? 'non riuscita' : 'annullata';

  return (
    <>
      <Step title="Rifai le app" />
      <Card>
        <Muted style={{ fontSize: 13 }}>
          Ogni modifica unita su GitHub rifà già da sola demo e prova per Android e Windows. Qui le rifai quando vuoi, senza aspettare.
        </Muted>
        <Row>
          {v.lanci.map((l) => (
            <Button key={l.id} small kind={l.id === 'tutte' ? 'primary' : 'ghost'} title={l.titolo} onPress={() => start(l.id)} loading={busy === l.id} disabled={!!busy} />
          ))}
        </Row>
        <Body bold>Nuova prova con database</Body>
        <Muted style={{ fontSize: 13 }}>
          Crea un database nuovo per la prova e costruisce i file che scegli (APK per Android, programma per Windows) collegati a quello. Il proprietario si iscrive dall&apos;app con questa
          email ed entra come proprietario.
        </Muted>
        <Row>
          <Field label="Nome del centro" value={campo} onChangeText={setCampo} placeholder="Centro di prova" style={{ flex: 2, minWidth: 180 }} />
          <Field label="Email del proprietario" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={{ flex: 2, minWidth: 200 }} />
          <Field label="Giorni" value={giorni} onChangeText={setGiorni} keyboardType="number-pad" style={{ width: 90 }} />
        </Row>
        <Body bold>Cosa mettere nella prova</Body>
        <Row>
          <Button small kind={files.android ? 'primary' : 'ghost'} title={`${files.android ? '✓ ' : ''}APK per Android`} onPress={() => setFiles({ ...files, android: !files.android })} />
          <Button small kind={files.windows ? 'primary' : 'ghost'} title={`${files.windows ? '✓ ' : ''}Programma per Windows`} onPress={() => setFiles({ ...files, windows: !files.windows })} />
        </Row>
        <Button
          small
          title="Crea la prova"
          onPress={() => start('prova', { campo, email, giorni: Number(giorni), ...files })}
          loading={busy === 'prova'}
          disabled={!!busy || !email.includes('@') || (!files.android && !files.windows)}
        />
        <ErrorText>{err}</ErrorText>
        {!!msg && <Muted>{msg}</Muted>}
      </Card>

      <Step title="Ultime build" />
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 8, overflow: 'hidden' }}>
        {v.build.map((b, i) => (
          <Row key={b.id} style={{ paddingVertical: 10, paddingHorizontal: 14, gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, flexWrap: 'nowrap' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot(b) }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Body bold>{b.nome}</Body>
              <Muted style={{ fontSize: 13 }}>
                {quando(b.quando)} · {esito(b)}
                {b.titolo && b.titolo !== b.nome ? ` · ${b.titolo}` : ''}
              </Muted>
            </View>
            <Button small kind="ghost" title="Apri" onPress={() => Linking.openURL(b.url)} />
          </Row>
        ))}
        {!v.build.length && <Muted style={{ padding: 14 }}>Nessuna build recente.</Muted>}
      </View>

      <Step title="Da scaricare" />
      {v.rilasci.map((r) => (
        <Card key={r.tag}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body bold>{r.titolo}</Body>
            <Row>
              <Muted style={{ fontSize: 13 }}>aggiornata il {quando(r.data)}</Muted>
              <Button
                small
                kind="danger"
                title={sure === `r${r.id}` ? 'Sicuro? Cancella tutto' : 'Cancella la versione'}
                onPress={() => remove(`r${r.id}`, { rilascio: r.id }, `la versione ${r.titolo}`)}
                loading={busy === `r${r.id}`}
                disabled={!!busy}
              />
            </Row>
          </Row>
          {r.file.map((f) => (
            <Row key={f.nome} style={{ justifyContent: 'space-between' }}>
              <View style={{ flexShrink: 1 }}>
                <Body>{f.nome}</Body>
                <Muted style={{ fontSize: 13 }}>
                  {f.mb} MB · scaricato {f.scaricato === 1 ? '1 volta' : `${f.scaricato} volte`} · {quando(f.data)}
                </Muted>
              </View>
              <Row>
                <Button small kind="ghost" title="Copia link" onPress={() => copyText(f.url).then(() => setMsg(`Link di ${f.nome} copiato.`))} />
                <Button small title="Scarica" onPress={() => Linking.openURL(f.url)} />
                <Button
                  small
                  kind="danger"
                  title={sure === `f${f.id}` ? 'Sicuro?' : 'Cancella'}
                  onPress={() => remove(`f${f.id}`, { file: f.id }, f.nome)}
                  loading={busy === `f${f.id}`}
                  disabled={!!busy}
                />
              </Row>
            </Row>
          ))}
          {!r.file.length && <Muted style={{ fontSize: 13 }}>Ancora nessun file.</Muted>}
        </Card>
      ))}
      {!v.rilasci.length && <Muted>Nessuna Release.</Muted>}
    </>
  );
}

/** Pallino verde (pagato) o rosso (da pagare). */
function Dot({ paid }: { paid: boolean }) {
  return <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: paid ? '#2e9e5b' : '#d0453a' }} />;
}

const variazione = (ora: number, prima: number) => (prima ? ` (${ora >= prima ? '+' : ''}${Math.round(((ora - prima) / prima) * 100)}%)` : '');

type Metric = 'addebitato' | 'incassato' | 'prenotazioni' | 'centri' | 'nuovi';
const METRICHE: { value: Metric; label: string }[] = [
  { value: 'addebitato', label: 'Addebitato' },
  { value: 'incassato', label: 'Incassato' },
  { value: 'prenotazioni', label: 'Prenotazioni' },
  { value: 'centri', label: 'Centri addebitati' },
  { value: 'nuovi', label: 'Nuovi centri' },
];

/** Le statistiche: ultimi 12 mesi chiusi, piani, centri che rendono di più e pagamenti. */
function Stats({ d }: { d: AdminData }) {
  const c = useColors();
  const [metric, setMetric] = useState<Metric>('addebitato');
  const ultimo = mesePrima(d.oggi.slice(0, 7));
  const months: string[] = [];
  for (let m = ultimo; months.length < 12; m = mesePrima(m)) months.unshift(m);
  const perMese = months.map((m) => {
    const rows = d.addebiti.filter((a) => a.mese === m);
    return {
      mese: m,
      addebitato: rows.reduce((s, a) => s + a.importo_cents, 0),
      incassato: rows.filter((a) => a.stato === 'pagato').reduce((s, a) => s + a.importo_cents, 0),
      prenotazioni: rows.reduce((s, a) => s + a.prenotazioni, 0),
      centri: rows.filter((a) => a.importo_cents > 0).length,
      nuovi: d.centri.filter((x) => x.creato.slice(0, 7) === m).length,
    };
  });
  const scorso = perMese[11];
  const prima = perMese[10];
  const anno = perMese.reduce((s, m) => s + m.addebitato, 0);
  const incassatoAnno = perMese.reduce((s, m) => s + m.incassato, 0);
  const daIncassare = owed(d.addebiti).reduce((s, a) => s + a.importo_cents, 0);
  const inRitardo = d.addebiti.filter((a) => a.stato === 'non_pagato');
  const piani = Object.fromEntries(d.piani.map((p) => [p.piano, p])) as Record<AdminCentre['piano'], PlanRow | undefined>;
  const attivi = d.centri.filter((x) => x.stato === 'pronto' && !x.sospeso);
  // Canoni fissi del mese dei centri attivi: quello che entra anche senza prenotazioni.
  const canoni = attivi.reduce((s, x) => s + fixedPart(x, piani[x.piano]), 0);
  const scorsoRows = d.addebiti.filter((a) => a.mese === ultimo && a.importo_cents > 0);
  const media = scorsoRows.length ? Math.round(scorso.addebitato / scorsoRows.length) : 0;
  const nome = (id: string) => d.centri.find((x) => x.id === id)?.campo ?? id;
  const top = [...scorsoRows].sort((a, b) => b.importo_cents - a.importo_cents).slice(0, 5);
  const perPiano = PIANI.map((p) => {
    const centri = attivi.filter((x) => x.piano === p.value);
    const ids = new Set(d.centri.filter((x) => x.piano === p.value).map((x) => x.id));
    return { ...p, centri: centri.length, addebitato: scorsoRows.filter((a) => ids.has(a.centro)).reduce((s, a) => s + a.importo_cents, 0) };
  });
  const maxPiano = Math.max(1, ...perPiano.map((p) => p.centri));
  const fmt = metric === 'addebitato' || metric === 'incassato' ? euro : (n: number) => String(n);

  return (
    <>
      <Step title={`Mese chiuso: ${meseLabel(ultimo)}`} />
      <Row>
        <Stat label="Addebitato" value={`${euro(scorso.addebitato)}${variazione(scorso.addebitato, prima.addebitato)}`} />
        <Stat label="Incassato" value={euro(scorso.incassato)} />
        <Stat label="Prenotazioni" value={`${scorso.prenotazioni}${variazione(scorso.prenotazioni, prima.prenotazioni)}`} />
        <Stat label="Media per centro" value={euro(media)} />
      </Row>
      <Step title="Oggi" />
      <Row>
        <Stat label="Centri attivi" value={attivi.length} />
        <Stat label="Canoni fissi al mese" value={euro(canoni)} />
        <Stat label="Da incassare" value={euro(daIncassare)} />
        <Stat label="Addebiti scaduti" value={inRitardo.length} />
      </Row>
      <Step title="Ultimi 12 mesi" />
      <Row>
        <Stat label="Addebitato in 12 mesi" value={euro(anno)} />
        <Stat label="Incassato in 12 mesi" value={euro(incassatoAnno)} />
        <Stat label="Pagato sul totale" value={anno ? `${Math.round((incassatoAnno / anno) * 100)}%` : '—'} />
        <Stat label="Nuovi centri in 12 mesi" value={perMese.reduce((s, m) => s + m.nuovi, 0)} />
      </Row>
      <Card>
        <Chips items={METRICHE} value={metric} onChange={setMetric} />
        <MonthChart data={perMese.map((m) => ({ mese: m.mese, valore: m[metric] }))} format={fmt} what={METRICHE.find((m) => m.value === metric)!.label} />
      </Card>
      <Step title="Centri attivi per piano" />
      <Card>
        {perPiano.map((p) => (
          <View key={p.value} style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{p.label}</Body>
              <Muted>
                {p.centri === 1 ? '1 centro' : `${p.centri} centri`} · {euro(p.addebitato)} in {meseLabel(ultimo)}
              </Muted>
            </Row>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden' }}>
              <View style={{ width: `${(p.centri / maxPiano) * 100}%`, height: '100%', backgroundColor: c.accent }} />
            </View>
          </View>
        ))}
      </Card>
      <Step title={`I centri che rendono di più (${meseLabel(ultimo)})`} />
      <Card>
        {top.map((a, i) => (
          <Row key={a.id} style={{ justifyContent: 'space-between' }}>
            <Body>
              {i + 1}. {nome(a.centro)}
            </Body>
            <Muted>
              {a.prenotazioni} prenotazioni · {euro(a.importo_cents)}
            </Muted>
          </Row>
        ))}
        {!top.length && <Muted>Nessun addebito nel mese.</Muted>}
      </Card>
      {inRitardo.length > 0 && (
        <>
          <Step title="Addebiti scaduti" />
          <Card>
            {inRitardo.map((a) => (
              <Row key={a.id} style={{ justifyContent: 'space-between' }}>
                <Row style={{ gap: 6 }}>
                  <Dot paid={false} />
                  <Body>{nome(a.centro)}</Body>
                </Row>
                <Muted>
                  {meseLabel(a.mese)} · {euro(a.importo_cents)} · scaduto il {data(a.scadenza)}
                </Muted>
              </Row>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

/** Barre per mese; toccando (o passando sopra) una barra si legge il numero di quel mese. */
function MonthChart({ data: rows, format, what }: { data: { mese: string; valore: number }[]; format: (n: number) => string; what: string }) {
  const c = useColors();
  const [sel, setSel] = useState(rows.length - 1);
  const max = Math.max(1, ...rows.map((m) => m.valore));
  const m = rows[sel] ?? rows[rows.length - 1];
  return (
    <View style={{ gap: 10 }}>
      <Body>
        <Text style={{ fontWeight: '700' }}>{meseLabel(m.mese)}</Text>: {what.toLowerCase()} {format(m.valore)}
      </Body>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 2, borderBottomWidth: 1, borderColor: c.line }}>
        {rows.map((x, i) => (
          <Pressable
            key={x.mese}
            accessibilityRole="button"
            accessibilityLabel={`${meseLabel(x.mese)}: ${format(x.valore)}`}
            onPress={() => setSel(i)}
            onHoverIn={() => setSel(i)}
            style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View
              style={{
                height: `${(x.valore / max) * 100}%`,
                minHeight: x.valore ? 2 : 0,
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
        {rows.map((x, i) => (
          <Text key={x.mese} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: i === sel ? c.text : c.muted }}>
            {MESI[Number(x.mese.slice(5, 7)) - 1]}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Un centro nella lista: pallino, nome e quanto deve; toccandolo si aprono i dettagli. */
function CentreRow({
  first,
  centre: x,
  plan,
  charges,
  credit,
  today,
  onChange,
}: {
  first: boolean;
  centre: AdminCentre;
  plan: PlanRow | undefined;
  charges: Charge[];
  /** Bonus che resta da scalare dai prossimi conti. */
  credit: number;
  today: string;
  onChange: () => void;
}) {
  const c = useColors();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState(euroField(x.tariffa_cents));
  const [rent, setRent] = useState(euroField(x.canone_cents));
  const [flat, setFlat] = useState(euroField(x.fisso_cents));
  const [iban, setIban] = useState(formatIban(x.iban));
  const [bill, setBill] = useState<CentreBilling>(() => cleanCentreBilling(x));
  const [bonus, setBonus] = useState('');
  const [bonusNote, setBonusNote] = useState('');
  const [pwEmail, setPwEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pwDone, setPwDone] = useState('');
  const [db, setDb] = useState<CentreDatabase | null>(null);
  const [pauseSure, setPauseSure] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const billing = centreBillingLines(cleanCentreBilling(x));
  const last = charges[charges.length - 1];
  const unpaid = owed(charges);
  const due = unpaid.reduce((s, a) => s + a.importo_cents, 0);
  const canone = x.canone_cents ?? plan?.canone_cents ?? 0;
  const quota = x.tariffa_cents ?? plan?.tariffa_cents ?? 100;
  const fisso = x.formula === 'fisso';
  const custom = fisso ? x.fisso_cents !== null : x.canone_cents !== null || x.tariffa_cents !== null;
  const priceLabel = fisso ? `Fisso ${euro(fixedPart(x, plan))} al mese` : prezzo(canone, quota);
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

  async function loadDatabase() {
    setErr('');
    setBusy('database');
    try {
      setDb(await adminCall<CentreDatabase>('database', { id: x.id }));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  }

  async function changePassword() {
    setErr('');
    setPwDone('');
    if (pw && pw.length < 8) return setErr('La password deve avere almeno 8 caratteri.');
    setBusy('password');
    try {
      const r = await adminCall<{ password: string; ruolo: string }>('password', { id: x.id, email: pwEmail.trim(), password: pw });
      setPwDone(`Nuova password di ${pwEmail.trim()} (${RUOLO[r.ruolo] ?? r.ruolo}): ${r.password}`);
      setPw('');
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  }

  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: show }}
        onPress={() => setShow(!show)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: show || pressed ? c.surface2 : 'transparent',
        })}>
        <Dot paid={!unpaid.length} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body bold>{x.campo}</Body>
          <Muted style={{ fontSize: 13 }}>
            {[x.codice, `${PIANI.find((p) => p.value === x.piano)?.label}${fisso ? ' fisso' : ''}`, x.comune].filter(Boolean).join(' · ')}
          </Muted>
        </View>
        {x.db_stato === 'MANCANTE' && <Badge tone="bad">Database cancellato</Badge>}
        {x.db_stato === 'INACTIVE' && <Badge tone="warn">Database spento</Badge>}
        {x.stato === 'pronto' && !x.sospeso && !!x.disdetta && <Badge tone="bad">Disdetto</Badge>}
        {(x.stato !== 'pronto' || x.sospeso) && (
          <Badge tone={x.stato === 'errore' || x.sospeso ? 'bad' : 'warn'}>{x.sospeso ? 'Sospeso' : STATO[x.stato]}</Badge>
        )}
        <Text style={{ color: unpaid.length ? c.danger : c.muted, fontWeight: unpaid.length ? '800' : '400', fontSize: 14, textAlign: 'right' }}>
          {unpaid.length
            ? `${euro(due)} da pagare`
            : last
              ? `${meseLabel(last.mese)}: ${last.stato === 'pagato' ? `pagato ${euro(last.importo_cents)}` : ADDEBITO[last.stato]}`
              : 'Nessun addebito'}
        </Text>
        <Text style={{ color: c.muted, fontSize: 14 }}>{show ? '▴' : '▾'}</Text>
      </Pressable>
      {show && (
        <View style={{ gap: 10, paddingHorizontal: 14, paddingBottom: 14, backgroundColor: c.surface2 }}>
          <Muted style={{ fontSize: 13 }}>{x.email}</Muted>
          <Row>
            <Badge>{PIANI.find((p) => p.value === x.piano)?.label}</Badge>
            <Badge tone={custom ? 'warn' : 'neutral'}>{`${priceLabel}${custom ? ' (apposta)' : ''}`}</Badge>
            {!!x.iban && <Badge>IBAN {x.iban.slice(0, 4)}…{x.iban.slice(-4)}</Badge>}
            {x.stato === 'pronto' && <Badge tone={days !== null && days < 7 ? 'bad' : 'neutral'}>Licenza fino al {data(x.scade)}</Badge>}
            {credit > 0 && <Badge tone="ok">Bonus da scalare {euro(credit)}</Badge>}
            {!!x.piano_prossimo && <Badge tone="warn">Dal mese prossimo {PIANI.find((p) => p.value === x.piano_prossimo)?.label}</Badge>}
            {!!x.formula_prossima && <Badge tone="warn">Dal mese prossimo {x.formula_prossima === 'fisso' ? 'prezzo fisso' : 'a consumo'}</Badge>}
            {!!x.disdetta && <Badge tone="bad">Disdetto: finisce il {data(x.disdetta)}</Badge>}
          </Row>
          {billing.length > 0 && <Muted style={{ fontSize: 13 }}>{billing.join('\n')}</Muted>}
          {!!centreBillingError(x) && <ErrorText>Dati per la fattura incompleti: completali da Modifica.</ErrorText>}
          {!!x.errore && <ErrorText>{x.errore}</ErrorText>}
          {last && (
            <Muted style={{ fontSize: 13 }}>
              Ultimo mese {meseLabel(last.mese)}: {last.prenotazioni} prenotazioni, {euro(last.importo_cents)}
              {last.canone_cents ? ` (${fisso ? 'fisso' : 'canone'} ${euro(last.canone_cents)})` : ''}
              {last.pacchetti_cents ? ` (pacchetti ${euro(last.pacchetti_cents)})` : ''}
              {last.bonus_cents ? ` (bonus scalato ${euro(last.bonus_cents)})` : ''}, {ADDEBITO[last.stato]}
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
          <Row>
            <Field label="Dai un bonus €" value={bonus} onChangeText={setBonus} keyboardType="decimal-pad" style={{ width: 130 }} />
            <Field label="Perché (lo vedi solo tu)" value={bonusNote} onChangeText={setBonusNote} style={{ flex: 1, minWidth: 180 }} />
            <Button
              small
              title="Dai il bonus"
              loading={busy === 'bonus_dai'}
              disabled={!bonus.trim()}
              onPress={() => {
                const cents = Math.round(Number(bonus.replace(',', '.')) * 100);
                if (!Number.isFinite(cents) || cents <= 0) return setErr('Scrivi quanto vale il bonus.');
                run('bonus_dai', { importo_cents: cents, nota: bonusNote }).then(() => (setBonus(''), setBonusNote('')));
              }}
            />
          </Row>
          {!!x.progetto && (
            <View style={{ gap: 6 }}>
              <Row>
                <Body bold>Database</Body>
                <Muted style={{ fontSize: 13 }}>{x.progetto}</Muted>
                {x.db_stato !== 'MANCANTE' && (
                  <Button small kind="ghost" title={db ? 'Aggiorna' : 'Mostra il database'} onPress={loadDatabase} loading={busy === 'database'} />
                )}
                {(x.db_stato === 'ACTIVE_HEALTHY' || x.db_stato === 'INACTIVE') && (
                  <Button
                    small
                    kind={x.db_stato === 'INACTIVE' ? 'primary' : 'danger'}
                    title={x.db_stato === 'INACTIVE' ? 'Accendi il database' : pauseSure ? 'Sicuro? Metti in pausa' : 'Metti in pausa'}
                    onPress={() => {
                      if (x.db_stato !== 'INACTIVE' && !pauseSure) return setPauseSure(true);
                      setPauseSure(false);
                      run('database_accendi', { acceso: x.db_stato === 'INACTIVE' }).then(() => setDb(null));
                    }}
                    loading={busy === 'database_accendi'}
                  />
                )}
                <Button small kind="ghost" title="Apri su Supabase" onPress={() => Linking.openURL(`https://supabase.com/dashboard/project/${x.progetto}`)} />
              </Row>
              {x.db_stato === 'MANCANTE' && (
                <ErrorText>
                  Il database di questo centro non esiste più su Supabase (cancellato o spostato in un altro account): l&apos;app del centro non funziona.
                  Se è stato cancellato per sbaglio, il centro va preparato di nuovo.
                </ErrorText>
              )}
              {x.db_stato === 'INACTIVE' && <Muted style={{ fontSize: 13 }}>Il database è in pausa: l&apos;app del centro non funziona finché non lo riaccendi.</Muted>}
              {db && (
                <>
                  <Row>
                    <Badge tone={db.stato === 'ACTIVE_HEALTHY' ? 'ok' : 'bad'}>{STATO_DB[db.stato] ?? db.stato}</Badge>
                    <Badge>{`${db.mb} MB`}</Badge>
                    <Badge>{`${db.utenti} account`}</Badge>
                    <Badge tone={db.migrazioni < db.migrazioni_app ? 'warn' : 'neutral'}>{`Aggiornamenti ${db.migrazioni} su ${db.migrazioni_app}`}</Badge>
                    {!!db.regione && <Badge>{db.regione}</Badge>}
                    {!!db.postgres && <Badge>{`Postgres ${db.postgres}`}</Badge>}
                  </Row>
                  <Muted style={{ fontSize: 13 }}>Righe per tabella (circa): {db.tabelle.map((t) => `${t.nome} ${t.righe}`).join(' · ')}</Muted>
                </>
              )}
            </View>
          )}
          <Button small kind="ghost" title={open ? 'Chiudi' : 'Modifica'} onPress={() => setOpen(!open)} />
          {open && (
            <View style={{ gap: 10 }}>
              <Muted style={{ fontSize: 13 }}>Registrato il {data(x.creato)}.</Muted>
              {!!x.disdetta && (
                <Row>
                  <Muted style={{ flex: 1, fontSize: 13 }}>
                    Ha disdetto: il servizio finisce il {data(x.disdetta)}, l&apos;ultimo conto arriva come sempre e poi la licenza non si rinnova.
                  </Muted>
                  <Button small kind="ghost" title="Togli la disdetta" onPress={() => run('centro', { disdetta: null })} loading={busy === 'centro'} />
                </Row>
              )}
              {(!!x.piano_prossimo || !!x.formula_prossima) && (
                <Muted style={{ fontSize: 13 }}>
                  Ha scelto un cambio dal primo del mese prossimo. Se cambi piano o come paga da qui vale subito e annulla quella scelta.
                </Muted>
              )}
              <Body bold>Piano</Body>
              <Chips items={PIANI} value={x.piano} onChange={(piano) => run('piano', { piano })} disabled={!!busy} />
              <Body bold>Come paga</Body>
              <Chips items={FORMULE} value={x.formula} onChange={(formula) => run('piano', { piano: x.piano, formula })} disabled={!!busy} />
              <Muted style={{ fontSize: 13 }}>Il cambio vale da oggi: il conto del mese divide canone e fisso a giorni.</Muted>
              <Body bold>Prezzi fatti apposta (vuoto = quelli del piano)</Body>
              {fisso ? (
                <Row>
                  <Field label="Fisso al mese €" value={flat} onChangeText={setFlat} keyboardType="decimal-pad" placeholder={euroField(plan?.fisso_cents ?? 0)} style={{ flex: 1, minWidth: 120 }} />
                  <Button small title="Salva" onPress={() => run('centro', { fisso_cents: cents(flat) })} loading={busy === 'centro'} />
                </Row>
              ) : (
                <Row>
                  <Field label="Canone al mese €" value={rent} onChangeText={setRent} keyboardType="decimal-pad" placeholder={euroField(plan?.canone_cents ?? 0)} style={{ flex: 1, minWidth: 120 }} />
                  <Field label="Euro a prenotazione" value={fee} onChangeText={setFee} keyboardType="decimal-pad" placeholder={euroField(plan?.tariffa_cents ?? 100)} style={{ flex: 1, minWidth: 120 }} />
                  <Button small title="Salva" onPress={() => run('centro', { canone_cents: cents(rent), tariffa_cents: cents(fee) })} loading={busy === 'centro'} />
                </Row>
              )}
              <Row>
                <Field label="IBAN da cui paga" value={iban} onChangeText={setIban} autoCapitalize="characters" style={{ flex: 1, minWidth: 220 }} />
                <Button
                  small
                  title="Salva"
                  onPress={() => (normalizeIban(iban) && !isValidIban(normalizeIban(iban)) ? setErr('IBAN non valido.') : run('centro', { iban: normalizeIban(iban) }))}
                  loading={busy === 'centro'}
                />
              </Row>
              <Body bold>Dati per la fattura</Body>
              <CentreBillingFields value={bill} onChange={setBill} />
              <Button
                small
                title="Salva i dati per la fattura"
                onPress={() => {
                  const e = centreBillingError(bill);
                  if (e) setErr(e);
                  else run('centro', { fattura: cleanCentreBilling(bill) });
                }}
                loading={busy === 'centro'}
              />
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
                <>
                  <Body bold>Cambia una password</Body>
                  <Muted style={{ fontSize: 13 }}>
                    Del titolare, di un trainer o di un cliente del centro. Lascia vuota la password per farne inventare una. Chi era dentro
                    con la vecchia viene fatto uscire. La password nuova la vedi solo adesso: comunicala tu.
                  </Muted>
                  <Row>
                    <Field label="Email" value={pwEmail} onChangeText={setPwEmail} keyboardType="email-address" autoCapitalize="none" style={{ flex: 1, minWidth: 200 }} />
                    <Field label="Password nuova (facoltativa)" value={pw} onChangeText={setPw} autoCapitalize="none" style={{ flex: 1, minWidth: 180 }} />
                    <Button small title="Cambia la password" onPress={changePassword} loading={busy === 'password'} disabled={!pwEmail.includes('@')} />
                  </Row>
                  {!!pwDone && <Text selectable style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{pwDone}</Text>}
                </>
              )}
              {x.stato === 'pronto' && (
                <Muted style={{ fontSize: 13 }}>
                  Sospendendo i rinnovi la licenza non si allunga più quando arriva il bonifico e il centro si blocca alla scadenza ({data(x.scade)}).
                  Cambiando piano qui, il conto del mese si divide a giorni come quando lo cambia il centro.
                </Muted>
              )}
            </View>
          )}
          <ErrorText>{err}</ErrorText>
        </View>
      )}
    </View>
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

/** Canone al mese e quota per prenotazione di ogni piano, e il prezzo fisso al mese. */
function PricesCard({ rows, onChange }: { rows: PlanRow[]; onChange: () => void }) {
  const [edit, setEdit] = useState<Record<string, { canone: string; quota: string; fisso: string; pct: string }>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.piano,
        { canone: euroField(r.canone_cents), quota: euroField(r.tariffa_cents), fisso: euroField(r.fisso_cents ?? null), pct: euroField(r.pacchetti_bp ?? 100) },
      ]),
    ),
  );
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function save(piano: string) {
    const e = edit[piano];
    const canone = cents(e.canone) ?? 0;
    const quota = cents(e.quota) ?? 0;
    const fisso = cents(e.fisso) ?? 0;
    // La percentuale si scrive come un prezzo (2 o 2,5) e si salva in centesimi di punto.
    const pct = cents(e.pct) ?? 0;
    if ([canone, quota, fisso, pct].some((n) => !Number.isFinite(n) || n < 0) || pct > 10000) return setErr('Prezzo non valido.');
    setErr('');
    setBusy(piano);
    try {
      await adminCall('prezzi', { piano, canone_cents: canone, tariffa_cents: quota, fisso_cents: fisso, pacchetti_bp: pct });
      onChange();
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy('');
  }

  return (
    <Card>
      <Muted style={{ fontSize: 13 }}>
        Valgono per tutti i centri del piano (tranne quelli con prezzi fatti apposta) dal prossimo conto del mese. A consumo il centro paga
        canone, quota per prenotazione e la percentuale sul prezzo dei pacchetti attivati (le lezioni del pacchetto non pagano la quota); a prezzo
        fisso solo il fisso. Si dividono a giorni se il centro cambia piano o formula, o si registra
        a metà mese.
      </Muted>
      {PIANI.map((p) => {
        const r = rows.find((x) => x.piano === p.value);
        const e = edit[p.value] ?? { canone: '', quota: '', fisso: '', pct: '' };
        const changed =
          !r ||
          cents(e.canone) !== r.canone_cents ||
          cents(e.quota) !== r.tariffa_cents ||
          cents(e.fisso) !== (r.fisso_cents ?? null) ||
          cents(e.pct) !== (r.pacchetti_bp ?? 100);
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
            <Field
              label="% sui pacchetti"
              value={e.pct}
              onChangeText={(v) => setEdit({ ...edit, [p.value]: { ...e, pct: v } })}
              keyboardType="decimal-pad"
              style={{ flex: 1, minWidth: 90 }}
            />
            <Field
              label="Fisso al mese €"
              value={e.fisso}
              onChangeText={(v) => setEdit({ ...edit, [p.value]: { ...e, fisso: v } })}
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
