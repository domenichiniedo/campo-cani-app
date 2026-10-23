#!/usr/bin/env node
// Unisce tutte le migrazioni in supabase/setup.sql: un solo file da incollare nel SQL Editor
// di un progetto Supabase nuovo. Rilancialo ogni volta che aggiungi una migrazione:
//
//   node tools/setup-sql.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(import.meta.dirname, '../supabase/migrations');

/** Tutte le migrazioni in ordine, in un unico testo SQL. */
export function migrationsSql() {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => `-- ===== ${f} =====\n\n${readFileSync(join(dir, f), 'utf8').trim()}\n`)
    .join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(import.meta.dirname, '../supabase/setup.sql');
  writeFileSync(
    out,
    `-- K9 Manager: tutto il database in un solo file, per un progetto Supabase NUOVO.
-- 1. Scrivi l'email del titolare del centro nell'ultima riga, al posto di titolare@esempio.it.
-- 2. Incolla tutto il file nel SQL Editor di Supabase e premi Run.
-- Il titolare poi si iscrive dall'app con quella email ed entra già come proprietario.
-- Non eseguirlo su un database che ha già i dati: lì servono solo le migrazioni nuove.
-- File generato da tools/setup-sql.mjs: non modificarlo a mano.

${migrationsSql()}
-- ===== Titolare del centro =====

select public.set_owner_email('titolare@esempio.it');
`,
  );
  console.log(`Scritto ${out}`);
}
