import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, desktopCapturer, type BrowserWindow } from 'electron';
import { exportVideo } from './export';
import { desktopCatalog } from './catalog';
import type { LibraryUIReport } from '../tests/library-ui-qa';
import type { NavigationUIReport } from '../tests/navigation-ui-qa';
import type { PreviewUIReport, RoundedFrameReport } from '../tests/preview-ui-qa';

interface CaptureReport {
  bytes: number[];
  mimeType: string;
  width: number;
  height: number;
  pointerSamples: number;
  duration: number;
  ui: { title: string; canvasWidth: number; canvasHeight: number; shots: number };
}

const decodeFile = promisify(execFile);
const DECODE = { width: 3840, height: 2160, fps: 30, frames: 30, duration: '00:00:01.00' } as const;
const SCREENSHOT = { attempts: 3, retryDelay: 200 } as const;

async function captureRestoredPage(window: BrowserWindow): Promise<Buffer> {
  for (let attempt = 0; attempt < SCREENSHOT.attempts; attempt++) {
    try { return (await window.webContents.capturePage()).toPNG(); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== 'UnknownVizError' || attempt === SCREENSHOT.attempts - 1) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, SCREENSHOT.retryDelay));
    }
  }
  throw new Error('SMOKE_RESTORED_SCREENSHOT_UNAVAILABLE');
}

async function verifyFourK(root: string): Promise<typeof DECODE> {
  const { stderr } = await decodeFile(path.join(root, 'node_modules/ffmpeg-static/ffmpeg.exe'), ['-hide_banner', '-i', path.join(root, '.qa/4K清晰度验证.mp4'), '-f', 'null', 'NUL'], { windowsHide: true });
  const frames = Array.from(stderr.matchAll(/frame=\s*(\d+)/g)).at(-1)?.[1];
  if (!stderr.includes(`${DECODE.width}x${DECODE.height}`) || !stderr.includes(`${DECODE.fps} fps`) || !stderr.includes(`Duration: ${DECODE.duration}`) || Number(frames) !== DECODE.frames) throw new Error('SMOKE_4K_OUTPUT_INVALID');
  return DECODE;
}

async function verifyPausedRecording(root: string, duration: number): Promise<{ frames: number; duration: number }> {
  const { stderr } = await decodeFile(path.join(root, 'node_modules/ffmpeg-static/ffmpeg.exe'), ['-hide_banner', '-i', path.join(root, '.qa/暂停继续录制验证.webm'), '-f', 'null', 'NUL'], { windowsHide: true });
  const frames = Number(Array.from(stderr.matchAll(/frame=\s*(\d+)/g)).at(-1)?.[1]);
  const decodedDuration = frames / DECODE.fps;
  if (!stderr.includes(`${DECODE.fps} fps`) || Math.abs(decodedDuration - duration) > 1 / DECODE.fps) throw new Error(`SMOKE_PAUSED_VIDEO_DURATION_MISMATCH: ${decodedDuration}/${duration}`);
  return { frames, duration: decodedDuration };
}

export async function runSmokeTest(window: BrowserWindow, root: string, setSource: (sourceId: string) => Promise<void>): Promise<void> {
  const output = path.join(root, '.qa');
  await mkdir(output, { recursive: true });
  const errors: string[] = [];
  window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  try {
    window.showInactive();
    if (process.argv.includes('--quality-only')) {
      await window.webContents.executeJavaScript(await readFile(path.join(output, 'renderer-test.js'), 'utf8'));
      const quality = await window.webContents.executeJavaScript(`cursoramaQA.runExportQualityQA()`, true) as Record<string, unknown>;
      const decode = await verifyFourK(root);
      await writeFile(path.join(output, 'quality-report.json'), JSON.stringify({ ...quality, decode, errors }, null, 2));
      console.info('导出清晰度专项验证完成。'); app.exit(0); return;
    }
    await window.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 200))`);
    const emptyWorkspace = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.empty-workspace') && document.querySelector('.library-sidebar') && !document.querySelector('.preview-stage canvas'))`) as boolean;
    if (!emptyWorkspace) throw new Error('SMOKE_DEFAULT_DEMO_VISIBLE');
    await writeFile(path.join(output, 'workspace-empty.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`document.querySelector('[data-action="open-demo"]').click()`);
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const deadline = performance.now() + 5000;
      const ready = () => { const canvas = document.querySelector('.preview-stage canvas'); if (canvas && canvas.width >= 1920) resolve(true); else if (performance.now() > deadline) reject(new Error('SMOKE_DEMO_NOT_READY')); else setTimeout(ready, 50); }; ready();
    })`);
    await writeFile(path.join(output, 'desktop-dark.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(await readFile(path.join(output, 'renderer-test.js'), 'utf8'));
    const navigation = await window.webContents.executeJavaScript(`cursoramaQA.runNavigationUIQA()`, true) as NavigationUIReport;
    await window.webContents.executeJavaScript(`cursoramaQA.setThemeUI('light')`, true);
    await window.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 100))`);
    const lightPreviewValid = await window.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('.preview-stage canvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < data.length; index += 4) if (data[index] < 150) return true;
      return false;
    })()`) as boolean;
    if (!lightPreviewValid) throw new Error('SMOKE_THEME_PREVIEW_EMPTY');
    await writeFile(path.join(output, 'desktop-light.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`cursoramaQA.setThemeUI('dark')`, true);
    await window.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 100))`);
    await window.webContents.executeJavaScript(`Promise.race([document.querySelector('.preview-stage').requestFullscreen(), new Promise((_, reject) => setTimeout(() => reject(new Error('SMOKE_FULLSCREEN_REQUEST_TIMEOUT')), 5000))])`, true);
    await window.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 200))`);
    const fullscreen = await window.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('.preview-stage canvas');
      return { active: Boolean(document.fullscreenElement), width: canvas.width, height: canvas.height, displayWidth: canvas.getBoundingClientRect().width, displayHeight: canvas.getBoundingClientRect().height };
    })()`) as { active: boolean; width: number; height: number; displayWidth: number; displayHeight: number };
    if (!fullscreen.active || fullscreen.width < 1920 || fullscreen.height < 1080) throw new Error('SMOKE_FULLSCREEN_RESOLUTION_LOW');
    const fullscreenControls = await window.webContents.executeJavaScript(`cursoramaQA.runFullscreenControlsQA()`, true) as PreviewUIReport;
    await writeFile(path.join(output, 'fullscreen-controls.png'), (await window.webContents.capturePage()).toPNG());
    const roundedFrame = await window.webContents.executeJavaScript(`cursoramaQA.runRoundedFrameQA()`, true) as RoundedFrameReport;
    await window.webContents.executeJavaScript(`document.exitFullscreen()`);
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
    const ownWindow = sources.find((source) => source.name === desktopCatalog.appName);
    if (!ownWindow) throw new Error('SMOKE_OWN_WINDOW_MISSING');
    await setSource(ownWindow.id);
    const result = await window.webContents.executeJavaScript(`(async () => {
      const canvas = document.querySelector('.preview-stage canvas');
      if (!canvas || canvas.width < 100) throw new Error('SMOKE_CANVAS_MISSING');
      const ui = { title: document.title, canvasWidth: canvas.width, canvasHeight: canvas.height, shots: document.querySelectorAll('.motion-clip').length };
      let pointerSamples = 0;
      const unsubscribe = window.desktop.onPointer(() => pointerSamples++);
      await window.desktop.selectSource({ sourceId: ${JSON.stringify(ownWindow.id)}, microphone: false, systemAudio: false, fps: 30 });
      await window.desktop.startPointer(${JSON.stringify(ownWindow.id)});
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      const track = stream.getVideoTracks()[0].getSettings();
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 2000000 });
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise(resolve => recorder.onstop = resolve);
      recorder.start();
      await new Promise(resolve => setTimeout(resolve, 1800));
      recorder.stop(); await stopped;
      stream.getTracks().forEach(track => track.stop());
      await window.desktop.stopPointer(); unsubscribe();
      const blob = new Blob(chunks, { type: recorder.mimeType });
      return { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), mimeType: recorder.mimeType, width: track.width, height: track.height, pointerSamples, duration: 1.8, ui };
    })()`, true) as CaptureReport;
    if (result.bytes.length < 1000 || result.ui.shots === 0 || result.pointerSamples === 0) throw new Error('SMOKE_CAPTURE_INVALID');
    const raw = Uint8Array.from(result.bytes);
    await writeFile(path.join(output, 'capture.webm'), raw);
    await exportVideo(window, { bytes: raw.buffer, mimeType: result.mimeType, format: 'mp4', name: '录制验证', quality: 'standard', duration: result.duration, fps: 30 }, path.join(output, 'capture.mp4'));
    await window.webContents.executeJavaScript(await readFile(path.join(output, 'renderer-test.js'), 'utf8'));
    const ready = await window.webContents.executeJavaScript(`cursoramaQA.prepareRecordingUI()`, true) as Record<string, unknown>;
    await writeFile(path.join(output, 'recording-ready.png'), (await window.webContents.capturePage()).toPNG());
    const cancelledCountdown = await window.webContents.executeJavaScript(`cursoramaQA.cancelCountdownUI()`, true) as Record<string, unknown>;
    await window.webContents.executeJavaScript(`cursoramaQA.prepareRecordingUI()`, true);
    const startedCountdown = await window.webContents.executeJavaScript(`cursoramaQA.startCountdownUI()`, true) as Record<string, unknown>;
    const libraryReport = await window.webContents.executeJavaScript(`cursoramaQA.runLibraryUIQA()`, true) as LibraryUIReport;
    await window.webContents.executeJavaScript(`cursoramaQA.navigatePageUI('library')`, true);
    await writeFile(path.join(output, 'library-page.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`cursoramaQA.openSettingsUI()`, true);
    await writeFile(path.join(output, 'settings-dialog.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`cursoramaQA.closeSettingsUI()`, true);
    await window.webContents.executeJavaScript(`cursoramaQA.navigatePageUI('workspace')`, true);
    const wallpaperReport = await window.webContents.executeJavaScript(`cursoramaQA.runWallpaperQA()`, true) as { count: number; coverAndFilters: boolean; image: string };
    await writeFile(path.join(output, 'wallpaper-styles.png'), Buffer.from(wallpaperReport.image.split(',')[1], 'base64'));
    await writeFile(path.join(output, 'wallpapers-ui.png'), (await window.webContents.capturePage()).toPNG());
    const rendererReport = await window.webContents.executeJavaScript(`cursoramaQA.runRendererQA(${JSON.stringify(ownWindow.id)})`, true) as { overview: string; zoomed: string; recordingSource: number[]; recordingDuration: number; [key: string]: unknown };
    const { overview, zoomed, recordingSource, ...rendererDetails } = rendererReport;
    await writeFile(path.join(output, 'paused-recording-source.webm'), Uint8Array.from(recordingSource));
    const decodedPausedRecording = await verifyPausedRecording(root, rendererReport.recordingDuration);
    const decodedFourK = await verifyFourK(root);
    await writeFile(path.join(output, 'overview.png'), Buffer.from(overview.split(',')[1], 'base64'));
    await writeFile(path.join(output, 'cinematic.png'), Buffer.from(zoomed.split(',')[1], 'base64'));
    await writeFile(path.join(output, 'desktop.png'), (await window.webContents.capturePage()).toPNG());
    window.webContents.reload();
    await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()));
    await window.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 200))`);
    await window.webContents.executeJavaScript(await readFile(path.join(output, 'renderer-test.js'), 'utf8'));
    await window.webContents.executeJavaScript(`cursoramaQA.restoreLibraryUIQA(${JSON.stringify(libraryReport.projectId)})`, true);
    await writeFile(path.join(output, 'library-restored.png'), await captureRestoredPage(window));
    const { bytes: _bytes, ...report } = result;
    await writeFile(path.join(output, 'smoke-report.json'), JSON.stringify({ passed: true, ...report, bytes: raw.length, emptyWorkspace, navigation: { ...navigation, lightTheme: true, darkTheme: true }, library: { ...libraryReport, restoredAfterReload: true }, wallpapers: { count: wallpaperReport.count, coverAndFilters: wallpaperReport.coverAndFilters }, fullscreen, fullscreenControls, roundedFrame, recordingFlow: { ...ready, ...cancelledCountdown, ...startedCountdown }, renderer: rendererDetails, decodedFourK, decodedPausedRecording, errors }, null, 2));
    if (errors.length) throw new Error(errors.join('\n'));
    console.info('桌面端验证通过：界面、原生鼠标追踪、应用窗口录制、3D 自动运镜、带效果 MP4 导出、项目恢复。');
    app.exit(0);
  } catch (error) {
    console.error('SMOKE_TEST_FAILED', error);
    await writeFile(path.join(output, 'smoke-failure.png'), (await window.webContents.capturePage()).toPNG());
    await writeFile(path.join(output, 'smoke-report.json'), JSON.stringify({ passed: false, error: String(error), errors }, null, 2));
    app.exit(1);
  }
}
