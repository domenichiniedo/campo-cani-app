import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { Image, Linking, View } from 'react-native';

import { Body, Button, Card, ErrorText, Muted, Row } from '@/components/ui';
import { t } from '@/lib/i18n';
import { canCopyImage, canPrint, canSaveImage, canShareImage, copyImage, copyText, nativeApp, saveImage, shareImage, whatsappLink } from '@/lib/share';
import { errorText } from '@/lib/supabase';

const PITCH = '#123a2b';
const INK = '#16211b';
const MUTED = '#5f6b64';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** Stampa un foglio con il QR, il nome del centro e il codice, da appendere al campo. */
function print(campo: string, qr: string, code: string | null) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(campo)}</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:48px 24px;color:#16211b">
<h1 style="font-size:34px;margin:0 0 8px">${esc(campo)}</h1>
<p style="font-size:20px;margin:0 0 28px">${esc(t("Prenota le lezioni con l'app K9 Manager"))}</p>
<img src="${qr}" style="width:340px;height:340px;image-rendering:pixelated">
<p style="font-size:18px;margin:28px auto 0;max-width:520px">${esc(t("Inquadra il codice con la fotocamera del telefono: si apre l'app già collegata al centro. Se non hai ancora l'app ti porta a scaricarla: poi inquadralo di nuovo."))}</p>
${code ? `<p style="font-size:18px">${esc(t('Codice del centro'))}: <b>${esc(code)}</b></p>` : ''}
</body></html>`);
  d.close();
  setTimeout(() => {
    f.contentWindow?.print();
    setTimeout(() => f.remove(), 1000);
  }, 300);
}

/** Scrive il testo centrato, rimpicciolendolo finché sta nella larghezza. */
function fitText(g: CanvasRenderingContext2D, text: string, y: number, size: number, weight: string, color: string, width: number) {
  let s = size;
  do {
    g.font = `${weight} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    s -= 2;
  } while (g.measureText(text).width > width && s > 18);
  g.fillStyle = color;
  g.fillText(text, 540, y);
}

/**
 * L'immagine da mandare su WhatsApp e sui social (1080×1350, il formato verticale di Instagram): il nome del centro
 * sulla fascia verde, il QR e il codice.
 */
function poster(campo: string, q: ReturnType<typeof qrcode>, code: string | null): Promise<Blob> {
  const cv = document.createElement('canvas');
  cv.width = 1080;
  cv.height = 1350;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = PITCH;
  g.fillRect(0, 0, 1080, 210);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, campo.toUpperCase(), 105, 66, '800', '#ffffff', 980);
  fitText(g, t("Prenota le lezioni con l'app K9 Manager"), 285, 42, '600', INK, 980);
  // Il QR disegnato quadratino per quadratino, nitido a qualunque dimensione.
  const n = q.getModuleCount();
  const cell = Math.floor(720 / (n + 8));
  const side = cell * (n + 8);
  const x0 = (1080 - side) / 2 + cell * 4;
  const y0 = 350 + cell * 4;
  g.fillStyle = INK;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
  const below = 350 + side + 50;
  if (code) fitText(g, t('Codice del centro: {codice}', { codice: code }), below, 46, '800', INK, 980);
  fitText(g, t('Inquadralo con la fotocamera del telefono'), code ? below + 70 : below, 34, '400', MUTED, 980);
  return new Promise((ok, ko) => cv.toBlob((b) => (b ? ok(b) : ko(new Error('canvas'))), 'image/png'));
}

/**
 * Il QR code del centro: chi lo inquadra arriva all'app già collegata a questo centro. Si stampa, si copia, si salva
 * e si manda su WhatsApp e sui social come immagine con il nome del centro.
 */
export function CentreQr({ campo, link, code, message }: { campo: string; link: string; code: string | null; message: string }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const q = useMemo(() => {
    const x = qrcode(0, 'M');
    x.addData(link);
    x.make();
    return x;
  }, [link]);
  const qr = useMemo(() => q.createDataURL(8, 4), [q]);
  const share = useMemo(canShareImage, []);
  const name = `qr-${campo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'centro'}.png`;

  async function run(what: string, job: () => Promise<string | void>) {
    setErr('');
    setMsg('');
    setBusy(what);
    try {
      const done = await job();
      if (done) setMsg(done);
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy('');
  }

  return (
    <Card>
      <Body bold>{t('QR code per i clienti')}</Body>
      <Muted>
        {t("Appendilo al campo, mandalo su WhatsApp o pubblicalo sui social: chi lo inquadra apre l'app già collegata al tuo centro. Se non ha ancora l'app lo porta a scaricarla, poi basta inquadrarlo di nuovo.")}
      </Muted>
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <View style={{ backgroundColor: '#fff', padding: 8, borderRadius: 8 }}>
          <Image source={{ uri: qr }} style={{ width: 220, height: 220 }} accessibilityLabel={t('QR code del centro {campo}', { campo })} />
        </View>
      </View>
      {!!code && <Muted style={{ textAlign: 'center' }}>{t('Codice del centro: {codice}', { codice: code })}</Muted>}
      {share ? (
        <Button
          small
          title={t('Condividi (WhatsApp, social...)')}
          loading={busy === 'share'}
          onPress={() => run('share', async () => shareImage(await poster(campo, q, code), name, message, campo))}
        />
      ) : (
        <Button small title={t('Manda su WhatsApp')} onPress={() => Linking.openURL(whatsappLink(message))} />
      )}
      <Row>
        {canCopyImage ? (
          <Button
            small
            kind="ghost"
            title={t("Copia l'immagine")}
            loading={busy === 'copy'}
            onPress={() =>
              run('copy', async () => {
                await copyImage(await poster(campo, q, code));
                return t('Immagine copiata: incollala con Ctrl+V in WhatsApp, in una mail o in un post.');
              })
            }
          />
        ) : null}
        <Button
          small
          kind="ghost"
          title={t('Copia il link')}
          onPress={() =>
            run('link', async () => {
              await copyText(message);
              return t('Messaggio con il link copiato: incollalo dove vuoi.');
            })
          }
        />
        {canSaveImage && (
          <Button
            small
            kind="ghost"
            title={t("Salva l'immagine")}
            loading={busy === 'save'}
            onPress={() => run('save', async () => saveImage(await poster(campo, q, code), name))}
          />
        )}
        {canPrint && <Button small kind="ghost" title={t('Stampa il QR code')} onPress={() => print(campo, qr, code)} />}
      </Row>
      {!share && !nativeApp && (
        <Muted style={{ fontSize: 13 }}>
          {t("Su WhatsApp parte il messaggio con il link; per mandare anche l'immagine copiala e incollala nella chat.")}
        </Muted>
      )}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
    </Card>
  );
}
