// Management API di Supabase: crea i progetti dei centri ed esegue SQL nei loro database.
// Usa TOKEN_SUPABASE, un token del tuo account (supabase.com → Account → Access Tokens), solo nei segreti del gestore.

const API = 'https://api.supabase.com/v1';

export type Api = (method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) => Promise<unknown>;

// deno-lint-ignore no-explicit-any
export const managementApi: Api = async (method, path, body): Promise<any> => {
  const token = Deno.env.get('TOKEN_SUPABASE') ?? '';
  if (!token) throw new Error('Manca il token di Supabase (TOKEN_SUPABASE) nei segreti del gestore.');
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status} su ${method} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

/** Testo SQL tra apici. */
export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
