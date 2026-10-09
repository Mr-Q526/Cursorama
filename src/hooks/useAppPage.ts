import { useCallback, useEffect, useState } from 'react';

export type AppPage = 'workspace' | 'library';

const PAGE_ROUTES: Record<AppPage, string> = {
  workspace: '#/workspace', library: '#/library',
};

function currentPage(): AppPage {
  return (Object.keys(PAGE_ROUTES) as AppPage[]).find((page) => PAGE_ROUTES[page] === window.location.hash) ?? 'workspace';
}

export function useAppPage() {
  const [page, setPage] = useState<AppPage>(currentPage);
  useEffect(() => {
    const sync = (): void => setPage(currentPage());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  const navigate = useCallback((next: AppPage): void => {
    if (window.location.hash !== PAGE_ROUTES[next]) window.history.pushState(null, '', PAGE_ROUTES[next]);
    setPage(next);
  }, []);
  return { page, navigate };
}
