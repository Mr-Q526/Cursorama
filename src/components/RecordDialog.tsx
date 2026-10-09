import { useEffect, useRef, useState } from 'react';
import { ArrowClockwiseIcon, CheckCircleIcon, MicrophoneIcon, MonitorIcon, RecordIcon, SpeakerHighIcon, SquaresFourIcon } from '@phosphor-icons/react';
import type { CaptureSource, ExportFps } from '../../shared';
import { CAPTURE_TIMING } from '../../shared';
import { prepareRecording } from '../engine';
import type { PreparedRecording } from '../engine';
import { formatFps, formatSeconds, t } from '../i18n';
import { IconButton, Modal, Segmented, Toggle } from './Controls';

export interface RecordDialogProps { onClose: () => void; onStart: (prepared: PreparedRecording, countdownSeconds: number) => Promise<void>; }

export function RecordDialog({ onClose, onStart }: RecordDialogProps) {
  const [kind, setKind] = useState<'screen' | 'window'>('screen');
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [microphone, setMicrophone] = useState(false);
  const [systemAudio, setSystemAudio] = useState(false);
  const [fps, setFps] = useState<ExportFps>(30);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(CAPTURE_TIMING.defaultCountdown);
  const [prepared, setPrepared] = useState<PreparedRecording | null>(null);
  const preparedRef = useRef<PreparedRecording | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const copy = t.recording;

  const refresh = async (): Promise<void> => {
    setLoading(true); setError('');
    try {
      const results = await window.desktop?.listSources() ?? [];
      setSources(results); setSelected((current) => results.some((source) => source.id === current) ? current : '');
    } catch (failure) { console.error('SOURCES_FAILED', failure); setError(copy.sourcesError); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void refresh();
    return () => { void preparedRef.current?.cancel().catch((failure: unknown) => console.error('CAPTURE_CANCEL_FAILED', failure)); };
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!prepared || !video) return;
    video.srcObject = prepared.stream;
    void video.play().catch((failure: unknown) => console.error('CAPTURE_PREVIEW_FAILED', failure));
    const ended = (): void => {
      if (preparedRef.current !== prepared) return;
      preparedRef.current = null; setPrepared(null); setError(copy.sourceEnded);
    };
    prepared.sourceEnded.addEventListener('abort', ended, { once: true });
    if (prepared.sourceEnded.aborted) ended();
    return () => { video.srcObject = null; prepared.sourceEnded.removeEventListener('abort', ended); };
  }, [prepared, copy.sourceEnded]);

  const clearPreparation = async (): Promise<void> => {
    const current = preparedRef.current;
    preparedRef.current = null; setPrepared(null);
    await current?.cancel();
  };
  const prepare = async (): Promise<void> => {
    setBusy(true); setError('');
    try {
      const next = await prepareRecording({ sourceId: selected, microphone, systemAudio, fps });
      preparedRef.current = next; setPrepared(next);
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'NotAllowedError')) console.error('CAPTURE_PREPARE_FAILED', failure);
      setError(t.editor.recordingFailed);
    } finally { setBusy(false); }
  };
  const start = async (): Promise<void> => {
    if (!prepared) return;
    setBusy(true); setError('');
    try { await onStart(prepared, countdownSeconds); }
    catch (failure) {
      await clearPreparation();
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) { console.error('RECORDING_FAILED', failure); setError(t.editor.recordingFailed); }
    } finally { setBusy(false); }
  };
  const filtered = sources.filter((source) => source.kind === kind);
  return <Modal title={prepared ? copy.ready : copy.title} subtitle={prepared ? copy.readyHint : copy.subtitle} onClose={onClose} wide closeDisabled={busy}>
    {prepared ? <div className="capture-ready"><video ref={videoRef} aria-label={copy.sourcePreview} muted autoPlay playsInline /><div className="capture-source-details"><CheckCircleIcon size={20} /><div><strong>{sources.find((source) => source.id === selected)?.name ?? prepared.source.label}</strong><span>{copy.originalResolution} · {prepared.source.width} × {prepared.source.height} · {formatFps(Math.round(prepared.source.fps))}</span></div><button className="text-button" type="button" disabled={busy} onClick={() => { void clearPreparation(); setError(''); }}>{copy.changeSource}</button></div></div> : <>{window.desktop && <div className="record-sources-toolbar"><Segmented label={copy.browser} value={kind} onChange={(value) => { setKind(value); setSelected(''); }} options={[{ value: 'screen', label: copy.screen, icon: MonitorIcon }, { value: 'window', label: copy.window, icon: SquaresFourIcon }]} /><IconButton icon={ArrowClockwiseIcon} label={copy.refresh} onClick={() => void refresh()} disabled={loading || busy} /></div>}
      {window.desktop ? <div className="source-grid">{loading ? <p className="empty-state">{copy.loading}</p> : filtered.length === 0 ? <p className="empty-state">{copy.noSources}</p> : filtered.map((source, index) => <button type="button" key={source.id} disabled={busy} className={`source-option ${source.id === selected ? 'selected' : ''}`} onClick={() => setSelected(source.id)}><img src={source.thumbnail} alt={source.name} /><span>{source.kind === 'screen' ? `${copy.screenName} ${index + 1}` : source.name}</span>{selected === source.id && <span className="selection-dot" />}</button>)}</div> : <div className="browser-source"><MonitorIcon size={40} weight="thin" /><p>{copy.browserNote}</p></div>}</>}
    <fieldset className="capture-device-options" disabled={busy || Boolean(prepared)}><div className="record-options"><div><MicrophoneIcon size={20} /><Toggle label={copy.microphone} description={copy.microphoneHint} checked={microphone} onChange={setMicrophone} /></div><div><SpeakerHighIcon size={20} /><Toggle label={copy.systemAudio} description={copy.systemAudioHint} checked={systemAudio} onChange={setSystemAudio} /></div></div><label className="select-inline capture-fps">{copy.fps}<select value={fps} onChange={(event) => setFps(Number(event.currentTarget.value) as ExportFps)}><option value={30}>{formatFps(30)}</option><option value={60}>{formatFps(60)}</option></select></label></fieldset>
    <div className="record-bottom"><label className="select-inline">{copy.countdownSetting}<select value={countdownSeconds} disabled={busy} onChange={(event) => setCountdownSeconds(Number(event.currentTarget.value))}>{CAPTURE_TIMING.choices.map((seconds) => <option key={seconds} value={seconds}>{seconds === 0 ? copy.countdownOff : formatSeconds(seconds)}</option>)}</select></label><div className="record-actions">{!prepared && <button className="soft-button" type="button" disabled={busy || Boolean(window.desktop && !selected)} onClick={() => void prepare()}><MonitorIcon size={17} />{busy ? copy.preparing : window.desktop ? copy.confirmSource : copy.chooseSource}</button>}<button className="primary-button" type="button" disabled={busy || !prepared} onClick={() => void start()}><RecordIcon size={18} weight="fill" />{copy.start}</button></div></div><p className="field-hint">{copy.countdownHint}</p>{error && <p className="error-message" role="alert">{error}</p>}
  </Modal>;
}
