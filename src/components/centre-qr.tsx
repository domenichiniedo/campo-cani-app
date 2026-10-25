import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { Image, Platform, View } from 'react-native';

import { Body, Button, Card, Muted } from '@/components/ui';
import { t } from '@/lib/i18n';

// Si stampa dal browser e dal programma per computer; nell'app sul telefono il QR si mostra o si fotografa.
const native = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ?? false;
const canPrint = Platform.OS === 'web' && !native && typeof window !== 'undefined' && typeof window.print === 'function';

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

/** Il QR code del centro: chi lo inquadra arriva all'app già collegata a questo centro. */
export function CentreQr({ campo, link, code }: { campo: string; link: string; code: string | null }) {
  const qr = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(link);
    q.make();
    return q.createDataURL(8, 4);
  }, [link]);

  return (
    <Card>
      <Body bold>{t('QR code per i clienti')}</Body>
      <Muted>
        {t("Appendilo al campo o mostralo dal telefono: chi lo inquadra apre l'app già collegata al tuo centro. Se non ha ancora l'app lo porta a scaricarla, poi basta inquadrarlo di nuovo.")}
      </Muted>
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <View style={{ backgroundColor: '#fff', padding: 8, borderRadius: 8 }}>
          <Image source={{ uri: qr }} style={{ width: 220, height: 220 }} accessibilityLabel={t('QR code del centro {campo}', { campo })} />
        </View>
      </View>
      {!!code && <Muted style={{ textAlign: 'center' }}>{t('Codice del centro: {codice}', { codice: code })}</Muted>}
      {canPrint && <Button small kind="ghost" title={t('Stampa il QR code')} onPress={() => print(campo, qr, code)} />}
    </Card>
  );
}
