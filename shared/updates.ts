import metadata from '../package.json';

export type UpdateStatus = 'unsupported' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';
export type UpdateError = 'check' | 'download' | 'install' | 'settings' | 'busy';
export interface UpdateState {
  revision: number;
  supported: boolean;
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  releaseNotes: string;
  automatic: boolean;
  checkedAt: string | null;
  progress: number;
  downloaded: boolean;
  error: UpdateError | null;
}

export const APP_VERSION = metadata.version;
export const UPDATE_CONFIG = {
  owner: 'Mr-Q526', repository: 'Cursorama',
  releasePage: 'https://github.com/Mr-Q526/Cursorama/releases/latest',
  startupDelay: 10_000, checkInterval: 4 * 60 * 60 * 1000,
  preferencesVersion: 1, preferencesFile: 'updates.json',
  minimumProgress: 0, maximumProgress: 100, notesLimit: 6000,
} as const;

export function initialUpdateState(version: string, supported: boolean): UpdateState {
  return { revision: 0, supported, status: supported ? 'idle' : 'unsupported', currentVersion: version, latestVersion: null, releaseNotes: '', automatic: true, checkedAt: null, progress: UPDATE_CONFIG.minimumProgress, downloaded: false, error: null };
}
