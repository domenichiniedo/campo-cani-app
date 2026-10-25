import qrcode from 'qrcode-generator';
import { type ReactNode, useMemo, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';

import { PayLesson } from '@/components/pay-now';
import { Body, Button, Card, Muted, Row } from '@/components/ui';
import { euro } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { epcPayload, formatIban, transferReason } from '@/lib/transfer';
import type { Booking, TransferSettings } from '@/lib/types';

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

// Copiare negli appunti si può nel browser (app web e Android); sul telefono il testo resta selezionabile.
const clip = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.clipboard : undefined;

function Line({ label, value, copy }: { label: string; value: string; copy?: string }) {
  const c = useColors();
  const [done, setDone] = useState(false);
  return (
    <View style={{ gap: 2 }}>
      <Muted style={{ fontSize: 12 }}>{label}</Muted>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Text selectable style={{ color: c.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>
          {value}
        </Text>
        {clip && copy !== undefined && (
          <Button
            small
            kind="ghost"
            title={done ? t('Copiato ✓') : t('Copia')}
            onPress={() => clip.writeText(copy).then(() => setDone(true), () => {})}
          />
        )}
      </Row>
    </View>
  );
}

/** Dati di un bonifico istantaneo: QR da inquadrare con l'app della banca, beneficiario, IBAN, importo e causale. */
export function TransferBox({
  title,
  intro,
  holder,
  iban,
  cents,
  reason,
  children,
}: {
  title: string;
  intro: string;
  holder: string;
  iban: string;
  cents: number;
  reason: string;
  /** Sotto la spiegazione, prima dei dati del bonifico (per esempio "Paga ora"). */
  children?: ReactNode;
}) {
  const qr = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(epcPayload(holder, iban, cents, reason));
    q.make();
    return q.createDataURL(6, 4);
  }, [holder, iban, cents, reason]);

  return (
    <Card>
      <Body bold>{title}</Body>
      <Muted>{intro}</Muted>
      {children}
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <View style={{ backgroundColor: '#fff', padding: 6, borderRadius: 8 }}>
          <Image source={{ uri: qr }} style={{ width: 200, height: 200 }} accessibilityLabel={t('Codice QR del bonifico')} />
        </View>
      </View>
      <Line label={t('Beneficiario')} value={holder} copy={holder} />
      <Line label={t('IBAN')} value={formatIban(iban)} copy={iban} />
      <Line label={t('Importo')} value={euro(cents)} copy={(cents / 100).toFixed(2).replace('.', ',')} />
      <Line label={t('Causale')} value={reason} copy={reason} />
    </Card>
  );
}

/**
 * Dati del bonifico istantaneo per una lezione. Se il gestore ha il pagamento dalla banca, sopra c'è "Paga dalla tua
 * banca": il cliente lo fa dall'app e la lezione si segna pagata da sola (onPaid ricarica l'elenco).
 */
export function TransferDetails({
  booking,
  dog,
  cfg,
  onPaid,
}: {
  booking: Pick<Booking, 'id' | 'day' | 'start_min' | 'price_cents'>;
  dog: string;
  cfg: TransferSettings;
  onPaid?: () => void;
}) {
  return (
    <TransferBox
      title={t('Paga con bonifico istantaneo')}
      intro={t("Inquadra il codice con l'app della tua banca, oppure copia i dati. Scegli il bonifico istantaneo: il centro vede l'accredito in pochi secondi e segna la lezione come pagata.")}
      holder={cfg.holder}
      iban={cfg.iban}
      cents={booking.price_cents}
      reason={transferReason(booking, dog)}
    >
      <PayLesson booking={booking.id} cents={booking.price_cents} onDone={onPaid} />
    </TransferBox>
  );
}
