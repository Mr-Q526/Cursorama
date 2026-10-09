import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initialUpdateState, UPDATE_CONFIG, type UpdateError, type UpdateState } from '../../shared';
import { atomicReplace } from '../../storage/files';

export interface UpdateDetails { version: string; notes: string; }
export interface UpdateDriver {
  check(): Promise<UpdateDetails | null>;
  download(progress: (percent: number) => void): Promise<void>;
  install(): void;
  dispose(): void;
}
export interface UpdateServiceOptions {
  version: string;
  preferencesFile: string;
  driver: UpdateDriver | null;
  canInstall: () => boolean;
  emit: (state: UpdateState) => void;
}

export class UpdateService {
  private state: UpdateState;
  private checking: Promise<UpdateState> | null = null;
  private downloading: Promise<UpdateState> | null = null;
  private startup: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private preferenceQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: UpdateServiceOptions) { this.state = initialUpdateState(options.version, options.driver !== null); }
  get current(): UpdateState { return { ...this.state }; }

  private change(next: Partial<UpdateState>): UpdateState {
    this.state = { ...this.state, ...next, revision: this.state.revision + 1 };
    if (!this.disposed) this.options.emit(this.current);
    return this.current;
  }

  async start(): Promise<void> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.options.preferencesFile, 'utf8'));
      if (raw && typeof raw === 'object' && 'version' in raw && raw.version === UPDATE_CONFIG.preferencesVersion && 'automatic' in raw && typeof raw.automatic === 'boolean') this.change({ automatic: raw.automatic });
      else throw new Error('INVALID_UPDATE_PREFERENCES');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('UPDATE_PREFERENCES_READ_FAILED', error);
    }
    this.schedule();
  }

  private schedule(): void {
    this.clearTimers();
    if (!this.state.supported || !this.state.automatic || this.disposed) return;
    this.startup = setTimeout(() => { this.startup = null; void this.check(); }, UPDATE_CONFIG.startupDelay);
    this.interval = setInterval(() => { void this.check(); }, UPDATE_CONFIG.checkInterval);
    this.startup.unref(); this.interval.unref();
  }

  private clearTimers(): void {
    if (this.startup) clearTimeout(this.startup);
    if (this.interval) clearInterval(this.interval);
    this.startup = null; this.interval = null;
  }

  setAutomatic(enabled: boolean): Promise<UpdateState> {
    const operation = this.preferenceQueue.then(async () => {
      if (typeof enabled !== 'boolean') throw new Error('INVALID_UPDATE_PREFERENCE');
      const parent = path.dirname(this.options.preferencesFile);
      const temporary = path.join(parent, `${randomUUID()}.partial`);
      try {
        await mkdir(parent, { recursive: true });
        await writeFile(temporary, JSON.stringify({ version: UPDATE_CONFIG.preferencesVersion, automatic: enabled }), { flag: 'wx' });
        await atomicReplace(temporary, this.options.preferencesFile);
        this.change({ automatic: enabled, error: null }); this.schedule();
      } catch (error) { console.error('UPDATE_PREFERENCES_WRITE_FAILED', error); this.change({ error: 'settings' }); }
      finally { await rm(temporary, { force: true }); }
      return this.current;
    });
    this.preferenceQueue = operation.catch((error: unknown) => { console.error('UPDATE_PREFERENCES_QUEUE_FAILED', error); });
    return operation;
  }

  check(): Promise<UpdateState> {
    if (!this.options.driver || this.disposed || this.downloading || this.state.downloaded || this.state.status === 'installing') return Promise.resolve(this.current);
    if (this.checking) return this.checking;
    if (this.startup) { clearTimeout(this.startup); this.startup = null; }
    this.checking = this.performCheck().finally(() => { this.checking = null; });
    return this.checking;
  }

  private async performCheck(): Promise<UpdateState> {
    this.change({ status: 'checking', error: null, latestVersion: null, releaseNotes: '', progress: UPDATE_CONFIG.minimumProgress });
    try {
      const details = await this.options.driver?.check();
      if (!this.disposed) this.change({ status: details ? 'available' : 'current', latestVersion: details?.version ?? null, releaseNotes: details?.notes.slice(0, UPDATE_CONFIG.notesLimit) ?? '', checkedAt: new Date().toISOString() });
    } catch (error) { console.error('UPDATE_CHECK_FAILED', error); if (!this.disposed) this.change({ status: 'error', error: 'check' }); }
    return this.current;
  }

  download(): Promise<UpdateState> {
    if (this.downloading) return this.downloading;
    if (!this.options.driver || this.disposed || !this.state.latestVersion || this.state.downloaded || this.checking || this.state.status === 'installing') return Promise.resolve(this.current);
    this.downloading = this.performDownload().finally(() => { this.downloading = null; });
    return this.downloading;
  }

  private async performDownload(): Promise<UpdateState> {
    this.change({ status: 'downloading', error: null, progress: UPDATE_CONFIG.minimumProgress });
    try {
      await this.options.driver?.download((percent) => {
        if (!this.disposed && Number.isFinite(percent)) this.change({ progress: Math.max(UPDATE_CONFIG.minimumProgress, Math.min(UPDATE_CONFIG.maximumProgress, percent)) });
      });
      if (!this.disposed) this.change({ status: 'downloaded', downloaded: true, progress: UPDATE_CONFIG.maximumProgress });
    } catch (error) { console.error('UPDATE_DOWNLOAD_FAILED', error); if (!this.disposed) this.change({ status: 'error', error: 'download', downloaded: false }); }
    return this.current;
  }

  install(): UpdateState {
    if (!this.options.driver || this.disposed || !this.state.downloaded || this.state.status === 'installing') return this.current;
    if (!this.options.canInstall()) return this.change({ error: 'busy' });
    this.change({ status: 'installing', error: null });
    try { this.options.driver.install(); }
    catch (error) { console.error('UPDATE_INSTALL_FAILED', error); this.reportInstallFailure(); }
    return this.current;
  }

  reportInstallFailure(): void { if (this.state.status === 'installing') this.change({ status: 'error', error: 'install' satisfies UpdateError }); }
  dispose(): void { this.disposed = true; this.clearTimers(); this.options.driver?.dispose(); }
}
