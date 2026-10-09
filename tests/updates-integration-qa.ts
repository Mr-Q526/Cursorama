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
import { IPC, UPDATE_CONFIG } from '../shared';
import { LocalLibrary } from '../storage/library';
import { runWindowUIQA, type WindowUIReport } from './window-ui-qa';

export interface UpdateIntegrationReport {
  check: boolean; download: boolean; hashVerified: boolean; corruptedRejected: boolean;
  installTriggered: boolean; currentVersion: boolean; downgradeBlocked: boolean; ui: boolean;
  windowControls: WindowUIReport;
}

const QA = { initialVersion: '0.1.0', filename: 'Cursorama-Setup-0.1.1-x64.exe', latest: '0.1.1', loopback: '127.0.0.1', timeout: 120_000 } as const;
const root = process.cwd();
const output = path.join(root, '.qa');
app.setPath('userData', path.join(output, 'updates-test-profile'));

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
    const state = { ...service.current, status: 'available' as const, latestVersion: QA.latest, downloaded: false, error: null };
    ipcMain.handle(IPC.updateGet, () => state);
    ipcMain.handle(IPC.updateAutomatic, (_event, enabled: boolean) => { state.automatic = enabled; state.revision++; return state; });
    const ui = new BrowserWindow({ frame: false, show: false, width: 1480, height: 960, webPreferences: { preload: path.join(root, 'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    registerWindowControls(ui);
    await ui.loadFile(path.join(root, 'dist', 'index.html'));
    await ui.webContents.executeJavaScript(`document.querySelector('[data-action="open-settings"]').click(); new Promise(resolve => setTimeout(resolve, 400))`);
    const visible = await ui.webContents.executeJavaScript(`Boolean(document.querySelector('.update-settings [data-action="check-updates"]') && document.querySelector('[data-update-status="available"]') && document.querySelector('[data-action="download-update"]'))`) as boolean;
    assert(visible, 'QA_UPDATE_UI_MISSING');
    ui.showInactive();
    await ui.webContents.executeJavaScript(`document.querySelector('.update-settings').scrollIntoView({block:'end'}); new Promise(resolve => setTimeout(resolve, 500))`);
    await writeFile(path.join(output, 'update-settings.png'), (await ui.webContents.capturePage()).toPNG());
    const windowControls = await runWindowUIQA(ui, output);
    return { check: true, download: true, hashVerified: true, corruptedRejected: true, installTriggered: true, currentVersion: true, downgradeBlocked: true, ui: true, windowControls };
  } finally { service.dispose(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

app.whenReady().then(async () => {
  const timeout = setTimeout(() => { console.error('QA_UPDATE_TIMEOUT'); app.exit(1); }, QA.timeout);
  try { const report = await run(); await writeFile(path.join(output, 'updates-integration-report.json'), JSON.stringify(report, null, 2)); console.info('更新检查、下载校验、损坏拒绝、安装触发与设置界面验证通过。'); app.exit(0); }
  catch (error) { console.error('QA_UPDATES_FAILED', error); app.exit(1); }
  finally { clearTimeout(timeout); }
}).catch((error: unknown) => { console.error('QA_UPDATE_START_FAILED', error); app.exit(1); });

export { run as runUpdateIntegrationQA };
