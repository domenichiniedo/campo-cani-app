// Parti comuni alle funzioni di fatture e scontrini.
import { createClient } from 'npm:@supabase/supabase-js@2';

export const env = (k: string) => Deno.env.get(k) ?? '';

export const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

/** Può chiamarla il Database Webhook (con x-webhook-secret) o il proprietario dall'app. */
export async function allowed(req: Request) {
  const secret = env('WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') === secret) return true;
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return false;
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return false;
  const { data: p } = await admin.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return p?.role === 'owner';
}

export type Doc = {
  id: string;
  issued_on: string;
  buyer_name: string;
  buyer_tax_code: string | null;
  buyer_street: string | null;
  buyer_zip: string | null;
  buyer_city: string | null;
  buyer_province: string | null;
  description: string;
  total_cents: number;
  vat_rate: number;
  nature: string | null;
  provider_ref: string | null;
};
