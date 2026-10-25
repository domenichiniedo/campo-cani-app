import { useState } from 'react';

import { Body, Button, Card, ErrorText, Muted } from '@/components/ui';
import { euro } from '@/lib/format';
import { t } from '@/lib/i18n';
import { payByCard } from '@/lib/nexi';

/** Avviso della modalità di prova di Nexi: nessun addebito vero. */
export const nexiTestNote = () => t('Modalità di prova: usa una carta di prova di Nexi, non viene addebitato niente.');

/** Paga una lezione con la carta sulla pagina di Nexi. */
export function CardPay({ booking, cents, onDone, card = true }: { booking: string; cents: number; onDone?: () => void; card?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [paid, setPaid] = useState(false);

  async function go() {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const s = await payByCard(booking);
      setPaid(s === 'paid');
      setMsg(
        s === 'paid'
          ? t('Pagamento riuscito: la lezione è pagata.')
          : s === 'failed'
            ? t('La carta non è stata accettata. Riprova, oppure paga al campo.')
            : s === 'opened'
              ? t('Paga nella pagina di Nexi che si è aperta, poi torna qui.')
              : t('Nexi sta ancora confermando il pagamento: lo vedi in "Le mie lezioni" tra qualche minuto.'),
      );
      onDone?.();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  const body = (
    <>
      {!paid && (
        <>
          <Button small={!card} title={t('Paga {prezzo} con carta', { prezzo: euro(cents) })} onPress={go} loading={busy} />
          <Muted style={{ fontSize: 12 }}>{nexiTestNote()}</Muted>
        </>
      )}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
    </>
  );
  if (!card) return body;
  return (
    <Card>
      <Body bold>{t('Paga con carta')}</Body>
      <Muted>{t('Si apre la pagina sicura di Nexi: i dati della carta non passano dall\'app.')}</Muted>
      {body}
    </Card>
  );
}
