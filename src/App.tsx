import { useCallback, useEffect, useRef, useState } from 'react';
import { ApertureIcon, ArrowLeftIcon, CheckIcon, CircleIcon, DownloadSimpleIcon, FloppyDiskIcon, MonitorPlayIcon, RecordIcon, SparkleIcon, XIcon } from '@phosphor-icons/react';
import type { ChangeEvent } from 'react';
import type { EditorTab, EffectMode, ExportResult, LibraryProject, LibrarySnapshot, LibraryVideo, MotionClip, Project, ProjectData, RecordingCommand, StorageSettings, StoredProject, VisualSettings } from '../shared';
import { AUTOSAVE_DELAY, DEFAULT_SETTINGS, PRESETS, PROJECT_EXTENSION, projectBytes, readProjectBytes, TIME } from '../shared';
import { createDemoProject, downloadBlob, generateClips, loadVideo, startRecording } from './engine';
import type { PreparedRecording, RecordingSession } from './engine';
import { useAppPage, usePlayback, useTheme, useUpdates, type PrompterDraft } from './hooks';
import { EmptyWorkspace, ExportDialog, ExportPreview, IconButton, Inspector, LibraryPage, LibrarySidebar, Modal, Preview, RecordDialog, RecordingDock, SettingsDialog, Teleprompter, Timeline, UpdateNotice, WindowControls } from './components';
import { configureLibrary, hasLocalLibrary, listLibrary, openLibraryProject, openLibraryVideo, revealLibrary, saveLibraryProject } from './library';
import type { LibraryVideoSource } from './library';
import { formatTime, t } from './i18n';

export type AppDialog = 'record' | 'export' | 'guide' | 'settings' | null;
interface VideoSelection { projectId: string; video: LibraryVideo; source: LibraryVideoSource; }
interface PendingSave { project: Project; promise: Promise<ExportResult>; }

function dataFromProject(project: Project): ProjectData {
  return {
    schemaVersion: 1, name: project.name, duration: project.duration, width: project.width, height: project.height,
    samples: project.samples, clips: project.clips, settings: project.settings, trimStart: project.trimStart,
    trimEnd: project.trimEnd, sourceType: project.sourceType, hasAudio: project.hasAudio, cursorEmbedded: project.cursorEmbedded,
  };
}

function restoredProject(value: StoredProject): Project {
  const blob = value.bytes ? new Blob([value.bytes], { type: 'video/webm' }) : undefined;
  return { ...value.data, videoBlob: blob, videoUrl: blob ? URL.createObjectURL(blob) : undefined };
}

export function App() {
  const updates = useUpdates();
  const [preparingUpdate, setPreparingUpdate] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videoSelection, setVideoSelection] = useState<VideoSelection | null>(null);
  const [tab, setTab] = useState<EditorTab>('motion');
  const [selectedId, setSelectedId] = useState<string>();
  const [original, setOriginal] = useState(false);
  const [dialog, setDialog] = useState<AppDialog>(() => window.location.hash === '#/settings' ? 'settings' : null);
  const [toast, setToast] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [prompter, setPrompter] = useState<PrompterDraft>({ script: '', enabled: false });
  const [processing, setProcessing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const recordingRef = useRef<RecordingSession | null>(null);
  const countdownAbort = useRef<AbortController | null>(null);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);
  const recordingCommandRef = useRef<(command: RecordingCommand) => void>(() => undefined);
  const videoInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const previousUrl = useRef<string | undefined>(undefined);
  const currentRef = useRef({ project, projectId, key: 0 });
  const pendingSave = useRef<PendingSave | null>(null);
  currentRef.current.project = project;
  currentRef.current.projectId = projectId;
  const playback = usePlayback(project);
  const { theme, setTheme } = useTheme();
  const { page, navigate } = useAppPage();
  const copy = t.editor;
  const busy = recording || processing || loading || saving || storageBusy || countdown !== null || preparingUpdate || updates.state.status === 'installing';
  const notify = useCallback((message: string) => setToast(message), []);

  const refreshLibrary = useCallback(async (): Promise<void> => {
    if (!hasLocalLibrary) { setLibraryError(true); return; }
    setLibraryLoading(true);
    try { setLibrary(await listLibrary()); setLibraryError(false); }
    catch (error) { console.error('LIBRARY_LOAD_FAILED', error); setLibraryError(true); }
    finally { setLibraryLoading(false); }
  }, []);

  const persist = useCallback(async function persistProject(next: Project, id?: string): Promise<ExportResult> {
    const active = pendingSave.current;
    if (active) {
      const result = await active.promise;
      if (active.project === next) return result;
      return persistProject(next, currentRef.current.projectId ?? id);
    }
    const key = currentRef.current.key;
    setSaving(true);
    const promise = (async (): Promise<ExportResult> => {
      const result = await saveLibraryProject(dataFromProject(next), await next.videoBlob?.arrayBuffer(), id);
      if (!result.projectId || result.cancelled) throw new Error('PROJECT_SAVE_INCOMPLETE');
      if (currentRef.current.key === key) {
        currentRef.current.projectId = result.projectId;
        setProjectId(result.projectId);
        if (currentRef.current.project === next) setDirty(false);
      }
      await refreshLibrary();
      return result;
    })();
    pendingSave.current = { project: next, promise };
    try { return await promise; }
    finally { pendingSave.current = null; setSaving(false); }
  }, [refreshLibrary]);

  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);
  useEffect(() => {
    if (page !== 'workspace') { playback.pause(); void refreshLibrary(); }
  }, [page, playback.pause, refreshLibrary]);
  useEffect(() => {
    if (!project || !dirty || !hasLocalLibrary || (project.sourceType === 'demo' && !projectId) || recording || processing || loading || storageBusy || countdown !== null) return;
    const timeout = setTimeout(() => {
      void persist(project, projectId).catch((error: unknown) => { console.error('AUTOSAVE_FAILED', error); notify(t.library.saveFailed); });
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(timeout);
  }, [project, projectId, dirty, recording, processing, loading, storageBusy, countdown, persist, notify]);
  useEffect(() => {
    const focus = (): void => { if (!recording && !processing && !loading) void refreshLibrary(); };
    window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus);
  }, [recording, processing, loading, refreshLibrary]);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), TIME.milliseconds * 5); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => {
    if (previousUrl.current && previousUrl.current !== project?.videoUrl) URL.revokeObjectURL(previousUrl.current);
    previousUrl.current = project?.videoUrl;
  }, [project?.videoUrl]);
  useEffect(() => () => { if (previousUrl.current) URL.revokeObjectURL(previousUrl.current); }, []);
  useEffect(() => () => { if (videoSelection?.source.revoke) URL.revokeObjectURL(videoSelection.source.url); }, [videoSelection]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      const element = event.target;
      if (page !== 'workspace' || !project || videoSelection || (element instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName)) || dialog || busy) return;
      if (event.code === 'Space') { event.preventDefault(); void playback.toggle(); }
      if (event.code === 'ArrowLeft') { event.preventDefault(); playback.seek(playback.timeRef.current - 1); }
      if (event.code === 'ArrowRight') { event.preventDefault(); playback.seek(playback.timeRef.current + 1); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [page, project, videoSelection, dialog, busy, playback.toggle, playback.seek, playback.timeRef]);
  useEffect(() => window.desktop?.onStopRecording(() => void stopRef.current()), []);
  useEffect(() => window.desktop?.onRecordingCommand((command) => recordingCommandRef.current(command)), []);
  useEffect(() => {
    document.documentElement.dataset.recording = String(recording);
    return () => { delete document.documentElement.dataset.recording; };
  }, [recording]);
  useEffect(() => {
    const cancelCountdown = (event: KeyboardEvent): void => { if (event.key === 'Escape') countdownAbort.current?.abort(); };
    window.addEventListener('keydown', cancelCountdown);
    return () => { window.removeEventListener('keydown', cancelCountdown); countdownAbort.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => { if (recordingRef.current) { setRecordingElapsed(recordingRef.current.elapsed); setRecordingPaused(recordingRef.current.paused); } }, TIME.uiInterval);
    return () => clearInterval(interval);
  }, [recording]);

  const updateProject = (update: (current: Project) => Project): void => { setProject((current) => current ? update(current) : null); setDirty(true); };
  const settingsChanged = (settings: Partial<VisualSettings>): void => updateProject((current) => ({ ...current, settings: { ...current.settings, ...settings }, clips: settings.zoom === undefined ? current.clips : current.clips.map((clip) => ({ ...clip, zoom: settings.zoom ?? clip.zoom })) }));
  const presetChanged = (mode: EffectMode): void => updateProject((current) => ({ ...current, settings: { ...current.settings, mode, ...PRESETS[mode] }, clips: current.clips.map((clip) => ({ ...clip, mode, zoom: PRESETS[mode].zoom })) }));
  const clipChanged = (id: string, patch: Partial<MotionClip>): void => updateProject((current) => ({ ...current, clips: current.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip).sort((first, second) => first.start - second.start) }));
  const addShot = (x = 0.5, y = 0.5): void => {
    if (!project) return;
    playback.pause();
    const start = Math.max(0, Math.min(playback.timeRef.current, project.duration - 0.25));
    const id = crypto.randomUUID();
    const clip: MotionClip = { id, start, end: Math.min(project.duration, start + 3), x, y, zoom: project.settings.zoom, mode: project.settings.mode, enabled: true, manual: true };
    updateProject((current) => ({ ...current, clips: [...current.clips, clip].sort((first, second) => first.start - second.start) }));
    setSelectedId(id); setTab('motion'); playback.seek(start + Math.min(0.7, (clip.end - start) / 2));
  };
  const replaceProject = (next: Project | null, id?: string, saved = false): void => {
    playback.pause(); currentRef.current = { project: next, projectId: id, key: currentRef.current.key + 1 };
    setProject(next); setProjectId(id); setSelectedId(undefined); setOriginal(false); setDirty(Boolean(next) && !saved); setVideoSelection(null);
    navigate('workspace');
  };
  const flushCurrent = async (): Promise<void> => {
    if (project && dirty && hasLocalLibrary && (project.sourceType === 'video' || projectId)) await persist(project, projectId);
  };
  const configureStorage = async (settings: StorageSettings): Promise<void> => {
    setStorageBusy(true);
    try {
      await pendingSave.current?.promise;
      await flushCurrent();
      setLibrary(await configureLibrary(settings));
      setLibraryError(false);
    } finally { setStorageBusy(false); }
  };
  const changeWorkspace = async (next: Project | null): Promise<void> => {
    try { await flushCurrent(); replaceProject(next); }
    catch (error) { console.error('WORKSPACE_SAVE_FAILED', error); notify(t.library.saveFailed); }
  };

  const importVideo = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file) return;
    setLoading(true);
    let url: string | undefined;
    try {
      await flushCurrent(); url = URL.createObjectURL(file);
      const video = await loadVideo(url);
      let duration = video.duration;
      if (!Number.isFinite(duration)) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('VIDEO_DURATION_FAILED')), TIME.seekTimeout);
          video.addEventListener('durationchange', () => { if (Number.isFinite(video.duration)) { clearTimeout(timeout); resolve(); } });
          video.addEventListener('seeked', () => { if (Number.isFinite(video.duration)) { clearTimeout(timeout); resolve(); } }, { once: true });
          video.currentTime = Number.MAX_SAFE_INTEGER;
        });
        duration = video.duration;
      }
      if (!Number.isFinite(duration) || duration < 0.2) throw new Error('VIDEO_DURATION_FAILED');
      const audioVideo = video as HTMLVideoElement & { audioTracks?: { length: number }; mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number };
      const hasAudio = audioVideo.mozHasAudio === true || (audioVideo.audioTracks?.length ?? 0) > 0 || (audioVideo.webkitAudioDecodedByteCount ?? 0) > 0 || file.type !== 'image/gif';
      const next: Project = { schemaVersion: 1, name: file.name.replace(/\.[^.]+$/, ''), duration, width: video.videoWidth, height: video.videoHeight, samples: [], clips: [], settings: { ...DEFAULT_SETTINGS, cursor: 'none' }, trimStart: 0, trimEnd: duration, sourceType: 'video', videoBlob: file, videoUrl: url, hasAudio, cursorEmbedded: true };
      video.pause(); video.removeAttribute('src'); video.load(); replaceProject(next); url = undefined;
      if (hasLocalLibrary) await persist(next);
      notify(copy.imported);
    } catch (error) { if (url) URL.revokeObjectURL(url); console.error('IMPORT_FAILED', error); notify(currentRef.current.project?.videoBlob === file ? t.library.saveFailed : copy.importFailed); }
    finally { setLoading(false); }
  };
  const save = async (): Promise<void> => {
    if (!project) return;
    try {
      if (hasLocalLibrary) await persist(project, projectId);
      else { downloadBlob(new Blob([projectBytes(dataFromProject(project), await project.videoBlob?.arrayBuffer()).buffer as ArrayBuffer]), `${project.name}.${PROJECT_EXTENSION}`); setDirty(false); }
      notify(hasLocalLibrary ? t.library.saved : copy.webProject);
    } catch (error) { console.error('SAVE_FAILED', error); notify(t.library.saveFailed); }
  };
  const loadExternal = async (value: StoredProject): Promise<void> => {
    await flushCurrent();
    const next = restoredProject(value); replaceProject(next);
    if (hasLocalLibrary) await persist(next);
    notify(copy.projectOpened);
  };
  const open = async (): Promise<void> => {
    if (!window.desktop) { projectInput.current?.click(); return; }
    setLoading(true);
    try { const value = await window.desktop.openProject(); if (value) await loadExternal(value); }
    catch (error) { console.error('PROJECT_OPEN_FAILED', error); notify(copy.projectFailed); }
    finally { setLoading(false); }
  };
  const importProject = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file) return;
    setLoading(true);
    try { await loadExternal(readProjectBytes(new Uint8Array(await file.arrayBuffer()))); }
    catch (error) { console.error('PROJECT_OPEN_FAILED', error); notify(copy.projectFailed); }
    finally { setLoading(false); }
  };
  const openStored = async (item: LibraryProject, video?: LibraryVideo): Promise<void> => {
    setLoading(true); playback.pause();
    try {
      await flushCurrent();
      const source = video ? await openLibraryVideo(item.id, video.id, video.format) : undefined;
      try {
        if (item.id !== currentRef.current.projectId) replaceProject(restoredProject(await openLibraryProject(item.id)), item.id, true);
        setVideoSelection(source && video ? { projectId: item.id, video, source } : null);
        navigate('workspace');
      } catch (error) { if (source?.revoke) URL.revokeObjectURL(source.url); throw error; }
    } catch (error) { console.error('LIBRARY_OPEN_FAILED', error); notify(video ? t.library.videoFailed : t.library.projectFailed); await refreshLibrary(); }
    finally { setLoading(false); }
  };
  const reveal = async (id?: string, videoId?: string): Promise<void> => {
    try { await revealLibrary(id, videoId); }
    catch (error) { console.error('LIBRARY_REVEAL_FAILED', error); notify(t.library.folderFailed); }
  };
  const ensureSaved = async (): Promise<string | undefined> => {
    if (!project || !hasLocalLibrary) return undefined;
    return (await persist(project, projectId)).projectId;
  };
  const stopRecording = async (): Promise<void> => {
    const active = recordingRef.current; if (!active) return;
    recordingRef.current = null; setProcessing(true); setRecording(false); setRecordingPaused(false);
    try {
      const next = await active.stop(); replaceProject(next);
      if (hasLocalLibrary) {
        try { await persist(next); }
        catch (error) { console.error('RECORDING_SAVE_FAILED', error); notify(t.library.saveFailed); }
      }
    } catch (error) { console.error('RECORDING_STOP_FAILED', error); notify(copy.recordingFailed); }
    finally { setProcessing(false); }
  };
  stopRef.current = stopRecording;
  const recordingCommand = (command: RecordingCommand): void => {
    const active = recordingRef.current;
    if (!active) return;
    if (command === 'stop') { void stopRef.current(); return; }
    try { if (command === 'pause') active.pause(); else active.resume(); setRecordingPaused(active.paused); setRecordingElapsed(active.elapsed); }
    catch (error) { console.error('RECORDING_COMMAND_FAILED', error); notify(t.recorderControls.failed); }
  };
  recordingCommandRef.current = recordingCommand;
  const beginRecording = async (prepared: PreparedRecording, seconds: number, draft: PrompterDraft): Promise<void> => {
    playback.pause(); await flushCurrent();
    await window.desktop?.configurePrompter(draft.script, draft.enabled);
    setPrompter(draft);
    const abort = new AbortController(); countdownAbort.current = abort;
    try {
      const active = await startRecording(prepared, seconds, setCountdown, () => void stopRef.current(), abort.signal);
      recordingRef.current = active; setRecordingElapsed(0); setRecordingPaused(false); setRecording(true); setDialog(null);
    } finally { countdownAbort.current = null; setCountdown(null); }
  };
  const record = (): void => { playback.pause(); navigate('workspace'); setVideoSelection(null); setDialog('record'); };
  const installUpdate = async (): Promise<void> => {
    if (busy) return;
    setPreparingUpdate(true); playback.pause();
    try { await ensureSaved(); await updates.install(); }
    catch (error) { console.error('UPDATE_PROJECT_SAVE_FAILED', error); notify(t.library.saveFailed); }
    finally { setPreparingUpdate(false); }
  };

  return <div className={`app-shell${window.desktop ? ' desktop-window' : ''}`}>
    <LibrarySidebar page={page} disabled={busy} settingsOpen={dialog === 'settings'} onNavigate={navigate} onSettings={() => { playback.pause(); setDialog('settings'); void refreshLibrary(); }} onOpen={() => void open()} onImport={() => videoInput.current?.click()} onDemo={() => void changeWorkspace(createDemoProject())} />
    <header className="app-header"><div className="brand-text"><strong>{page === 'workspace' ? copy.studio : t.navigation[page]}</strong></div><div className="header-actions">{page !== 'workspace' && <button type="button" className="text-button" onClick={() => navigate('workspace')} disabled={busy}><ArrowLeftIcon size={16} />{t.navigation.back}</button>}<button type="button" className="soft-button" onClick={record} disabled={busy}><RecordIcon size={17} weight="fill" />{copy.newRecording}</button>{page === 'workspace' && <button type="button" className="primary-button" onClick={() => { playback.pause(); setDialog('export'); }} disabled={!project || Boolean(videoSelection) || busy}><DownloadSimpleIcon size={17} />{copy.exportVideo}</button>}</div><WindowControls /></header>
    <div className="app-main" data-page={page}>
      {page === 'library' ? <LibraryPage library={library} error={libraryError} loading={libraryLoading} disabled={busy} projectId={videoSelection?.projectId ?? projectId} videoId={videoSelection?.video.id} onProject={(item) => void openStored(item)} onVideo={(item, video) => void openStored(item, video)} onRefresh={() => void refreshLibrary()} onRecord={record} onImport={() => videoInput.current?.click()} /> : videoSelection ? <ExportPreview video={videoSelection.video} url={videoSelection.source.url} onBack={() => setVideoSelection(null)} onReveal={() => void reveal(videoSelection.projectId, videoSelection.video.id)} onError={() => notify(t.library.videoFailed)} /> : project ? <>
        <div className="project-bar" data-project-id={projectId}><div className="project-title"><span className="project-icon"><MonitorPlayIcon size={20} /></span><div><input aria-label={t.appearance.projectName} className="project-name" value={project.name} maxLength={120} onChange={(event) => { const name = event.currentTarget.value; updateProject((current) => ({ ...current, name })); }} /><div className="project-details"><span>{formatTime(project.duration)}</span><span>·</span><span>{project.width} × {project.height}</span><span>·</span><span>{project.sourceType === 'demo' ? copy.demoBadge : t.library.autoSave}</span></div></div></div><div className="project-tools"><span className="save-status">{dirty || saving ? <CircleIcon size={7} weight="fill" /> : <CheckIcon size={13} />}{saving ? t.library.saving : dirty ? copy.unsaved : t.library.saved}</span>{project.sourceType === 'demo' && <button type="button" className="text-button" data-action="close-demo" disabled={busy} onClick={() => void changeWorkspace(null)}>{t.library.closeDemo}</button>}<button className="text-button" type="button" onClick={() => void save()} disabled={busy}><FloppyDiskIcon size={17} />{copy.saveProject}</button></div></div>
        <div className="editor-layout"><main className="editor-center"><Preview project={project} playback={playback} original={original} onOriginal={setOriginal} /><Timeline project={project} time={playback.time} selectedId={selectedId} onSeek={playback.seek} onSelect={(id) => { setSelectedId(id); setTab('motion'); }} onAdd={() => addShot()} onRegenerate={() => { updateProject((current) => ({ ...current, clips: [...generateClips(current.samples, current.duration, current.settings.mode, current.settings.zoom), ...current.clips.filter((clip) => clip.manual)].sort((first, second) => first.start - second.start) })); setSelectedId(undefined); notify(copy.regenerateSuccess); }} /></main><Inspector project={project} tab={tab} onTab={setTab} onSettings={settingsChanged} onPreset={presetChanged} selectedClip={project.clips.find((clip) => clip.id === selectedId)} onClip={clipChanged} onDeleteClip={(id) => { updateProject((current) => ({ ...current, clips: current.clips.filter((clip) => clip.id !== id) })); setSelectedId(undefined); }} onTrim={(trimStart, trimEnd) => updateProject((current) => ({ ...current, trimStart, trimEnd }))} /></div>
      </> : <EmptyWorkspace onRecord={record} onImport={() => videoInput.current?.click()} onOpen={() => void open()} disabled={busy} />}
    </div>
    <input type="file" className="visually-hidden" ref={videoInput} accept="video/mp4,video/webm,video/quicktime,video/x-matroska" onChange={(event) => void importVideo(event)} /><input type="file" className="visually-hidden" ref={projectInput} accept={`.${PROJECT_EXTENSION}`} onChange={(event) => void importProject(event)} />
    {dialog === 'record' && <RecordDialog onClose={() => setDialog(null)} onStart={beginRecording} />}
    {dialog === 'settings' && <SettingsDialog theme={theme} onTheme={setTheme} library={library} loading={libraryLoading} error={libraryError} onSave={configureStorage} onClose={() => setDialog(null)} onRefresh={() => void refreshLibrary()} onGuide={() => setDialog('guide')} updates={updates} onInstallUpdate={installUpdate} installing={preparingUpdate || updates.state.status === 'installing'} />}
    {!busy && !dialog && <UpdateNotice state={updates.state} onOpen={() => { playback.pause(); setDialog('settings'); void refreshLibrary(); }} />}
    {dialog === 'export' && project && <ExportDialog project={project} ensureSaved={ensureSaved} onComplete={() => void refreshLibrary()} onClose={() => setDialog(null)} />}
    {dialog === 'guide' && <Modal title={copy.guideTitle} onClose={() => setDialog(null)}><div className="guide-steps">{copy.guideSteps.map(([title, description], index) => <div key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}</div><p className="guide-note"><SparkleIcon size={19} />{copy.guideNote}</p>{!window.desktop && <p className="field-hint">{copy.browserHint}</p>}</Modal>}
    {recording && !window.desktop && <div className="browser-recording-dock"><RecordingDock state={{ active: true, paused: recordingPaused, elapsed: recordingElapsed, pending: false, script: prompter.script, prompterVisible: prompter.enabled }} onCommand={recordingCommand} onPrompter={() => setPrompter((current) => ({ ...current, enabled: !current.enabled }))} /></div>}
    {recording && !window.desktop && prompter.enabled && <div className="browser-teleprompter"><Teleprompter script={prompter.script} recordingPaused={recordingPaused} onClose={() => setPrompter((current) => ({ ...current, enabled: false }))} /></div>}
    {countdown !== null && <div className="countdown-overlay" role="status"><span>{t.recording.countdown}</span><strong>{countdown}</strong><button className="soft-button" type="button" onClick={() => countdownAbort.current?.abort()}>{t.recording.cancelCountdown}</button></div>}
    {(processing || loading) && <div className="processing-overlay"><ApertureIcon size={39} className="spin" /><p>{processing ? t.recording.processing : t.library.loading}</p></div>}
    {toast && <div className="toast" role="status"><CheckIcon size={16} /><span>{toast}</span><IconButton icon={XIcon} label={copy.close} onClick={() => setToast('')} size={15} /></div>}
  </div>;
}

export { dataFromProject, restoredProject };
