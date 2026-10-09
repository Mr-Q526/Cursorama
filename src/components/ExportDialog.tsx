import { useEffect, useRef, useState } from 'react';
import { ArrowUpRightIcon, CheckCircleIcon, DownloadSimpleIcon, FolderOpenIcon, FilmStripIcon, SpeakerHighIcon } from '@phosphor-icons/react';
import type { ExportFormat, ExportFps, ExportOptions, ExportResolution, ExportResult, Project } from '../../shared';
import { RESOLUTIONS } from '../../shared';
import { canvasDimensions, preferredResolution, renderExport } from '../engine';
import type { ExportProgress } from '../engine';
import { formatFps, formatPercent, formatSeconds, t } from '../i18n';
import { Modal, Segmented } from './Controls';
import { hasLocalLibrary, revealLibrary } from '../library';

export interface ExportDialogProps { project: Project; onClose: () => void; ensureSaved: () => Promise<string | undefined>; onComplete: (result: ExportResult) => void; }

export function ExportDialog({ project, onClose, ensureSaved, onComplete }: ExportDialogProps) {
  const [options, setOptions] = useState<ExportOptions>({ resolution: preferredResolution(project.height), format: hasLocalLibrary ? 'mp4' : 'webm', fps: 30, quality: 'high' });
  const [status, setStatus] = useState<ExportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ExportResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const copy = t.export;
  const [width, height] = canvasDimensions(project.settings.aspect, RESOLUTIONS[options.resolution]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const start = async (): Promise<void> => {
    const abort = new AbortController(); abortRef.current = abort;
    setBusy(true); setError(''); setStatus({ progress: 0, phase: 'rendering' });
    try {
      const id = await ensureSaved();
      if (abort.signal.aborted) throw new DOMException(copy.cancelled, 'AbortError');
      const result = await renderExport(project, options, setStatus, abort.signal, id);
      if (result.cancelled) { setStatus(null); return; }
      setSaved(result); onComplete(result);
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError' && abort.signal.aborted) setStatus(null);
      else { console.error('EXPORT_FAILED', failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure)); setError(copy.failed); setStatus(null); }
    } finally { setBusy(false); }
  };
  const complete = status?.phase === 'complete';
  return <Modal title={complete ? copy.complete : copy.title} subtitle={complete ? undefined : copy.subtitle} onClose={onClose} closeDisabled={busy}>
    {complete ? <div className="export-success"><span className="success-art"><CheckCircleIcon size={54} weight="thin" /></span><h3>{project.name}</h3><p>{width} × {height}<span>·</span>{formatSeconds(project.trimEnd - project.trimStart)}</p>{saved?.path && <><p>{t.library.exportSaved}</p><small className="export-saved-path">{saved.path}</small><button className="soft-button" type="button" onClick={() => void revealLibrary(saved.projectId, saved.videoId).catch((failure: unknown) => { console.error('EXPORT_REVEAL_FAILED', failure); setError(t.library.folderFailed); })}><FolderOpenIcon size={18} />{copy.reveal}<ArrowUpRightIcon size={15} /></button></>}{error && <p className="error-message" role="alert">{error}</p>}<button className="primary-button" type="button" onClick={onClose}>{copy.close}</button></div> : <><div className="export-summary"><div className="summary-icon"><FilmStripIcon size={27} /></div><div><strong>{project.name}</strong><span>{formatSeconds(project.trimEnd - project.trimStart)}<span>·</span>{width} × {height}</span></div><SpeakerHighIcon size={18} /><small>{project.hasAudio ? copy.audio : copy.noAudio}</small></div>
      <div className="export-fields"><label className="select-control">{copy.resolution}<select value={options.resolution} disabled={busy} onChange={(event) => setOptions({ ...options, resolution: event.currentTarget.value as ExportResolution })}>{(Object.keys(RESOLUTIONS) as ExportResolution[]).map((resolution) => <option key={resolution}>{resolution}</option>)}</select></label><label className="select-control">{copy.fps}<select value={options.fps} disabled={busy} onChange={(event) => setOptions({ ...options, fps: Number(event.currentTarget.value) as ExportFps })}><option value={30}>{formatFps(30)}</option><option value={60}>{formatFps(60)}</option></select></label><label className="select-control export-format">{copy.format}<select value={options.format} disabled={busy} onChange={(event) => setOptions({ ...options, format: event.currentTarget.value as ExportFormat })}>{hasLocalLibrary && <option value="mp4">{copy.mp4}</option>}<option value="webm">{copy.webm}</option></select></label><div className={`quality-field ${busy ? 'disabled' : ''}`}><span>{copy.quality}</span><Segmented label={copy.quality} value={options.quality} onChange={(quality) => setOptions({ ...options, quality })} options={[{ value: 'standard', label: copy.standard }, { value: 'high', label: copy.high }]} /></div></div>
      {busy && status && <div className="export-progress"><div><span>{copy[status.phase]}</span><strong>{formatPercent(status.progress * 100)}</strong></div><progress max={1} value={status.progress} aria-label={copy[status.phase]} /><p>{copy.estimate}</p></div>}
      {!hasLocalLibrary && <p className="field-hint">{copy.browserNote}</p>}{error && <p className="error-message" role="alert">{error}</p>}<div className="modal-footer">{busy ? <button className="soft-button" type="button" disabled={status?.phase === 'encoding'} onClick={() => abortRef.current?.abort()}>{copy.cancel}</button> : <button className="primary-button full-width" type="button" onClick={() => void start()}><DownloadSimpleIcon size={18} />{copy.export}</button>}</div></>}
  </Modal>;
}
