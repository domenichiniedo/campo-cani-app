import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { PhotoEditor } from '@/components/photo';
import { Badge, Body, Button, Card, ErrorText, Field, H1, Muted, Row, Screen, Stat } from '@/components/ui';
import { addDays, dayKey, today } from '@/lib/format';
import { mondayOf } from '@/lib/owner';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { TrainerAccount } from '@/lib/types';

type Stats = { week: number; today: number; notes: number; hours: number | null };

/** Elenco dei trainer: cosa seguono, lezioni, orari, diario e account per l'app. */
export default function OwnerTrainers() {
  const { trainers, lessonTypes, refresh } = useSession();
  const [accounts, setAccounts] = useState<Record<string, TrainerAccount>>({});
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const todayK = dayKey(today());
  const from = dayKey(mondayOf(today()));
  const to = dayKey(addDays(mondayOf(today()), 6));

  const load = useCallback(async () => {
    setLoading(true);
    const since = dayKey(addDays(today(), -30));
    const [a, b, av, anyAv, n] = await Promise.all([
      supabase.from('trainer_accounts').select('*'),
      supabase.from('bookings').select('trainer_id, day').eq('status', 'active').not('trainer_id', 'is', null).gte('day', from).lte('day', to),
      supabase.from('trainer_availability').select('trainer_id, slots').gte('day', from).lte('day', to),
      supabase.from('trainer_availability').select('trainer_id'),
      supabase.from('dog_notes').select('trainer_id').gte('day', since),
    ]);
    const acc = Object.fromEntries(((a.data ?? []) as TrainerAccount[]).map((x) => [x.trainer_id, x]));
    setAccounts(acc);
    setEmails(Object.fromEntries(Object.values(acc).map((x) => [x.trainer_id, x.email])));
    const withHours = new Set(((anyAv.data ?? []) as { trainer_id: string }[]).map((x) => x.trainer_id));
    const s: Record<string, Stats> = {};
    for (const t of trainers) s[t.id] = { week: 0, today: 0, notes: 0, hours: withHours.has(t.id) ? 0 : null };
    for (const r of (b.data ?? []) as { trainer_id: string; day: string }[]) {
      if (!s[r.trainer_id]) continue;
      s[r.trainer_id].week++;
      if (r.day === todayK) s[r.trainer_id].today++;
    }
    for (const r of (av.data ?? []) as { trainer_id: string; slots: number[] }[])
      if (s[r.trainer_id] && s[r.trainer_id].hours !== null) s[r.trainer_id].hours! += r.slots.length / 2;
    for (const r of (n.data ?? []) as { trainer_id: string | null }[]) if (r.trainer_id && s[r.trainer_id]) s[r.trainer_id].notes++;
    setStats(s);
    setErr(a.error ? errorText(a.error) : '');
    setLoading(false);
  }, [from, to, todayK, trainers]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function link(id: string, email: string) {
    setErr('');
    setBusy(id);
    const { error } = await supabase.rpc('link_trainer', { p_trainer: id, p_email: email });
    setBusy(null);
    if (error) setErr(errorText(error));
    load();
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>Trainer</H1>
      <Muted>
        Ogni trainer entra nell&apos;app con la sua email: vede le sue lezioni, fa entrare i cani in campo, segna la sua disponibilità e scrive il
        diario dei cani. La foto la vedono i clienti nelle loro lezioni e nel diario. Per aggiungere o rinominare un trainer vai in Impostazioni.
      </Muted>
      <ErrorText>{err}</ErrorText>
      {trainers.length === 0 && <Muted>Non hai ancora trainer. Aggiungili in Impostazioni.</Muted>}
      {trainers.map((t) => {
        const a = accounts[t.id];
        const st = stats[t.id];
        const follows = t.lessons.length ? t.lessons.map((id) => lessonTypes.find((l) => l.id === id)?.label ?? id).join(', ') : 'Tutte le lezioni';
        const draft = emails[t.id] ?? '';
        return (
          <Card key={t.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{t.name}</Body>
              {a?.user_id ? <Badge tone="ok">App collegata</Badge> : a ? <Badge tone="warn">In attesa di iscrizione</Badge> : <Badge>Senza app</Badge>}
            </Row>
            <Muted>{`Segue: ${follows}`}</Muted>
            <PhotoEditor
              name={t.name}
              path={t.photo_path}
              prefix={`trainer-${t.id}-`}
              save={async (path) => {
                const { error } = await supabase.from('trainers').update({ photo_path: path }).eq('id', t.id);
                if (error) return errorText(error);
                await refresh();
                return null;
              }}
            />
            {st && (
              <Row>
                <Stat label="Oggi" value={st.today} />
                <Stat label="Questa settimana" value={st.week} />
                <Stat label="Ore disponibili" value={st.hours === null ? 'Sempre' : st.hours} />
                <Stat label="Diari ultimi 30 gg" value={st.notes} />
              </Row>
            )}
            <View style={{ gap: 8 }}>
              <Field
                label="Email per l'app"
                value={draft}
                onChangeText={(v) => setEmails({ ...emails, [t.id]: v })}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="trainer@email.it"
              />
              {a && !a.user_id && (
                <Muted style={{ fontSize: 13 }}>
                  Digli di iscriversi dall&apos;app con questa email scegliendo &quot;Sono un trainer del centro&quot;: entrerà direttamente nell&apos;area
                  trainer.
                </Muted>
              )}
              <Row>
                <Button
                  small
                  title={a ? 'Aggiorna email' : 'Collega'}
                  loading={busy === t.id}
                  disabled={!draft.trim() || draft.trim().toLowerCase() === a?.email}
                  onPress={() => link(t.id, draft)}
                />
                {a && <Button small kind="ghost" title="Scollega l'app" onPress={() => link(t.id, '')} />}
              </Row>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
