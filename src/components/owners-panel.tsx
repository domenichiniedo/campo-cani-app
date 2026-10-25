import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { LimitNote } from '@/components/limit-note';
import { Badge, Body, Button, Card, ErrorText, Field, Muted, Row } from '@/components/ui';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Owner = { email: string; name: string; signedUp: boolean };

/** Altri proprietari del centro: si nominano con l'email, come i trainer. */
export function OwnersPanel() {
  const { profile } = useSession();
  const plan = usePlan();
  const me = (profile?.email ?? '').toLowerCase();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [email, setEmail] = useState('');
  const [removing, setRemoving] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(
    () =>
      Promise.all([
        supabase.from('owner_emails').select('email').order('email'),
        supabase.from('profiles').select('email, first_name, last_name').eq('role', 'owner'),
      ]).then(([list, profiles]) => {
        if (list.error) return setErr(errorText(list.error));
        const byEmail = new Map((profiles.data ?? []).map((p) => [p.email.toLowerCase(), `${p.first_name} ${p.last_name}`.trim()]));
        const emails = new Set([...(list.data ?? []).map((o) => o.email), ...byEmail.keys()]);
        setOwners([...emails].sort((a, b) => Number(b === me) - Number(a === me) || a.localeCompare(b)).map((e) => ({ email: e, name: byEmail.get(e) ?? '', signedUp: byEmail.has(e) })));
      }),
    [me],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function call(fn: 'add_owner' | 'remove_owner', value: string) {
    setErr('');
    setBusy(true);
    const { error } = await supabase.rpc(fn, { p_email: value });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setEmail('');
    setRemoving('');
    load();
  }

  // Il piano fissa quanti proprietari può avere il centro, titolare compreso.
  const full = plan.maxOwners !== null && owners.length >= plan.maxOwners;

  return (
    <Card>
      <Muted>
        {t("Chi è proprietario vede e gestisce tutto il centro, come te. Scrivi la sua email: se è già iscritto diventa subito proprietario, altrimenti lo diventa quando si iscrive dall'app con quella email.")}
      </Muted>
      {owners.map((o) => (
        <View key={o.email} style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flexShrink: 1 }}>
              <Body bold>{o.name || o.email}</Body>
              {!!o.name && <Muted style={{ fontSize: 13 }}>{o.email}</Muted>}
            </View>
            {o.email === me ? (
              <Badge tone="ok">{t('Sei tu')}</Badge>
            ) : o.signedUp ? (
              <Badge tone="ok">{t('App collegata')}</Badge>
            ) : (
              <Badge tone="warn">{t('In attesa di iscrizione')}</Badge>
            )}
          </Row>
          {o.email !== me &&
            (removing === o.email ? (
              <Row>
                <Button small kind="danger" title={t('Sì, togli')} onPress={() => call('remove_owner', o.email)} loading={busy} />
                <Button small kind="ghost" title={t('Annulla')} onPress={() => setRemoving('')} disabled={busy} />
              </Row>
            ) : (
              <Row>
                <Button small kind="ghost" title={t('Togli proprietario')} onPress={() => setRemoving(o.email)} disabled={busy} />
              </Row>
            ))}
        </View>
      ))}
      {!full && (
        <Field
          label={t('Email del nuovo proprietario')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="nome@email.it"
        />
      )}
      <ErrorText>{err}</ErrorText>
      {!full && (
        <Button small title={t('Aggiungi proprietario')} onPress={() => call('add_owner', email)} loading={busy} disabled={!email.includes('@')} />
      )}
      <LimitNote kind="maxOwners" count={owners.length} what={t('proprietari')} />
    </Card>
  );
}
