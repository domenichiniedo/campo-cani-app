import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';

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

/** Dati del bonifico istantaneo per una lezione: QR da inquadrare con l'app della banca, IBAN, importo e causale. */
export function TransferDetails({ booking, dog, cfg }: { booking: Pick<Booking, 'id' | 'day' | 'start_min' | 'price_cents'>; dog: string; cfg: TransferSettings }) {
  const reason = transferReason(booking, dog);
  const qr = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(epcPayload(cfg.holder, cfg.iban, booking.price_cents, reason));
    q.make();
    return q.createDataURL(6, 4);
  }, [cfg.holder, cfg.iban, booking.price_cents, reason]);

  return (
    <Card>
      <Body bold>{t('Paga con bonifico istantaneo')}</Body>
      <Muted>
        {t("Inquadra il codice con l'app della tua banca, oppure copia i dati. Scegli il bonifico istantaneo: il centro vede l'accredito in pochi secondi e segna la lezione come pagata.")}
      </Muted>
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <View style={{ backgroundColor: '#fff', padding: 6, borderRadius: 8 }}>
          <Image source={{ uri: qr }} style={{ width: 200, height: 200 }} accessibilityLabel={t('Codice QR del bonifico')} />
        </View>
      </View>
      <Line label={t('Beneficiario')} value={cfg.holder} copy={cfg.holder} />
      <Line label={t('IBAN')} value={formatIban(cfg.iban)} copy={cfg.iban} />
      <Line label={t('Importo')} value={euro(booking.price_cents)} copy={(booking.price_cents / 100).toFixed(2).replace('.', ',')} />
      <Line label={t('Causale')} value={reason} copy={reason} />
    </Card>
  );
}
