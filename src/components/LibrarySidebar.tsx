import { FileArrowUpIcon, FolderOpenIcon, GearSixIcon, MonitorPlayIcon, QuestionIcon, RecordIcon, SquaresFourIcon } from '@phosphor-icons/react';
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
  onRecord: () => void;
}

export function LibrarySidebar({ page, disabled, settingsOpen, onNavigate, onSettings, onOpen, onImport, onDemo, onRecord }: LibrarySidebarProps) {
  const copy = t.navigation;
  return <aside className="library-sidebar" aria-label={copy.label}>
    <div className="library-actions">
      <button className="primary-button sidebar-record" type="button" onClick={onRecord} disabled={disabled}><RecordIcon size={16} />{t.editor.newRecording}</button>
      <div><button className="text-button" type="button" onClick={onOpen} disabled={disabled}><FolderOpenIcon size={16} />{t.editor.openProject}</button><button className="text-button" type="button" onClick={onImport} disabled={disabled}><FileArrowUpIcon size={16} />{t.library.import}</button></div>
    </div>
    <nav className="sidebar-navigation" aria-label={copy.label}>
      <button type="button" className="sidebar-link" data-page="workspace" aria-current={page === 'workspace' ? 'page' : undefined} disabled={disabled} onClick={() => onNavigate('workspace')}><MonitorPlayIcon size={19} /><span>{copy.workspace}</span></button>
      <button type="button" className="sidebar-link" data-page="library" aria-current={page === 'library' ? 'page' : undefined} disabled={disabled} onClick={() => onNavigate('library')}><SquaresFourIcon size={19} /><span>{copy.library}</span></button>
    </nav>
    <div className="library-bottom"><button type="button" className={`sidebar-link settings-link ${settingsOpen ? 'selected' : ''}`} data-action="open-settings" aria-haspopup="dialog" aria-expanded={settingsOpen} disabled={disabled} onClick={onSettings}><GearSixIcon size={18} /><span>{copy.settings}</span></button><button type="button" className="sidebar-help-button" data-action="open-demo" title={t.library.openDemo} aria-label={t.library.openDemo} onClick={onDemo} disabled={disabled}><QuestionIcon size={19} /></button></div>
  </aside>;
}
