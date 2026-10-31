import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Badge, Body, Button, Card, ErrorText, Muted, Row } from '@/components/ui';
import { eventWhen, sortPosts, visiblePosts } from '@/lib/board';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { Post } from '@/lib/types';

/** Bacheca del cliente: gli avvisi, le letture e la sua partecipazione agli eventi (con quanti posti restano). */
export function useBoard() {
  const { profile } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [going, setGoing] = useState<Set<string>>(new Set());
  const [taken, setTaken] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [p, r, g, n] = await Promise.all([
      supabase.from('posts').select('*').order('created_at', { ascending: false }),
      supabase.from('post_reads').select('post_id').eq('user_id', profile.id),
      supabase.from('post_rsvps').select('post_id').eq('user_id', profile.id),
      supabase.rpc('event_seats_taken'),
    ]);
    // Il database del centro non ha ancora la bacheca: niente da mostrare.
    setPosts(p.error ? [] : sortPosts(visiblePosts((p.data ?? []) as Post[])));
    setRead(new Set(((r.data ?? []) as { post_id: string }[]).map((x) => x.post_id)));
    setGoing(new Set(((g.data ?? []) as { post_id: string }[]).map((x) => x.post_id)));
    setTaken(Object.fromEntries(((n.data ?? []) as { post_id: string; taken: number }[]).map((x) => [x.post_id, x.taken])));
    setLoading(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Segna letti gli avvisi: tolti dall'evidenza nella pagina Prenota. */
  async function markRead(ids: string[]) {
    const fresh = ids.filter((id) => !read.has(id));
    if (!fresh.length || !profile) return;
    await supabase.from('post_reads').upsert(
      fresh.map((post_id) => ({ post_id, user_id: profile.id })),
      { onConflict: 'post_id,user_id', ignoreDuplicates: true },
    );
    setRead(new Set([...read, ...fresh]));
  }

  return { posts, read, going, taken, loading, load, markRead };
}

/** Un avviso o un evento; per gli eventi il tasto "Partecipo" (o "Non partecipo più"). */
export function PostCard({ p, going, taken, onChange }: { p: Post; going?: boolean; taken?: number; onChange?: () => void }) {
  const { profile } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const left = p.seats != null ? Math.max(p.seats - (taken ?? 0), 0) : null;

  async function toggle() {
    if (!profile) return;
    setErr('');
    setBusy(true);
    const { error } = going
      ? await supabase.from('post_rsvps').delete().eq('post_id', p.id).eq('user_id', profile.id)
      : await supabase.from('post_rsvps').insert({ post_id: p.id, user_id: profile.id });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onChange?.();
  }

  return (
    <Card accent={p.important || p.kind === 'evento'}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold style={{ flex: 1 }}>
          {p.title}
        </Body>
        {p.kind === 'evento' ? <Badge tone="ok">{t('Evento')}</Badge> : p.important ? <Badge tone="warn">{t('Importante')}</Badge> : null}
      </Row>
      {p.kind === 'evento' && <Body>{eventWhen(p)}</Body>}
      {!!p.body && <Muted>{p.body}</Muted>}
      {p.kind === 'evento' && (
        <>
          <Row>
            {going && <Badge tone="ok">{t('Partecipi')}</Badge>}
            {left !== null && <Muted style={{ fontSize: 13 }}>{left === 0 ? t('Posti esauriti') : left === 1 ? t('1 posto libero') : t('{n} posti liberi', { n: left })}</Muted>}
          </Row>
          {(going || left !== 0) && (
            <Button small kind={going ? 'ghost' : 'primary'} title={going ? t('Non partecipo più') : t('Partecipo')} onPress={toggle} loading={busy} />
          )}
          <ErrorText>{err}</ErrorText>
        </>
      )}
    </Card>
  );
}

/** Nella pagina Prenota: gli avvisi importanti non ancora letti e quanti eventi ci sono in bacheca. */
export function ImportantNotices() {
  const { posts, read, markRead } = useBoard();
  const news = posts.filter((p) => p.kind === 'avviso' && p.important && !read.has(p.id));
  const events = posts.filter((p) => p.kind === 'evento').length;
  return (
    <>
      {news.map((p) => (
        <Card key={p.id} accent>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body bold style={{ flex: 1 }}>
              {p.title}
            </Body>
            <Badge tone="warn">{t('Importante')}</Badge>
          </Row>
          {!!p.body && <Muted>{p.body}</Muted>}
          <Button small kind="ghost" title={t('Ho letto')} onPress={() => markRead([p.id])} />
        </Card>
      ))}
      {events > 0 && (
        <Button
          small
          kind="ghost"
          title={events === 1 ? t('1 evento in bacheca') : t('{n} eventi in bacheca', { n: events })}
          onPress={() => router.navigate('/(client)/board')}
        />
      )}
    </>
  );
}
