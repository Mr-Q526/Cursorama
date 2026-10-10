import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { CheckIcon, FolderOpenIcon, InfoIcon, MoonIcon, PaletteIcon, QuestionIcon, SunIcon } from '@phosphor-icons/react';
import type { AppTheme, UpdateControls } from '../hooks';
import type { LibrarySnapshot, StorageSettings, StorageTarget } from '../../shared';
import { chooseLibraryDirectory, revealStorageDirectory } from '../library';
import { t } from '../i18n';
import { Modal } from './Controls';
import { AboutSettings } from './AboutSettings';

export interface SettingsDialogProps {
  theme: AppTheme;
  library: LibrarySnapshot | null;
  loading: boolean;
  error: boolean;
  onTheme: (theme: AppTheme) => void;
  onSave: (settings: StorageSettings) => Promise<void>;
  onClose: () => void;
  onRefresh: () => void;
  onGuide: () => void;
  updates: UpdateControls;
  onInstallUpdate: () => Promise<void>;
  installing: boolean;
  initialPage?: SettingsPage;
}

export type SettingsPage = 'appearance' | 'storage' | 'about';

const THEMES: readonly AppTheme[] = ['light', 'dark'];
const STORAGE_FIELDS = [{ key: 'projectDirectory', target: 'projects' }, { key: 'exportDirectory', target: 'exports' }] as const;
const SETTINGS_PAGES = [
  { id: 'appearance', icon: PaletteIcon },
  { id: 'storage', icon: FolderOpenIcon },
  { id: 'about', icon: InfoIcon },
] as const;
const TAB_DIRECTION: Readonly<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 };

function defaultDirectory(root: string, target: StorageTarget): string {
  const separator = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${separator}${target}`;
}

export function SettingsDialog({ theme, library, loading, error, onTheme, onSave, onClose, onRefresh, onGuide, updates, onInstallUpdate, installing, initialPage = 'appearance' }: SettingsDialogProps) {
  const copy = t.settings;
  const [page, setPage] = useState<SettingsPage>(initialPage);
  const navigation = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<StorageSettings>(() => library?.storage ?? { projectDirectory: '', exportDirectory: '' });
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const projectDirectory = library?.storage.projectDirectory;
  const exportDirectory = library?.storage.exportDirectory;
  useEffect(() => {
    if (projectDirectory && exportDirectory) setDraft({ projectDirectory, exportDirectory });
  }, [projectDirectory, exportDirectory]);
  const busy = saving || choosing || installing;
  const changed = Boolean(library && (draft.projectDirectory !== projectDirectory || draft.exportDirectory !== exportDirectory));
  const navigateWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const direction = TAB_DIRECTION[event.key];
    if (!direction && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const current = SETTINGS_PAGES.findIndex((item) => item.id === page);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? SETTINGS_PAGES.length - 1 : (current + direction + SETTINGS_PAGES.length) % SETTINGS_PAGES.length;
    const target = SETTINGS_PAGES[next].id;
    setPage(target);
    navigation.current?.querySelector<HTMLButtonElement>(`[data-settings-page="${target}"]`)?.focus();
  };
  const update = (key: keyof StorageSettings, value: string): void => { setDraft((current) => ({ ...current, [key]: value })); setMessage(''); setSaved(false); };
  const choose = async (key: keyof StorageSettings, target: StorageTarget): Promise<void> => {
    setChoosing(true); setMessage('');
    try { const selected = await chooseLibraryDirectory(target); if (selected) update(key, selected); }
    catch (failure) { console.error('STORAGE_CHOOSE_FAILED', failure); setMessage(copy.chooseFailed); }
    finally { setChoosing(false); }
  };
  const reveal = async (target: StorageTarget): Promise<void> => {
    try { await revealStorageDirectory(target); }
    catch (failure) { console.error('STORAGE_REVEAL_FAILED', failure); setMessage(t.library.folderFailed); }
  };
  const save = async (): Promise<void> => {
    setSaving(true); setMessage(''); setSaved(false);
    try { await onSave(draft); setSaved(true); }
    catch (failure) { console.error('STORAGE_SAVE_FAILED', failure); setMessage(copy.saveFailed); }
    finally { setSaving(false); }
  };
  return <Modal title={copy.title} onClose={onClose} wide closeDisabled={busy} className="settings-dialog">
    <div className="settings-layout">
      <div ref={navigation} className="settings-navigation" role="tablist" aria-label={copy.categories} aria-orientation="vertical">
        {SETTINGS_PAGES.map(({ id, icon: Glyph }) => <button type="button" key={id} role="tab" id={`settings-tab-${id}`} data-settings-page={id} aria-selected={page === id} aria-controls={`settings-panel-${id}`} tabIndex={page === id ? 0 : -1} onClick={() => setPage(id)} onKeyDown={navigateWithKeyboard} disabled={busy}>
          <Glyph size={18} /><span>{id === 'about' ? t.about.title : copy[id]}</span>{id === 'storage' && changed && <span className="settings-pending-dot" role="img" aria-label={copy.unsavedDirectories} />}
        </button>)}
      </div>
      <div className="settings-content">
        <div className="settings-page" role="tabpanel" id={`settings-panel-${page}`} aria-labelledby={`settings-tab-${page}`} tabIndex={0} key={page}>
          {page === 'appearance' && <section className="settings-section" aria-labelledby="appearance-heading">
            <div className="settings-section-heading"><h2 id="appearance-heading">{copy.appearance}</h2><p>{copy.appearanceHint}</p></div>
            <div className="theme-options" role="radiogroup" aria-label={t.appearance.theme}>{THEMES.map((option) => {
              const Glyph = option === 'light' ? SunIcon : MoonIcon;
              return <label key={option} className={`theme-option ${theme === option ? 'selected' : ''}`}>
                <input className="visually-hidden" type="radio" name="app-theme" aria-label={t.appearance[option]} checked={theme === option} onChange={() => onTheme(option)} />
                <span className={`theme-preview theme-preview-${option}`} aria-hidden="true"><span className="theme-preview-rail"><i /><i /><i /></span><span className="theme-preview-main"><i /><span><i /><i /></span></span></span>
                <span className="theme-option-label"><span><Glyph size={18} /><strong>{t.appearance[option]}</strong></span>{theme === option && <CheckIcon size={17} />}</span>
                <small>{option === 'light' ? copy.lightHint : copy.darkHint}</small>
              </label>;
            })}</div>
            <p className="settings-note">{copy.themeHint}</p>
          </section>}
          {page === 'storage' && <section className="settings-section" aria-labelledby="storage-heading">
            <div className="settings-section-heading"><h2 id="storage-heading">{copy.storage}</h2><p>{copy.storageHint}</p></div>
            {library ? <fieldset className="storage-fields" disabled={busy}>{STORAGE_FIELDS.map(({ key, target }) => <div className="storage-setting" key={key}>
              <div>
                <label htmlFor={`storage-${target}`}>{copy[key]}</label>
                <div className="storage-path"><FolderOpenIcon size={18} /><input id={`storage-${target}`} value={draft[key]} title={draft[key]} placeholder={copy.directoryPlaceholder} onChange={(event) => update(key, event.currentTarget.value)} spellCheck={false} /></div>
              </div>
              <div className="storage-actions">
                {window.desktop && <button type="button" className="soft-button" aria-label={`${copy.chooseDirectory} · ${copy[key]}`} onClick={() => void choose(key, target)}>{copy.chooseDirectory}</button>}
                <button type="button" className="icon-button" title={`${copy.openDirectory} · ${copy[key]}`} aria-label={`${copy.openDirectory} · ${copy[key]}`} onClick={() => void reveal(target)}><FolderOpenIcon size={19} /></button>
              </div>
            </div>)}</fieldset> : <div className="storage-unavailable"><p role="status">{error ? copy.locationFailed : copy.locationLoading}</p><button type="button" className="soft-button" disabled={loading} onClick={onRefresh}>{t.library.retry}</button></div>}
            <p className="settings-note">{copy.storageNote}</p>
            {library && <button type="button" className="text-button storage-reset" disabled={busy} onClick={() => { setDraft({ projectDirectory: defaultDirectory(library.root, 'projects'), exportDirectory: defaultDirectory(library.root, 'exports') }); setSaved(false); setMessage(''); }}>{copy.resetDirectories}</button>}
            {message && <p className="error-message" role="alert">{message}</p>}
            {saved && <p className="settings-saved" role="status"><CheckIcon size={15} />{copy.savedDirectories}</p>}
          </section>}
          {page === 'about' && <AboutSettings updates={updates} onInstall={onInstallUpdate} installing={installing} />}
        </div>
      </div>
    </div>
    <div className="settings-footer"><button type="button" className="text-button" onClick={onGuide} disabled={busy}><QuestionIcon size={17} />{t.editor.guide}</button><div className="settings-footer-actions">
      {page === 'storage' && library && <button type="button" className="primary-button" data-action="save-storage" disabled={busy || !changed || !draft.projectDirectory.trim() || !draft.exportDirectory.trim()} onClick={() => void save()}>{saving ? copy.savingDirectories : copy.saveDirectories}</button>}
      <button type="button" className="soft-button" onClick={onClose} disabled={busy}>{copy.close}</button>
    </div></div>
  </Modal>;
}
