import { CAPTURE_TIMING, DEFAULT_SETTINGS, MEDIA_MIME, TIME } from '../../shared';
import type { CaptureOptions, NativePointer, PointerSample, Project } from '../../shared';
import { t } from '../i18n';
import { generateClips } from './motion';
import { recordingBitrate } from './quality';

const RECORDING = { audioBitrate: 192_000, minimumSampleGap: 0.012 } as const;

export interface RecordingSession { stop(): Promise<Project>; stream: MediaStream; startedAt: number; }
export interface RecordingSourceInfo { label: string; width: number; height: number; fps: number; cursorEmbedded: boolean; }
export interface PreparedRecording {
  stream: MediaStream;
  source: RecordingSourceInfo;
  sourceEnded: AbortSignal;
  start(onEnded: () => void, signal: AbortSignal): Promise<RecordingSession>;
  cancel(): Promise<void>;
}
type CapturePhase = 'preparing' | 'ready' | 'starting' | 'recording' | 'closed';
type CursorTrackSettings = MediaTrackSettings & { cursor?: 'always' | 'motion' | 'never' };
type CursorConstraints = MediaTrackConstraints & { cursor: 'always' | 'never' };

async function captureFrameSize(stream: MediaStream, signal: AbortSignal): Promise<{ width: number; height: number }> {
  const preview = document.createElement('video');
  preview.muted = true; preview.playsInline = true; preview.srcObject = stream;
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => { clearTimeout(timeout); signal.removeEventListener('abort', aborted); preview.removeEventListener('loadeddata', ready); preview.removeEventListener('error', failed); };
      const ready = (): void => { cleanup(); resolve(); };
      const failed = (): void => { cleanup(); reject(new Error('CAPTURE_PREVIEW_FAILED')); };
      const aborted = (): void => { cleanup(); reject(new DOMException(t.recording.cancelled, 'AbortError')); };
      const timeout = setTimeout(failed, TIME.seekTimeout);
      signal.addEventListener('abort', aborted, { once: true });
      preview.addEventListener('loadeddata', ready, { once: true });
      preview.addEventListener('error', failed, { once: true });
      if (signal.aborted) { aborted(); return; }
      void preview.play().catch(failed);
    });
    if (preview.videoWidth <= 0 || preview.videoHeight <= 0) throw new Error('CAPTURE_SIZE_MISSING');
    return { width: preview.videoWidth, height: preview.videoHeight };
  } finally { preview.pause(); preview.srcObject = null; }
}

function assertReady(signal: AbortSignal, track?: MediaStreamTrack): void {
  if (signal.aborted) throw new DOMException(t.recording.cancelled, 'AbortError');
  if (track && track.readyState !== 'live') throw new Error('CAPTURE_SOURCE_ENDED');
}

function waitForCountdownTick(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException(t.recording.cancelled, 'AbortError')); return; }
    const abort = (): void => { clearTimeout(timer); reject(new DOMException(t.recording.cancelled, 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, TIME.milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function startRecording(prepared: PreparedRecording, seconds: number, onCountdown: (remaining: number | null) => void, onEnded: () => void, signal: AbortSignal): Promise<RecordingSession> {
  const combinedSignal = AbortSignal.any([signal, prepared.sourceEnded]);
  try {
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > CAPTURE_TIMING.maximumCountdown) throw new Error('INVALID_COUNTDOWN');
    assertReady(combinedSignal);
    for (let remaining = seconds; remaining > 0; remaining--) {
      onCountdown(remaining);
      await waitForCountdownTick(combinedSignal);
    }
    assertReady(combinedSignal);
    return await prepared.start(onEnded, combinedSignal);
  } catch (error) {
    await prepared.cancel();
    throw error;
  } finally { onCountdown(null); }
}

export async function prepareRecording(options: CaptureOptions): Promise<PreparedRecording> {
  let screenStream: MediaStream | undefined;
  let microphoneStream: MediaStream | undefined;
  let mixedStream: MediaStream | undefined;
  let audio: AudioContext | undefined;
  let unsubscribe: (() => void) | undefined;
  let recorder: MediaRecorder | undefined;
  let phase: CapturePhase = 'preparing';
  let released = false;
  let ownsPointer = false;
  let ownsRecordingState = false;
  const sourceEnded = new AbortController();
  const samples: PointerSample[] = [];
  const chunks: Blob[] = [];
  let stopping = false;
  let hasStarted = false;
  let startedAt = 0;
  let epochStart = 0;
  let latestPointer: NativePointer | undefined;
  let handleEnded: (() => void) | undefined;
  let captureTrack: MediaStreamTrack | undefined;

  const onSourceEnded = (): void => {
    sourceEnded.abort();
    if (phase === 'recording') handleEnded?.();
    else if (phase === 'ready') void cleanup().catch((error: unknown) => console.error('CAPTURE_CLEANUP_FAILED', error));
  };
  const cleanup = async (): Promise<void> => {
    if (released) return;
    released = true; phase = 'closed';
    captureTrack?.removeEventListener('ended', onSourceEnded);
    unsubscribe?.();
    const tracks = new Set([...(mixedStream?.getTracks() ?? []), ...(screenStream?.getTracks() ?? []), ...(microphoneStream?.getTracks() ?? [])]);
    tracks.forEach((track) => track.stop());
    const results = await Promise.allSettled([
      audio && audio.state !== 'closed' ? audio.close() : Promise.resolve(),
      ownsPointer ? window.desktop?.stopPointer() : Promise.resolve(),
      ownsRecordingState ? window.desktop?.recordingState(false) : Promise.resolve(),
    ]);
    for (const result of results) if (result.status === 'rejected') console.error('CAPTURE_CLEANUP_FAILED', result.reason);
    sourceEnded.abort();
  };

  try {
    if (window.desktop) await window.desktop.selectSource(options);
    const video: CursorConstraints = { frameRate: { ideal: options.fps, max: options.fps }, cursor: window.desktop ? 'never' : 'always' };
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video, audio: options.systemAudio });
    captureTrack = screenStream.getVideoTracks()[0];
    if (!captureTrack) throw new Error('CAPTURE_VIDEO_MISSING');
    captureTrack.contentHint = 'detail';
    captureTrack.addEventListener('ended', onSourceEnded, { once: true });
    if (options.microphone) microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    assertReady(sourceEnded.signal, captureTrack);
    mixedStream = new MediaStream(screenStream.getVideoTracks());
    const audioTracks = [...screenStream.getAudioTracks(), ...(microphoneStream?.getAudioTracks() ?? [])];
    if (audioTracks.length) {
      audio = new AudioContext();
      const destination = audio.createMediaStreamDestination();
      for (const track of audioTracks) audio.createMediaStreamSource(new MediaStream([track])).connect(destination);
      await audio.resume();
      destination.stream.getAudioTracks().forEach((track) => mixedStream?.addTrack(track));
    }
    const mimeType = MEDIA_MIME.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error('MEDIA_RECORDER_UNAVAILABLE');
    const trackSettings = captureTrack.getSettings() as CursorTrackSettings;
    const source: RecordingSourceInfo = {
      label: captureTrack.label, width: 0,
      height: 0, fps: trackSettings.frameRate ?? options.fps,
      cursorEmbedded: trackSettings.cursor !== 'never' || !window.desktop,
    };
    const stream = mixedStream;
    const track = captureTrack;
    const addSample = (event: NativePointer): void => {
      latestPointer = event;
      if (!event.inside || stopping || !hasStarted) return;
      const time = Math.max(0, (event.timestamp - epochStart) / TIME.milliseconds);
      if (event.kind === 'move' && samples.at(-1)?.kind === 'move' && time - (samples.at(-1)?.time ?? 0) < RECORDING.minimumSampleGap) return;
      samples.push({ time, x: event.x, y: event.y, kind: event.kind, button: event.button });
    };
    if (window.desktop) {
      unsubscribe = window.desktop.onPointer(addSample);
      ownsPointer = true;
      await window.desktop.startPointer(options.sourceId);
    }
    Object.assign(source, await captureFrameSize(stream, sourceEnded.signal));
    assertReady(sourceEnded.signal, track);
    phase = 'ready';
    return {
      stream, source, sourceEnded: sourceEnded.signal,
      cancel: async () => { if (phase === 'ready') await cleanup(); },
      start: async (onEnded, signal): Promise<RecordingSession> => {
        if (phase !== 'ready') throw new Error('CAPTURE_NOT_READY');
        phase = 'starting';
        try {
          assertReady(signal, track);
          Object.assign(source, await captureFrameSize(stream, signal));
          recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: recordingBitrate(source.width, source.height, options.fps), audioBitsPerSecond: RECORDING.audioBitrate });
          const activeRecorder = recorder;
          let recorderError: Error | undefined;
          handleEnded = onEnded;
          activeRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
          const stopped = new Promise<Blob>((resolve) => {
            activeRecorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
            activeRecorder.onerror = () => { recorderError = new Error('MEDIA_RECORDER_FAILED'); if (hasStarted) onEnded(); };
          });
          assertReady(signal, track);
          ownsRecordingState = Boolean(window.desktop);
          await window.desktop?.recordingState(true);
          assertReady(signal, track);
          startedAt = performance.now(); epochStart = Date.now();
          hasStarted = true; phase = 'recording';
          if (latestPointer?.inside) samples.push({ time: 0, x: latestPointer.x, y: latestPointer.y, kind: 'move' });
          activeRecorder.start(TIME.recordingChunk);
          return {
            stream, startedAt,
            stop: async (): Promise<Project> => {
              if (stopping) throw new Error('RECORDING_ALREADY_STOPPED');
              stopping = true;
              const duration = Math.max(TIME.minimumDuration, (performance.now() - startedAt) / TIME.milliseconds);
              try {
                if (activeRecorder.state !== 'inactive') activeRecorder.stop();
                const blob = await stopped;
                if (recorderError) throw recorderError;
                return {
                  schemaVersion: 1, name: t.editor.recordingName, duration, width: source.width, height: source.height,
                  samples, clips: generateClips(samples, duration, DEFAULT_SETTINGS.mode),
                  settings: { ...DEFAULT_SETTINGS, cursor: source.cursorEmbedded ? 'none' : DEFAULT_SETTINGS.cursor }, trimStart: 0, trimEnd: duration,
                  sourceType: 'video', videoBlob: blob, videoUrl: URL.createObjectURL(blob), hasAudio: audioTracks.length > 0, cursorEmbedded: source.cursorEmbedded,
                };
              } finally { await cleanup(); }
            },
          };
        } catch (error) {
          if (recorder && recorder.state !== 'inactive') recorder.stop();
          await cleanup(); throw error;
        }
      },
    };
  } catch (error) { await cleanup(); throw error; }
}
