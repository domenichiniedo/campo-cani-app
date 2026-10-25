import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Share } from 'react-native';

import { Badge, Body, Button, Card, ErrorText, Field, Muted, Row } from '@/components/ui';
import { fromKey, today } from '@/lib/format';
import { gestoreEnabled, isCentreCode } from '@/lib/gestore';
import { t } from '@/lib/i18n';
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

  // Il codice attivo sta anche nel database, così lo ricevono tutti i clienti. Non si sovrascrive mai un codice
  // più recente: per i centri registrati dall'app lo rinnova il gestore direttamente nel database.
  useEffect(() => {
    const current = read();
    const mine = readLicense(current);
    if (mine.ok) {
      supabase
        .from('settings')
        .select('license_code')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => {
          const stored = (data?.license_code as string | undefined) ?? '';
          const s = readLicense(stored);
          if (stored === current || (s.ok && s.license.id === mine.license.id && longer(mine.license, s.license) !== mine.license)) return;
          supabase.from('settings').update({ license_code: current }).eq('id', 1).then(() => {});
        });
    }
    supabase.rpc('client_count').then(({ data }) => setClients(typeof data === 'number' ? data : null));
  }, []);

  if (!licensingEnabled || !license) return null;
  const plan = planOf(license);
  const full = plan.maxClients !== null && clients !== null && clients >= plan.maxClients;
  const days = license.scade ? Math.round((fromKey(license.scade).getTime() - today().getTime()) / 86400000) : null;
  // Un centro registrato dall'app ha il codice corto (K9-...), che non cambia ai rinnovi e si rinnova da solo.
  const auto = gestoreEnabled && isCentreCode(license.id);
  const link = Linking.createURL('attiva', { queryParams: { codice: auto ? license.id : read() } });

  async function renew() {
    setErr('');
    setMsg('');
    const r = readLicense(code);
    if (!r.ok) return setErr(r.reason);
    if (!license || r.license.id !== license.id || r.license.url !== license.url) return setErr(t('Questo codice è di un altro centro.'));
    if (longer(r.license, license) !== r.license) return setErr(t('Questo codice è più vecchio di quello attivo.'));
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
        ? t("Piano {piano} attivo: i tuoi clienti lo ricevono alla prossima apertura dell'app.", { piano: planOf(r.license).label })
        : t("Licenza rinnovata: i tuoi clienti la ricevono alla prossima apertura dell'app."),
    );
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold>{license.campo}</Body>
        {days === null ? (
          <Badge tone="ok">{t('Senza scadenza')}</Badge>
        ) : days < 0 ? (
          <Badge tone="bad">{t('Scaduta')}</Badge>
        ) : (
          <Badge tone={days <= 30 ? 'warn' : 'ok'}>{t('Scade il {data}', { data: license.scade!.split('-').reverse().join('/') })}</Badge>
        )}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body>{t('Piano {piano}', { piano: plan.label })}</Body>
        {clients !== null && (
          <Badge tone={full ? 'bad' : 'ok'}>{plan.maxClients === null ? t('{n} clienti', { n: clients }) : t('{n} / {max} clienti', { n: clients, max: plan.maxClients })}</Badge>
        )}
      </Row>
      {full && <Muted style={{ fontSize: 13 }}>{t('Hai raggiunto il limite del piano: i nuovi clienti non possono iscriversi. Chiedi un piano superiore.')}</Muted>}
      <Muted style={{ fontSize: 13 }}>
        {auto
          ? t('Codice del centro {id}: dallo a clienti e trainer. Licenza emessa il {data}.', { id: license.id, data: license.emessa.split('-').reverse().join('/') })
          : t('Licenza {id}, emessa il {data}.', { id: license.id, data: license.emessa.split('-').reverse().join('/') })}
        {auto
          ? ` ${t("Si rinnova da sola ogni mese, quando arriva il bonifico dell'abbonamento.")}`
          : days !== null && days <= 30 && days >= 0
            ? ` ${t('Mancano {n} giorni: chiedi il rinnovo.', { n: days })}`
            : ''}
      </Muted>
      <Button
        small
        kind="ghost"
        title={t('Manda il link di attivazione ai clienti')}
        onPress={() =>
          Share.share({
            message: auto
              ? t("Scarica l'app K9 Manager e attivala per {campo} con questo link: {link} (oppure scrivi il codice del centro {codice})", {
                  campo: license.campo,
                  link,
                  codice: license.id,
                })
              : t("Scarica l'app K9 Manager e attivala per {campo} con questo link: {link}", { campo: license.campo, link }),
          })
        }
      />
      <Field
        label={t('Nuovo codice (rinnovo o cambio piano)')}
        value={code}
        onChangeText={setCode}
        placeholder="CC1...."
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Button small title={t('Usa questo codice')} onPress={renew} loading={busy} disabled={!code.trim()} />
    </Card>
  );
}
