import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { NsisUpdater } from 'electron-updater';
import type { AppAdapter } from 'electron-updater/out/AppAdapter';
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor';
import type { InstallOptions } from 'electron-updater/out/BaseUpdater';
import { configureUpdateDriver, UpdateService } from '../electron/updates';
import { registerWindowControls } from '../electron/window';
import { APP_VERSION, IPC, UPDATE_CONFIG, type AboutLink, type UpdateState } from '../shared';
import { LocalLibrary } from '../storage/library';
import { runWindowUIQA, type WindowUIReport } from './window-ui-qa';
import { runSettingsUIQA, type SettingsUIReport } from './settings-ui-qa';

export interface UpdateIntegrationReport {
  check: boolean; download: boolean; hashVerified: boolean; corruptedRejected: boolean;
  installTriggered: boolean; currentVersion: boolean; downgradeBlocked: boolean; ui: boolean;
  windowControls: WindowUIReport;
  settings: SettingsUIReport;
}

const QA = { initialVersion: '0.1.0', filename: `Cursorama-Setup-${APP_VERSION}-x64.exe`, latest: APP_VERSION, loopback: '127.0.0.1', timeout: 120_000, downloadProgress: 9 } as const;
const root = process.cwd();
const output = path.join(root, '.qa');
const HTML_NOTES = '<h2>剪辑与字幕</h2><ul><li><strong>基础剪辑</strong>：支持分割、裁剪与倍速。</li><li>增加音乐 &amp; 字幕，兼容旧工程。</li></ul><p>安装 <code>Cursorama.exe</code>，查看 <a href="https://cursorama-qa.invalid/guide" onclick="window.cursoramaNotesExecuted=true">使用指南</a>。</p><img src="https://cursorama-qa.invalid/should-not-load.png" onerror="window.cursoramaNotesExecuted=true"><script>window.cursoramaNotesExecuted=true</script><iframe src="https://cursorama-qa.invalid/frame"></iframe>';
app.setPath('userData', path.join(output, 'updates-test-profile'));
app.on('window-all-closed', () => undefined);

class TestUpdater extends NsisUpdater {
  readonly httpExecutor: ElectronHttpExecutor;
  installOptions: InstallOptions | null = null;
  constructor(url: string, adapter: AppAdapter) {
    super(null, adapter);
    this.httpExecutor = new ElectronHttpExecutor();
    this.setFeedURL({ provider: 'generic', url });
    this.disableDifferentialDownload = true;
  }
  protected override doInstall(options: InstallOptions): boolean { this.installOptions = options; return true; }
}

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

async function fileHash(file: string): Promise<string> {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('base64');
}

async function run(): Promise<UpdateIntegrationReport> {
  await mkdir(output, { recursive: true });
  const workspace = await mkdtemp(path.join(output, 'updates-integration-'));
  const installer = path.join(root, 'release', QA.filename);
  const installerSize = (await stat(installer)).size;
  const expected = await fileHash(installer);
  let servedVersion: string = QA.latest;
  let corrupted = true;
  const fail = (response: ServerResponse, error: unknown): void => { console.error('QA_UPDATE_SERVER_FAILED', error); response.destroy(error instanceof Error ? error : undefined); };
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/latest.yml')) {
      response.setHeader('Content-Type', 'text/yaml');
      response.end(`version: ${servedVersion}\nfiles:\n  - url: ${QA.filename}\n    sha512: ${expected}\n    size: ${installerSize}\nreleaseNotes: 自动更新验证\nreleaseDate: '${new Date().toISOString()}'\n`);
    } else if (request.url?.startsWith(`/${QA.filename}`)) {
      if (corrupted) { response.end('损坏的安装包'); return; }
      response.setHeader('Content-Type', 'application/octet-stream'); response.setHeader('Content-Length', installerSize);
      const stream = createReadStream(installer); stream.on('error', (error) => fail(response, error)); stream.pipe(response);
    } else { response.statusCode = 404; response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, QA.loopback, resolve));
  const address = server.address(); assert(address && typeof address === 'object', 'QA_UPDATE_SERVER_NOT_READY');
  const quitEvents: boolean[] = [];
  const adapter: AppAdapter = {
    version: QA.initialVersion, name: 'CursoramaUpdateQA', isPackaged: true,
    appUpdateConfigPath: path.join(workspace, 'update-config.yml'), userDataPath: workspace, baseCachePath: workspace,
    whenReady: () => Promise.resolve(), relaunch: () => undefined, quit: () => { quitEvents.push(true); },
    onQuit: () => undefined,
  };
  await writeFile(adapter.appUpdateConfigPath, 'updaterCacheDirName: cursorama-qa-updater\n');
  await writeFile(path.join(workspace, 'Uninstall Cursorama.exe'), '仅用于安装模式验证');
  const updater = new TestUpdater(`http://${QA.loopback}:${address.port}/`, adapter);
  updater.logger = { info: () => undefined, warn: (message: unknown) => console.warn('QA_UPDATER_WARNING', message), error: (message: unknown) => console.info('QA_EXPECTED_DOWNLOAD_REJECTION', message) };
  const driver = configureUpdateDriver(updater, workspace, () => undefined);
  const service = new UpdateService({ version: QA.initialVersion, preferencesFile: path.join(workspace, UPDATE_CONFIG.preferencesFile), driver, canInstall: () => true, emit: () => undefined });
  try {
    await service.setAutomatic(false);
    await service.check(); assert(service.current.status === 'available' && service.current.latestVersion === QA.latest, 'QA_UPDATE_CHECK_FAILED');
    await service.download(); assert(service.current.error === 'download' && !service.current.downloaded, 'QA_UPDATE_CORRUPTED_ACCEPTED');
    corrupted = false;
    await service.download(); assert(service.current.status === 'downloaded' && service.current.progress === UPDATE_CONFIG.maximumProgress, 'QA_UPDATE_DOWNLOAD_FAILED');
    const downloaded = await updater.downloadUpdate(); assert(downloaded.length === 1 && await fileHash(downloaded[0]) === expected, 'QA_UPDATE_HASH_FAILED');
    service.install(); await new Promise<void>((resolve) => setImmediate(resolve));
    assert(updater.installOptions?.isSilent && updater.installOptions.isForceRunAfter && quitEvents.length === 1, 'QA_UPDATE_INSTALL_NOT_TRIGGERED');
    servedVersion = QA.initialVersion;
    const current = await updater.checkForUpdates(); assert(current && !current.isUpdateAvailable, 'QA_CURRENT_VERSION_WRONG');
    servedVersion = '0.0.9';
    const downgrade = await updater.checkForUpdates(); assert(downgrade && !downgrade.isUpdateAvailable, 'QA_DOWNGRADE_ALLOWED');
    const library = new LocalLibrary(path.join(workspace, 'ui-library'));
    ipcMain.handle(IPC.libraryList, () => library.list());
    const state: UpdateState = { ...service.current, status: 'available', latestVersion: QA.latest, releaseNotes: HTML_NOTES, automatic: true, downloaded: false, error: null };
    ipcMain.handle(IPC.updateGet, () => state);
    ipcMain.handle(IPC.updateAutomatic, (_event, enabled: boolean) => { state.automatic = enabled; state.revision++; return state; });
    const ui = new BrowserWindow({ frame: false, show: false, width: 1480, height: 960, webPreferences: { preload: path.join(root, 'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const publish = (patch: Partial<UpdateState>): UpdateState => { Object.assign(state, patch, { revision: state.revision + 1 }); ui.webContents.send(IPC.updateState, state); return state; };
    ipcMain.handle(IPC.updateCheck, () => publish({ status: 'checking', error: null }));
    ipcMain.handle(IPC.updateDownload, () => publish({ status: 'downloading', progress: QA.downloadProgress, error: null }));
    let notesRequests = 0;
    ui.webContents.session.webRequest.onBeforeRequest({ urls: ['https://cursorama-qa.invalid/*'] }, (_details, callback) => { notesRequests++; callback({ cancel: true }); });
    registerWindowControls(ui);
    await ui.loadFile(path.join(root, 'dist', 'index.html'));
    ui.showInactive();
    const openedLinks: AboutLink[] = [];
    ipcMain.handle(IPC.aboutLink, (_event, target: AboutLink) => { openedLinks.push(target); });
    const settings = await runSettingsUIQA(ui, output, { currentVersion: APP_VERSION, notes: HTML_NOTES, setState: publish, resourceRequests: () => notesRequests, openedLinks: () => openedLinks });
    const windowControls = await runWindowUIQA(ui, output);
    return { check: true, download: true, hashVerified: true, corruptedRejected: true, installTriggered: true, currentVersion: true, downgradeBlocked: true, ui: true, windowControls, settings };
  } finally { service.dispose(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

app.whenReady().then(async () => {
  const timeout = setTimeout(() => { console.error('QA_UPDATE_TIMEOUT'); app.exit(1); }, QA.timeout);
  try { const report = await run(); await writeFile(path.join(output, 'updates-integration-report.json'), JSON.stringify(report, null, 2)); console.info('更新检查、下载校验、损坏拒绝、安装触发与设置界面验证通过。'); app.exit(0); }
  catch (error) { console.error('QA_UPDATES_FAILED', error); app.exit(1); }
  finally { clearTimeout(timeout); }
}).catch((error: unknown) => { console.error('QA_UPDATE_START_FAILED', error); app.exit(1); });

export { run as runUpdateIntegrationQA };
