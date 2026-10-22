import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/photo';
import { Badge, Body, Button, Card, Chips, ConfirmButton, ErrorText, Muted, Row } from '@/components/ui';
import { euro, hm, timeOf } from '@/lib/format';
import type { OwnerBooking } from '@/lib/owner';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fullName, PENALTY_REASONS } from '@/lib/types';

/** Scheda di una prenotazione per il proprietario: ingresso, pagamento, penalità, annullo. */
export function OwnerBookingCard({ b, onChange, showField }: { b: OwnerBooking; onChange: () => void; showField?: boolean }) {
  const c = useColors();
  const { trainers } = useSession();
  const plan = usePlan();
  const [trainerOpen, setTrainerOpen] = useState(false);
  // Solo i trainer che seguono questo tipo di lezione (lista vuota = tutti).
  const fit = trainers.filter((t) => !t.lessons.length || t.lessons.includes(b.lesson_type));
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
          {showField && b.fields && <Badge>{b.fields.name}</Badge>}
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
        <Row>
          <Avatar name={fullName(b.profiles)} path={b.profiles?.photo_path} size={24} />
          <Muted>
            {fullName(b.profiles)} · {b.profiles?.phone}
          </Muted>
        </Row>
        {trainers.length > 0 && (
          <Row>
            {b.trainers && <Avatar name={b.trainers.name} path={trainers.find((t) => t.id === b.trainer_id)?.photo_path} size={24} />}
            <Text style={{ color: b.trainers ? c.accent : c.brassText, fontSize: 14, fontWeight: '700' }}>
              {b.trainers ? `Trainer: ${b.trainers.name}` : 'Trainer da assegnare'}
            </Text>
          </Row>
        )}
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
        {b.pay === 'package' ? (
          <Badge tone="ok">Dal pacchetto</Badge>
        ) : (
          plan.payments && (
            <Button
              small
              kind="ghost"
              title={b.paid ? `Pagato ${euro(b.price_cents)} ✓` : `Incassa ${euro(b.price_cents)}`}
              onPress={() => run(() => supabase.from('bookings').update({ paid: !b.paid }).eq('id', b.id))}
            />
          )
        )}
        {trainers.length > 0 && (
          <Button small kind="ghost" title={b.trainers ? 'Cambia trainer' : 'Assegna trainer'} onPress={() => setTrainerOpen(!trainerOpen)} />
        )}
        <Button small kind="ghost" title="Penalità" onPress={() => setPenaltyOpen(!penaltyOpen)} />
        <ConfirmButton
          title="Annulla lezione"
          onConfirm={() =>
            run(() => supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', b.id))
          }
        />
      </Row>
      {trainerOpen && (
        <View style={{ gap: 8 }}>
          {fit.length === 0 && <Muted>Nessun trainer segue questo tipo di lezione. Controlla in Impostazioni.</Muted>}
          <Chips
            items={[...fit.map((t) => ({ value: t.id, label: t.name })), { value: '', label: 'Nessuno' }]}
            value={b.trainer_id ?? ''}
            onChange={async (v) => {
              await run(() => supabase.from('bookings').update({ trainer_id: v || null }).eq('id', b.id));
              setTrainerOpen(false);
            }}
          />
        </View>
      )}
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
