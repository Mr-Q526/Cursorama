import { useEffect, useRef, useState } from 'react';
import { FilmStripIcon, ImageIcon } from '@phosphor-icons/react';
import { getLibraryCover } from '../library';
import { t } from '../i18n';

export interface LibraryCoverProps { projectId: string; videoId?: string; revision: string; cover?: string; }
interface CoverJob { run: () => Promise<void>; }

const COVER_QUEUE = { concurrency: 2, maximumCached: 160 } as const;
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
const queue: CoverJob[] = [];
let activeJobs = 0;

function nextJob(): void {
  if (activeJobs >= COVER_QUEUE.concurrency) return;
  const job = queue.shift(); if (!job) return;
  activeJobs++;
  void job.run().finally(() => { activeJobs--; nextJob(); });
}

function loadCover(key: string, projectId: string, videoId?: string): Promise<string | null> {
  const cached = cache.get(key); if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(key); if (existing) return existing;
  const promise = new Promise<string | null>((resolve) => {
    queue.push({ run: async () => {
      let result: string | null = null;
      try { result = await getLibraryCover(projectId, videoId); }
      catch (error) { console.warn('LIBRARY_COVER_UNAVAILABLE', projectId, videoId, error instanceof Error ? error.message : String(error)); }
      cache.set(key, result); pending.delete(key);
      if (cache.size > COVER_QUEUE.maximumCached) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
      resolve(result);
    } });
    nextJob();
  });
  pending.set(key, promise);
  return promise;
}

export function LibraryCover({ projectId, videoId, revision, cover }: LibraryCoverProps) {
  const key = `${projectId}:${videoId ?? 'project'}:${revision}`;
  const host = useRef<HTMLSpanElement>(null);
  const [image, setImage] = useState<string | null>(cover ?? cache.get(key) ?? null);
  const [loading, setLoading] = useState(!image);
  useEffect(() => {
    let cancelled = false;
    setImage(cover ?? cache.get(key) ?? null); setLoading(!cover);
    if (cover) return;
    const fetchCover = (): void => { void loadCover(key, projectId, videoId).then((value) => { if (!cancelled) { setImage(value); setLoading(false); } }); };
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); fetchCover(); } }, { rootMargin: '160px' });
    if (host.current) observer.observe(host.current); else fetchCover();
    return () => { cancelled = true; observer.disconnect(); };
  }, [key, projectId, videoId, cover]);
  return <span className={`library-cover${loading && !image ? ' loading' : ''}`} ref={host} aria-label={image ? t.covers.preview : loading ? t.covers.loading : t.covers.unavailable}>
    {image ? <img src={image} alt="" loading="lazy" draggable={false} onError={() => { cache.set(key, null); setImage(null); setLoading(false); }} /> : loading ? <FilmStripIcon size={22} weight="light" /> : <ImageIcon size={22} weight="light" />}
  </span>;
}
