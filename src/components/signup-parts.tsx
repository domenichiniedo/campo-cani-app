import { BillingFields } from '@/components/billing-fields';
import { Button, Card, Check, Expandable, Field, Muted } from '@/components/ui';
import type { BillingDraft } from '@/lib/billing';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { rulesLines } from '@/lib/types';

// Pezzi del modulo di iscrizione, uguali per chi si iscrive con email e password e per chi entra con Google.

export type DogDraft = { name: string; breed: string; birth: string };
export const newDog = (): DogDraft => ({ name: '', breed: '', birth: '' });

/** Fattura sì o no; codice fiscale e indirizzo servono solo a chi la vuole. */
export function InvoiceCard(p: { wants: boolean; onWants: (v: boolean) => void; billing: BillingDraft; onBilling: (v: BillingDraft) => void }) {
  return (
    <Card>
      <Check value={p.wants} onChange={p.onWants}>
        {t('Voglio la fattura per le lezioni e i pacchetti')}
      </Check>
      {p.wants ? (
        <BillingFields value={p.billing} onChange={p.onBilling} />
      ) : (
        <Muted style={{ fontSize: 13 }}>{t('Senza fattura non servono codice fiscale e indirizzo. Puoi chiederla anche dopo, dal Profilo.')}</Muted>
      )}
    </Card>
  );
}

/** Un riquadro per cane, con il bottone per aggiungerne un altro. */
export function DogCards({ dogs, onChange }: { dogs: DogDraft[]; onChange: (v: DogDraft[]) => void }) {
  const setDog = (i: number, patch: Partial<DogDraft>) => onChange(dogs.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <>
      {dogs.map((d, i) => (
        <Card key={i}>
          <Field label={t('Nome del cane')} value={d.name} onChangeText={(v) => setDog(i, { name: v })} />
          <Field label={t('Razza')} value={d.breed} onChangeText={(v) => setDog(i, { breed: v })} />
          <Field label={t('Nato il (AAAA-MM-GG)')} value={d.birth} onChangeText={(v) => setDog(i, { birth: v })} placeholder="2024-03-15" keyboardType="numbers-and-punctuation" />
          {dogs.length > 1 && <Button title={t('Togli questo cane')} kind="danger" small onPress={() => onChange(dogs.filter((_, j) => j !== i))} />}
        </Card>
      ))}
      <Button title={t('+ Aggiungi un altro cane')} kind="ghost" onPress={() => onChange([...dogs, newDog()])} />
    </>
  );
}

/** Regolamento e privacy (obbligatori) e, se c'è `social`, il consenso facoltativo a foto e video. */
export function ConsentCard(p: {
  rules: boolean;
  onRules: (v: boolean) => void;
  privacy: boolean;
  onPrivacy: (v: boolean) => void;
  social?: boolean;
  onSocial?: (v: boolean) => void;
}) {
  const { settings, lessonTypes } = useSession();
  return (
    <Card>
      {settings && <Expandable title={t('il regolamento')} lines={rulesLines(settings, lessonTypes)} />}
      <Check value={p.rules} onChange={p.onRules}>
        {t('Ho letto e accetto il regolamento del campo.')}
      </Check>
      {settings && <Expandable title={t("l'informativa privacy")} lines={settings.privacy.split('\n').filter(Boolean)} />}
      <Check value={p.privacy} onChange={p.onPrivacy}>
        {t("Ho letto l'informativa e acconsento al trattamento dei miei dati per gestire le prenotazioni.")}
      </Check>
      {p.onSocial && (
        <>
          <Check value={!!p.social} onChange={p.onSocial}>
            {t('Acconsento alla pubblicazione sui social del centro di foto e video in cui compaiono i miei cani o io.')}
          </Check>
          <Muted style={{ fontSize: 13 }}>{t('Facoltativo: puoi iscriverti anche senza, e cambiare idea quando vuoi dal Profilo.')}</Muted>
        </>
      )}
    </Card>
  );
}
