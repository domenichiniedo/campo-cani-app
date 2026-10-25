import { BillingFields } from '@/components/billing-fields';
import { useState, type ReactNode } from 'react';

import { Button, Card, Check, Chips, Expandable, Field, Muted } from '@/components/ui';
import type { BillingDraft, ClientKind } from '@/lib/billing';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { rulesLines } from '@/lib/types';

// Pezzi del modulo di iscrizione, uguali per chi si iscrive con email e password e per chi entra con Google.

export type DogDraft = { name: string; breed: string; birth: string; chip: string; goals: string; sex: '' | 'M' | 'F'; neutered: '' | 'si' | 'no' };
export const newDog = (): DogDraft => ({ name: '', breed: '', birth: '', chip: '', goals: '', sex: '', neutered: '' });

/** Le colonne del cane da salvare (o da mandare all'iscrizione). */
export const dogColumns = (d: DogDraft) => ({
  name: d.name.trim(),
  breed: d.breed.trim(),
  birth: d.birth || null,
  chip: cleanChip(d.chip),
  goals: d.goals.trim(),
  sex: d.sex,
  neutered: d.neutered === '' ? null : d.neutered === 'si',
});

/** Maschio o femmina, sterilizzato o no: due scelte veloci, facoltative. */
export function DogFacts({ sex, neutered, onChange }: { sex: DogDraft['sex']; neutered: DogDraft['neutered']; onChange: (p: Partial<DogDraft>) => void }) {
  return (
    <>
      <Chips
        items={[
          { value: 'M' as const, label: t('Maschio') },
          { value: 'F' as const, label: t('Femmina') },
        ]}
        value={sex || null}
        onChange={(v) => onChange({ sex: v === sex ? '' : v })}
      />
      <Chips
        items={[
          { value: 'si' as const, label: t('Sterilizzato') },
          { value: 'no' as const, label: t('Non sterilizzato') },
        ]}
        value={neutered || null}
        onChange={(v) => onChange({ neutered: v === neutered ? '' : v })}
      />
    </>
  );
}

/** Una riga con quello che si sa del cane: razza, sesso, sterilizzazione, nascita e microchip. */
export const dogLine = (d: { breed: string; birth: string | null; chip: string; sex: string; neutered: boolean | null }, born: (day: string) => string) =>
  [
    d.breed,
    d.sex === 'M' ? t('maschio') : d.sex === 'F' ? t('femmina') : '',
    d.neutered === true ? t('sterilizzato') : d.neutered === false ? t('non sterilizzato') : '',
    d.birth && born(d.birth),
    d.chip && t('microchip {n}', { n: d.chip }),
  ]
    .filter(Boolean)
    .join(' · ');

/** Il microchip senza spazi: 15 cifre, o vuoto. */
export const cleanChip = (s: string) => s.replace(/\s/g, '');
export const chipOk = (s: string) => !cleanChip(s) || /^\d{15}$/.test(cleanChip(s));

/** La nota sul cane per il centro e i trainer: obiettivi e situazione di adesso, in poche righe. */
export function GoalsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field
      label={t('Obiettivi e situazione attuale (facoltativo)')}
      value={value}
      onChangeText={onChange}
      maxLength={500}
      multiline
      placeholder={t('Es. tira al guinzaglio e abbaia agli altri cani; vorrei una passeggiata tranquilla e il richiamo.')}
    />
  );
}

/** Il campo del microchip: facoltativo, ma consigliato (serve al centro se il cane si perde o per l'assicurazione). */
export function ChipField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <Field label={t('Microchip (consigliato)')} value={value} onChangeText={onChange} keyboardType="number-pad" maxLength={18} placeholder="380260000000000" />
      <Muted style={{ fontSize: 13 }}>{t('Le 15 cifre del libretto o del passaporto del cane. Puoi metterlo anche dopo, dal Profilo.')}</Muted>
    </>
  );
}

/**
 * Persona o associazione/società. Una persona riceve solo lo scontrino; una società sceglie scontrino o fattura,
 * e per la fattura dà i suoi dati.
 */
export function ClientKindCard(p: {
  kind: ClientKind;
  onKind: (v: ClientKind) => void;
  wants: boolean;
  onWants: (v: boolean) => void;
  billing: BillingDraft;
  onBilling: (v: BillingDraft) => void;
}) {
  return (
    <Card>
      <Chips
        items={[
          { value: 'persona' as const, label: t('Sono una persona') },
          { value: 'societa' as const, label: t('Associazione o società') },
        ]}
        value={p.kind}
        onChange={p.onKind}
      />
      {p.kind === 'persona' ? (
        <Muted style={{ fontSize: 13 }}>{t('Come persona ricevi lo scontrino: non servono altri dati.')}</Muted>
      ) : (
        <>
          <Check value={p.wants} onChange={p.onWants}>
            {t('Voglio la fattura per le lezioni e i pacchetti')}
          </Check>
          {p.wants ? (
            <BillingFields value={p.billing} onChange={p.onBilling} />
          ) : (
            <Muted style={{ fontSize: 13 }}>{t('Senza fattura ricevi lo scontrino. Puoi chiederla anche dopo, dal Profilo.')}</Muted>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Un riquadro per cane, con il bottone per aggiungerne un altro. Con `extraOnly` il nome del primo cane è già
 * nel modulo principale: qui restano razza e nascita.
 */
export function DogCards({ dogs, onChange, extraOnly }: { dogs: DogDraft[]; onChange: (v: DogDraft[]) => void; extraOnly?: boolean }) {
  const setDog = (i: number, patch: Partial<DogDraft>) => onChange(dogs.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <>
      {dogs.map((d, i) => (
        <Card key={i}>
          {extraOnly && i === 0 ? (
            <Muted style={{ fontSize: 13 }}>{d.name.trim() || t('Il tuo cane')}</Muted>
          ) : (
            <Field label={t('Nome del cane')} value={d.name} onChangeText={(v) => setDog(i, { name: v })} />
          )}
          {/* Il microchip del primo cane è già nel modulo principale. */}
          {!(extraOnly && i === 0) && (
            <>
              <DogFacts sex={d.sex} neutered={d.neutered} onChange={(p) => setDog(i, p)} />
              <ChipField value={d.chip} onChange={(v) => setDog(i, { chip: v })} />
              <GoalsField value={d.goals} onChange={(v) => setDog(i, { goals: v })} />
            </>
          )}
          <Field label={t('Razza')} value={d.breed} onChangeText={(v) => setDog(i, { breed: v })} />
          <Field label={t('Nato il (AAAA-MM-GG)')} value={d.birth} onChangeText={(v) => setDog(i, { birth: v })} placeholder="2024-03-15" keyboardType="numbers-and-punctuation" />
          {dogs.length > 1 && i > 0 && <Button title={t('Togli questo cane')} kind="danger" small onPress={() => onChange(dogs.filter((_, j) => j !== i))} />}
        </Card>
      ))}
      <Button title={t('+ Aggiungi un altro cane')} kind="ghost" onPress={() => onChange([...dogs, newDog()])} />
    </>
  );
}

/** Regolamento e privacy (obbligatori) in un solo consenso, con i testi da leggere. */
export function ConsentCard(p: { accepted: boolean; onAccepted: (v: boolean) => void }) {
  const { settings, lessonTypes } = useSession();
  return (
    <Card>
      <Check value={p.accepted} onChange={p.onAccepted}>
        {t('Ho letto e accetto il regolamento del campo e l’informativa privacy.')}
      </Check>
      {settings && <Expandable title={t('il regolamento')} lines={rulesLines(settings, lessonTypes)} />}
      {settings && <Expandable title={t("l'informativa privacy")} lines={settings.privacy.split('\n').filter(Boolean)} />}
    </Card>
  );
}

/** Il consenso facoltativo a foto e video sui social. */
export function SocialCheck({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Card>
      <Check value={value} onChange={onChange}>
        {t('Acconsento alla pubblicazione sui social del centro di foto e video in cui compaiono i miei cani o io.')}
      </Check>
      <Muted style={{ fontSize: 13 }}>{t('Facoltativo: puoi iscriverti anche senza, e cambiare idea quando vuoi dal Profilo.')}</Muted>
    </Card>
  );
}

/** I dati facoltativi, chiusi finché non li apri: così il modulo resta corto. */
export function OptionalSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button title={open ? t('Nascondi i dati facoltativi') : t('Aggiungi altri dati (facoltativi)')} kind="ghost" onPress={() => setOpen(!open)} />
      {!open && <Muted style={{ fontSize: 13 }}>{t('Puoi aggiungerli adesso o più tardi, dal tuo profilo.')}</Muted>}
      {open && children}
    </>
  );
}
