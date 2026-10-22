import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { hasBilling } from '@/lib/billing';
import { supabase } from '@/lib/supabase';
import type { Field, LessonType, Profile, Settings, Trainer } from '@/lib/types';

type Ctx = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  settings: Settings | null;
  lessonTypes: LessonType[];
  /** Campi attivi, in ordine. */
  fields: Field[];
  /** Trainer attivi, in ordine. */
  trainers: Trainer[];
  isOwner: boolean;
  needsTerms: boolean;
  /** Cliente senza codice fiscale o indirizzo di fatturazione (iscritto prima che servissero). */
  needsBilling: boolean;
  logoUrl: string | null;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lessonTypes, setLessonTypes] = useState<LessonType[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  // Utente per cui profilo e impostazioni sono già caricati (null = nessuno connesso).
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [s, t, f, tr] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('lesson_types').select('*').eq('active', true).order('sort'),
      supabase.from('fields').select('*').eq('active', true).order('sort'),
      supabase.from('trainers').select('*').eq('active', true).order('sort'),
    ]);
    if (s.data) setSettings(s.data as Settings);
    setLessonTypes((t.data ?? []) as LessonType[]);
    setFields((f.data ?? []) as Field[]);
    setTrainers((tr.data ?? []) as Trainer[]);
    const uid = (await supabase.auth.getSession()).data.session?.user.id ?? null;
    if (uid) {
      const p = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      setProfile((p.data as Profile) ?? null);
    } else {
      setProfile(null);
    }
    setLoadedFor(uid);
  }, []);

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

  const uid = session?.user.id ?? null;
  const dataReady = loadedFor === uid;

  const isOwner = profile?.role === 'owner';
  const needsTerms =
    !!session && !!profile && !!settings && !isOwner &&
    (profile.rules_ver !== settings.rules_ver || profile.privacy_ver !== settings.privacy_ver);
  const needsBilling = !!session && !!profile && !isOwner && !hasBilling(profile);
  const logoUrl = settings?.logo_path
    ? supabase.storage.from('branding').getPublicUrl(settings.logo_path).data.publicUrl
    : null;

  return (
    <SessionContext.Provider
      value={{ ready: authReady && dataReady, session, profile, settings, lessonTypes, fields, trainers, isOwner, needsTerms, needsBilling, logoUrl, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession va usato dentro SessionProvider');
  return ctx;
}
