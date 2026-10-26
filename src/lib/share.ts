// Condividere e copiare testi e immagini (il QR code del centro, il link di attivazione):
//   - app Android (Capacitor): la WebView non ha la condivisione del browser, quindi si usano i plugin Share,
//     Filesystem e Clipboard; si apre la scelta di Android con WhatsApp, Telegram, Instagram e gli altri;
//   - browser del telefono e Windows: la condivisione del browser quando c'è (navigator.share);
//   - programma per Windows: non ha la condivisione, ma copia l'immagine, la salva e apre WhatsApp.
import { Platform, Share } from 'react-native';

import { t } from '@/lib/i18n';

type Capacitor = { isNativePlatform?: () => boolean; nativePromise: (plugin: string, method: string, options?: object) => Promise<unknown> };

const w = (Platform.OS === 'web' ? globalThis : {}) as { Capacitor?: Capacitor; navigator?: Navigator };
const capacitor = w.Capacitor?.isNativePlatform?.() ? w.Capacitor : null;

/** Nell'app Android installata. */
export const nativeApp = !!capacitor;

/** Il browser (o il programma per computer) apre il foglio di stampa. */
export const canPrint = Platform.OS === 'web' && !nativeApp && typeof window !== 'undefined' && typeof window.print === 'function';

/** Si può copiare un'immagine negli appunti, per incollarla in WhatsApp, in una mail o in un post. */
export const canCopyImage =
  Platform.OS === 'web' && !nativeApp && typeof ClipboardItem !== 'undefined' && typeof w.navigator?.clipboard?.write === 'function';

/** Si può salvare l'immagine come file: nel browser e nel programma con il download, nell'app Android nei Documenti. */
export const canSaveImage = Platform.OS === 'web' && typeof document !== 'undefined';

const toFile = (blob: Blob, name: string) => new File([blob], name, { type: blob.type || 'image/png' });

/** La condivisione apre la scelta delle app (WhatsApp, social...) anche con un'immagine. */
export function canShareImage(): boolean {
  if (nativeApp) return true;
  const n = w.navigator;
  if (!n?.canShare || typeof File === 'undefined') return false;
  try {
    return n.canShare({ files: [new File([new Uint8Array(1)], 'qr.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

const base64 = (blob: Blob) =>
  new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => ko(r.error);
    r.readAsDataURL(blob);
  });

/** Annullare la condivisione non è un errore. */
const cancelled = (e: unknown) => /cancel|abort/i.test(String((e as { name?: string; message?: string })?.name ?? '') + String((e as Error)?.message ?? ''));

/** Condivide un testo: nell'app Android con la scelta delle app, altrove con la condivisione di React Native. */
export async function shareText(message: string, title?: string) {
  try {
    if (capacitor) await capacitor.nativePromise('Share', 'share', { title, text: message, dialogTitle: title });
    else await Share.share({ message, title });
  } catch (e) {
    if (!cancelled(e)) throw e;
  }
}

/** Condivide un'immagine con un testo: WhatsApp, Telegram, Instagram, mail... a scelta di chi la manda. */
export async function shareImage(blob: Blob, name: string, message: string, title?: string) {
  try {
    if (capacitor) {
      const { uri } = (await capacitor.nativePromise('Filesystem', 'writeFile', { path: name, data: await base64(blob), directory: 'CACHE' })) as { uri: string };
      await capacitor.nativePromise('Share', 'share', { title, text: message, files: [uri], dialogTitle: title });
      return;
    }
    await w.navigator!.share({ files: [toFile(blob, name)], text: message, title });
  } catch (e) {
    if (!cancelled(e)) throw e;
  }
}

/** Copia un testo negli appunti. */
export async function copyText(text: string) {
  if (capacitor) await capacitor.nativePromise('Clipboard', 'write', { string: text });
  else await w.navigator!.clipboard.writeText(text);
}

/** Copia un'immagine negli appunti: poi si incolla con Ctrl+V in WhatsApp, nelle mail o nei social. */
export async function copyImage(blob: Blob) {
  await w.navigator!.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
}

/**
 * Salva l'immagine nella cartella Download (o dove sceglie chi la salva); nell'app Android nella cartella Documenti
 * del telefono. Torna il messaggio da mostrare, se c'è.
 */
export async function saveImage(blob: Blob, name: string): Promise<string | void> {
  if (capacitor) {
    await capacitor.nativePromise('Filesystem', 'writeFile', { path: name, data: await base64(blob), directory: 'DOCUMENTS' });
    return t('Immagine salvata nella cartella Documenti del telefono: {nome}', { nome: name });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Apre WhatsApp (l'app sul computer o WhatsApp Web) con il messaggio già scritto. */
export function whatsappLink(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
