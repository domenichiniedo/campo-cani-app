// Il database di un centro, visto dal pannello: stato del progetto Supabase, spazio usato,
// aggiornamenti dell'app caricati e quante righe ha ogni tabella. Solo numeri: nessun dato dei clienti.

import { MIGRAZIONI } from './migrazioni.ts';
import type { Api } from './supabase-api.ts';

export type Tabella = { nome: string; righe: number };

export async function databaseCentro(api: Api, progetto: string, migrazioni: number) {
  const [p, righe] = await Promise.all([
    api('GET', `/projects/${progetto}`) as Promise<{ status?: string; region?: string; created_at?: string; database?: { version?: string } }>,
    api('POST', `/projects/${progetto}/database/query`, {
      query: `select pg_database_size(current_database())::bigint as byte,
  coalesce((select json_agg(json_build_object('nome', relname, 'righe', n_live_tup) order by relname)
    from pg_stat_user_tables where schemaname = 'public'), '[]'::json) as tabelle,
  (select count(*) from auth.users)::int as utenti;`,
    }) as Promise<{ byte: number | string; tabelle: Tabella[] | string; utenti: number }[]>,
  ]);
  const r = righe?.[0];
  const tabelle = typeof r?.tabelle === 'string' ? (JSON.parse(r.tabelle) as Tabella[]) : (r?.tabelle ?? []);
  return {
    stato: p?.status ?? '',
    regione: p?.region ?? '',
    creato: p?.created_at ?? null,
    postgres: p?.database?.version ?? '',
    mb: Math.round((Number(r?.byte ?? 0) / 1048576) * 10) / 10,
    utenti: r?.utenti ?? 0,
    tabelle: tabelle.map((t) => ({ nome: t.nome, righe: Number(t.righe) })),
    migrazioni,
    migrazioni_app: MIGRAZIONI.length,
    link: `https://supabase.com/dashboard/project/${progetto}`,
  };
}

export type Progetto = { ref: string; nome: string; stato: string; regione: string; creato: string | null; centro: { id: string; campo: string; codice: string } | null; gestore: boolean };

/** Tutti i progetti del tuo account Supabase, con il centro a cui appartengono (o il gestore). */
export async function tuttiIDatabase(api: Api, centri: { id: string; campo: string; codice: string; progetto: string | null }[], gestore: string): Promise<Progetto[]> {
  const progetti = (await api('GET', '/projects')) as { id?: string; ref?: string; name: string; status: string; region: string; created_at?: string }[];
  return progetti.map((p) => {
    const ref = p.id ?? p.ref ?? '';
    const c = centri.find((x) => x.progetto === ref);
    return { ref, nome: p.name, stato: p.status, regione: p.region, creato: p.created_at ?? null, centro: c ? { id: c.id, campo: c.campo, codice: c.codice } : null, gestore: ref === gestore };
  });
}

/** Accende (restore) o spegne (pause) il database di un centro. */
export async function accendiDatabase(api: Api, progetto: string, acceso: boolean) {
  await api('POST', `/projects/${progetto}/${acceso ? 'restore' : 'pause'}`);
}
