import { useState } from 'react';
import { ArrowSquareOutIcon, ArrowsClockwiseIcon, DownloadSimpleIcon, XIcon } from '@phosphor-icons/react';
import { UPDATE_CONFIG, type UpdateState } from '../../shared';
import type { UpdateControls } from '../hooks';
import { t } from '../i18n';
import { Toggle } from './Controls';

export interface UpdateSettingsProps { updates: UpdateControls; onInstall: () => Promise<void>; installing: boolean; }
export interface UpdateNoticeProps { state: UpdateState; onOpen: () => void; }

export function UpdateSettings({ updates, onInstall, installing }: UpdateSettingsProps) {
  const copy = t.updates;
  const state = updates.state;
  const downloading = state.status === 'downloading';
  const busy = state.status === 'checking' || downloading || state.status === 'installing' || installing;
  const message = state.status === 'available' && state.latestVersion ? copy.available(state.latestVersion) : copy.status[state.status];
  return <section className="settings-section update-settings" aria-labelledby="updates-heading">
    <div className="settings-section-heading"><h2 id="updates-heading">{copy.title}</h2><p>{copy.description}</p></div>
    <div className="update-version-row"><span>{copy.currentVersion}<strong>{state.currentVersion}</strong></span><button type="button" className="soft-button" data-action="check-updates" disabled={!state.supported || busy || state.downloaded} onClick={() => void updates.check()}><ArrowsClockwiseIcon size={17} className={state.status === 'checking' ? 'spin' : ''} />{copy.check}</button></div>
    <fieldset className="update-preference" disabled={!state.supported || installing || state.status === 'installing'}><Toggle label={copy.automatic} description={copy.automaticHint} checked={state.automatic} onChange={(enabled) => void updates.automatic(enabled)} /></fieldset>
    <p className="update-status" role="status" data-update-status={state.status}>{installing ? copy.status.installing : message}</p>
    {state.latestVersion && <div className="update-offer"><strong>{state.downloaded ? copy.downloaded(state.latestVersion) : copy.available(state.latestVersion)}</strong>
      {state.releaseNotes && <details><summary>{copy.releaseNotes}</summary><p className="update-notes">{state.releaseNotes}</p></details>}
      {(downloading || state.downloaded) && <div className="update-progress"><progress max={UPDATE_CONFIG.maximumProgress} value={state.progress} aria-label={copy.download} /><span>{state.downloaded ? copy.completed : copy.progress(state.progress)}</span></div>}
      {state.downloaded ? <><p className="settings-note">{copy.installHint}</p><button type="button" className="primary-button" data-action="install-update" disabled={busy} onClick={() => void onInstall()}>{copy.install}</button></> : <button type="button" className="primary-button" data-action="download-update" disabled={busy} onClick={() => void updates.download()}><DownloadSimpleIcon size={17} />{state.error === 'download' ? copy.retryDownload : copy.download}</button>}
    </div>}
    {(state.error || updates.requestFailed) && <p className="error-message" role="alert">{state.error ? copy.error[state.error] : copy.requestFailed}</p>}
    <a className="update-release-link" href={UPDATE_CONFIG.releasePage} target="_blank" rel="noreferrer" onClick={(event) => { if (window.desktop) { event.preventDefault(); void window.desktop.openUpdatePage().catch((error: unknown) => console.error('UPDATE_PAGE_FAILED', error)); } }}><ArrowSquareOutIcon size={16} />{copy.releasePage}</a>
  </section>;
}

export function UpdateNotice({ state, onOpen }: UpdateNoticeProps) {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  if (!state.latestVersion || state.latestVersion === dismissedVersion || (state.status !== 'available' && state.status !== 'downloaded')) return null;
  return <aside className="update-notice" role="status"><DownloadSimpleIcon size={20} /><div><strong>{state.downloaded ? t.updates.downloaded(state.latestVersion) : t.updates.available(state.latestVersion)}</strong><button type="button" className="text-button" onClick={onOpen}>{t.updates.view}</button></div><button type="button" className="icon-button" aria-label={t.updates.later} onClick={() => setDismissedVersion(state.latestVersion)}><XIcon size={15} /></button></aside>;
}
