// Licenze firmate dal server, con la seconda chiave (LICENZA_SERVER_PRIVATA, creata con
// "node tools/licenza.mjs chiavi-server"). Stesso formato di tools/licenza.mjs: l'app le legge allo stesso modo.
import nacl from 'npm:tweetnacl@1.0.3';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

export type DatiLicenza = {
  id: string;
  campo: string;
  piano: 'base' | 'professional' | 'pro';
  scade: string | null;
  emessa: string;
  url: string;
  chiave: string;
};

export function firmaLicenza(d: DatiLicenza, seme: string) {
  if (!seme) throw new Error('Manca la chiave del server per le licenze (LICENZA_SERVER_PRIVATA): vedi gestore/README.md.');
  const body = b64url(new TextEncoder().encode(JSON.stringify({ v: 1, ...d })));
  const { secretKey } = nacl.sign.keyPair.fromSeed(fromB64url(seme));
  const sig = nacl.sign.detached(new TextEncoder().encode(`CC1.${body}`), secretKey);
  return `CC1.${body}.${b64url(sig)}`;
}

/** Ultimo giorno del mese, `mesi` mesi dopo quello di `giorno` (AAAA-MM-GG). */
export function fineMese(giorno: string, mesi: number) {
  const [y, m] = giorno.split('-').map(Number);
  return new Date(Date.UTC(y, m + mesi, 0)).toISOString().slice(0, 10);
}
