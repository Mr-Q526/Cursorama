import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, session, shell, Tray, type IpcMainInvokeEvent } from 'electron';
import { APP_PORT, IPC, RECORDING_CONTROLS, UPDATE_CONFIG } from '../shared';
import type { CaptureOptions, CaptureSource, ExportRequest, ProjectData, StorageSettings, StorageTarget } from '../shared';
import { desktopCatalog } from './catalog';
import { exportVideo, openProject } from './export';
import { LocalLibrary } from '../storage/library';
import { legacyLibraryRoots } from '../storage/locations';
import { PointerTracker } from './pointer';
import { createUpdateDriver, UpdateService } from './updates';
import { registerWindowControls } from './window';
import { RecordingOverlays } from './recording-overlays';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STOP_SHORTCUT = 'CommandOrControl+Shift+F9';
const EDITOR_PERMISSIONS = new Set(['media', 'display-capture', 'fullscreen']);
const isSmoke = process.argv.includes('--smoke-test');
const isStartupCheck = process.argv.includes('--startup-check');
const INSTALL_ROOT = app.isPackaged ? path.dirname(process.execPath) : ROOT;
const library = new LocalLibrary(isSmoke ? path.join(ROOT, '.qa', 'library') : isStartupCheck ? path.join(tmpdir(), 'cursorama-startup-check-library') : process.env.CURSORAMA_LIBRARY_DIR ?? INSTALL_ROOT, { legacyRoots: isSmoke || isStartupCheck ? [] : legacyLibraryRoots() });
const tracker = new PointerTracker();
let mainWindow: BrowserWindow | null = null;
let selection: CaptureOptions | null = null;
let recording = false;
let overlays: RecordingOverlays | null = null;
let tray: Tray | null = null;
let updates: UpdateService | null = null;
let activeOperations = 0;
const UPDATE_SETTINGS_DIRECTORY = '.cursorama';
const trustedFiles = new Set<string>();
const sourceDisplays = new Map<string, string>();

async function sources(): Promise<CaptureSource[]> {
  const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: false });
  sourceDisplays.clear();
  return list.filter((source) => !source.name.startsWith(desktopCatalog.appName) || isSmoke).map((source) => {
    sourceDisplays.set(source.id, source.display_id);
    return { id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL(), kind: source.id.startsWith('screen:') ? 'screen' : 'window', displayId: source.display_id };
  });
}

function requireWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('WINDOW_UNAVAILABLE');
  return mainWindow;
}

function requireUpdates(event: IpcMainInvokeEvent): UpdateService {
  if (!updates || event.sender !== mainWindow?.webContents) throw new Error(desktopCatalog.invalidRequest);
  return updates;
}

async function withActivity<T>(operation: () => Promise<T>): Promise<T> {
  if (updates?.current.status === 'installing') throw new Error(desktopCatalog.invalidRequest);
  activeOperations++;
  try { return await operation(); }
  finally { activeOperations--; }
}

async function setRecording(active: boolean): Promise<void> {
  recording = active;
  if (active) {
    try { await overlays?.start(); }
    catch (error) { recording = false; throw error; }
  } else overlays?.stop();
  if (active && !tray) {
    const size = 32;
    const pixels = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const isCenter = Math.hypot(x - size / 2, y - size / 2) < size / 4;
      const offset = (y * size + x) * 4;
      pixels[offset] = isCenter ? 245 : 32;
      pixels[offset + 1] = isCenter ? 245 : 32;
      pixels[offset + 2] = isCenter ? 245 : 32;
      pixels[offset + 3] = 255;
    }
    const icon = nativeImage.createFromBitmap(pixels, { width: size, height: size });
    tray = new Tray(icon);
    tray.setToolTip(desktopCatalog.trayRecording);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: desktopCatalog.trayPauseToggle, click: () => overlays?.command(overlays.current.paused ? 'resume' : 'pause') },
      { label: desktopCatalog.trayStop, click: () => mainWindow?.webContents.send(IPC.recordingStop) },
      { label: desktopCatalog.trayShow, click: () => mainWindow?.show() },
    ]));
    tray.on('double-click', () => mainWindow?.show());
  }
  if (!active) { tray?.destroy(); tray = null; if (!isSmoke) mainWindow?.show(); }
}

function registerIPC(): void {
  ipcMain.handle(IPC.updateGet, (event) => requireUpdates(event).current);
  ipcMain.handle(IPC.updateCheck, (event) => requireUpdates(event).check());
  ipcMain.handle(IPC.updateDownload, (event) => requireUpdates(event).download());
  ipcMain.handle(IPC.updateInstall, (event) => requireUpdates(event).install());
  ipcMain.handle(IPC.updateAutomatic, (event, enabled: boolean) => { if (typeof enabled !== 'boolean') throw new Error(desktopCatalog.invalidRequest); return requireUpdates(event).setAutomatic(enabled); });
  ipcMain.handle(IPC.updatePage, (event) => { requireUpdates(event); return shell.openExternal(UPDATE_CONFIG.releasePage); });
  ipcMain.handle(IPC.sources, () => sources());
  ipcMain.handle(IPC.select, async (_event, options: CaptureOptions) => {
    if (!options || typeof options.sourceId !== 'string' || ![30, 60].includes(options.fps)) throw new Error(desktopCatalog.invalidRequest);
    const list = await sources();
    if (!list.some((source) => source.id === options.sourceId)) throw new Error(desktopCatalog.invalidSource);
    selection = options;
  });
  ipcMain.handle(IPC.pointerStart, async (_event, sourceId: string) => {
    if (!selection || selection.sourceId !== sourceId) throw new Error(desktopCatalog.invalidSource);
    const nativeRoot = app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(ROOT, 'native');
    await tracker.start(path.join(nativeRoot, 'pointer-tracker.ps1'), sourceId, sourceDisplays.get(sourceId) ?? '', (sample) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.pointer, sample);
    }, (position) => overlays?.contains(position) ?? false);
  });
  ipcMain.handle(IPC.pointerStop, () => tracker.stop());
  ipcMain.handle(IPC.recording, (event, active: boolean) => { if (event.sender !== mainWindow?.webContents || typeof active !== 'boolean') throw new Error(desktopCatalog.invalidRequest); return setRecording(active); });
  ipcMain.handle(IPC.export, async (_event, request: ExportRequest) => withActivity(async () => {
    const result = isSmoke && !request.projectId
      ? await exportVideo(requireWindow(), request, path.join(ROOT, '.qa', `${request.name}.${request.format}`))
      : await library.exportVideo(request, async (target) => { await exportVideo(requireWindow(), request, target); });
    if (result.path) trustedFiles.add(result.path);
    return result;
  }));
  ipcMain.handle(IPC.projectSave, async (_event, data: ProjectData, bytes?: ArrayBuffer, projectId?: string) => withActivity(async () => {
    const result = await library.saveProject(data, bytes, projectId); if (result.path) trustedFiles.add(result.path); return result;
  }));
  ipcMain.handle(IPC.projectOpen, () => openProject(requireWindow()));
  ipcMain.handle(IPC.libraryList, () => library.list());
  ipcMain.handle(IPC.libraryConfigure, (_event, settings: StorageSettings) => withActivity(() => library.configure(settings)));
  ipcMain.handle(IPC.libraryChoose, async (_event, target: StorageTarget) => {
    const directory = await library.storageDirectory(target);
    const selected = await dialog.showOpenDialog(requireWindow(), { title: target === 'projects' ? desktopCatalog.chooseProjectDirectory : desktopCatalog.chooseExportDirectory, defaultPath: directory, properties: ['openDirectory', 'createDirectory'] });
    return selected.canceled ? null : selected.filePaths[0] ?? null;
  });
  ipcMain.handle(IPC.libraryRevealDirectory, async (_event, target: StorageTarget) => {
    const error = await shell.openPath(await library.storageDirectory(target));
    if (error) throw new Error(error);
  });
  ipcMain.handle(IPC.libraryProject, (_event, projectId: string) => library.openProject(projectId));
  ipcMain.handle(IPC.libraryVideo, async (_event, projectId: string, videoId: string) => Uint8Array.from(await readFile(await library.videoPath(projectId, videoId))).buffer);
  ipcMain.handle(IPC.libraryCover, (event, projectId: string, videoId?: string) => {
    if (event.sender !== mainWindow?.webContents) throw new Error(desktopCatalog.invalidRequest);
    const binary = app.isPackaged ? path.join(process.resourcesPath, 'ffmpeg.exe') : path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');
    return library.cover(projectId, binary, videoId);
  });
  ipcMain.handle(IPC.libraryReveal, async (_event, projectId?: string, videoId?: string) => {
    const target = await library.revealPath(projectId, videoId);
    if (projectId) shell.showItemInFolder(target);
    else { const error = await shell.openPath(target); if (error) throw new Error(error); }
  });
  ipcMain.handle(IPC.reveal, (_event, filePath: string) => { if (trustedFiles.has(filePath)) shell.showItemInFolder(filePath); });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: desktopCatalog.appName, width: 1480, height: 960, minWidth: 1080, minHeight: 760,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(ROOT, 'assets/icon.png'),
    backgroundColor: '#141414', show: !isSmoke && !isStartupCheck, frame: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(ROOT, 'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  registerWindowControls(mainWindow);
  overlays = new RecordingOverlays({ mainWindow, preload: path.join(ROOT, 'dist-electron/preload.cjs'), keepMainVisible: isSmoke });
  mainWindow.webContents.on('render-process-gone', () => { recording = false; tracker.stop(); overlays?.stop(); tray?.destroy(); tray = null; });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== mainWindow?.webContents.getURL()) event.preventDefault(); });
  mainWindow.on('close', (event) => {
    if (recording && !isSmoke) {
      event.preventDefault();
      void dialog.showMessageBox(requireWindow(), { title: desktopCatalog.unsavedRecordingTitle, message: desktopCatalog.unsavedRecordingBody, buttons: [desktopCatalog.unsavedRecordingButton] });
    }
  });
  mainWindow.on('closed', () => { overlays?.dispose(); overlays = null; mainWindow = null; });
  const url = process.env.FRAMEFLOW_DEV_URL;
  if (url && url.startsWith(`http://127.0.0.1:${APP_PORT}`)) await mainWindow.loadURL(url);
  else await mainWindow.loadFile(path.join(ROOT, 'dist/index.html'));
}

app.setName(desktopCatalog.appName);
if (app.isPackaged && !isSmoke && !isStartupCheck && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
if (isSmoke || isStartupCheck) app.setPath('userData', path.join(isSmoke ? path.join(ROOT, '.qa') : tmpdir(), isSmoke ? 'smoke-profile' : 'cursorama-startup-profile'));
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  updates = new UpdateService({
    version: app.getVersion(), preferencesFile: path.join(isSmoke || isStartupCheck ? app.getPath('userData') : INSTALL_ROOT, UPDATE_SETTINGS_DIRECTORY, UPDATE_CONFIG.preferencesFile),
    driver: app.isPackaged && process.platform === 'win32' && !isSmoke && !isStartupCheck ? createUpdateDriver(INSTALL_ROOT, () => updates?.reportInstallFailure()) : null,
    canInstall: () => !recording && activeOperations === 0,
    emit: (state) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.updateState, state); },
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(webContents === mainWindow?.webContents && EDITOR_PERMISSIONS.has(permission));
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!selection || !request.userGesture && !isSmoke) { callback({}); return; }
    try {
      const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
      const source = list.find((candidate) => candidate.id === selection?.sourceId);
      if (!source) { callback({}); return; }
      callback({ video: source, audio: selection.systemAudio ? 'loopback' : undefined });
    } catch (error) { console.error('CAPTURE_SOURCE_FAILED', error); callback({}); }
  });
  registerIPC();
  globalShortcut.register(STOP_SHORTCUT, () => { if (recording) mainWindow?.webContents.send(IPC.recordingStop); });
  globalShortcut.register(RECORDING_CONTROLS.pauseShortcut, () => { if (recording) overlays?.command(overlays.current.paused ? 'resume' : 'pause'); });
  await createWindow();
  await updates.start();
  if (isStartupCheck) {
    const ready = await requireWindow().webContents.executeJavaScript(`(async () => {
      const wait = () => new Promise(resolve => setTimeout(resolve, 250));
      await wait();
      const sidebar = document.querySelector('.library-sidebar');
      if (!document.querySelector('.empty-workspace') || !sidebar || sidebar.querySelector('.library-tabs, .library-item, .library-location') || document.querySelector('.preview-stage canvas, .app-footer, .theme-toggle') || !window.desktop || document.title !== 'Cursorama') return false;
      if (document.querySelectorAll('.window-controls button').length !== 3 || getComputedStyle(document.querySelector('.app-header')).getPropertyValue('-webkit-app-region') !== 'drag') return false;
      sidebar.querySelector('[data-action="open-settings"]').click(); await wait();
      if (!document.querySelector('.settings-dialog [aria-label="浅色主题"]') || !document.querySelector('.settings-dialog #storage-projects') || !document.querySelector('.settings-dialog #storage-exports') || !document.querySelector('.empty-workspace')) return false;
      if (document.querySelector('.window-controls').closest('[inert]') || !document.querySelector('.header-actions').inert) return false;
      const updateState = await window.desktop.getUpdateState();
      if (!document.querySelector('.update-settings [data-action="check-updates"]') || updateState.status !== 'unsupported' || !document.querySelector('.update-settings [data-update-status="unsupported"]')) return false;
      document.querySelector('.settings-dialog [aria-label="关闭"]').click(); await wait();
      sidebar.querySelector('[data-page="library"]').click(); await wait();
      if (!document.querySelector('.library-page .library-tabs') || sidebar.querySelector('.library-tabs')) return false;
      sidebar.querySelector('[data-page="workspace"]').click(); await wait();
      return Boolean(document.querySelector('.empty-workspace'));
    })()`) as boolean;
    console.info(ready ? 'Cursorama 打包程序启动检查通过。' : 'Cursorama 打包程序启动检查失败。');
    app.exit(ready ? 0 : 1);
    return;
  }
  if (isSmoke) {
    const { runSmokeTest } = await import('./smoke');
    await runSmokeTest(requireWindow(), ROOT, async (sourceId) => { selection = { sourceId, microphone: false, systemAudio: false, fps: 30 }; });
  }
}).catch((error: unknown) => { console.error(error); app.exit(1); });

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { updates?.dispose(); overlays?.dispose(); tracker.stop(); tray?.destroy(); globalShortcut.unregisterAll(); });

export { sources };
