import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Badge, Body, Button, Card, ErrorText, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { euro, shortDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { upTo, usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { usable, type ClientPackage, type Package } from '@/lib/types';

export default function Packages() {
  const { profile, lessonTypes } = useSession();
  const plan = usePlan();
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
    setOffers(upTo((o.data ?? []) as Package[], plan.maxPackages));
    setMine((m.data ?? []) as ClientPackage[]);
    setNow(Date.now());
    setLoading(false);
  }, [profile, plan]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const typeLabel = (id: string | null) => (id ? (lessonTypes.find((t) => t.id === id)?.label ?? id) : t('tutte le lezioni'));

  async function request(p: Package) {
    setErr('');
    setMsg('');
    const { error } = await supabase.rpc('request_package', { p_package: p.id });
    if (error) return setErr(errorText(error));
    setMsg(
      plan.invoices
        ? t("Richiesta inviata. Paga {prezzo} al campo: il pacchetto si attiva appena il campo conferma l'incasso e ricevi fattura o scontrino.", { prezzo: euro(p.price_cents) })
        : t("Richiesta inviata. Paga {prezzo} al campo: il pacchetto si attiva appena il campo conferma l'incasso.", { prezzo: euro(p.price_cents) }),
    );
    load();
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{t('Pacchetti')}</H1>

      <Step title={t('I tuoi pacchetti')} />
      {mine.length === 0 && !loading && <Muted>{t('Non hai pacchetti. Puoi richiederne uno qui sotto.')}</Muted>}
      {mine.map((cp) => {
        const left = cp.lessons_total - cp.lessons_used;
        const expired = cp.status === 'active' && !!cp.expires_at && new Date(cp.expires_at).getTime() <= now;
        return (
          <Card key={cp.id} accent={usable(cp, now)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{cp.name}</Body>
              {cp.status === 'requested' ? (
                <Badge tone="warn">{t('In attesa di pagamento')}</Badge>
              ) : expired ? (
                <Badge tone="bad">{t('Scaduto')}</Badge>
              ) : left === 0 ? (
                <Badge>{t('Esaurito')}</Badge>
              ) : (
                <Badge tone="ok">{left === 1 ? t('1 lezione rimasta') : t('{n} lezioni rimaste', { n: left })}</Badge>
              )}
            </Row>
            <Muted>
              {t('Vale per {tipo} · {usate}/{totale} usate', { tipo: typeLabel(cp.lesson_type), usate: cp.lessons_used, totale: cp.lessons_total })}
              {cp.expires_at ? ` · ${t('scade il {data}', { data: shortDate(cp.expires_at) })}` : ''}
            </Muted>
            {cp.status === 'requested' && <Muted style={{ fontSize: 13 }}>{t('Paga {prezzo} al campo per attivarlo.', { prezzo: euro(cp.price_cents) })}</Muted>}
          </Card>
        );
      })}

      <Step title={t('Disponibili')} />
      {offers.length === 0 && !loading && <Muted>{t('Al momento il campo non offre pacchetti.')}</Muted>}
      {offers.map((p) => {
        const pending = mine.some((cp) => cp.package_id === p.id && cp.status === 'requested');
        return (
          <Card key={p.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{p.name}</Body>
              <Badge tone="warn">{euro(p.price_cents)}</Badge>
            </Row>
            <Muted>
              {t('{n} lezioni di {tipo}', { n: p.lessons, tipo: typeLabel(p.lesson_type) })}
              {p.valid_days ? t(", valide {giorni} giorni dall'attivazione", { giorni: p.valid_days }) : t(', senza scadenza')}
            </Muted>
            <Button small title={pending ? t('Già richiesto') : t('Richiedi')} disabled={pending} onPress={() => request(p)} />
          </Card>
        );
      })}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
    </Screen>
  );
}
