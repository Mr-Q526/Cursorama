import { ApertureIcon, ArrowLeftIcon, CaretRightIcon, MonitorPlayIcon, SquaresFourIcon } from '@phosphor-icons/react';
import type { AppPage } from '../hooks';
import { t } from '../i18n';
import { WindowControls } from './WindowControls';

export interface AppHeaderProps {
  page: AppPage;
  projectName?: string;
  busy: boolean;
  onBack: () => void;
}

export function AppHeader({ page, projectName, busy, onBack }: AppHeaderProps) {
  const PageIcon = page === 'library' ? SquaresFourIcon : MonitorPlayIcon;
  return <header className="app-header">
    <div className="header-brand"><span className="brand-mark"><ApertureIcon size={20} weight="fill" /></span><strong>{t.editor.appName}</strong></div>
    <div className="header-context"><PageIcon size={16} /><span>{t.navigation[page]}</span>{page === 'workspace' && projectName && <><CaretRightIcon className="header-path-divider" size={12} /><span className="header-project" title={projectName}>{projectName}</span></>}</div>
    <div className="header-actions">
      {page !== 'workspace' && <button type="button" className="header-back icon-button" title={t.navigation.back} aria-label={t.navigation.back} onClick={onBack} disabled={busy}><ArrowLeftIcon size={16} /></button>}
    </div>
    <WindowControls />
  </header>;
}
