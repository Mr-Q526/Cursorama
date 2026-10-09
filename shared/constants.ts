import type { AspectRatio, BackgroundId, EffectMode, ExportResolution, VisualSettings } from './types';

export const APP_PORT = 5178;
export const IPC = {
  windowGet: 'window:get',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowState: 'window:state',
  sources: 'capture:sources',
  select: 'capture:select',
  pointerStart: 'pointer:start',
  pointerStop: 'pointer:stop',
  pointer: 'pointer:sample',
  recording: 'capture:state',
  recordingStop: 'capture:stop',
  recordingProgress: 'capture:progress',
  recordingOverlayGet: 'capture:overlay-get',
  recordingOverlayState: 'capture:overlay-state',
  recordingCommand: 'capture:command',
  recordingCommandRequest: 'capture:command-request',
  prompterConfigure: 'capture:prompter-configure',
  prompterToggle: 'capture:prompter-toggle',
  export: 'export:video',
  encodeProgress: 'export:progress',
  projectSave: 'project:save',
  projectOpen: 'project:open',
  libraryList: 'library:list',
  libraryConfigure: 'library:configure',
  libraryChoose: 'library:choose-directory',
  libraryRevealDirectory: 'library:reveal-directory',
  libraryProject: 'library:project',
  libraryVideo: 'library:video',
  libraryReveal: 'library:reveal',
  reveal: 'file:reveal',
  updateGet: 'updates:get',
  updateCheck: 'updates:check',
  updateDownload: 'updates:download',
  updateInstall: 'updates:install',
  updateAutomatic: 'updates:automatic',
  updatePage: 'updates:page',
  updateState: 'updates:state',
} as const;

export const TIME = {
  milliseconds: 1000,
  secondsPerMinute: 60,
  pointerInterval: 16,
  uiInterval: 80,
  recordingChunk: 1000,
  clickDuration: 0.7,
  minimumDuration: 0.2,
  seekTimeout: 5000,
} as const;

export const CAPTURE_TIMING = { defaultCountdown: 3, choices: [0, 3, 5, 10], maximumCountdown: 60 } as const;

export const MOTION = {
  leadIn: 0.45,
  holdAfterClick: 2.0,
  mergeGap: 1.5,
  settleDuration: 0.65,
  smoothingWindow: 0.3,
  cursorLag: 0.07,
  edgeInset: 0.03,
  degreesToRadians: Math.PI / 180,
  perspective: 3.8,
} as const;

export const DEFAULT_SETTINGS: VisualSettings = {
  mode: 'cinematic', autoZoom: true, followCursor: true, zoom: 1.85,
  tilt: 12, easing: 0.6, background: 'paper', padding: 9, radius: 18,
  backgroundBlur: 0, backgroundDim: 0,
  edgeGlass: 55, shadow: 45, aspect: '16:9', cursor: 'arrow', cursorSize: 28,
  clickEffect: true, spotlight: false,
};

export const PRESETS: Record<EffectMode, Pick<VisualSettings, 'zoom' | 'tilt'>> = {
  focus: { zoom: 2, tilt: 0 },
  cinematic: { zoom: 1.85, tilt: 12 },
  orbit: { zoom: 1.55, tilt: 23 },
  overview: { zoom: 1, tilt: 0 },
};

export const BACKGROUNDS: Record<BackgroundId, readonly [string, string, string]> = {
  silver: ['#bababa', '#eeeeee', '#a1a1a1'],
  smoke: ['#c9c9c9', '#f5f5f5', '#a7a7a7'],
  graphite: ['#555555', '#888888', '#353535'],
  charcoal: ['#222222', '#464646', '#171717'],
  ink: ['#080808', '#202020', '#000000'],
  paper: ['#eeeeee', '#ffffff', '#dedede'],
  bloom: ['#071830', '#367dc8', '#193e81'],
  silk: ['#f4f4f3', '#d7d8da', '#9a9da2'],
  aurora: ['#c3b1e1', '#8766bf', '#171d50'],
  dunes: ['#8ca3bb', '#eedac6', '#b77c5d'],
};

export const WALLPAPER_IDS = ['bloom', 'silk', 'aurora', 'dunes'] as const;
export const NEUTRAL_BACKGROUND_IDS = ['silver', 'smoke', 'graphite', 'charcoal', 'ink', 'paper'] as const;
export const BACKGROUND_LIMITS = { blur: 24, dim: 60, referenceHeight: 1080, blurOverscan: 3 } as const;
export const FRAME_LIMITS = { edgeGlass: 100, referenceWidth: 1280, glassOutset: 16, glassBlur: 14, glassFeather: 2 } as const;

export const ASPECTS: Record<AspectRatio, number> = {
  '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:3': 4 / 3,
};
export const RESOLUTIONS: Record<ExportResolution, number> = { '720p': 720, '1080p': 1080, '1440p': 1440, '2160p': 2160 };
export const MEDIA_MIME = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] as const;
export const PROJECT_EXTENSION = 'cursorama';
export const PROJECT_SCHEMA_VERSION = 1;
export const LIBRARY_API = '/api/library';
export const LIBRARY_MUTATION_HEADER = 'x-cursorama-local';
export const AUTOSAVE_DELAY = 1000;
