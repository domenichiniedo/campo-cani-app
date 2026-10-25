import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

// Pagamento con carta tramite Nexi XPay: la funzione "nexi" del database del centro crea l'ordine e il cliente paga
// sulla pagina di Nexi. Per ora solo l'ambiente di prova di Nexi: nessun addebito vero.

async function nexi<T>(body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nexi', { body });
  if (error) {
    // L'errore della funzione è nel corpo della risposta.
    const msg = await (error as { context?: Response }).context?.json?.().then((x: { error?: string }) => x.error, () => undefined);
    throw new Error(msg ?? t('Il pagamento con carta non risponde. Riprova più tardi.'));
  }
  return data as T;
}

/** Apre la pagina di Nexi per pagare la lezione; torna lo stato dell'ordine quando il cliente rientra (sul telefono). */
export async function payByCard(booking: string): Promise<'paid' | 'failed' | 'created' | 'opened'> {
  // Sul web la finestra si apre subito, nel tocco del cliente, se no il browser la blocca.
  const w = Platform.OS === 'web' ? window.open('', '_blank') : null;
  try {
    const r = await nexi<{ url: string; ordine: string; pagato?: boolean }>({ azione: 'paga', booking });
    // Nella demo il pagamento riesce subito, senza la pagina di Nexi.
    if (r.pagato) {
      w?.close();
      return 'paid';
    }
    if (Platform.OS === 'web') {
      if (w) w.location.href = r.url;
      else window.location.href = r.url;
      return 'opened';
    }
    await WebBrowser.openBrowserAsync(r.url);
    const v = await nexi<{ stato: 'paid' | 'failed' | 'created' }>({ azione: 'verifica', ordine: r.ordine });
    return v.stato;
  } catch (e) {
    w?.close();
    throw e;
  }
}

/** Rimborsa sulla carta una lezione pagata con Nexi e poi disdetta. */
export const refundCard = (booking: string) => nexi<{ rimborsato: boolean }>({ azione: 'rimborsa', booking });

/** La funzione nexi è installata nel database del centro (solo il proprietario). */
export const nexiReady = () => nexi<{ pronto: boolean; prova: boolean }>({ azione: 'stato' });
