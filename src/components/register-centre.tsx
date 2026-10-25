import { useEffect, useState } from 'react';

import { priceText } from '@/components/subscription-panel';
import { Badge, Body, Button, Card, Chips, ErrorText, Field, Muted, Row } from '@/components/ui';
import { centreStatus, planPrices, registerCentre, type CentreState, type PlanPrice } from '@/lib/gestore';
import { t, tKey } from '@/lib/i18n';
import { useLicense } from '@/lib/license-gate';
import { PLANS, type PlanId } from '@/lib/plans';
import { isValidIban, normalizeIban } from '@/lib/transfer';

const STORE = 'campo-cani-registrazione';

type Pending = { codice: string; email: string };

const read = (): Pending | null => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null');
  } catch {
    return null;
  }
};
const write = (p: Pending | null) => {
  try {
    if (p) localStorage.setItem(STORE, JSON.stringify(p));
    else localStorage.removeItem(STORE);
  } catch {}
};

// I passi della preparazione, nell'ordine del gestore.
const STEPS: CentreState[] = ['progetto', 'avvio', 'database', 'chiavi', 'licenza'];
const STEP_TEXT: Record<string, string> = {
  progetto: tKey('Creo il database del centro…'),
  avvio: tKey('Avvio il database…'),
  database: tKey('Preparo tabelle e permessi…'),
  chiavi: tKey('Collego il database…'),
  licenza: tKey('Attivo la licenza…'),
};

/** Un centro nuovo si registra dall'app e il gestore gli prepara il database. Paga ogni mese con un bonifico istantaneo. */
export function RegisterCentre({ onBack }: { onBack: () => void }) {
  const { activate } = useLicense();
  const [pending, setPending] = useState<Pending | null>(read);
  const [campo, setCampo] = useState('');
  const [email, setEmail] = useState('');
  const [piano, setPiano] = useState<PlanId>('professional');
  const [iban, setIban] = useState('');
  const [prices, setPrices] = useState<Partial<Record<string, PlanPrice>>>({});
  const [state, setState] = useState<CentreState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    planPrices().then(setPrices, () => {});
  }, []);

  // Mentre il centro si prepara si chiede lo stato ogni pochi secondi; pronto, l'app si attiva da sola.
  useEffect(() => {
    if (!pending) return;
    let stop = false;
    const check = () =>
      centreStatus(pending.codice)
        .then(async (s) => {
          if (stop) return;
          setState(s.stato);
          if (s.licenza) {
            const e = await activate(s.licenza);
            if (e) setErr(e);
            else write(null);
          }
        })
        .catch(() => {});
    check();
    const id = setInterval(check, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [pending, activate]);

  async function submit() {
    setErr('');
    const i = normalizeIban(iban);
    if (i && !isValidIban(i)) return setErr(t('IBAN non valido.'));
    setBusy(true);
    try {
      const r = await registerCentre(campo.trim(), email.trim().toLowerCase(), piano, i);
      const p = { codice: r.codice, email: email.trim().toLowerCase() };
      write(p);
      setPending(p);
    } catch (e) {
      setErr(t((e as Error).message));
    }
    setBusy(false);
  }

  function cancel() {
    write(null);
    setPending(null);
    setState(null);
    setErr('');
  }

  if (pending) {
    const step = state ? STEPS.indexOf(state) : -1;
    return (
      <Card>
        <Body bold>{t('Il tuo centro')}</Body>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body>{t('Codice del centro')}</Body>
          <Badge tone="ok">{pending.codice}</Badge>
        </Row>
        <Muted style={{ fontSize: 13 }}>{t("Dallo ai tuoi clienti e trainer: lo scrivono alla prima apertura dell'app.")}</Muted>
        {step >= 0 && (
          <>
            <Body>{t(STEP_TEXT[state!])}</Body>
            <Muted>{t('Passo {n} di {tot}. Di solito bastano 3 o 4 minuti: puoi lasciare l\'app aperta.', { n: step + 1, tot: STEPS.length })}</Muted>
          </>
        )}
        {state === 'pronto' && <Body>{t('Il centro è pronto: sto aprendo l\'app…')}</Body>}
        {state === 'errore' && <ErrorText>{t('La preparazione del centro non è riuscita. Contatta l\'assistenza indicando il codice {codice}.', { codice: pending.codice })}</ErrorText>}
        <Muted style={{ fontSize: 13 }}>
          {t('Quando è pronto, iscriviti con {email}: entri già come proprietario.', { email: pending.email })}
        </Muted>
        <ErrorText>{err}</ErrorText>
        <Button small kind="ghost" title={t('Ricomincia la registrazione')} onPress={cancel} />
      </Card>
    );
  }

  return (
    <Card>
      <Body bold>{t('Registra il tuo centro')}</Body>
      <Muted>
        {t("Ogni mese paghi il canone del piano e una quota per ogni prenotazione dei tuoi clienti, con un bonifico istantaneo: nell'app trovi importo, IBAN e causale. Se il pagamento non arriva entro il giorno 3 del mese, l'app del centro si blocca finché non arriva.")}
      </Muted>
      <Field label={t('Nome del centro')} value={campo} onChangeText={setCampo} />
      <Field label={t('Email del titolare')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="nome@email.it" />
      <Body bold>{t('Piano')}</Body>
      <Chips items={(Object.keys(PLANS) as PlanId[]).map((id) => ({ value: id, label: PLANS[id].label }))} value={piano} onChange={setPiano} />
      {!!prices[piano] && <Muted>{t('Piano {piano}: {prezzo}', { piano: PLANS[piano].label, prezzo: priceText(prices[piano]!) })}</Muted>}
      <Muted style={{ fontSize: 13 }}>{t('Puoi cambiare piano quando vuoi dalle Impostazioni.')}</Muted>
      <Field
        label={t('IBAN da cui paghi (facoltativo)')}
        value={iban}
        onChangeText={setIban}
        placeholder="IT60 X054 2811 1010 0000 0123 456"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <ErrorText>{err}</ErrorText>
      <Button title={t('Continua')} onPress={submit} loading={busy} disabled={campo.trim().length < 2 || !email.includes('@')} />
      <Button small kind="ghost" title={t('Ho già un codice')} onPress={onBack} disabled={busy} />
    </Card>
  );
}

/** C'è una registrazione in corso su questo dispositivo. */
export const registrationPending = () => !!read();
