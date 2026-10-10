import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { RecordingOverlays } from '../electron/recording-overlays';
import { registerWindowControls } from '../electron/window';
import { initialUpdateState, IPC } from '../shared';
import { LocalLibrary } from '../storage/library';
import { t } from '../src/i18n';

export interface RecordingOverlaysReport {
  mainHidden: boolean;
  floating: boolean;
  captureExcluded: boolean;
  pauseResume: boolean;
  prompterScroll: boolean;
  pauseStopsPrompter: boolean;
  recovered: boolean;
}

const QA = { timeout: 30_000, poll: 50, scrollDelay: 600, elapsed: 1.25 } as const;
const root = process.cwd();
const output = path.join(root, '.qa');
app.setPath('userData', path.join(output, 'recording-controls-profile'));
app.on('window-all-closed', () => undefined);

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + QA.timeout;
  while (!await check()) { if (Date.now() >= deadline) throw new Error('QA_OVERLAY_TIMEOUT'); await new Promise<void>((resolve) => setTimeout(resolve, QA.poll)); }
}
const waitForScroll = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, QA.scrollDelay));

async function run(): Promise<RecordingOverlaysReport> {
  await mkdir(output, { recursive: true });
  const library = new LocalLibrary(path.join(output, 'recording-overlays-library'));
  ipcMain.handle(IPC.libraryList, () => library.list());
  ipcMain.handle(IPC.updateGet, () => initialUpdateState(app.getVersion(), false));
  const main = new BrowserWindow({ frame: false, show: false, width: 1480, height: 960, webPreferences: { preload: path.join(root, 'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  registerWindowControls(main);
  const overlays = new RecordingOverlays({ mainWindow: main, preload: path.join(root, 'dist-electron/preload.cjs'), keepMainVisible: false });
  try {
    await main.loadFile(path.join(root, 'dist/index.html'));
    await waitFor(() => main.webContents.executeJavaScript(`Boolean(document.querySelector('.library-page'))`));
    main.showInactive();
    const script = Array.from({ length: 24 }, (_unused, index) => `第 ${index + 1} 段：向观众介绍操作步骤，说明重点，再开始演示。`).join('\n\n');
    await main.webContents.executeJavaScript(`window.desktop.configurePrompter(${JSON.stringify(script)}, true)`);
    await main.webContents.executeJavaScript(`window.desktop.onRecordingCommand(command => { window.desktop.syncRecordingProgress({elapsed:${QA.elapsed}, paused:command === 'pause'}); }); undefined`);
    await overlays.start();
    overlays.sync({ elapsed: 0, paused: false });
    const dock = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('#/recording-dock'));
    const prompter = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('#/teleprompter'));
    assert(dock && prompter && !main.isVisible(), 'QA_MAIN_NOT_HIDDEN');
    assert(dock.isAlwaysOnTop() && prompter.isAlwaysOnTop() && dock.isContentProtected() && prompter.isContentProtected(), 'QA_FLOATING_NOT_PROTECTED');
    await waitFor(() => dock.webContents.executeJavaScript(`Boolean(document.querySelector('.recording-dock[data-recording-active="true"]'))`));
    await writeFile(path.join(output, 'floating-dock.png'), (await dock.webContents.capturePage()).toPNG());
    const scrollTop = (): Promise<number> => prompter.webContents.executeJavaScript(`document.querySelector('.prompter-viewport').scrollTop`) as Promise<number>;
    await waitForScroll();
    assert(await scrollTop() > 0, 'QA_PROMPTER_NOT_SCROLLING');
    await dock.webContents.executeJavaScript(`document.querySelector('[aria-label="${t.recorderControls.pause}"]').click()`);
    await waitFor(() => overlays.current.paused && !overlays.current.pending);
    await waitForScroll();
    const pausedScroll = await scrollTop();
    await waitForScroll();
    assert(await scrollTop() === pausedScroll, 'QA_PROMPTER_SCROLLS_WHILE_PAUSED');
    await writeFile(path.join(output, 'teleprompter.png'), (await prompter.webContents.capturePage()).toPNG());
    await dock.webContents.executeJavaScript(`document.querySelector('[aria-label="${t.recorderControls.resume}"]').click()`);
    await waitFor(() => !overlays.current.paused && !overlays.current.pending);
    await waitForScroll();
    assert(await scrollTop() > pausedScroll, 'QA_PROMPTER_RESUME_FAILED');
    await dock.webContents.executeJavaScript(`window.desktop.togglePrompter()`);
    assert(!prompter.isVisible(), 'QA_PROMPTER_HIDE_FAILED');
    await waitForScroll();
    const hiddenScroll = await scrollTop();
    await waitForScroll();
    assert(await scrollTop() === hiddenScroll, 'QA_HIDDEN_PROMPTER_SCROLLS');
    await dock.webContents.executeJavaScript(`window.desktop.togglePrompter()`);
    assert(prompter.isVisible(), 'QA_PROMPTER_REOPEN_FAILED');
    overlays.stop();
    assert(main.isVisible() && dock.isDestroyed() && prompter.isDestroyed(), 'QA_RECORDING_CLEANUP_FAILED');
    return { mainHidden: true, floating: true, captureExcluded: true, pauseResume: true, prompterScroll: true, pauseStopsPrompter: true, recovered: true };
  } finally { overlays.dispose(); main.destroy(); }
}

app.whenReady().then(async () => {
  const timeout = setTimeout(() => { console.error('录制悬浮窗口验证超时'); app.exit(1); }, QA.timeout);
  try { const report = await run(); await writeFile(path.join(output, 'recording-overlays-report.json'), JSON.stringify(report, null, 2)); console.info('主窗口隐藏、悬浮录制控制、提词器滚动与暂停同步验证通过。'); app.exit(0); }
  catch (error) { console.error('QA_RECORDING_OVERLAYS_FAILED', error); app.exit(1); }
  finally { clearTimeout(timeout); }
}).catch((error: unknown) => { console.error('QA_RECORDING_OVERLAYS_START_FAILED', error); app.exit(1); });

export { run as runRecordingOverlaysQA };
