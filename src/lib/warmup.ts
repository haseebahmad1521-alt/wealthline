// App-wide rule (owner, Nov 2, 2026): data and images a view needs are fetched and decoded ahead of time, off the
// interaction path, so changing views never stalls on the network or a decode. Once the first screen has painted, the
// other tabs' queries are warmed and every portrait thumbnail is prefetched, all in idle time. React Query then serves
// cached data instantly and refreshes it in the background.
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect } from 'react';

import { loadProjects, usePeople } from '@/lib/data';
import { portraitAt, portraitPx } from '@/lib/portrait';
import { prefetchWorld } from '@/lib/world';

const idle = (fn: () => void) => {
  const w = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 3000 });
  else setTimeout(fn, 800);
};

export function useWarmup() {
  const qc = useQueryClient();
  const people = usePeople().data;
  useEffect(() => {
    idle(() => {
      void prefetchWorld(qc);
      void qc.prefetchQuery({ queryKey: ['projects'], queryFn: loadProjects });
    });
  }, [qc]);
  useEffect(() => {
    if (!people) return;
    // The biggest size a list or globe bubble draws covers every small portrait (rows, podium, bubbles).
    const urls = people.flatMap((p) => (p.portrait_url ? [portraitAt(p.portrait_url, portraitPx(80))] : []));
    idle(() => void Image.prefetch(urls, 'memory-disk').catch(() => undefined));
  }, [people]);
}
