import { Field, Row } from '@/components/ui';
import type { BillingDraft } from '@/lib/billing';

/** Campi per codice fiscale e indirizzo di fatturazione, usati in iscrizione e profilo. */
export function BillingFields({ value, onChange }: { value: BillingDraft; onChange: (v: BillingDraft) => void }) {
  const set = (patch: Partial<BillingDraft>) => onChange({ ...value, ...patch });
  return (
    <>
      <Field
        label="Codice fiscale (o partita IVA)"
        value={value.taxCode}
        onChangeText={(v) => set({ taxCode: v.toUpperCase() })}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={16}
      />
      <Field label="Indirizzo di fatturazione (via e numero)" value={value.street} onChangeText={(v) => set({ street: v })} autoComplete="street-address" />
      <Row>
        <Field label="CAP" value={value.zip} onChangeText={(v) => set({ zip: v })} keyboardType="number-pad" maxLength={5} autoComplete="postal-code" style={{ width: 96 }} />
        <Field label="Comune" value={value.city} onChangeText={(v) => set({ city: v })} style={{ flex: 1, minWidth: 140 }} />
        <Field label="Prov." value={value.province} onChangeText={(v) => set({ province: v.toUpperCase() })} autoCapitalize="characters" maxLength={2} style={{ width: 72 }} />
      </Row>
    </>
  );
}
