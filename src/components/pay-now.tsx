import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { Body, Button, Chips, Dialog, ErrorText, Field, Muted, Row } from '@/components/ui';
import { euro } from '@/lib/format';
import { payBanks, payNow, subscription, subscriptionCode, type Due } from '@/lib/gestore';
import { t } from '@/lib/i18n';
import { useLicense } from '@/lib/license-gate';
import { openSection } from '@/lib/sections';
import { supabase } from '@/lib/supabase';

type Bank = { nome: string; paese: string };

const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? '';
const month = (m: string) => m.split('-').reverse().join('/');

// La banca scelta l'ultima volta, per non cercarla ogni mese.
const STORE = 'k9-banca-pagamento';
const readBank = (): Bank | null => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null');
  } catch {
    return null;
  }
};
const writeBank = (b: Bank) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(b));
  } catch {}
};

/**
 * "Paga ora": apre la banca del centro con il bonifico istantaneo già compilato (importo, IBAN del gestore,
 * causale). Il centro lo conferma lì; il gestore lo riconosce e rinnova la licenza da solo. Non c'è se il
 * gestore non ha il pagamento dalla banca.
 */
export function PayNow({ code, due }: { code: string; due: Due }) {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [bank, setBank] = useState<Bank | null>(readBank);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    token()
      .then((tk) => payBanks(code, tk))
      .then(
        (r) => setBanks(r.banche),
        () => setBanks([]),
      );
  }, [code]);

  if (!banks?.length) return null;
  const known = bank && banks.some((b) => b.nome === bank.nome && b.paese === bank.paese) ? bank : null;
  const q = search.trim().toLowerCase();
  const found = q ? banks.filter((b) => b.nome.toLowerCase().includes(q)).slice(0, 8) : [];

  async function pay() {
    if (!known) return;
    setErr('');
    setBusy(true);
    try {
      const r = await payNow(code, due.id, known, await token());
      writeBank(known);
      await Linking.openURL(r.url);
      setSent(true);
    } catch (e) {
      setErr(t((e as Error).message));
    }
    setBusy(false);
  }

  return (
    <>
      {known ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>{t('Paghi da: {banca}', { banca: known.nome })}</Muted>
          <Button small kind="ghost" title={t('Cambia banca')} onPress={() => setBank(null)} />
        </Row>
      ) : (
        <>
          <Field label={t('La tua banca')} value={search} onChangeText={setSearch} placeholder={t('Cerca la tua banca')} />
          {found.length > 0 && (
            <Chips items={found.map((b) => ({ value: `${b.paese}|${b.nome}`, label: b.nome }))} value={null} onChange={(v) => setBank(found.find((b) => `${b.paese}|${b.nome}` === v)!)} />
          )}
        </>
      )}
      <Button title={t('Paga ora {importo}', { importo: euro(due.importo_cents) })} onPress={pay} loading={busy} disabled={!known} />
      <Muted style={{ fontSize: 13 }}>
        {sent
          ? t('Conferma il bonifico nella pagina della tua banca: appena arriva la licenza si rinnova da sola.')
          : t('Si apre la tua banca con il bonifico istantaneo già compilato: devi solo confermarlo.')}
      </Muted>
      <ErrorText>{err}</ErrorText>
    </>
  );
}

// Una volta per apertura dell'app: chi rimanda non la rivede finché non riapre.
const seen = new Set<string>();

/** All'apertura, se c'è un conto da pagare, l'app lo chiede al proprietario con "Paga ora". */
export function PaymentRequest() {
  const router = useRouter();
  const { license } = useLicense();
  const code = license ? subscriptionCode(license.id) : null;
  const [due, setDue] = useState<Due | null>(null);

  useEffect(() => {
    if (!code) return;
    token()
      .then((tk) => (tk ? subscription(code, tk) : null))
      .then((s) => setDue(s?.da_pagare.find((d) => !seen.has(d.id)) ?? null), () => {});
  }, [code]);

  if (!code || !due) return null;
  const close = () => {
    seen.add(due.id);
    setDue(null);
  };
  return (
    <Dialog open onClose={close}>
      <Body bold>{t('Conto di {mese}: {importo}', { mese: month(due.mese), importo: euro(due.importo_cents) })}</Body>
      <Muted>
        {due.scadenza
          ? t("Da pagare entro il {data}: dopo quel giorno l'app del centro si blocca finché il pagamento non arriva.", { data: due.scadenza.split('-').reverse().join('/') })
          : t("Il conto del mese è pronto.")}
      </Muted>
      <PayNow code={code} due={due} />
      <Row>
        <Button
          small
          kind="ghost"
          title={t('Vedi i dati del bonifico')}
          onPress={() => {
            close();
            openSection('settings', 'piano');
            router.navigate('/(owner)/settings');
          }}
        />
        <Button small kind="ghost" title={t('Più tardi')} onPress={close} />
      </Row>
    </Dialog>
  );
}
