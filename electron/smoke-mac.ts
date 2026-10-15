import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, desktopCapturer, systemPreferences, BrowserWindow } from 'electron';
import { exportVideo } from './export';
import { ffmpegPath } from './runtime';
import { macWindowSources, macCaptureHelper } from './mac-capture';
import { PointerTracker } from './pointer';

const execute = promisify(execFile);

export async function runMacSmokeTest(window: BrowserWindow, root: string, setSource: (sourceId: string) => Promise<void>): Promise<void> {
  const output = path.join(root, '.qa');
  let captureWindow: BrowserWindow | undefined;
  const tracker = new PointerTracker();
  try {
    await mkdir(output, { recursive: true });
    window.show();
    await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 500))');
    const startup = await window.webContents.executeJavaScript(`(async () => {
      const library = await window.desktop.listLibrary();
      return { title: document.title, platform: window.desktop.platform, libraryVisible: Boolean(document.querySelector('.library-page')), settings: library.settings };
    })()`) as { title: string; platform: string; libraryVisible: boolean };
    if (startup.title !== 'Cursorama' || startup.platform !== 'darwin' || !startup.libraryVisible) throw new Error('MAC_SMOKE_STARTUP_FAILED');
    await writeFile(path.join(output, 'mac-startup.png'), (await window.webContents.capturePage()).toPNG());
    const source = path.join(output, 'mac-source.webm');
    const permission = systemPreferences.getMediaAccessStatus('screen');
    let recording = '未验证：屏幕录制权限未授予；编码验证使用应用自身窗口截图。';
    let fullscreen: Record<string, unknown> = { verified: false };
    let pointerTracking: Record<string, unknown> = { verified: false };
    if (permission === 'granted') {
      captureWindow = new BrowserWindow({ title: 'Cursorama macOS capture QA', width: 900, height: 650, backgroundColor: '#252525' });
      await captureWindow.loadURL('data:text/html,<title>Cursorama macOS capture QA</title><body style="background:%23252525;color:white"><h1>Cursorama capture QA</h1></body>');
      captureWindow.show(); captureWindow.focus();
      await new Promise<void>((resolve) => setTimeout(resolve, 1200));
      const entered = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('MAC_FULLSCREEN_TIMEOUT')), 15_000);
        captureWindow?.once('enter-full-screen', () => { clearTimeout(timer); resolve(); });
      });
      captureWindow.setFullScreen(true); await entered;
      window.show(); window.focus();
      await new Promise<void>((resolve) => setTimeout(resolve, 800));
      const ownId = captureWindow.getMediaSourceId();
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
      const own = sources.find((candidate) => candidate.id === ownId);
      const native = (await macWindowSources(true, [ownId])).find((candidate) => candidate.id === ownId);
      if (!native) throw new Error('MAC_SMOKE_FULLSCREEN_NATIVE_WINDOW_MISSING');
      if (native.thumbnail.isEmpty()) throw new Error('MAC_SMOKE_FULLSCREEN_THUMBNAIL_EMPTY');
      await writeFile(path.join(output, 'mac-fullscreen-thumbnail.png'), native.thumbnail.toPNG());
      const available = await window.webContents.executeJavaScript('window.desktop.listSources()') as { id: string }[];
      if (!available.some((candidate) => candidate.id === ownId)) throw new Error('MAC_SMOKE_FULLSCREEN_SELECTION_MISSING');
      await window.webContents.executeJavaScript(await readFile(path.join(output, 'renderer-test.js'), 'utf8'));
      const previewUI = await window.webContents.executeJavaScript(`cursoramaQA.runCaptureSourcePreviewUIQA(${JSON.stringify(ownId)})`, true) as Record<string, unknown>;
      await writeFile(path.join(output, 'mac-source-picker.png'), (await window.webContents.capturePage()).toPNG());
      const fallbackUI = await window.webContents.executeJavaScript(`cursoramaQA.runCaptureSourceFallbackUIQA(${JSON.stringify(ownId)})`, true) as Record<string, unknown>;
      await writeFile(path.join(output, 'mac-source-picker-fallback.png'), (await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript(`document.querySelector('[role="dialog"] .modal-heading button').click()`);
      fullscreen = { verified: true, electronEnumerated: Boolean(own), nativeEnumerated: true, selectable: true, thumbnail: true, previewUI, fallbackUI };
      const { stdout } = await execute(macCaptureHelper(), ['status']);
      const status = JSON.parse(stdout) as { inputMonitoring: boolean };
      if (status.inputMonitoring) {
        captureWindow.show(); captureWindow.focus();
        await new Promise<void>((resolve) => setTimeout(resolve, 800));
        let moves = 0; let clicks = 0;
        await tracker.start('', ownId, '', (event) => { if (!event.inside) return; if (event.kind === 'move') moves++; if (event.kind === 'click') clicks++; });
        await execute('xcrun', ['swift', path.join(root, 'tests/mac-pointer-qa.swift'), ownId.split(':')[1], String(process.pid)], { timeout: 30_000 });
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        tracker.stop();
        if (moves === 0) throw new Error('MAC_SMOKE_POINTER_EMPTY');
        if (clicks === 0) throw new Error('MAC_SMOKE_CLICK_EMPTY');
        pointerTracking = { verified: true, moves, clicks, normalized: true };
        window.show(); window.focus();
        await new Promise<void>((resolve) => setTimeout(resolve, 800));
      } else pointerTracking = { verified: false, reason: 'INPUT_MONITORING_PERMISSION_REQUIRED' };
      await setSource(ownId);
      const bytes = await window.webContents.executeJavaScript(`(async () => {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, cursor: 'always' }, audio: false });
        try {
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
          const chunks = [];
          recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = reject; });
          recorder.start();
          await new Promise(resolve => setTimeout(resolve, 1000));
          recorder.stop(); await stopped;
          return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
        } finally { stream.getTracks().forEach(track => track.stop()); }
      })()`, true) as number[];
      if (bytes.length < 1000) throw new Error('MAC_SMOKE_RECORDING_EMPTY');
      await writeFile(source, Uint8Array.from(bytes));
      recording = '已验证：仅录制 Cursorama 自身窗口。';
    } else {
      await execute(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', path.join(output, 'mac-startup.png'), '-t', '1', '-vf', 'scale=640:360', '-c:v', 'libvpx', '-pix_fmt', 'yuv420p', source], { timeout: 30_000 });
    }
    const content = Uint8Array.from(await readFile(source));
    const target = path.join(output, 'mac-export.mp4');
    await exportVideo(window, { bytes: content.buffer, mimeType: 'video/webm', format: 'mp4', name: 'Mac导出验证', quality: 'standard', duration: 1, fps: 30 }, target);
    const size = (await stat(target)).size;
    if (size < 1000) throw new Error('MAC_SMOKE_EXPORT_EMPTY');
    await execute(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-i', target, '-f', 'null', '/dev/null'], { timeout: 30_000 });
    await writeFile(path.join(output, 'mac-smoke-report.json'), JSON.stringify({ passed: true, startup, screenPermission: permission, recording, exportBytes: size, decoded: true, fullscreen, pointerTracking, microphoneAndSystemAudio: '未验证' }, null, 2));
    console.info('Mac 启动、项目库、MP4 导出与解码检查通过。', recording);
    tracker.stop(); captureWindow?.destroy();
    app.exit(0);
  } catch (error) {
    tracker.stop(); captureWindow?.destroy();
    console.error('MAC_SMOKE_FAILED', error);
    app.exit(1);
  }
}
