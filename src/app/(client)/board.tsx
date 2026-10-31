import { useEffect } from 'react';

import { PostCard, useBoard } from '@/components/board';
import { H1, Muted, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';

/** La bacheca del centro: eventi in arrivo e comunicazioni. Aprendola gli avvisi si segnano letti. */
export default function Board() {
  const { posts, going, taken, loading, load, markRead } = useBoard();

  const unread = posts.filter((p) => p.kind === 'avviso').map((p) => p.id).join(',');
  useEffect(() => {
    if (unread) markRead(unread.split(','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{t('Bacheca')}</H1>
      {posts.length === 0 && !loading && <Muted>{t('Nessuna comunicazione dal centro, per ora.')}</Muted>}
      {posts.map((p) => (
        <PostCard key={p.id} p={p} going={going.has(p.id)} taken={taken[p.id]} onChange={load} />
      ))}
    </Screen>
  );
}
