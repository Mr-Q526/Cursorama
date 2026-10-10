import { useCallback, useEffect, useState } from 'react';

export type AppPage = 'workspace' | 'library' | 'preview';
export interface PreviewPageTarget { projectId: string; videoId: string; }
export interface PageNavigationOptions { replace?: boolean; preview?: PreviewPageTarget; }
interface PageLocation { page: AppPage; previewTarget?: PreviewPageTarget; }
interface PageHistoryState { cursoramaPreview?: PreviewPageTarget; }

const PAGE_ROUTES: Record<AppPage, string> = {
  workspace: '#/workspace', library: '#/library', preview: '#/preview',
};

function currentLocation(): PageLocation {
  const page = (Object.keys(PAGE_ROUTES) as AppPage[]).find((value) => PAGE_ROUTES[value] === window.location.hash) ?? 'library';
  const state: unknown = window.history.state;
  if (page !== 'preview' || typeof state !== 'object' || state === null || !('cursoramaPreview' in state)) return { page };
  const target = state.cursoramaPreview;
  if (typeof target !== 'object' || target === null || !('projectId' in target) || !('videoId' in target) || typeof target.projectId !== 'string' || !target.projectId || typeof target.videoId !== 'string' || !target.videoId) return { page };
  return { page, previewTarget: { projectId: target.projectId, videoId: target.videoId } };
}

function sameLocation(first: PageLocation, second: PageLocation): boolean {
  return first.page === second.page && first.previewTarget?.projectId === second.previewTarget?.projectId && first.previewTarget?.videoId === second.previewTarget?.videoId;
}

export function useAppPage() {
  const [location, setLocation] = useState<PageLocation>(currentLocation);
  useEffect(() => {
    const sync = (): void => { const next = currentLocation(); setLocation((current) => sameLocation(current, next) ? current : next); };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  const navigate = useCallback((next: AppPage, options?: PageNavigationOptions): void => {
    const target: PageLocation = { page: next, previewTarget: next === 'preview' ? options?.preview : undefined };
    if (window.location.hash !== PAGE_ROUTES[next] || !sameLocation(currentLocation(), target)) {
      const state: PageHistoryState = { cursoramaPreview: target.previewTarget };
      if (options?.replace) window.history.replaceState(state, '', PAGE_ROUTES[next]);
      else window.history.pushState(state, '', PAGE_ROUTES[next]);
    }
    setLocation((current) => sameLocation(current, target) ? current : target);
  }, []);
  return { ...location, navigate };
}
