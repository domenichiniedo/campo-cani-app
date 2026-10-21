import { useState } from 'react';
import { Text, View } from 'react-native';

import { Badge, Body, Button, Card, Chips, ConfirmButton, ErrorText, Muted, Row } from '@/components/ui';
import { euro, hm, timeOf } from '@/lib/format';
import type { OwnerBooking } from '@/lib/owner';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fullName, PENALTY_REASONS } from '@/lib/types';

/** Scheda di una prenotazione per il proprietario: ingresso, pagamento, penalità, annullo. */
export function OwnerBookingCard({ b, onChange }: { b: OwnerBooking; onChange: () => void }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setErr('');
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) setErr(errorText(error));
    onChange();
  }

  const arrived = !!b.checked_in_at;
  const penalized = b.penalties.length > 0;

  return (
    <Card style={arrived ? { borderLeftWidth: 4, borderLeftColor: c.accent } : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>
          {hm(b.start_min)}
          <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }}> – {hm(b.start_min + b.dur_min)}</Text>
        </Text>
        <Row>
          {arrived && <Badge tone="ok">{`Entrato ${timeOf(b.checked_in_at!)}`}</Badge>}
          {b.dogs?.blocked && <Badge tone="bad">Sospeso</Badge>}
          {penalized && <Badge tone="bad">Penalità</Badge>}
        </Row>
      </Row>
      <View style={{ gap: 2 }}>
        <Body bold>
          {b.dogs?.name}
          {b.dogs?.breed ? ` (${b.dogs.breed})` : ''}
        </Body>
        <Muted>
          {b.lesson_types?.label ?? b.lesson_type}
          {b.lesson_option ? ` · ${b.lesson_option}` : ''}
        </Muted>
        <Muted>
          {fullName(b.profiles)} · {b.profiles?.phone}
        </Muted>
      </View>
      <Row>
        <Button
          small
          kind={arrived ? 'ghost' : 'primary'}
          title={arrived ? 'Annulla ingresso' : 'Ingresso'}
          loading={busy}
          onPress={() =>
            run(() => supabase.from('bookings').update({ checked_in_at: arrived ? null : new Date().toISOString() }).eq('id', b.id))
          }
        />
        <Button
          small
          kind="ghost"
          title={b.paid ? `Pagato ${euro(b.price_cents)} ✓` : `Incassa ${euro(b.price_cents)}`}
          onPress={() => run(() => supabase.from('bookings').update({ paid: !b.paid }).eq('id', b.id))}
        />
        <Button small kind="ghost" title="Penalità" onPress={() => setPenaltyOpen(!penaltyOpen)} />
        <ConfirmButton
          title="Annulla lezione"
          onConfirm={() =>
            run(() => supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', b.id))
          }
        />
      </Row>
      {penaltyOpen && (
        <View style={{ gap: 8 }}>
          <Chips items={PENALTY_REASONS.map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
          <Button
            small
            kind="danger"
            title="Dai penalità"
            disabled={!reason}
            onPress={async () => {
              await run(() => supabase.from('penalties').insert({ dog_id: b.dog_id, booking_id: b.id, reason }));
              setPenaltyOpen(false);
              setReason(null);
            }}
          />
        </View>
      )}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}
