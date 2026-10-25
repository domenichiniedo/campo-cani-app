import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { billingOk } from '@/lib/billing';
import { imageUrl } from '@/lib/images';
import { upTo, usePlan } from '@/lib/plans';
import { sameOr, useWhenActive } from '@/lib/refresh';
import { supabase } from '@/lib/supabase';
import type { Field, LessonType, Profile, Settings, Trainer } from '@/lib/types';

type Ctx = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  settings: Settings | null;
  lessonTypes: LessonType[];
  /** Campi attivi, in ordine, fino al numero previsto dal piano. */
  fields: Field[];
  /** Trainer attivi, in ordine (nessuno se il piano non li prevede). */
  trainers: Trainer[];
  isOwner: boolean;
  isTrainer: boolean;
  /** Il trainer collegato all'account, se chi è entrato è un trainer. */
  myTrainer: Trainer | null;
  /** Cliente entrato con Google senza passare dal modulo di iscrizione: mancano telefono, cani e consensi. */
  needsSignup: boolean;
  needsTerms: boolean;
  /** Cliente che vuole la fattura ma non ha codice fiscale o indirizzo di fatturazione. */
  needsBilling: boolean;
  /** Cliente iscritto con la conferma SMS accesa che non ha ancora confermato il cellulare. */
  needsPhone: boolean;
  logoUrl: string | null;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const plan = usePlan();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lessonTypes, setLessonTypes] = useState<LessonType[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [myTrainerId, setMyTrainerId] = useState<string | null>(null);
  // Utente per cui profilo e impostazioni sono già caricati (null = nessuno connesso).
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    // Le assenze: a lezione finita, il cane che nessuno ha fatto entrare in campo prende la penalità (0023_cani.sql).
    // La fa chiunque abbia l'app aperta; con un database di prima la funzione non c'è e non succede niente.
    supabase.rpc('penalize_no_shows').then(
      () => {},
      () => {},
    );
    const [s, t, f, tr] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('lesson_types').select('*').eq('active', true).order('sort'),
      supabase.from('fields').select('*').eq('active', true).order('sort'),
      supabase.from('trainers').select('*').eq('active', true).order('sort'),
    ]);
    if (s.data) setSettings(sameOr<Settings | null>(s.data as Settings));
    // Con un piano più piccolo restano prenotabili solo le prime lezioni e le prime opzioni di ognuna.
    setLessonTypes(sameOr(upTo((t.data ?? []) as LessonType[], plan.maxLessonTypes).map((l) => ({ ...l, options: upTo(l.options ?? [], plan.maxOptions) }))));
    setFields(sameOr(((f.data ?? []) as Field[]).slice(0, plan.maxFields ?? undefined)));
    setTrainers(sameOr(upTo((tr.data ?? []) as Trainer[], plan.maxTrainers)));
    const uid = (await supabase.auth.getSession()).data.session?.user.id ?? null;
    if (uid) {
      const p = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      // Senza risposta (rete assente) si tiene il profilo che c'è.
      if (!p.error) setProfile(sameOr<Profile | null>((p.data as Profile) ?? null));
      if ((p.data as Profile | null)?.role === 'trainer') {
        const a = await supabase.from('trainer_accounts').select('trainer_id').eq('user_id', uid).maybeSingle();
        setMyTrainerId((a.data as { trainer_id: string } | null)?.trainer_id ?? null);
      } else {
        setMyTrainerId(null);
      }
    } else {
      setProfile(null);
    }
    setLoadedFor(uid);
  }, [plan]);

  useEffect(() => {
    const load = () =>
      refresh().catch(async () => setLoadedFor((await supabase.auth.getSession()).data.session?.user.id ?? null));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      load();
    });
    // Supabase sconsiglia altre chiamate dentro questo callback: le rimandiamo di un giro.
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setTimeout(load, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  // Ruolo, impostazioni, lezioni, campi e trainer si aggiornano da soli, senza chiudere l'app.
  useWhenActive(() => {
    refresh().catch(() => {});
  }, 60_000);

  const uid = session?.user.id ?? null;
  const dataReady = loadedFor === uid;

  const isOwner = profile?.role === 'owner';
  const isTrainer = profile?.role === 'trainer';
  const myTrainer = isTrainer ? (trainers.find((t) => t.id === myTrainerId) ?? null) : null;
  // Chi si iscrive dal modulo accetta subito regolamento e privacy: senza nessun consenso vuol dire che è
  // entrato la prima volta con Google e deve ancora completare l'iscrizione.
  const needsSignup = !!session && !!profile && !isOwner && !isTrainer && profile.rules_ver === null && profile.privacy_ver === null;
  // Regolamento e dati di fatturazione servono ai clienti, non a proprietario e trainer.
  const needsTerms =
    !!session && !!profile && !!settings && !isOwner && !isTrainer && !needsSignup &&
    (profile.rules_ver !== settings.rules_ver || profile.privacy_ver !== settings.privacy_ver);
  const needsBilling = !!session && !!profile && !isOwner && !isTrainer && !billingOk(profile);
  const needsPhone = !!session && !!profile && !isOwner && !isTrainer && profile.phone_ok === false;
  const logoUrl = imageUrl('branding', settings?.logo_path);

  return (
    <SessionContext.Provider
      value={{ ready: authReady && dataReady, session, profile, settings, lessonTypes, fields, trainers, isOwner, isTrainer, myTrainer, needsSignup, needsTerms, needsBilling, needsPhone, logoUrl, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession va usato dentro SessionProvider');
  return ctx;
}
