import { ApertureIcon, ArrowLeftIcon, CaretRightIcon, DownloadSimpleIcon, MonitorPlayIcon, RecordIcon, SquaresFourIcon } from '@phosphor-icons/react';
import type { AppPage } from '../hooks';
import { t } from '../i18n';
import { WindowControls } from './WindowControls';

export interface AppHeaderProps {
  page: AppPage;
  projectName?: string;
  busy: boolean;
  canExport: boolean;
  onBack: () => void;
  onRecord: () => void;
  onExport: () => void;
}

export function AppHeader({ page, projectName, busy, canExport, onBack, onRecord, onExport }: AppHeaderProps) {
  const PageIcon = page === 'library' ? SquaresFourIcon : MonitorPlayIcon;
  return <header className="app-header">
    <div className="header-brand"><span className="brand-mark"><ApertureIcon size={20} weight="fill" /></span><strong>{t.editor.appName}</strong></div>
    <div className="header-context"><PageIcon size={16} /><span>{t.navigation[page]}</span>{page === 'workspace' && projectName && <><CaretRightIcon className="header-path-divider" size={12} /><span className="header-project" title={projectName}>{projectName}</span></>}</div>
    <div className="header-actions">
      {page !== 'workspace' && <button type="button" className="header-back icon-button" title={t.navigation.back} aria-label={t.navigation.back} onClick={onBack} disabled={busy}><ArrowLeftIcon size={16} /></button>}
      <button type="button" className="soft-button header-record" onClick={onRecord} disabled={busy}><RecordIcon size={15} />{t.editor.newRecording}</button>
      {page === 'workspace' && <button type="button" className="primary-button header-export" onClick={onExport} disabled={!canExport || busy}><DownloadSimpleIcon size={15} />{t.editor.exportVideo}</button>}
    </div>
    <WindowControls />
  </header>;
}
