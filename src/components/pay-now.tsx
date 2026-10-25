import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { Body, Button, Chips, Dialog, ErrorText, Field, Muted, Row } from '@/components/ui';
import { euro } from '@/lib/format';
import { lessonBanks, payBanks, payLesson, payNow, subscription, subscriptionCode, type Due } from '@/lib/gestore';
import { t } from '@/lib/i18n';
import { useLicense } from '@/lib/license-gate';
import { openSection } from '@/lib/sections';
import { supabase } from '@/lib/supabase';
import { formatIban, isValidIban, normalizeIban } from '@/lib/transfer';

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

// L'IBAN del cliente, per non riscriverlo a ogni lezione (resta solo nel dispositivo).
const IBAN = 'k9-iban-cliente';
const readIban = () => {
  try {
    return localStorage.getItem(IBAN) ?? '';
  } catch {
    return '';
  }
};
const writeIban = (s: string) => {
  try {
    localStorage.setItem(IBAN, s);
  } catch {}
};

/** La banca da cui si paga: quella dell'ultima volta, o una da cercare fra quelle che lo permettono. */
function BankChoice({ banks, bank, setBank }: { banks: Bank[]; bank: Bank | null; setBank: (b: Bank | null) => void }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const found = q ? banks.filter((b) => b.nome.toLowerCase().includes(q)).slice(0, 8) : [];
  return bank ? (
    <Row style={{ justifyContent: 'space-between' }}>
      <Muted>{t('Paghi da: {banca}', { banca: bank.nome })}</Muted>
      <Button small kind="ghost" title={t('Cambia banca')} onPress={() => setBank(null)} />
    </Row>
  ) : (
    <>
      <Field label={t('La tua banca')} value={search} onChangeText={setSearch} placeholder={t('Cerca la tua banca')} />
      {found.length > 0 && (
        <Chips items={found.map((b) => ({ value: `${b.paese}|${b.nome}`, label: b.nome }))} value={null} onChange={(v) => setBank(found.find((b) => `${b.paese}|${b.nome}` === v)!)} />
      )}
    </>
  );
}

const knownBank = (banks: Bank[], bank: Bank | null) => (bank && banks.some((b) => b.nome === bank.nome && b.paese === bank.paese) ? bank : null);

/**
 * "Paga ora": apre la banca del centro con il bonifico istantaneo già compilato (importo, IBAN del gestore,
 * causale). Il centro lo conferma lì; il gestore lo riconosce e rinnova la licenza da solo. Non c'è se il
 * gestore non ha il pagamento dalla banca.
 */
export function PayNow({ code, due }: { code: string; due: Due }) {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [bank, setBank] = useState<Bank | null>(readBank);
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
  const known = knownBank(banks, bank);

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
      <BankChoice banks={banks} bank={known} setBank={setBank} />
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

/**
 * Il cliente paga una lezione dall'app: sceglie la sua banca, scrive il suo IBAN e trova il bonifico istantaneo
 * verso il conto del centro già compilato; lo conferma nella banca e la lezione si segna pagata da sola. Non c'è se
 * il centro non è del gestore o il gestore non ha il pagamento dalla banca.
 */
export function PayLesson({ booking, cents, onDone }: { booking: string; cents: number; onDone?: () => void }) {
  const { license } = useLicense();
  const code = license ? subscriptionCode(license.id) : null;
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [bank, setBank] = useState<Bank | null>(readBank);
  const [iban, setIban] = useState(readIban);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!code) return;
    token()
      .then((tk) => (tk ? lessonBanks(code, tk) : { banche: [] }))
      .then(
        (r) => setBanks(r.banche),
        () => setBanks([]),
      );
  }, [code]);

  if (!code || !banks?.length) return null;
  const known = knownBank(banks, bank);
  const ibanOk = isValidIban(iban);

  async function pay() {
    if (!known || !code) return;
    setErr('');
    if (!ibanOk) return setErr(t('Il tuo IBAN non è valido: controllalo.'));
    setBusy(true);
    // Sul web la finestra si apre subito, nel tocco del cliente, se no il browser la blocca.
    const w = Platform.OS === 'web' ? window.open('', '_blank') : null;
    try {
      const r = await payLesson(code, booking, known, normalizeIban(iban), await token());
      writeBank(known);
      writeIban(normalizeIban(iban));
      setSent(true);
      if (Platform.OS === 'web') {
        if (w) w.location.href = r.url;
        else window.location.href = r.url;
      } else {
        // Al ritorno dalla banca la lezione è già segnata pagata: si ricarica l'elenco.
        await WebBrowser.openBrowserAsync(r.url);
        onDone?.();
      }
    } catch (e) {
      w?.close();
      setErr(t((e as Error).message));
    }
    setBusy(false);
  }

  return (
    <>
      <BankChoice banks={banks} bank={known} setBank={setBank} />
      <Field
        label={t('Il tuo IBAN')}
        value={iban}
        onChangeText={setIban}
        onBlur={() => ibanOk && setIban(formatIban(iban))}
        placeholder="IT60 X054 2811 1010 0000 0123 456"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Button title={t('Paga dalla tua banca {importo}', { importo: euro(cents) })} onPress={pay} loading={busy} disabled={!known || !iban.trim()} />
      <Muted style={{ fontSize: 13 }}>
        {sent
          ? t('Conferma il bonifico nella pagina della tua banca: appena parte la lezione risulta pagata.')
          : t('Si apre la tua banca con il bonifico istantaneo al centro già compilato: devi solo confermarlo. La lezione si segna pagata da sola.')}
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
