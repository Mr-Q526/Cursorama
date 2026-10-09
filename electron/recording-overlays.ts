import { BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent, type Point } from 'electron';
import { initialRecordingOverlay, IPC, isRecordingCommand, isRecordingProgress, RECORDING_CONTROLS, type RecordingCommand, type RecordingOverlayState, type RecordingProgress, type RecordingSurface } from '../shared';
import { desktopCatalog } from './catalog';

export interface RecordingOverlayOptions {
  mainWindow: BrowserWindow;
  preload: string;
  keepMainVisible: boolean;
}

const COMPOSITION_DELAY = 160;

export class RecordingOverlays {
  private state: RecordingOverlayState = initialRecordingOverlay();
  private dock: BrowserWindow | null = null;
  private prompter: BrowserWindow | null = null;
  private pendingCommand: RecordingCommand | null = null;
  private commandTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: RecordingOverlayOptions) { this.registerIPC(); }
  get current(): RecordingOverlayState { return { ...this.state }; }

  private requireSender(event: IpcMainInvokeEvent, mainOnly = false): void {
    const windows = mainOnly ? [this.options.mainWindow] : [this.options.mainWindow, this.dock, this.prompter];
    if (!windows.some((window) => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame)) throw new Error(desktopCatalog.invalidRequest);
  }

  private registerIPC(): void {
    ipcMain.handle(IPC.recordingOverlayGet, (event) => { this.requireSender(event); return this.current; });
    ipcMain.handle(IPC.recordingProgress, (event, value: unknown) => {
      this.requireSender(event, true);
      if (!isRecordingProgress(value)) throw new Error(desktopCatalog.invalidRequest);
      this.sync(value);
    });
    ipcMain.handle(IPC.recordingCommandRequest, (event, command: unknown) => {
      this.requireSender(event);
      if (!isRecordingCommand(command)) throw new Error(desktopCatalog.invalidRequest);
      this.command(command);
    });
    ipcMain.handle(IPC.prompterConfigure, (event, script: unknown, enabled: unknown) => {
      this.requireSender(event, true);
      if (this.state.active || typeof script !== 'string' || script.length > RECORDING_CONTROLS.scriptLimit || typeof enabled !== 'boolean') throw new Error(desktopCatalog.invalidRequest);
      this.state = { ...this.state, script, prompterVisible: enabled && script.trim().length > 0 };
    });
    ipcMain.handle(IPC.prompterToggle, async (event) => {
      this.requireSender(event);
      if (!this.state.active) return;
      if (this.prompter?.isVisible()) { this.prompter.hide(); this.state.prompterVisible = false; }
      else {
        if (!this.prompter) this.prompter = await this.createSurface('teleprompter');
        if (!this.state.active) { this.prompter?.destroy(); this.prompter = null; return; }
        this.prompter.showInactive(); this.state.prompterVisible = true;
      }
      this.publish();
    });
  }

  async start(): Promise<void> {
    if (this.state.active) return;
    this.state = { ...this.state, active: true, paused: false, elapsed: 0, pending: true };
    try {
      this.dock = await this.createSurface('recording-dock');
      if (this.state.prompterVisible) this.prompter = await this.createSurface('teleprompter');
      if (!this.options.keepMainVisible) this.options.mainWindow.hide();
      this.dock.showInactive(); this.prompter?.showInactive(); this.publish();
      await new Promise<void>((resolve) => setTimeout(resolve, COMPOSITION_DELAY));
    } catch (error) { this.stop(); throw error; }
  }

  private async createSurface(surface: RecordingSurface): Promise<BrowserWindow> {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const dock = surface === 'recording-dock';
    const size = dock ? RECORDING_CONTROLS.dock : RECORDING_CONTROLS.prompter;
    const window = new BrowserWindow({
      title: dock ? desktopCatalog.recordingDock : desktopCatalog.teleprompter,
      frame: false, show: false, skipTaskbar: true, alwaysOnTop: true,
      resizable: !dock, maximizable: false, minimizable: false, fullscreenable: false,
      width: size.width, height: size.height,
      minWidth: dock ? size.width : RECORDING_CONTROLS.prompter.minimumWidth,
      minHeight: dock ? size.height : RECORDING_CONTROLS.prompter.minimumHeight,
      x: Math.round(display.x + (display.width - size.width) / 2),
      y: dock ? display.y + display.height - size.height - RECORDING_CONTROLS.dock.edge : display.y + RECORDING_CONTROLS.dock.edge,
      backgroundColor: '#171717',
      webPreferences: { preload: this.options.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    if (dock) this.dock = window; else this.prompter = window;
    window.setContentProtection(true);
    window.setAlwaysOnTop(true, 'floating');
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const url = new URL(this.options.mainWindow.webContents.getURL()); url.hash = `/${surface}`;
    window.webContents.on('will-navigate', (event, next) => { if (next !== url.href) event.preventDefault(); });
    window.on('close', (event) => {
      if (!this.state.active) return;
      event.preventDefault();
      if (dock) this.command('stop');
      else { window.hide(); this.state.prompterVisible = false; this.publish(); }
    });
    try { await window.loadURL(url.href); return window; }
    catch (error) { window.destroy(); throw error; }
  }

  sync(progress: RecordingProgress): void {
    if (!this.state.active) return;
    this.state = { ...this.state, elapsed: progress.elapsed, paused: progress.paused };
    if (!this.pendingCommand) this.state.pending = false;
    if (this.pendingCommand === 'pause' && progress.paused || this.pendingCommand === 'resume' && !progress.paused) this.clearCommand();
    this.publish();
  }

  command(command: RecordingCommand): void {
    if (!this.state.active || this.options.mainWindow.isDestroyed()) return;
    if (this.state.pending && !this.pendingCommand) return;
    if (this.pendingCommand && command !== 'stop') return;
    if (command === 'pause' && this.state.paused || command === 'resume' && !this.state.paused) return;
    this.clearCommand(); this.pendingCommand = command; this.state.pending = true; this.publish();
    this.commandTimer = setTimeout(() => { this.clearCommand(); this.publish(); }, RECORDING_CONTROLS.commandTimeout);
    this.options.mainWindow.webContents.send(IPC.recordingCommand, command);
  }

  contains(point: Point): boolean {
    return [this.dock, this.prompter].some((window) => {
      if (!window || window.isDestroyed() || !window.isVisible()) return false;
      const bounds = window.getBounds();
      return point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height;
    });
  }

  private clearCommand(): void {
    if (this.commandTimer) clearTimeout(this.commandTimer);
    this.commandTimer = null; this.pendingCommand = null; this.state.pending = false;
  }

  private publish(): void {
    for (const window of [this.options.mainWindow, this.dock, this.prompter]) if (window && !window.isDestroyed()) window.webContents.send(IPC.recordingOverlayState, this.current);
  }

  stop(): void {
    this.state.active = false; this.clearCommand();
    this.dock?.destroy(); this.prompter?.destroy(); this.dock = null; this.prompter = null;
    this.state.prompterVisible = false; this.publish();
    if (!this.options.keepMainVisible && !this.options.mainWindow.isDestroyed()) this.options.mainWindow.show();
  }

  dispose(): void {
    this.state.active = false; this.clearCommand(); this.dock?.destroy(); this.prompter?.destroy();
    this.dock = null; this.prompter = null;
    for (const channel of [IPC.recordingOverlayGet, IPC.recordingProgress, IPC.recordingCommandRequest, IPC.prompterConfigure, IPC.prompterToggle]) ipcMain.removeHandler(channel);
  }
}
