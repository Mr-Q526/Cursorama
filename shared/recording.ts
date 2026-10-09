export type RecordingCommand = 'pause' | 'resume' | 'stop';
export type RecordingSurface = 'recording-dock' | 'teleprompter';
export interface RecordingProgress { elapsed: number; paused: boolean; }
export interface RecordingOverlayState extends RecordingProgress {
  active: boolean;
  pending: boolean;
  prompterVisible: boolean;
  script: string;
}

export const RECORDING_CONTROLS = {
  interval: 200,
  commandTimeout: 5000,
  pauseShortcut: 'CommandOrControl+Shift+F8',
  scriptLimit: 30_000,
  scriptStorageKey: 'cursorama-prompter-script',
  enabledStorageKey: 'cursorama-prompter-enabled',
  dock: { width: 336, height: 72, edge: 22 },
  prompter: { width: 540, height: 400, minimumWidth: 360, minimumHeight: 260 },
  speed: { default: 32, minimum: 8, maximum: 100 },
  font: { default: 28, minimum: 18, maximum: 48 },
} as const;

export function initialRecordingOverlay(): RecordingOverlayState {
  return { active: false, paused: false, elapsed: 0, pending: false, prompterVisible: false, script: '' };
}

export function isRecordingCommand(value: unknown): value is RecordingCommand {
  return value === 'pause' || value === 'resume' || value === 'stop';
}

export function isRecordingProgress(value: unknown): value is RecordingProgress {
  return Boolean(value && typeof value === 'object' && 'elapsed' in value && typeof value.elapsed === 'number' && Number.isFinite(value.elapsed) && value.elapsed >= 0 && 'paused' in value && typeof value.paused === 'boolean');
}
