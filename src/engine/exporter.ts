import { MEDIA_MIME, RESOLUTIONS, TIME } from '../../shared';
import type { ExportOptions, ExportResult, Project } from '../../shared';
import { t } from '../i18n';
import { VideoRenderer, canvasDimensions } from './renderer';
import { exportBitrate } from './quality';
import { exportLibraryVideo, hasLocalLibrary } from '../library';
import { prepareBackground } from './backgrounds';

const EXPORT_PROGRESS = { render: 0.88, encoding: 0.12 } as const;
const EXPORT_STARTUP_TIMEOUT = 30_000;

export interface ExportProgress { progress: number; phase: 'rendering' | 'encoding' | 'complete'; }

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), TIME.milliseconds * 30);
}

export function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.002 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = (): void => { clearTimeout(timeout); video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onError); };
    const onSeeked = (): void => { cleanup(); resolve(); };
    const onError = (): void => { cleanup(); reject(new Error('VIDEO_SEEK_FAILED')); };
    const timeout = setTimeout(onError, TIME.seekTimeout);
    video.addEventListener('seeked', onSeeked, { once: true }); video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

export async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.preload = 'auto'; video.playsInline = true;
  return new Promise((resolve, reject) => {
    video.addEventListener('loadeddata', () => resolve(video), { once: true });
    video.addEventListener('error', () => reject(new Error('VIDEO_LOAD_FAILED')), { once: true });
    video.src = url; video.load();
  });
}

async function startExportCapture(recorder: MediaRecorder, signal: AbortSignal, fps: number, frame: () => void): Promise<void> {
  if (signal.aborted) throw new DOMException(t.export.cancelled, 'AbortError');
  await new Promise<void>((resolve, reject) => {
    let frameTimer: ReturnType<typeof setTimeout> | undefined;
    let complete = false;
    const cleanup = (): void => { complete = true; clearTimeout(timeout); clearTimeout(frameTimer); recorder.removeEventListener('start', ready); recorder.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); };
    const ready = (): void => { cleanup(); resolve(); };
    const failed = (): void => { cleanup(); reject(new Error('EXPORT_ENCODER_NOT_READY')); };
    const aborted = (): void => { cleanup(); reject(new DOMException(t.export.cancelled, 'AbortError')); };
    const timeout = setTimeout(failed, EXPORT_STARTUP_TIMEOUT);
    recorder.addEventListener('start', ready, { once: true }); recorder.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    const drawFirstFrame = (): void => {
      if (complete) return;
      try { frame(); if (!complete) frameTimer = setTimeout(drawFirstFrame, TIME.milliseconds / fps); }
      catch (error) { cleanup(); reject(error); }
    };
    try { recorder.start(TIME.recordingChunk); drawFirstFrame(); }
    catch (error) { cleanup(); reject(error); }
  });
}

export async function renderExport(project: Project, options: ExportOptions, onProgress: (status: ExportProgress) => void, signal: AbortSignal, projectId?: string): Promise<ExportResult> {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = canvasDimensions(project.settings.aspect, RESOLUTIONS[options.resolution]);
  const renderer = new VideoRenderer(canvas);
  let video: HTMLVideoElement | undefined;
  let audio: AudioContext | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stream: MediaStream | undefined;
  let capturePreview: HTMLVideoElement | undefined;
  let unsubscribe: (() => void) | undefined;
  let mediaRecorder: MediaRecorder | undefined;
  let removeAbortListener: (() => void) | undefined;
  const duration = project.trimEnd - project.trimStart;
  const chunks: Blob[] = [];
  try {
    await prepareBackground(project.settings.background);
    if (project.sourceType === 'video' && project.videoUrl) {
      video = await loadVideo(project.videoUrl);
      await seekVideo(video, project.trimStart);
    }
    if (signal.aborted) throw new DOMException(t.export.cancelled, 'AbortError');
    renderer.render(project, project.trimStart, video);
    stream = canvas.captureStream(options.fps);
    capturePreview = document.createElement('video');
    capturePreview.muted = true; capturePreview.playsInline = true; capturePreview.srcObject = stream;
    const preview = capturePreview;
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => { clearTimeout(timeout); preview.removeEventListener('loadeddata', ready); preview.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); };
      const ready = (): void => { cleanup(); resolve(); };
      const failed = (): void => { cleanup(); reject(new Error('EXPORT_CAPTURE_NOT_READY')); };
      const aborted = (): void => { cleanup(); reject(new DOMException(t.export.cancelled, 'AbortError')); };
      const timeout = setTimeout(failed, TIME.seekTimeout);
      preview.addEventListener('loadeddata', ready, { once: true }); preview.addEventListener('error', failed, { once: true });
      signal.addEventListener('abort', aborted, { once: true });
      void preview.play().catch(failed);
    });
    if (video && project.hasAudio) {
      audio = new AudioContext();
      const input = audio.createMediaElementSource(video);
      const destination = audio.createMediaStreamDestination();
      input.connect(destination);
      await audio.resume();
      destination.stream.getAudioTracks().forEach((track) => stream?.addTrack(track));
    } else if (video) video.muted = true;
    const mimeType = MEDIA_MIME.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error('MEDIA_RECORDER_UNAVAILABLE');
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: exportBitrate(canvas.width, canvas.height, options), audioBitsPerSecond: 192_000 });
    mediaRecorder = recorder;
    const captureTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    await startExportCapture(recorder, signal, options.fps, () => { renderer.render(project, project.trimStart, video); captureTrack.requestFrame(); });
    if (signal.aborted) throw new DOMException(t.export.cancelled, 'AbortError');
    const rendered = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('MEDIA_RECORDER_FAILED'));
      recorder.onstop = () => signal.aborted ? reject(new DOMException(t.export.cancelled, 'AbortError')) : resolve(new Blob(chunks, { type: mimeType }));
    });
    let aborted = false;
    const abort = (): void => { aborted = true; if (recorder.state !== 'inactive') recorder.stop(); };
    signal.addEventListener('abort', abort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', abort);
    const startedAt = performance.now();
    if (video) {
      try { await video.play(); }
      catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError' && video.ended && !signal.aborted)) throw error;
      }
    }
    const draw = (): void => {
      if (aborted || recorder.state === 'inactive') return;
      const elapsed = (performance.now() - startedAt) / TIME.milliseconds;
      const time = video && !video.ended ? video.currentTime : project.trimStart + elapsed;
      renderer.render(project, Math.min(time, project.trimEnd), video);
      captureTrack.requestFrame();
      onProgress({ progress: Math.min(1, (time - project.trimStart) / duration) * EXPORT_PROGRESS.render, phase: 'rendering' });
      if (time >= project.trimEnd - 1 / options.fps || elapsed >= duration + 2) timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, TIME.milliseconds / options.fps);
      else timer = setTimeout(draw, TIME.milliseconds / options.fps);
    };
    draw();
    const blob = await rendered;
    if (blob.size === 0) throw new Error('EXPORT_CAPTURE_EMPTY');
    signal.removeEventListener('abort', abort);
    video?.pause();
    if (signal.aborted) throw new DOMException(t.export.cancelled, 'AbortError');
    if (hasLocalLibrary) {
      onProgress({ progress: EXPORT_PROGRESS.render, phase: 'encoding' });
      unsubscribe = window.desktop?.onEncodeProgress((progress) => onProgress({ progress: EXPORT_PROGRESS.render + progress * EXPORT_PROGRESS.encoding, phase: 'encoding' }));
      const result = await exportLibraryVideo({ bytes: await blob.arrayBuffer(), mimeType, format: options.format, name: project.name, quality: options.quality, duration, fps: options.fps, projectId });
      if (!result.cancelled) onProgress({ progress: 1, phase: 'complete' });
      return result;
    }
    downloadBlob(blob, `${project.name}.webm`);
    onProgress({ progress: 1, phase: 'complete' });
    return { cancelled: false };
  } finally {
    if (timer) clearTimeout(timer);
    removeAbortListener?.();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    unsubscribe?.();
    capturePreview?.pause();
    if (capturePreview) capturePreview.srcObject = null;
    video?.pause();
    if (video) { video.removeAttribute('src'); video.load(); }
    stream?.getTracks().forEach((track) => track.stop());
    if (audio) await audio.close();
    renderer.dispose();
  }
}
