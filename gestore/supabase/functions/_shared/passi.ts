// La preparazione di un centro, un passo alla volta: progetto → avvio → database → chiavi → licenza → pronto.
// Ogni passo si può ripetere senza danni, così se uno fallisce il giro dopo riprova da lì.
// A un centro già pronto aggiunge, una alla volta, le migrazioni uscite dopo (aggiornamenti dell'app).
import type { Centro } from './comune.ts';
import { fineMese, firmaLicenza } from './licenza.ts';
import { MIGRAZIONI } from './migrazioni.ts';
import { lit, type Api } from './supabase-api.ts';

export type Ambiente = {
  api: Api;
  /** Seme della chiave del server per le licenze. */
  seme: string;
  /** Organizzazione Supabase dove nascono i progetti dei centri (id o slug); vuota = la prima. */
  org: string;
  regione: string;
  /** Oggi, AAAA-MM-GG. */
  oggi: string;
  /** Password del database del progetto nuovo (non serve a nessuno: si può cambiare da Supabase). */
  password: () => string;
  /** SMTP per le email della password dimenticata; senza, Supabase non le manda ai clienti. */
  smtp: { host: string; port: string; user: string; pass: string; from: string } | null;
  /** Twilio per il codice SMS che conferma il cellulare dei clienti; senza, il cellulare non si conferma. */
  sms: { sid: string; token: string; servizio: string } | null;
};

// deno-lint-ignore no-explicit-any
type Any = any;

/** Fa il passo successivo e restituisce i campi del centro da salvare ({} = niente di nuovo, si riprova dopo). */
export async function passo(c: Centro, a: Ambiente): Promise<Partial<Centro>> {
  const query = (sql: string): Promise<Any[]> => a.api('POST', `/projects/${c.progetto}/database/query`, { query: sql }) as Promise<Any[]>;
  switch (c.stato) {
    case 'progetto': {
      const orgs = (await a.api('GET', '/organizations')) as { id: string; slug: string; name: string }[];
      const org = a.org ? orgs.find((o) => o.id === a.org || o.slug === a.org) : orgs[0];
      if (!org) throw new Error(a.org ? `Organizzazione Supabase "${a.org}" non trovata.` : 'Il tuo account Supabase non ha organizzazioni.');
      const p = (await a.api('POST', '/projects', {
        name: `${c.campo} (${c.codice})`.slice(0, 60),
        organization_id: org.id,
        region: a.regione,
        db_pass: a.password(),
      })) as { id?: string; ref?: string };
      return { progetto: p.id ?? p.ref, stato: 'avvio' };
    }
    case 'avvio': {
      const p = (await a.api('GET', `/projects/${c.progetto}`)) as { status: string };
      if (p.status === 'ACTIVE_HEALTHY') return { stato: 'database' };
      // Di solito bastano un paio di minuti: dopo mezz'ora (un controllo al minuto) c'è qualcosa che non va.
      if (c.tentativi >= 30) throw new Error(`Il progetto ${c.progetto} non è ancora pronto dopo mezz'ora (stato ${p.status}).`);
      return { tentativi: c.tentativi + 1 };
    }
    case 'database': {
      const [{ pronto }] = await query("select to_regclass('public.settings') is not null as pronto;");
      // Le migrazioni vanno insieme in un'unica richiesta: o entrano tutte o nessuna.
      const sql = [
        ...(pronto ? [] : MIGRAZIONI.map((m) => m.sql)),
        `select public.set_owner_email(${lit(c.email)});`,
        `update public.settings set field_name = ${lit(c.campo)} where id = 1;`,
      ].join('\n\n');
      await query(sql);
      const migrazioni = MIGRAZIONI.length;
      // Con un SMTP proprio chi si iscrive conferma l'email con un codice (un link nell'app non si aprirebbe);
      // senza, Supabase non manda email ai clienti ed entrano subito. Con Twilio confermano anche il cellulare.
      await a.api('PATCH', `/projects/${c.progetto}/config/auth`, {
        mailer_autoconfirm: !a.smtp,
        ...(a.smtp
          ? {
              smtp_host: a.smtp.host,
              smtp_port: a.smtp.port,
              smtp_user: a.smtp.user,
              smtp_pass: a.smtp.pass,
              smtp_admin_email: a.smtp.from,
              smtp_sender_name: c.campo,
              mailer_subjects_recovery: 'Il codice per la nuova password',
              mailer_templates_recovery_content: '<h2>Nuova password</h2>\n<p>Il tuo codice è: <strong>{{ .Token }}</strong></p>',
              mailer_subjects_confirmation: 'Il codice per confermare la tua email',
              mailer_templates_confirmation_content: `<h2>Benvenuto in ${c.campo.replace(/[<>&]/g, '')}</h2>\n<p>Il codice per confermare la tua email è: <strong>{{ .Token }}</strong></p>`,
            }
          : {}),
        ...(a.sms
          ? {
              external_phone_enabled: true,
              sms_autoconfirm: false,
              sms_provider: 'twilio',
              sms_twilio_account_sid: a.sms.sid,
              sms_twilio_auth_token: a.sms.token,
              sms_twilio_message_service_sid: a.sms.servizio,
              sms_template: 'Il tuo codice è {{ .Code }}',
            }
          : {}),
      });
      if (a.sms) await query('update public.settings set sms_check = true where id = 1;');
      return { stato: 'chiavi', migrazioni };
    }
    case 'chiavi': {
      const trova = async () => ((await a.api('GET', `/projects/${c.progetto}/api-keys?reveal=true`)) as { type: string; api_key: string }[]).find((k) => k.type === 'publishable');
      let pub = await trova();
      if (!pub) {
        await a.api('POST', `/projects/${c.progetto}/api-keys`, { type: 'publishable', name: 'app' });
        pub = await trova();
      }
      // Solo la publishable key, che va nell'app: la secret key del centro non serve e non si legge mai.
      if (!pub?.api_key?.startsWith('sb_publishable_')) throw new Error('Non trovo la publishable key del progetto.');
      return { url: `https://${c.progetto}.supabase.co`, chiave: pub.api_key, stato: 'licenza' };
    }
    case 'licenza':
      return { ...(await rinnova(c, a, fineMese(a.oggi, 1))), stato: 'pronto' };
    case 'pronto': {
      const m = MIGRAZIONI[c.migrazioni];
      if (!m) return {};
      await query(m.sql);
      return { migrazioni: c.migrazioni + 1 };
    }
    default:
      return {};
  }
}

/** Firma una licenza valida fino a `scade` (mai prima di quella che il centro ha già) e la mette nel suo database. */
export async function rinnova(c: Centro, a: Ambiente, scade: string): Promise<Partial<Centro>> {
  if (!c.progetto || !c.url || !c.chiave) throw new Error(`Il centro ${c.codice} non ha ancora il database.`);
  const fine = c.scade && c.scade > scade ? c.scade : scade;
  const licenza = firmaLicenza({ id: c.codice, campo: c.campo, piano: c.piano, scade: fine, emessa: a.oggi, url: c.url, chiave: c.chiave }, a.seme);
  // L'app di tutti i clienti prende da qui il codice più recente, anche senza aggiornarla.
  await a.api('POST', `/projects/${c.progetto}/database/query`, { query: `update public.settings set license_code = ${lit(licenza)} where id = 1;` });
  return { licenza, scade: fine };
}
