import { ApertureIcon, ArrowLeftIcon, CaretRightIcon, FilmStripIcon, SquaresFourIcon } from '@phosphor-icons/react';
import type { AppPage } from '../hooks';
import { t } from '../i18n';
import { WindowControls } from './WindowControls';

export interface AppHeaderProps {
  page: AppPage;
  projectName?: string;
  busy: boolean;
  onLibrary: () => void;
}

export function AppHeader({ page, projectName, busy, onLibrary }: AppHeaderProps) {
  const PageIcon = page === 'library' ? SquaresFourIcon : page === 'preview' ? FilmStripIcon : ApertureIcon;
  const pageLabel = page === 'library' ? t.navigation.library : page === 'preview' ? t.navigation.preview : t.navigation.editor;
  return <header className="app-header">
    <div className="header-brand"><span className="brand-mark"><ApertureIcon size={20} weight="fill" /></span><strong>{t.editor.appName}</strong></div>
    <div className="header-context"><PageIcon size={16} /><span>{pageLabel}</span>{page !== 'library' && projectName && <><CaretRightIcon className="header-path-divider" size={12} /><span className="header-project" title={projectName}>{projectName}</span></>}</div>
    <div className="header-actions">{page !== 'library' && <button type="button" className="text-button header-back" title={t.navigation.back} aria-label={t.navigation.back} onClick={onLibrary} disabled={busy}><ArrowLeftIcon size={16} /><span>{t.navigation.back}</span></button>}</div>
    <WindowControls />
  </header>;
}
