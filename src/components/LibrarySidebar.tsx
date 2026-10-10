import { FileArrowUpIcon, FolderOpenIcon, GearSixIcon, MonitorPlayIcon, MusicNotesIcon, QuestionIcon, RecordIcon, SquaresFourIcon } from '@phosphor-icons/react';
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
  onAudio: () => void;
  audioOpen: boolean;
  audioAvailable: boolean;
}

export function LibrarySidebar({ page, disabled, settingsOpen, onNavigate, onSettings, onOpen, onImport, onDemo, onRecord, onAudio, audioOpen, audioAvailable }: LibrarySidebarProps) {
  const copy = t.navigation;
  return <aside className="library-sidebar" aria-label={copy.label}>
    <div className="library-actions">
      <button className="primary-button sidebar-record" type="button" title={t.editor.newRecording} aria-label={t.editor.newRecording} onClick={onRecord} disabled={disabled}><RecordIcon size={16} /><span>{t.editor.newRecording}</span></button>
      <div><button className="text-button" type="button" title={t.editor.openProject} aria-label={t.editor.openProject} onClick={onOpen} disabled={disabled}><FolderOpenIcon size={16} /><span>{t.editor.openProject}</span></button><button className="text-button" type="button" title={t.library.import} aria-label={t.library.import} onClick={onImport} disabled={disabled}><FileArrowUpIcon size={16} /><span>{t.library.import}</span></button></div>
    </div>
    <nav className="sidebar-navigation" aria-label={copy.label}>
      <button type="button" className="sidebar-link" data-page="workspace" title={copy.workspace} aria-label={copy.workspace} aria-current={page === 'workspace' ? 'page' : undefined} disabled={disabled} onClick={() => onNavigate('workspace')}><MonitorPlayIcon size={19} /><span>{copy.workspace}</span></button>
      <button type="button" className="sidebar-link" data-page="library" title={copy.library} aria-label={copy.library} aria-current={page === 'library' ? 'page' : undefined} disabled={disabled} onClick={() => onNavigate('library')}><SquaresFourIcon size={19} /><span>{copy.library}</span></button>
      <button type="button" className={`sidebar-link${audioOpen ? ' selected' : ''}`} data-action="open-audio" title={t.studio.panel.audio} aria-label={t.studio.panel.audio} aria-pressed={audioOpen} disabled={disabled || !audioAvailable} onClick={onAudio}><MusicNotesIcon size={19} /><span>{t.studio.panel.audio}</span></button>
    </nav>
    <div className="library-bottom"><button type="button" className={`sidebar-link settings-link ${settingsOpen ? 'selected' : ''}`} data-action="open-settings" title={copy.settings} aria-label={copy.settings} aria-haspopup="dialog" aria-expanded={settingsOpen} disabled={disabled} onClick={onSettings}><GearSixIcon size={18} /><span>{copy.settings}</span></button><button type="button" className="sidebar-help-button" data-action="open-demo" title={t.library.openDemo} aria-label={t.library.openDemo} onClick={onDemo} disabled={disabled}><QuestionIcon size={19} /></button></div>
  </aside>;
}
