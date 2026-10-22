import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Badge, Body, Button, Card, ConfirmButton, ErrorText, Field, H1, Muted, Row, Screen } from '@/components/ui';
import { billingLine } from '@/lib/billing';
import { euro, shortDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { fullName, usable, type ClientPackage, type Dog, type Penalty, type Profile } from '@/lib/types';

type Client = Profile & { dogs: (Dog & { penalties: Penalty[] })[]; client_packages: ClientPackage[] };

export default function OwnerClients() {
  const { settings } = useSession();
  const [rows, setRows] = useState<Client[]>([]);
  const [q, setQ] = useState('');
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

  async function act(fn: () => PromiseLike<{ error: unknown }>) {
    setErr('');
    const { error } = await fn();
    if (error) setErr(errorText(error));
    load();
  }

  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (p) =>
      !needle ||
      fullName(p).toLowerCase().includes(needle) ||
      p.phone.includes(needle) ||
      p.tax_code.toLowerCase().includes(needle) ||
      p.dogs.some((d) => d.name.toLowerCase().includes(needle)),
  );
  const limit = settings?.penalty_limit ?? 0;
  const requests = rows.flatMap((p) => p.client_packages.filter((cp) => cp.status === 'requested').map((cp) => ({ p, cp })));
  const activate = (cp: ClientPackage) => act(() => supabase.from('client_packages').update({ status: 'active' }).eq('id', cp.id));
  const reject = (cp: ClientPackage) => act(() => supabase.from('client_packages').update({ status: 'cancelled' }).eq('id', cp.id));

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>Clienti</H1>
      <Muted>
        {rows.length} iscritti.{' '}
        {limit > 0 ? `Un cane viene sospeso da solo alla ${limit}ª penalità.` : 'La sospensione automatica è spenta.'}
      </Muted>
      {requests.length > 0 && (
        <Card accent>
          <Body bold>{requests.length === 1 ? '1 pacchetto da attivare' : `${requests.length} pacchetti da attivare`}</Body>
          {requests.map(({ p, cp }) => (
            <View key={cp.id} style={{ gap: 6 }}>
              <Muted>
                {fullName(p)}: {cp.name}, {euro(cp.price_cents)}
              </Muted>
              <Row>
                <Button small title={`Incassato, attiva`} onPress={() => activate(cp)} />
                <ConfirmButton title="Rifiuta" onConfirm={() => reject(cp)} />
              </Row>
            </View>
          ))}
        </Card>
      )}
      <Field label="Cerca" value={q} onChangeText={setQ} placeholder="Nome, telefono, codice fiscale o cane" />
      <ErrorText>{err}</ErrorText>
      {shown.map((p) => (
        <Card key={p.id}>
          <View style={{ gap: 2 }}>
            <Body bold>{fullName(p)}</Body>
            <Muted>
              {p.phone} · {p.email}
            </Muted>
            <Muted style={{ fontSize: 13 }}>
              {p.tax_code ? `CF ${p.tax_code} · ${billingLine(p)}` : 'Dati di fatturazione mancanti'}
            </Muted>
            <Muted style={{ fontSize: 12 }}>
              Iscritto il {shortDate(p.created_at)} · consensi regolamento v{p.rules_ver ?? '–'}, privacy v{p.privacy_ver ?? '–'}
            </Muted>
          </View>
          {p.client_packages
            .filter((cp) => cp.status === 'active')
            .map((cp) => (
              <Row key={cp.id} style={{ justifyContent: 'space-between' }}>
                <Muted style={{ fontSize: 13, flex: 1 }}>
                  {cp.name}: {cp.lessons_used}/{cp.lessons_total} usate
                  {cp.expires_at ? `, scade il ${shortDate(cp.expires_at)}` : ''}
                </Muted>
                <Badge tone={usable(cp) ? 'ok' : 'neutral'}>{usable(cp) ? 'Attivo' : 'Finito'}</Badge>
              </Row>
            ))}
          {p.dogs
            .filter((d) => !d.archived)
            .map((d) => (
              <View key={d.id} style={{ gap: 6, paddingTop: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Body bold>
                    {d.name}
                    {d.breed ? ` (${d.breed})` : ''}
                  </Body>
                  <Row>
                    {d.penalties.length > 0 && <Badge tone="warn">{`${d.penalties.length} penalità`}</Badge>}
                    {d.blocked && <Badge tone="bad">Sospeso</Badge>}
                  </Row>
                </Row>
                {d.penalties.map((pen) => (
                  <Row key={pen.id} style={{ justifyContent: 'space-between' }}>
                    <Muted style={{ fontSize: 13, flex: 1 }}>
                      {shortDate(pen.created_at)}: {pen.reason}
                    </Muted>
                    <ConfirmButton title="Togli" onConfirm={() => act(() => supabase.from('penalties').delete().eq('id', pen.id))} />
                  </Row>
                ))}
                <Button
                  small
                  kind={d.blocked ? 'primary' : 'danger'}
                  title={d.blocked ? 'Riattiva prenotazioni' : 'Sospendi prenotazioni'}
                  onPress={() => act(() => supabase.from('dogs').update({ blocked: !d.blocked }).eq('id', d.id))}
                />
              </View>
            ))}
        </Card>
      ))}
    </Screen>
  );
}
