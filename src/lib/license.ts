import nacl from 'tweetnacl';

import { LICENSE_PUBLIC_KEY } from '@/lib/license-key';

// Codice di licenza: CC1.<dati in base64url>.<firma Ed25519 in base64url>, creato con tools/licenza.mjs.

export type License = {
  v: number;
  id: string;
  campo: string;
  /** Ultimo giorno valido (AAAA-MM-GG), oppure null se non scade. */
  scade: string | null;
  emessa: string;
  /** Database del campo, se la licenza lo indica. */
  url?: string;
  chiave?: string;
};

export type LicenseCheck = { ok: true; license: License } | { ok: false; reason: string };

const PREFIX = 'CC1';

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const utf8 = (bytes: Uint8Array) => decodeURIComponent(escape(String.fromCharCode(...bytes)));
const ascii = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));

export const licensingEnabled = LICENSE_PUBLIC_KEY.length > 0;

/** Legge un codice e ne controlla la firma, senza guardare la scadenza. */
export function readLicense(code: string, publicKey = LICENSE_PUBLIC_KEY): LicenseCheck {
  const [prefix, body, sig] = code.trim().split('.');
  if (prefix !== PREFIX || !body || !sig) return { ok: false, reason: 'Questo non è un codice di licenza Campo Cani.' };
  let valid = false;
  try {
    valid = nacl.sign.detached.verify(ascii(`${prefix}.${body}`), fromB64url(sig), fromB64url(publicKey));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'Codice di licenza non valido. Controlla di averlo copiato tutto.' };
  try {
    return { ok: true, license: JSON.parse(utf8(fromB64url(body))) as License };
  } catch {
    return { ok: false, reason: 'Codice di licenza non leggibile.' };
  }
}

export const isExpired = (l: License, today: string) => !!l.scade && l.scade < today;

export const expiredText = (l: License) =>
  `La licenza di ${l.campo} è scaduta il ${(l.scade ?? '').split('-').reverse().join('/')}. Il centro deve rinnovarla.`;

/** Tra due licenze valide tiene quella che dura di più. */
export const longer = (a: License, b: License) => (!a.scade ? a : !b.scade ? b : a.scade >= b.scade ? a : b);

/** Controlla firma e scadenza. `today` è la data locale AAAA-MM-GG. */
export function checkLicense(code: string, today: string, publicKey = LICENSE_PUBLIC_KEY): LicenseCheck {
  const r = readLicense(code, publicKey);
  if (r.ok && isExpired(r.license, today)) return { ok: false, reason: expiredText(r.license) };
  return r;
}
