import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Share } from 'react-native';

import { Badge, Body, Button, Card, ErrorText, Field, Muted, Row } from '@/components/ui';
import { fromKey, today } from '@/lib/format';
import { licensingEnabled, longer, readLicense } from '@/lib/license';
import { useLicense } from '@/lib/license-gate';
import { planOf } from '@/lib/plans';
import { errorText, supabase } from '@/lib/supabase';

const read = () => {
  try {
    return localStorage.getItem('campo-cani-licenza') ?? '';
  } catch {
    return '';
  }
};

/** Licenza del centro: scadenza, rinnovo e link di attivazione per i clienti. */
export function LicensePanel() {
  const { license, activate } = useLicense();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [clients, setClients] = useState<number | null>(null);

  // Il codice attivo sta anche nel database, così lo ricevono tutti i clienti.
  useEffect(() => {
    const current = read();
    if (current) supabase.from('settings').update({ license_code: current }).eq('id', 1).neq('license_code', current).then(() => {});
    supabase.rpc('client_count').then(({ data }) => setClients(typeof data === 'number' ? data : null));
  }, []);

  if (!licensingEnabled || !license) return null;
  const plan = planOf(license);
  const full = plan.maxClients !== null && clients !== null && clients >= plan.maxClients;
  const days = license.scade ? Math.round((fromKey(license.scade).getTime() - today().getTime()) / 86400000) : null;
  const link = Linking.createURL('attiva', { queryParams: { codice: read() } });

  async function renew() {
    setErr('');
    setMsg('');
    const r = readLicense(code);
    if (!r.ok) return setErr(r.reason);
    if (!license || r.license.id !== license.id || r.license.url !== license.url) return setErr('Questo codice è di un altro centro.');
    if (longer(r.license, license) !== r.license) return setErr('Questo codice è più vecchio di quello attivo.');
    setBusy(true);
    const { error } = await supabase.from('settings').update({ license_code: code.trim() }).eq('id', 1);
    if (error) {
      setBusy(false);
      return setErr(errorText(error));
    }
    const e = await activate(code);
    setBusy(false);
    if (e) return setErr(e);
    setCode('');
    setMsg(
      r.license.piano && r.license.piano !== license.piano
        ? `Piano ${planOf(r.license).label} attivo: i tuoi clienti lo ricevono alla prossima apertura dell'app.`
        : 'Licenza rinnovata: i tuoi clienti la ricevono alla prossima apertura dell\'app.',
    );
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold>{license.campo}</Body>
        {days === null ? (
          <Badge tone="ok">Senza scadenza</Badge>
        ) : days < 0 ? (
          <Badge tone="bad">Scaduta</Badge>
        ) : (
          <Badge tone={days <= 30 ? 'warn' : 'ok'}>{`Scade il ${license.scade!.split('-').reverse().join('/')}`}</Badge>
        )}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body>Piano {plan.label}</Body>
        {clients !== null && (
          <Badge tone={full ? 'bad' : 'ok'}>{plan.maxClients === null ? `${clients} clienti` : `${clients} / ${plan.maxClients} clienti`}</Badge>
        )}
      </Row>
      {full && <Muted style={{ fontSize: 13 }}>Hai raggiunto il limite del piano: i nuovi clienti non possono iscriversi. Chiedi un piano superiore.</Muted>}
      <Muted style={{ fontSize: 13 }}>
        Licenza {license.id}, emessa il {license.emessa.split('-').reverse().join('/')}.
        {days !== null && days <= 30 && days >= 0 ? ` Mancano ${days} giorni: chiedi il rinnovo.` : ''}
      </Muted>
      <Button
        small
        kind="ghost"
        title="Manda il link di attivazione ai clienti"
        onPress={() => Share.share({ message: `Scarica l'app K9 Manager e attivala per ${license.campo} con questo link: ${link}` })}
      />
      <Field
        label="Nuovo codice (rinnovo o cambio piano)"
        value={code}
        onChangeText={setCode}
        placeholder="CC1...."
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Button small title="Usa questo codice" onPress={renew} loading={busy} disabled={!code.trim()} />
    </Card>
  );
}
