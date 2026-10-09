import { ApertureIcon, FileArrowUpIcon, FolderOpenIcon, GearSixIcon, MonitorPlayIcon, QuestionIcon, SquaresFourIcon } from '@phosphor-icons/react';
import type { AppPage } from '../hooks';
import { t } from '../i18n';

export interface LibrarySidebarProps {
  page: AppPage;
  disabled: boolean;
  onNavigate: (page: AppPage) => void;
  settingsOpen: boolean;
  onSettings: () => void;
  onOpen: () => void;
  onImport: () => void;
  onDemo: () => void;
}

export function LibrarySidebar({ page, disabled, settingsOpen, onNavigate, onSettings, onOpen, onImport, onDemo }: LibrarySidebarProps) {
  const copy = t.navigation;
  return <aside className="library-sidebar" aria-label={copy.label}>
    <div className="library-brand"><span className="brand-mark"><ApertureIcon size={27} weight="fill" /></span><div><strong>{t.editor.appName}</strong><span>{t.editor.tagline}</span></div></div>
    <div className="library-actions">
      <div><button className="text-button" type="button" onClick={onOpen} disabled={disabled}><FolderOpenIcon size={16} />{t.editor.openProject}</button><button className="text-button" type="button" onClick={onImport} disabled={disabled}><FileArrowUpIcon size={16} />{t.library.import}</button></div>
    </div>
    <nav className="sidebar-navigation" aria-label={copy.label}>
      <button type="button" className="sidebar-link" data-page="workspace" aria-current={page === 'workspace' ? 'page' : undefined} disabled={disabled} onClick={() => onNavigate('workspace')}><MonitorPlayIcon size={19} /><span>{copy.workspace}</span></button>
      <button type="button" className="sidebar-link" data-page="library" aria-current={page === 'library' ? 'page' : undefined} disabled={disabled} onClick={() => onNavigate('library')}><SquaresFourIcon size={19} /><span>{copy.library}</span></button>
    </nav>
    <div className="library-bottom"><button type="button" className={`sidebar-link settings-link ${settingsOpen ? 'selected' : ''}`} data-action="open-settings" aria-haspopup="dialog" aria-expanded={settingsOpen} disabled={disabled} onClick={onSettings}><GearSixIcon size={20} /><span>{copy.settings}</span></button><div className="sidebar-help"><button type="button" className="icon-button" data-action="open-demo" title={t.library.openDemo} aria-label={t.library.openDemo} onClick={onDemo} disabled={disabled}><QuestionIcon size={20} /></button></div></div>
  </aside>;
}
