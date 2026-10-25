import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Avatar } from '@/components/photo';
import { TransferDetails } from '@/components/transfer';
import { Badge, Body, Button, Card, ConfirmButton, ErrorText, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { dayKey, euro, hm, longDay, slotDate, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useTransfer } from '@/lib/transfer';
import type { Booking } from '@/lib/types';

type BookingRow = Booking & {
  dogs: { name: string } | null;
  lesson_types: { label: string } | null;
  fields: { name: string; address: string } | null;
};

export default function MyBookings() {
  const { profile, settings, fields, trainers } = useSession();
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(0);
  const transfer = useTransfer();
  // La lezione di cui si stanno guardando i dati del bonifico.
  const [payOpen, setPayOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*, dogs(name), lesson_types(label), fields(name, address)')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .gte('day', dayKey(today()))
      .order('day')
      .order('start_min');
    setRows((data ?? []) as BookingRow[]);
    setNow(Date.now());
    setLoading(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const limitMs = (settings?.cancel_hours ?? 0) * 3600_000;

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{t('Le mie lezioni')}</H1>
      <ErrorText>{err}</ErrorText>
      {rows.length === 0 && !loading && <Muted>{t('Non hai lezioni in programma.')}</Muted>}
      {rows.map((b) => {
        const startsAt = slotDate(b.day, b.start_min);
        const canCancel = startsAt.getTime() - now >= limitMs;
        const trainer = trainers.find((t) => t.id === b.trainer_id);
        return (
          <Card key={b.id}>
            <Step title={`${longDay(b.day)} · ${hm(b.start_min)}`} />
            <Body bold>
              {b.lesson_types?.label ?? b.lesson_type}
              {b.lesson_option ? ` · ${b.lesson_option}` : ''} {t('per {cane}', { cane: b.dogs?.name ?? '' })}
            </Body>
            {fields.length > 1 && b.fields && (
              <Muted>
                {b.fields.name}
                {b.fields.address ? ` · ${b.fields.address}` : ''}
              </Muted>
            )}
            {trainer && (
              <Row>
                <Avatar name={trainer.name} path={trainer.photo_path} size={32} />
                <Muted>{t('Con {nome}', { nome: trainer.name })}</Muted>
              </Row>
            )}
            <Row>
              <Badge>{`${b.dur_min} min`}</Badge>
              {b.class_id && <Badge>{t('Di gruppo')}</Badge>}
              <Badge tone={b.paid ? 'ok' : 'warn'}>
                {b.pay === 'package'
                  ? t('Dal pacchetto')
                  : b.paid
                    ? t('Pagato')
                    : b.pay === 'online'
                      ? t('Online')
                      : b.pay === 'transfer'
                        ? t('Bonifico da fare {prezzo}', { prezzo: euro(b.price_cents) })
                        : t('Al campo {prezzo}', { prezzo: euro(b.price_cents) })}
              </Badge>
              {b.checked_in_at && <Badge tone="ok">{t('Entrato')}</Badge>}
            </Row>
            {!!b.note && <Muted style={{ fontSize: 13 }}>{t('La tua nota: {nota}', { nota: b.note })}</Muted>}
            {b.pay === 'transfer' && !b.paid && transfer?.iban && (
              <>
                <Button
                  small
                  kind="ghost"
                  title={payOpen === b.id ? t('Nascondi i dati del bonifico') : t('Dati per il bonifico')}
                  onPress={() => setPayOpen(payOpen === b.id ? null : b.id)}
                />
                {payOpen === b.id && <TransferDetails booking={b} dog={b.dogs?.name ?? ''} cfg={transfer} />}
              </>
            )}
            {canCancel ? (
              <ConfirmButton
                title={t('Disdici')}
                onConfirm={async () => {
                  setErr('');
                  const { error } = await supabase.rpc('cancel_booking', { p_id: b.id });
                  if (error) setErr(errorText(error));
                  load();
                }}
              />
            ) : (
              <Muted style={{ fontSize: 13 }}>{t('Non si può più disdire online: chiama il campo.')}</Muted>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
