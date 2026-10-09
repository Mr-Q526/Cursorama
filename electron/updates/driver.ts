import path from 'node:path';
import { existsSync } from 'node:fs';
import { NsisUpdater, type ProgressInfo } from 'electron-updater';
import { UPDATE_CONFIG } from '../../shared';
import type { UpdateDriver } from './service';

export function createUpdateDriver(installRoot: string, onInstallError: () => void): UpdateDriver {
  const updater = new NsisUpdater({ provider: 'github', owner: UPDATE_CONFIG.owner, repo: UPDATE_CONFIG.repository });
  return configureUpdateDriver(updater, installRoot, onInstallError);
}

export function configureUpdateDriver(updater: NsisUpdater, installRoot: string, onInstallError: () => void): UpdateDriver {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;
  updater.installDirectory = installRoot;
  const errorHandler = (error: Error): void => { console.error('UPDATE_DRIVER_FAILED', error); onInstallError(); };
  updater.on('error', errorHandler);
  return {
    async check() {
      const result = await updater.checkForUpdates();
      if (!result?.isUpdateAvailable) return null;
      const notes = result.updateInfo.releaseNotes;
      return { version: result.updateInfo.version, notes: typeof notes === 'string' ? notes : notes?.map((item) => item.note ?? '').join('\n\n') ?? '' };
    },
    async download(progress) {
      const listener = (info: ProgressInfo): void => progress(info.percent);
      updater.on('download-progress', listener);
      try { const files = await updater.downloadUpdate(); if (!files.length) throw new Error('UPDATE_DOWNLOAD_EMPTY'); }
      finally { updater.removeListener('download-progress', listener); }
    },
    install() {
      const installed = existsSync(path.join(installRoot, 'Uninstall Cursorama.exe'));
      updater.quitAndInstall(installed, true);
    },
    dispose() { updater.removeListener('error', errorHandler); },
  };
}
