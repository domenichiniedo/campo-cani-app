import { useState } from 'react';

import { Body, Button, Card, Check, ErrorText, Expandable, H1, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { rulesLines } from '@/lib/types';

/** Appare quando il proprietario ha cambiato regolamento o privacy dopo l'ultimo consenso. */
export default function Terms() {
  const { settings, lessonTypes, profile, refresh } = useSession();
  const [rulesOk, setRulesOk] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!settings || !profile) return null;

  const rulesChanged = profile.rules_ver !== settings.rules_ver;
  const privacyChanged = profile.privacy_ver !== settings.privacy_ver;

  async function accept() {
    setBusy(true);
    const { error } = await supabase.rpc('accept_terms');
    if (error) {
      setBusy(false);
      return setErr(errorText(error));
    }
    await refresh();
    setBusy(false);
  }

  return (
    <Screen>
      <H1>{t('Sono cambiate le regole')}</H1>
      <Body>{t('Per continuare a prenotare leggi e accetta la nuova versione.')}</Body>
      <Card accent>
        {rulesChanged && (
          <>
            <Expandable title={t('il regolamento')} lines={rulesLines(settings, lessonTypes)} />
            <Check value={rulesOk} onChange={setRulesOk}>
              {t('Ho letto e accetto il nuovo regolamento.')}
            </Check>
          </>
        )}
        {privacyChanged && (
          <>
            <Expandable title={t("l'informativa privacy")} lines={settings.privacy.split('\n').filter(Boolean)} />
            <Check value={privacyOk} onChange={setPrivacyOk}>
              {t('Ho letto la nuova informativa e acconsento al trattamento dei miei dati.')}
            </Check>
          </>
        )}
        <ErrorText>{err}</ErrorText>
        <Button
          title={t('Accetto e continuo')}
          onPress={accept}
          loading={busy}
          disabled={(rulesChanged && !rulesOk) || (privacyChanged && !privacyOk)}
        />
      </Card>
      <Button title={t('Esci')} kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
