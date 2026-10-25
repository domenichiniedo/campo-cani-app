/** Numero nel formato internazionale (+39...) chiesto dagli SMS; i numeri senza prefisso sono italiani. */
export function toE164(raw: string): string | null {
  let s = raw.replace(/[\s\-./()]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) s = `+39${s}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}
