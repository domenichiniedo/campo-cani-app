import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Share } from 'react-native';

import { Badge, Body, Button, Card, ErrorText, Field, Muted, Row } from '@/components/ui';
import { fromKey, today } from '@/lib/format';
import { licensingEnabled, longer, readLicense } from '@/lib/license';
import { useLicense } from '@/lib/license-gate';
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

  // Il codice attivo sta anche nel database, così lo ricevono tutti i clienti.
  useEffect(() => {
    const current = read();
    if (current) supabase.from('settings').update({ license_code: current }).eq('id', 1).neq('license_code', current).then(() => {});
  }, []);

  if (!licensingEnabled || !license) return null;
  const days = license.scade ? Math.round((fromKey(license.scade).getTime() - today().getTime()) / 86400000) : null;
  const link = Linking.createURL('attiva', { queryParams: { codice: read() } });

  async function renew() {
    setErr('');
    setMsg('');
    const r = readLicense(code);
    if (!r.ok) return setErr(r.reason);
    if (!license || r.license.id !== license.id || r.license.url !== license.url) return setErr('Questo codice è di un altro centro.');
    if (longer(r.license, license) !== r.license) return setErr('Questo codice non dura più di quello attivo.');
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
    setMsg('Licenza rinnovata: i tuoi clienti la ricevono alla prossima apertura dell\'app.');
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
      <Muted style={{ fontSize: 13 }}>
        Licenza {license.id}, emessa il {license.emessa.split('-').reverse().join('/')}.
        {days !== null && days <= 30 && days >= 0 ? ` Mancano ${days} giorni: chiedi il rinnovo.` : ''}
      </Muted>
      <Button
        small
        kind="ghost"
        title="Manda il link di attivazione ai clienti"
        onPress={() => Share.share({ message: `Scarica l'app Campo Cani e attivala per ${license.campo} con questo link: ${link}` })}
      />
      <Field
        label="Nuovo codice (rinnovo)"
        value={code}
        onChangeText={setCode}
        placeholder="CC1...."
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Button small title="Rinnova" onPress={renew} loading={busy} disabled={!code.trim()} />
    </Card>
  );
}
