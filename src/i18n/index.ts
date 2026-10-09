import { demoCatalog } from './demo';
import { appearanceCatalog } from './appearance';
import { editorCatalog } from './editor';
import { exportCatalog } from './export';
import { recordingCatalog } from './recording';
import { libraryCatalog } from './library';
import { backgroundCatalog } from './background';
import { navigationCatalog } from './navigation';
import { settingsCatalog } from './settings';

export { editorCatalog, demoCatalog, exportCatalog, recordingCatalog, appearanceCatalog };
export * from './library';
export { backgroundCatalog };
export type { BackgroundCatalog } from './background';
export * from './navigation';
export * from './settings';
export const t = { editor: editorCatalog, demo: demoCatalog, export: exportCatalog, recording: recordingCatalog, appearance: appearanceCatalog, library: libraryCatalog, background: backgroundCatalog, navigation: navigationCatalog, settings: settingsCatalog };
export const formatTime = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  return `${Math.floor(safeSeconds / 60).toString().padStart(2, '0')}:${Math.floor(safeSeconds % 60).toString().padStart(2, '0')}`;
};
export const formatPreciseTime = (seconds: number): string => `${formatTime(seconds)}.${Math.floor((seconds % 1) * 10)}`;
export const formatMultiplier = (amount: number): string => `${amount.toFixed(2)}×`;
export const formatSeconds = (seconds: number): string => `${seconds.toFixed(1)} 秒`;
export const formatDegrees = (degrees: number): string => `${degrees}°`;
export const formatPixels = (pixels: number): string => `${pixels} px`;
export const formatPercent = (amount: number): string => `${Math.round(amount)}%`;
export const formatFps = (fps: number): string => `${fps} fps`;
