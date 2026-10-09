import { useEffect, useState } from 'react';

export type AppTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'cursorama:theme';

export function useTheme() {
  const [theme, setTheme] = useState<AppTheme>(() => {
    try { return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'; }
    catch (error) { console.warn('THEME_READ_FAILED', error); return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); }
    catch (error) { console.warn('THEME_SAVE_FAILED', error); }
  }, [theme]);
  return { theme, setTheme };
}
