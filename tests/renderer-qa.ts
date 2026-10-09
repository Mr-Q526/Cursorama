import { DEFAULT_SETTINGS, projectBytes, readProjectBytes } from '../shared';
import type { Project } from '../shared';
import { createDemoProject, DEMO, drawDemo, loadVideo, prepareRecording, renderExport, startRecording, VideoRenderer } from '../src/engine';

export { prepareRecordingUI, cancelCountdownUI, startCountdownUI } from './recording-ui-qa';
export { runFullscreenControlsQA, runRoundedFrameQA } from './preview-ui-qa';
export { runGlassFrameQA } from './frame-glass-qa';

export async function runExportQualityQA() {
  const demo = createDemoProject();
  const fourK = await renderExport({ ...demo, name: '4K清晰度验证', trimStart: 0, trimEnd: 1 }, { resolution: '2160p', format: 'mp4', fps: 30, quality: 'high' }, () => undefined, new AbortController().signal);
  const toneVideo = await createToneVideo();
  const toneUrl = URL.createObjectURL(toneVideo);
  try {
    const audio = await renderExport({ ...demo, name: '音频保留验证', sourceType: 'video', videoUrl: toneUrl, videoBlob: toneVideo, hasAudio: true, duration: 1.5, trimStart: 0.2, trimEnd: 1.2 }, { resolution: '720p', format: 'mp4', fps: 30, quality: 'standard' }, () => undefined, new AbortController().signal);
    return { fourKPath: fourK.path, audioPath: audio.path };
  } finally { URL.revokeObjectURL(toneUrl); }
}

async function createToneVideo(): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = DEMO.width; canvas.height = DEMO.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('QA_CANVAS_MISSING');
  const stream = canvas.captureStream(30);
  const audio = new AudioContext();
  const tone = audio.createOscillator(); const gain = audio.createGain(); gain.gain.value = 0.08;
  const destination = audio.createMediaStreamDestination();
  tone.connect(gain); gain.connect(destination); destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  await audio.resume(); tone.start();
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
  const chunks: Blob[] = [];
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  drawDemo(context, 0); recorder.start();
  const interval = setInterval(() => drawDemo(context, 1), 33);
  await new Promise<void>((resolve) => setTimeout(resolve, 1500));
  recorder.stop(); await stopped;
  clearInterval(interval); tone.stop(); stream.getTracks().forEach((track) => track.stop()); await audio.close();
  return new Blob(chunks, { type: recorder.mimeType });
}

export async function runRendererQA(sourceId: string) {
  const demo = createDemoProject();
  demo.trimStart = 1.8; demo.trimEnd = 4.8; demo.name = '自动运镜验证';
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  const renderer = new VideoRenderer(canvas);
  renderer.render(demo, 0);
  const overview = canvas.toDataURL('image/png');
  const camera = renderer.render(demo, 3.0);
  const zoomed = canvas.toDataURL('image/png');
  const supports3D = renderer.supports3D;
  if (overview === zoomed || camera.zoom < 1.5 || !supports3D) throw new Error('QA_MOTION_RENDER_FAILED');
  const result = await renderExport(demo, { resolution: '720p', format: 'mp4', fps: 30, quality: 'high' }, () => undefined, new AbortController().signal);
  const prepared = await prepareRecording({ sourceId, microphone: false, systemAudio: false, fps: 30 });
  const active = await startRecording(prepared, 0, () => undefined, () => undefined, new AbortController().signal);
  await new Promise<void>((resolve) => setTimeout(resolve, 800));
  active.pause();
  const pausedAt = active.elapsed;
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  if (!active.paused || Math.abs(active.elapsed - pausedAt) > 0.05) throw new Error('QA_PAUSE_CLOCK_CONTINUED');
  active.resume();
  await new Promise<void>((resolve) => setTimeout(resolve, 800));
  const recorded = await active.stop();
  if (!recorded.videoBlob || recorded.videoBlob.size < 1000 || recorded.duration < 1.4 || recorded.duration > 2.2) throw new Error('QA_RECORDING_FAILED');
  await window.desktop?.exportVideo({ bytes: await recorded.videoBlob.arrayBuffer(), mimeType: recorded.videoBlob.type, name: '暂停继续录制验证', format: 'webm', quality: 'standard', duration: recorded.duration, fps: 30 });
  const recordedVideo = await loadVideo(recorded.videoUrl ?? '');
  if (!Number.isFinite(recordedVideo.duration) || Math.abs(recordedVideo.duration - recorded.duration) > 1 / 30) throw new Error('QA_RECORDING_DURATION_METADATA_MISSING');
  if (recordedVideo.videoWidth !== recorded.width || recordedVideo.videoHeight !== recorded.height) throw new Error(`QA_CAPTURE_SIZE_CHANGED: metadata ${recorded.width}×${recorded.height}, video ${recordedVideo.videoWidth}×${recordedVideo.videoHeight}`);
  renderer.render(recorded, 0, recordedVideo);
  const pointerFrame: Project = { ...recorded, samples: [{ time: 0, x: 0.4, y: 0.4, kind: 'move' }], clips: [], cursorEmbedded: true, settings: { ...DEFAULT_SETTINGS, mode: 'overview', autoZoom: false, followCursor: false, clickEffect: false, spotlight: false, cursor: 'arrow' } };
  renderer.render(pointerFrame, 0, recordedVideo);
  const embeddedPointerFrame = canvas.toDataURL();
  renderer.render({ ...pointerFrame, settings: { ...pointerFrame.settings, cursor: 'none' } }, 0, recordedVideo);
  if (embeddedPointerFrame !== canvas.toDataURL()) throw new Error('QA_DUPLICATE_CURSOR_RENDERED');
  renderer.render({ ...pointerFrame, cursorEmbedded: false }, 0, recordedVideo);
  if (embeddedPointerFrame === canvas.toDataURL()) throw new Error('QA_SEPARATE_CURSOR_MISSING');
  const restored = readProjectBytes(projectBytes({ ...recorded, settings: { ...DEFAULT_SETTINGS } }, await recorded.videoBlob.arrayBuffer()));
  if (!restored.bytes || restored.data.duration !== recorded.duration) throw new Error('QA_PROJECT_ROUNDTRIP_FAILED');
  const imported: Project = { ...recorded, name: '录制编辑导出验证', trimStart: 0, trimEnd: Math.min(1, recorded.duration), clips: [{ id: 'test-shot', start: 0, end: Math.min(1, recorded.duration), x: 0.7, y: 0.4, zoom: 1.8, mode: 'orbit', enabled: true, manual: true }] };
  await renderExport(imported, { resolution: '720p', format: 'mp4', fps: 30, quality: 'standard' }, () => undefined, new AbortController().signal);
  const toneVideo = await createToneVideo();
  const toneUrl = URL.createObjectURL(toneVideo);
  await renderExport({ ...demo, name: '音频保留验证', sourceType: 'video', videoUrl: toneUrl, videoBlob: toneVideo, hasAudio: true, duration: 1.5, trimStart: 0.2, trimEnd: 1.2 }, { resolution: '720p', format: 'mp4', fps: 30, quality: 'standard' }, () => undefined, new AbortController().signal);
  URL.revokeObjectURL(toneUrl);
  const abort = new AbortController();
  setTimeout(() => abort.abort(), 200);
  let cancellationPassed = false;
  try { await renderExport(demo, { resolution: '720p', format: 'webm', fps: 30, quality: 'standard' }, () => undefined, abort.signal); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') cancellationPassed = true; else throw error; }
  if (!cancellationPassed) throw new Error('QA_EXPORT_CANCEL_FAILED');
  const fourK = await renderExport({ ...demo, name: '4K清晰度验证', trimStart: 0, trimEnd: 1 }, { resolution: '2160p', format: 'mp4', fps: 30, quality: 'high' }, () => undefined, new AbortController().signal);
  URL.revokeObjectURL(recorded.videoUrl ?? '');
  recordedVideo.pause(); recordedVideo.removeAttribute('src'); recordedVideo.load(); renderer.dispose();
  return { supports3D, camera, effectPath: result.path, recordingDuration: recorded.duration, recordingBytes: recorded.videoBlob.size, recordingSource: Array.from(new Uint8Array(await recorded.videoBlob.arrayBuffer())), recordingWidth: recorded.width, recordingHeight: recorded.height, recordingCursorEmbedded: recorded.cursorEmbedded, duplicateCursorSuppressed: true, fourKPath: fourK.path, projectBytes: restored.bytes.byteLength, audioExportPassed: true, cancellationPassed, overview, zoomed };
}

export { runLibraryUIQA, restoreLibraryUIQA } from './library-ui-qa';
export { runNavigationUIQA, setThemeUI, navigatePageUI, openSettingsUI, closeSettingsUI } from './navigation-ui-qa';

export async function runWallpaperQA() {
  const { prepareBackground, WALLPAPER_ASSETS } = await import('../src/engine/backgrounds');
  const { WALLPAPER_IDS } = await import('../shared');
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  const board = document.createElement('canvas'); board.width = 1536; board.height = 864;
  const context = board.getContext('2d');
  if (!context) throw new Error('QA_BACKGROUND_CANVAS_UNAVAILABLE');
  const renderer = new VideoRenderer(canvas);
  const colors: string[] = [];
  try {
    for (const [index, background] of WALLPAPER_IDS.entries()) {
      await prepareBackground(background);
      renderer.render({ ...createDemoProject(), settings: { ...DEFAULT_SETTINGS, background, backgroundBlur: 4, backgroundDim: 10 } }, 0);
      const pixel = canvas.getContext('2d')?.getImageData(1, 1, 1, 1).data;
      if (!pixel || pixel[3] !== 255) throw new Error('QA_WALLPAPER_FRAME_EMPTY');
      colors.push(Array.from(pixel).join(','));
      context.drawImage(canvas, (index % 2) * 768, Math.floor(index / 2) * 432, 768, 432);
      if (!WALLPAPER_ASSETS[background].image) throw new Error('QA_WALLPAPER_ASSET_MISSING');
    }
    if (new Set(colors).size !== WALLPAPER_IDS.length) throw new Error('QA_WALLPAPERS_NOT_DISTINCT');
    return { count: WALLPAPER_IDS.length, coverAndFilters: true, image: board.toDataURL('image/png') };
  } finally { renderer.dispose(); }
}
