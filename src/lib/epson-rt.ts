import { t } from '@/lib/i18n';

// Scontrino sul registratore telematico del campo, con il protocollo Epson ePOS-Print XML
// (fpmate.cgi) dei registratori Epson FP-81 II RT, FP-90 III RT e compatibili.
// La chiamata parte dal telefono o dal PC, che devono essere sulla stessa rete del registratore.
// Nel programma per computer passa dal programma stesso (desktop/main.js), non dalla pagina.

type DesktopBridge = { printerPost: (url: string, body: string) => Promise<{ status: number; text: string }> };
const desktop = (globalThis as { campoCaniDesktop?: DesktopBridge }).campoCaniDesktop;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const amount = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** Documento commerciale di una riga, già pagato con carta (pagamento online). */
export function epsonReceiptXml(description: string, cents: number, department = 1) {
  // Il registratore stampa solo caratteri semplici, al massimo 38 per descrizione.
  const plain = description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7E]/g, '');
  const desc = esc(plain.slice(0, 38));
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
<s:Body>
<printerFiscalReceipt>
<beginFiscalReceipt operator="1" />
<printRecItem operator="1" description="${desc}" quantity="1" unitPrice="${amount(cents)}" department="${department}" justification="1" />
<printRecTotal operator="1" description="PAGAMENTO ELETTRONICO" payment="${amount(cents)}" paymentType="2" index="1" justification="1" />
<endFiscalReceipt operator="1" />
</printerFiscalReceipt>
</s:Body>
</s:Envelope>`;
}

/** Numero del documento letto dalla risposta del registratore, nel formato zzzz-nnnn. */
export function parseEpsonResponse(xml: string): { ok: boolean; number: string | null; code: string } {
  const ok = /<response[^>]*success="true"/i.test(xml);
  const code = /<response[^>]*code="([^"]*)"/i.exec(xml)?.[1] ?? '';
  const n = /<fiscalReceiptNumber>\s*(\d+)\s*<\/fiscalReceiptNumber>/i.exec(xml)?.[1];
  const z = /<zRepNumber>\s*(\d+)\s*<\/zRepNumber>/i.exec(xml)?.[1];
  const number = n ? `${String(Number(z ?? 0) + 1).padStart(4, '0')}-${n.padStart(4, '0')}` : null;
  return { ok, number, code };
}

export async function printEpsonReceipt(printerUrl: string, description: string, cents: number) {
  const base = printerUrl.trim().replace(/\/+$/, '');
  const url = `${/^https?:\/\//.test(base) ? base : `http://${base}`}/cgi-bin/fpmate.cgi?devid=local_printer&timeout=10000`;
  let text: string;
  try {
    const body = epsonReceiptXml(description, cents);
    if (desktop) {
      text = (await desktop.printerPost(url, body)).text;
    } else {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body });
      text = await res.text();
    }
  } catch {
    throw new Error(t("Registratore non raggiungibile: controlla l'indirizzo e che il telefono o il PC siano sulla stessa rete."));
  }
  const r = parseEpsonResponse(text);
  if (!r.ok) throw new Error(r.code ? t('Il registratore ha rifiutato lo scontrino ({codice}).', { codice: r.code }) : t('Il registratore ha rifiutato lo scontrino.'));
  return r.number;
}
