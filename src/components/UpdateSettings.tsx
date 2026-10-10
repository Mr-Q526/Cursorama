import { useState } from 'react';
import { ArrowSquareOutIcon, ArrowsClockwiseIcon, CheckCircleIcon, CaretDownIcon, DownloadSimpleIcon, InfoIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { UPDATE_CONFIG, type UpdateState, type UpdateStatus } from '../../shared';
import type { UpdateControls } from '../hooks';
import { t } from '../i18n';
import { Toggle } from './Controls';
import { ReleaseNotes } from './ReleaseNotes';

export interface UpdateSettingsProps { updates: UpdateControls; onInstall: () => Promise<void>; installing: boolean; }
export interface UpdateNoticeProps { state: UpdateState; onOpen: () => void; }

const STATUS_ICONS = {
  unsupported: InfoIcon, idle: ArrowsClockwiseIcon, checking: ArrowsClockwiseIcon,
  current: CheckCircleIcon, available: DownloadSimpleIcon, downloading: DownloadSimpleIcon,
  downloaded: CheckCircleIcon, installing: ArrowsClockwiseIcon, error: WarningCircleIcon,
} satisfies Record<UpdateStatus, typeof InfoIcon>;

export function UpdateSettings({ updates, onInstall, installing }: UpdateSettingsProps) {
  const copy = t.updates;
  const state = updates.state;
  const status = installing ? 'installing' : state.status;
  const StatusIcon = STATUS_ICONS[status];
  const downloading = state.status === 'downloading';
  const busy = state.status === 'checking' || downloading || state.status === 'installing' || installing;
  const progress = Number.isFinite(state.progress) ? Math.max(UPDATE_CONFIG.minimumProgress, Math.min(UPDATE_CONFIG.maximumProgress, state.progress)) : UPDATE_CONFIG.minimumProgress;
  const checkedAt = state.checkedAt && Number.isFinite(Date.parse(state.checkedAt)) ? state.checkedAt : null;
  const message = status === 'downloaded' ? copy.installHint : status === 'current' && !state.automatic ? copy.currentManual : copy.status[status];
  const failure = state.error ? copy.error[state.error] : updates.requestFailed ? copy.requestFailed : null;
  const checkButton = <button type="button" className="soft-button small" data-action="check-updates" disabled={!state.supported || busy || state.downloaded} onClick={() => void updates.check()}><ArrowsClockwiseIcon size={14} className={status === 'checking' ? 'spin' : ''} />{status === 'checking' ? copy.checking : copy.check}</button>;
  return <section className="settings-section update-settings" aria-labelledby="updates-heading">
    <h3 id="updates-heading" className="visually-hidden">{copy.title}</h3>
    <div className="update-version-row"><span className="update-current-version" aria-label={copy.version(state.currentVersion)}>{state.currentVersion}</span>
      {!downloading && !state.downloaded && status !== 'installing' && checkButton}
      <a className="update-release-link soft-button small" href={UPDATE_CONFIG.releasePage} target="_blank" rel="noreferrer" onClick={(event) => { if (window.desktop) { event.preventDefault(); void window.desktop.openUpdatePage().catch((error: unknown) => console.error('UPDATE_PAGE_FAILED', error)); } }}><ArrowSquareOutIcon size={13} />{t.about.releaseLog}</a>
    </div>
    <div className="update-card">
      <div className="update-status" role="status" aria-live="polite" data-update-status={status}>
        <div className="update-status-heading"><StatusIcon size={19} className={status === 'checking' || status === 'installing' ? 'spin' : ''} aria-hidden="true" /><h3>{copy.heading[status]}</h3>{state.latestVersion && <span className="update-version-badge" aria-label={copy.versionChange(state.currentVersion, state.latestVersion)}>{state.latestVersion}</span>}</div>
        {!failure && status !== 'available' && <p className="update-description">{message}</p>}
      </div>
      {failure && <p className="update-error" role="alert"><WarningCircleIcon size={16} aria-hidden="true" />{failure}</p>}
      {downloading && <div className="update-progress"><div><span>{copy.downloading}</span><strong>{copy.percent(progress)}</strong></div><progress max={UPDATE_CONFIG.maximumProgress} value={progress} aria-label={copy.download} /></div>}
      {!downloading && state.latestVersion && <div className="update-actions">
        {state.downloaded
          ? <button type="button" className="primary-button" data-action="install-update" disabled={busy} onClick={() => void onInstall()}><ArrowsClockwiseIcon size={16} className={installing ? 'spin' : ''} />{installing ? copy.installing : copy.install}</button>
          : <button type="button" className="primary-button" data-action="download-update" disabled={busy || !state.supported} onClick={() => void updates.download()}><DownloadSimpleIcon size={16} />{state.error === 'download' ? copy.retryDownload : copy.download}</button>}
      </div>}
    </div>
    <fieldset className="update-preference" disabled={!state.supported || installing || state.status === 'installing'}><Toggle label={copy.automatic} description={copy.automaticHint} checked={state.automatic} onChange={(enabled) => void updates.automatic(enabled)} /></fieldset>
    {state.latestVersion && state.releaseNotes.trim() && <details className="update-notes" key={state.latestVersion}><summary><span>{copy.releaseNotes}</span><CaretDownIcon size={15} aria-hidden="true" /></summary><ReleaseNotes source={state.releaseNotes} /></details>}
    {checkedAt && <div className="update-meta"><time dateTime={checkedAt}>{copy.checkedAt(checkedAt)}</time></div>}
  </section>;
}

export function UpdateNotice({ state, onOpen }: UpdateNoticeProps) {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  if (!state.latestVersion || state.latestVersion === dismissedVersion || (state.status !== 'available' && state.status !== 'downloaded')) return null;
  return <aside className="update-notice" role="status"><DownloadSimpleIcon size={20} /><div><strong>{state.downloaded ? t.updates.downloaded(state.latestVersion) : t.updates.available(state.latestVersion)}</strong><button type="button" className="text-button" onClick={onOpen}>{t.updates.view}</button></div><button type="button" className="icon-button" aria-label={t.updates.later} onClick={() => setDismissedVersion(state.latestVersion)}><XIcon size={15} /></button></aside>;
}
