import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Badge, Body, Button, Card, ErrorText, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { euro, shortDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { usable, type ClientPackage, type Package } from '@/lib/types';

export default function Packages() {
  const { profile, lessonTypes } = useSession();
  const [offers, setOffers] = useState<Package[]>([]);
  const [mine, setMine] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [o, m] = await Promise.all([
      supabase.from('packages').select('*').eq('active', true).order('sort'),
      supabase.from('client_packages').select('*').eq('user_id', profile.id).neq('status', 'cancelled').order('requested_at', { ascending: false }),
    ]);
    setOffers((o.data ?? []) as Package[]);
    setMine((m.data ?? []) as ClientPackage[]);
    setNow(Date.now());
    setLoading(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const typeLabel = (id: string | null) => (id ? (lessonTypes.find((t) => t.id === id)?.label ?? id) : 'tutte le lezioni');

  async function request(p: Package) {
    setErr('');
    setMsg('');
    const { error } = await supabase.rpc('request_package', { p_package: p.id });
    if (error) return setErr(errorText(error));
    setMsg(`Richiesta inviata. Paga ${euro(p.price_cents)} al campo: il pacchetto si attiva appena il campo conferma l'incasso e ricevi fattura o scontrino.`);
    load();
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>Pacchetti</H1>

      <Step title="I tuoi pacchetti" />
      {mine.length === 0 && !loading && <Muted>Non hai pacchetti. Puoi richiederne uno qui sotto.</Muted>}
      {mine.map((cp) => {
        const left = cp.lessons_total - cp.lessons_used;
        const expired = cp.status === 'active' && !!cp.expires_at && new Date(cp.expires_at).getTime() <= now;
        return (
          <Card key={cp.id} accent={usable(cp, now)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{cp.name}</Body>
              {cp.status === 'requested' ? (
                <Badge tone="warn">In attesa di pagamento</Badge>
              ) : expired ? (
                <Badge tone="bad">Scaduto</Badge>
              ) : left === 0 ? (
                <Badge>Esaurito</Badge>
              ) : (
                <Badge tone="ok">{left === 1 ? '1 lezione rimasta' : `${left} lezioni rimaste`}</Badge>
              )}
            </Row>
            <Muted>
              Vale per {typeLabel(cp.lesson_type)} · {cp.lessons_used}/{cp.lessons_total} usate
              {cp.expires_at ? ` · scade il ${shortDate(cp.expires_at)}` : ''}
            </Muted>
            {cp.status === 'requested' && <Muted style={{ fontSize: 13 }}>Paga {euro(cp.price_cents)} al campo per attivarlo.</Muted>}
          </Card>
        );
      })}

      <Step title="Disponibili" />
      {offers.length === 0 && !loading && <Muted>Al momento il campo non offre pacchetti.</Muted>}
      {offers.map((p) => {
        const pending = mine.some((cp) => cp.package_id === p.id && cp.status === 'requested');
        return (
          <Card key={p.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{p.name}</Body>
              <Badge tone="warn">{euro(p.price_cents)}</Badge>
            </Row>
            <Muted>
              {p.lessons} lezioni di {typeLabel(p.lesson_type)}
              {p.valid_days ? `, valide ${p.valid_days} giorni dall'attivazione` : ', senza scadenza'}
            </Muted>
            <Button small title={pending ? 'Già richiesto' : 'Richiedi'} disabled={pending} onPress={() => request(p)} />
          </Card>
        );
      })}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
    </Screen>
  );
}
