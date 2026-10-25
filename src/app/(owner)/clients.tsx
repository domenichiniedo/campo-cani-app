import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { DogDiary, DogEvalEditor, type EvalTarget } from '@/components/dog-diary';
import { Avatar } from '@/components/photo';
import { Badge, Body, Button, Card, Chips, ConfirmButton, ErrorText, Field, H1, Muted, Row, Screen } from '@/components/ui';
import { billingLine } from '@/lib/billing';
import { euro, shortDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fullName, usable, type ClientPackage, type Dog, type Penalty, type Profile } from '@/lib/types';

type Client = Profile & { dogs: (Dog & { penalties: Penalty[] })[]; client_packages: ClientPackage[] };
type Filter = 'all' | 'package' | 'blocked' | 'penalties' | 'billing' | 'nosocial';
type Act = (fn: () => PromiseLike<{ error: unknown }>) => Promise<void>;

const dogsOf = (p: Client) => p.dogs.filter((d) => !d.archived);
const sortName = (p: Client) => `${p.last_name} ${p.first_name}`.trim();
const initial = (p: Client) => (p.last_name || p.first_name).charAt(0).toUpperCase();

export default function OwnerClients() {
  const c = useColors();
  const { settings } = useSession();
  const plan = usePlan();
  // Sul PC la scheda del cliente sta a destra della lista; sul telefono si apre sotto il nome.
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  // Sul PC lista e scheda scorrono ognuna per conto suo, così la scheda resta sempre in vista.
  const paneH = Math.max(420, height - 220);
  const [rows, setRows] = useState<Client[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, dogs(*, penalties(*)), client_packages(*)')
      .eq('role', 'client')
      .order('last_name');
    if (error) setErr(errorText(error));
    setRows((data ?? []) as Client[]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act: Act = async (fn) => {
    setErr('');
    const { error } = await fn();
    if (error) setErr(errorText(error));
    load();
  };

  const needle = q.trim().toLowerCase();
  const matches = (p: Client) =>
    !needle ||
    fullName(p).toLowerCase().includes(needle) ||
    sortName(p).toLowerCase().includes(needle) ||
    p.phone.replace(/\s/g, '').includes(needle.replace(/\s/g, '')) ||
    p.email.toLowerCase().includes(needle) ||
    p.tax_code.toLowerCase().includes(needle) ||
    p.company_name.toLowerCase().includes(needle) ||
    p.dogs.some((d) => d.name.toLowerCase().includes(needle));
  const passes = (p: Client) =>
    filter === 'all' ||
    (filter === 'package' && p.client_packages.some((cp) => usable(cp))) ||
    (filter === 'blocked' && dogsOf(p).some((d) => d.blocked)) ||
    (filter === 'penalties' && dogsOf(p).some((d) => d.penalties.length > 0)) ||
    (filter === 'billing' && p.doc_pref !== 'receipt' && !p.tax_code) ||
    (filter === 'nosocial' && !p.social_consent);
  const shown = rows
    .filter((p) => matches(p) && passes(p))
    .sort((a, b) => sortName(a).localeCompare(sortName(b), 'it', { sensitivity: 'base' }));
  const open = rows.find((p) => p.id === openId) ?? null;

  const limit = settings?.penalty_limit ?? 0;
  const requests = rows.flatMap((p) => p.client_packages.filter((cp) => cp.status === 'requested').map((cp) => ({ p, cp })));
  const activate = (cp: ClientPackage) => act(() => supabase.from('client_packages').update({ status: 'active' }).eq('id', cp.id));
  const reject = (cp: ClientPackage) => act(() => supabase.from('client_packages').update({ status: 'cancelled' }).eq('id', cp.id));

  const list = (
    <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 8, backgroundColor: c.surface, overflow: 'hidden' }}>
      {shown.map((p, i) => {
        const letter = initial(p);
        const first = i === 0 || initial(shown[i - 1]) !== letter;
        const dogs = dogsOf(p);
        const pkg = p.client_packages.find((cp) => usable(cp));
        const pens = dogs.reduce((s, d) => s + d.penalties.length, 0);
        const on = p.id === openId;
        return (
          <View key={p.id}>
            {first && (
              <Text style={{ backgroundColor: c.surface2, color: c.muted, fontWeight: '800', fontSize: 12, paddingHorizontal: 12, paddingVertical: 4 }}>
                {letter}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: on }}
              onPress={() => setOpenId(on ? null : p.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderTopWidth: first ? 0 : 1,
                borderTopColor: c.line,
                backgroundColor: on ? c.accentSoft : pressed ? c.surface2 : c.surface,
              })}>
              <Avatar name={fullName(p) || p.email} path={p.photo_path} size={32} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                  {sortName(p) || p.email}
                </Text>
                <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
                  {dogs.length ? dogs.map((d) => d.name).join(', ') : t('Nessun cane')}
                  {p.phone ? `  ·  ${p.phone}` : ''}
                </Text>
              </View>
              <Row style={{ gap: 4, flexWrap: 'nowrap' }}>
                {pkg && <Badge tone="ok">{t('{n} lez.', { n: pkg.lessons_total - pkg.lessons_used })}</Badge>}
                {pens > 0 && <Badge tone="warn">{t('{n} pen.', { n: pens })}</Badge>}
                {dogs.some((d) => d.blocked) && <Badge tone="bad">{t('Sospeso')}</Badge>}
              </Row>
              {!wide && <Text style={{ color: c.muted, fontSize: 16 }}>{on ? '▾' : '›'}</Text>}
            </Pressable>
            {!wide && on && (
              <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg }}>
                <ClientDetail p={p} act={act} />
              </View>
            )}
          </View>
        );
      })}
      {shown.length === 0 && !loading && (
        <Text style={{ color: c.muted, padding: 12 }}>{rows.length ? t('Nessun cliente corrisponde alla ricerca.') : t('Ancora nessun iscritto.')}</Text>
      )}
    </View>
  );

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{t('Clienti')}</H1>
      <Muted>
        {t('{n} iscritti.', { n: rows.length })}{' '}
        {limit > 0 ? t('Un cane viene sospeso da solo alla {n}ª penalità.', { n: limit }) : t('La sospensione automatica è spenta.')}
      </Muted>
      {requests.length > 0 && (
        <Card accent>
          <Body bold>{requests.length === 1 ? t('1 pacchetto da attivare') : t('{n} pacchetti da attivare', { n: requests.length })}</Body>
          <Muted style={{ fontSize: 13 }}>
            {plan.invoices ? t('Attivalo quando il cliente paga: parte la fattura o lo scontrino, come per le lezioni.') : t('Attivalo quando il cliente paga.')}
          </Muted>
          {requests.map(({ p, cp }) => (
            <View key={cp.id} style={{ gap: 6 }}>
              <Muted>
                {fullName(p)}: {cp.name}, {euro(cp.price_cents)}
              </Muted>
              <Row>
                <Button small title={plan.payments ? t('Incassato, attiva') : t('Attiva')} onPress={() => activate(cp)} />
                <ConfirmButton title={t('Rifiuta')} onConfirm={() => reject(cp)} />
              </Row>
            </View>
          ))}
        </Card>
      )}
      <Field label={t('Cerca')} value={q} onChangeText={setQ} placeholder={t('Nome, cognome, cane, telefono, email o codice fiscale')} />
      <Chips
        items={[
          { value: 'all', label: t('Tutti') },
          { value: 'package', label: t('Con pacchetto') },
          { value: 'penalties', label: t('Con penalità') },
          { value: 'blocked', label: t('Sospesi') },
          { value: 'billing', label: t('Senza dati fattura') },
          { value: 'nosocial', label: t('No foto sui social') },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {(!!needle || filter !== 'all') && <Muted style={{ fontSize: 13 }}>{t('{n} di {tot}', { n: shown.length, tot: rows.length })}</Muted>}
      <ErrorText>{err}</ErrorText>
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
          <ScrollView style={{ flex: 1, maxWidth: 520, height: paneH }}>{list}</ScrollView>
          <ScrollView style={{ flex: 1.3, height: paneH }}>
            {open ? (
              <Card>
                <ClientDetail p={open} act={act} />
              </Card>
            ) : (
              <Muted>{t('Scegli un cliente dalla lista per vedere cani, pacchetti e penalità.')}</Muted>
            )}
          </ScrollView>
        </View>
      ) : (
        list
      )}
    </Screen>
  );
}

/** Scheda del cliente: contatti, dati di fatturazione, pacchetti e cani con penalità. */
function ClientDetail({ p, act }: { p: Client; act: Act }) {
  const { trainers } = useSession();
  const plan = usePlan();
  const [diary, setDiary] = useState<string | null>(null);
  const [evalFor, setEvalFor] = useState<EvalTarget | null>(null);
  const [round, setRound] = useState(0);
  return (
    <View style={{ gap: 10 }}>
      <Row>
        <Avatar name={fullName(p) || p.email} path={p.photo_path} size={56} />
        <View style={{ gap: 2, flex: 1 }}>
          <Body bold>{fullName(p)}</Body>
          <Muted>
            {p.phone} · {p.email}
          </Muted>
        </View>
      </Row>
      <View style={{ gap: 2 }}>
        <Muted style={{ fontSize: 13 }}>
          {p.client_kind !== 'societa'
            ? t('Persona: scontrino')
            : p.tax_code
              ? [p.company_name, p.vat_number && `${t('P.IVA')} ${p.vat_number}`, `${t('CF')} ${p.tax_code}`, billingLine(p), p.doc_pref === 'receipt' && t('non vuole la fattura')]
                  .filter(Boolean)
                  .join(' · ')
              : p.doc_pref === 'receipt'
                ? t('Associazione o società: non vuole la fattura')
                : t('Dati di fatturazione mancanti')}
        </Muted>
        {!p.phone_ok && <Muted style={{ fontSize: 13 }}>{t('Cellulare non ancora confermato con il codice SMS')}</Muted>}
        <Muted style={{ fontSize: 12 }}>
          {t('Iscritto il {data} · consensi regolamento v{reg}, privacy v{priv}', {
            data: shortDate(p.created_at),
            reg: p.rules_ver ?? '–',
            priv: p.privacy_ver ?? '–',
          })}
        </Muted>
        <Muted style={{ fontSize: 13 }}>
          {p.social_consent
            ? t('Foto sui social: sì, dal {data}', { data: shortDate(p.social_consent_at) })
            : t('Foto sui social: no')}
        </Muted>
      </View>
      {p.client_packages
        .filter((cp) => cp.status === 'active')
        .map((cp) => (
          <Row key={cp.id} style={{ justifyContent: 'space-between' }}>
            <Muted style={{ fontSize: 13, flex: 1 }}>
              {cp.name}: {t('{usate}/{tot} usate', { usate: cp.lessons_used, tot: cp.lessons_total })}
              {cp.expires_at ? `, ${t('scade il {data}', { data: shortDate(cp.expires_at) })}` : ''}
            </Muted>
            <Badge tone={usable(cp) ? 'ok' : 'neutral'}>{usable(cp) ? t('Attivo') : t('Finito')}</Badge>
          </Row>
        ))}
      {dogsOf(p).map((d) => (
        <View key={d.id} style={{ gap: 6, paddingTop: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body bold>
              {d.name}
              {d.breed ? ` (${d.breed})` : ''}
            </Body>
            <Row>
              {d.penalties.length > 0 && <Badge tone="warn">{t('{n} penalità', { n: d.penalties.length })}</Badge>}
              {d.blocked && <Badge tone="bad">{t('Sospeso')}</Badge>}
            </Row>
          </Row>
          <Muted style={{ fontSize: 13 }}>{d.chip ? t('microchip {n}', { n: d.chip }) : t('Microchip non inserito')}</Muted>
          {d.penalties.map((pen) => (
            <Row key={pen.id} style={{ justifyContent: 'space-between' }}>
              <Muted style={{ fontSize: 13, flex: 1 }}>
                {shortDate(pen.created_at)}: {t(pen.reason)}
              </Muted>
              <ConfirmButton title={t('Togli')} onConfirm={() => act(() => supabase.from('penalties').delete().eq('id', pen.id))} />
            </Row>
          ))}
          <Row>
            {trainers.length > 0 && (
              <Button small kind="ghost" title={diary === d.id ? t('Chiudi diario') : t('Diario')} onPress={() => setDiary(diary === d.id ? null : d.id)} />
            )}
            {plan.evals && <Button small kind="ghost" title={t('+ Valuta il cane')} onPress={() => setEvalFor({ dogId: d.id, dogName: d.name })} />}
            <Button
              small
              kind={d.blocked ? 'primary' : 'danger'}
              title={d.blocked ? t('Riattiva prenotazioni') : t('Sospendi prenotazioni')}
              onPress={() => act(() => supabase.from('dogs').update({ blocked: !d.blocked }).eq('id', d.id))}
            />
          </Row>
          {diary === d.id && <DogDiary key={round} dogId={d.id} limit={10} empty={t('Il diario di {cane} è ancora vuoto.', { cane: d.name })} />}
        </View>
      ))}
      <DogEvalEditor
        target={evalFor}
        onClose={() => setEvalFor(null)}
        onSaved={() => {
          setDiary(evalFor?.dogId ?? null);
          setEvalFor(null);
          setRound(round + 1);
        }}
      />
    </View>
  );
}
