import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Badge, Body, Button, Card, Chips, ConfirmButton, ErrorText, Field, H1, Muted, Row, Screen, Step, Toggle } from '@/components/ui';
import { eventWhen, parseDay, sortPosts } from '@/lib/board';
import { dayKey, hm, parseHm, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { dayText } from '@/lib/membership';
import { errorText, supabase } from '@/lib/supabase';
import type { Post } from '@/lib/types';

type Rsvp = { post_id: string; profiles: { first_name: string; last_name: string } | null };
type Draft = { id?: string; kind: Post['kind']; title: string; body: string; important: boolean; day: string; time: string; place: string; seats: string; until: string };

const EMPTY: Draft = { kind: 'avviso', title: '', body: '', important: false, day: '', time: '', place: '', seats: '', until: '' };

const toDraft = (p: Post): Draft => ({
  id: p.id,
  kind: p.kind,
  title: p.title,
  body: p.body,
  important: p.important,
  day: dayText(p.event_day),
  time: p.event_start != null ? hm(p.event_start) : '',
  place: p.place,
  seats: p.seats ? String(p.seats) : '',
  until: dayText(p.visible_until),
});

/** La bacheca del proprietario: scrive avvisi ed eventi, vede quanti hanno letto e chi partecipa. */
export default function OwnerBoard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [reads, setReads] = useState<Record<string, number>>({});
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [clients, setClients] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [old, setOld] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [p, r, g, n] = await Promise.all([
      supabase.from('posts').select('*').order('created_at', { ascending: false }),
      supabase.from('post_reads').select('post_id'),
      supabase.from('post_rsvps').select('post_id, profiles(first_name, last_name)'),
      supabase.rpc('client_count'),
    ]);
    if (p.error) setErr(errorText(p.error));
    setPosts(sortPosts((p.data ?? []) as Post[]));
    const count: Record<string, number> = {};
    ((r.data ?? []) as { post_id: string }[]).forEach((x) => (count[x.post_id] = (count[x.post_id] ?? 0) + 1));
    setReads(count);
    setRsvps((g.data ?? []) as unknown as Rsvp[]);
    setClients(typeof n.data === 'number' ? n.data : 0);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  async function save() {
    if (!draft) return;
    setErr('');
    setMsg('');
    const event = draft.kind === 'evento';
    const day = event ? parseDay(draft.day) : null;
    const start = event && draft.time.trim() ? parseHm(draft.time) : null;
    const until = !event && draft.until.trim() ? parseDay(draft.until) : null;
    const seats = event && draft.seats.trim() ? Number(draft.seats) : null;
    if (!draft.title.trim()) return setErr(t('Scrivi il titolo.'));
    if (event && !day) return setErr(t('Scrivi il giorno dell\'evento, per esempio 14/11/2026.'));
    if (event && draft.time.trim() && start === null) return setErr(t('Ora non valida: usa il formato 09:30.'));
    if (seats !== null && (!Number.isInteger(seats) || seats <= 0)) return setErr(t('I posti devono essere un numero intero, oppure lascia vuoto.'));
    if (!event && draft.until.trim() && !until) return setErr(t('Data non valida: usa il formato 31/12/2026.'));
    const row = {
      kind: draft.kind,
      title: draft.title.trim(),
      body: draft.body.trim(),
      important: !event && draft.important,
      event_day: day,
      event_start: start,
      place: event ? draft.place.trim() : '',
      seats,
      visible_until: until,
    };
    setSaving(true);
    const { error } = draft.id ? await supabase.from('posts').update(row).eq('id', draft.id) : await supabase.from('posts').insert(row);
    setSaving(false);
    if (error) return setErr(errorText(error));
    setMsg(draft.id ? t('Modifiche salvate.') : event ? t('Evento pubblicato: i clienti lo vedono in Bacheca.') : t('Avviso pubblicato: i clienti lo vedono in Bacheca.'));
    setDraft(null);
    load();
  }

  const todayK = dayKey(today());
  const past = (p: Post) => (p.kind === 'evento' ? (p.event_day ?? '') < todayK : !!p.visible_until && p.visible_until < todayK);
  const shown = posts.filter((p) => old || !past(p));
  const hidden = posts.length - posts.filter((p) => !past(p)).length;

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{t('Bacheca')}</H1>
      <Muted>{t('Comunicazioni ed eventi per i clienti: li trovano nella Bacheca dell\'app, e gli avvisi importanti anche in cima alla pagina Prenota.')}</Muted>
      {!draft ? (
        <Row>
          <Button small title={t('+ Nuovo avviso')} onPress={() => (setMsg(''), setDraft({ ...EMPTY }))} />
          <Button small kind="ghost" title={t('+ Nuovo evento')} onPress={() => (setMsg(''), setDraft({ ...EMPTY, kind: 'evento' }))} />
        </Row>
      ) : (
        <Card>
          <Chips
            items={[
              { value: 'avviso' as const, label: t('Avviso') },
              { value: 'evento' as const, label: t('Evento') },
            ]}
            value={draft.kind}
            onChange={(kind) => set({ kind })}
          />
          <Field label={t('Titolo')} value={draft.title} onChangeText={(title) => set({ title })} placeholder={draft.kind === 'evento' ? t('Gara sociale di obbedienza') : t('Campo chiuso per manutenzione')} />
          <Field label={t('Testo')} value={draft.body} onChangeText={(body) => set({ body })} multiline />
          {draft.kind === 'evento' ? (
            <>
              <Row>
                <Field label={t('Giorno')} value={draft.day} onChangeText={(day) => set({ day })} placeholder="14/11/2026" style={{ flex: 1, minWidth: 120 }} />
                <Field label={t('Ora')} value={draft.time} onChangeText={(time) => set({ time })} placeholder="10:00" style={{ width: 100 }} />
                <Field label={t('Posti')} value={draft.seats} onChangeText={(seats) => set({ seats })} keyboardType="number-pad" placeholder={t('liberi')} style={{ width: 100 }} />
              </Row>
              <Field label={t('Luogo')} value={draft.place} onChangeText={(place) => set({ place })} placeholder={t('Campo A')} />
            </>
          ) : (
            <>
              <Toggle label={t('Importante: in evidenza nella pagina Prenota')} value={draft.important} onChange={(important) => set({ important })} />
              <Field label={t('Visibile fino al (facoltativo)')} value={draft.until} onChangeText={(until) => set({ until })} placeholder="31/12/2026" style={{ maxWidth: 260 }} />
            </>
          )}
          <ErrorText>{err}</ErrorText>
          <Row>
            <Button small title={draft.id ? t('Salva') : t('Pubblica')} onPress={save} loading={saving} />
            <Button small kind="ghost" title={t('Annulla')} onPress={() => (setErr(''), setDraft(null))} />
          </Row>
        </Card>
      )}
      {!!msg && <Muted>{msg}</Muted>}

      <Step title={t('Pubblicati')} />
      {shown.length === 0 && !loading && <Muted>{t('Ancora niente in bacheca.')}</Muted>}
      {shown.map((p) => {
        const people = rsvps.filter((r) => r.post_id === p.id);
        return (
          <Card key={p.id} accent={!past(p) && (p.important || p.kind === 'evento')}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold style={{ flex: 1 }}>
                {p.title}
              </Body>
              {past(p) ? <Badge>{t('Passato')}</Badge> : p.kind === 'evento' ? <Badge tone="ok">{t('Evento')}</Badge> : p.important ? <Badge tone="warn">{t('Importante')}</Badge> : null}
            </Row>
            {p.kind === 'evento' && <Body>{eventWhen(p)}</Body>}
            {!!p.body && <Muted>{p.body}</Muted>}
            <Muted style={{ fontSize: 13 }}>
              {p.kind === 'evento'
                ? [
                    p.seats ? t('{n} partecipanti su {posti} posti', { n: people.length, posti: p.seats }) : people.length === 1 ? t('1 partecipante') : t('{n} partecipanti', { n: people.length }),
                    people.map((r) => `${r.profiles?.first_name ?? ''} ${r.profiles?.last_name ?? ''}`.trim()).filter(Boolean).join(', '),
                  ]
                    .filter(Boolean)
                    .join(': ')
                : [
                    t('Letto da {n} clienti su {tot}', { n: reads[p.id] ?? 0, tot: clients }),
                    p.visible_until ? t('visibile fino al {data}', { data: dayText(p.visible_until) }) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </Muted>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button small kind="ghost" title={t('Modifica')} onPress={() => (setMsg(''), setDraft(toDraft(p)))} />
              <ConfirmButton title={t('Elimina')} onConfirm={async () => {
                const { error } = await supabase.from('posts').delete().eq('id', p.id);
                if (error) setErr(errorText(error));
                load();
              }} />
            </View>
          </Card>
        );
      })}
      {hidden > 0 && (
        <Button small kind="ghost" title={old ? t('Nascondi quelli passati') : t('Mostra anche quelli passati ({n})', { n: hidden })} onPress={() => setOld(!old)} />
      )}
    </Screen>
  );
}
