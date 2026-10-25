import { useEffect, useState } from 'react';

import { Body, Button, ErrorText, Field, Muted, Toggle } from '@/components/ui';
import { t } from '@/lib/i18n';
import { errorText, supabase } from '@/lib/supabase';
import { formatIban, isValidIban, normalizeIban } from '@/lib/transfer';
import type { TransferSettings } from '@/lib/types';

/** Conto del proprietario per il bonifico istantaneo dei clienti. */
export function TransferPanel() {
  const [enabled, setEnabled] = useState(false);
  const [holder, setHolder] = useState('');
  const [iban, setIban] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase
      .from('transfer_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        const s = data as TransferSettings | null;
        if (!s) return;
        setEnabled(s.enabled);
        setHolder(s.holder);
        setIban(formatIban(s.iban));
      });
  }, []);

  async function save() {
    setErr('');
    setMsg('');
    const clean = normalizeIban(iban);
    if (clean && !isValidIban(clean)) return setErr(t("L'IBAN non è valido. Controlla lettere e numeri."));
    if (enabled && (!holder.trim() || !clean)) return setErr(t('Per attivare il bonifico servono intestatario e IBAN del conto.'));
    setBusy(true);
    const { error } = await supabase.from('transfer_settings').update({ enabled, holder: holder.trim(), iban: clean }).eq('id', 1);
    setBusy(false);
    if (error) return setErr(errorText(error));
    setMsg(t('Dati del bonifico salvati.'));
  }

  return (
    <>
      <Body bold>{t('Bonifico istantaneo')}</Body>
      <Muted style={{ fontSize: 13 }}>
        {t("Il cliente sceglie \"Bonifico istantaneo\" quando prenota e vede IBAN, importo e causale, con un QR per l'app della sua banca. I soldi arrivano direttamente sul tuo conto: quando vedi l'accredito premi \"Incassa\" sulla lezione.")}
      </Muted>
      <Field label={t('Intestatario del conto')} value={holder} onChangeText={setHolder} />
      <Field label={t('IBAN')} value={iban} onChangeText={(v) => setIban(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={42} />
      <Toggle label={t('I clienti possono pagare con bonifico')} value={enabled} onChange={setEnabled} />
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Button small kind="ghost" title={t('Salva il bonifico')} onPress={save} loading={busy} />
    </>
  );
}
