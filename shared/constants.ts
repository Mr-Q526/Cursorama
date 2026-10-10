import type { AspectRatio, BackgroundId, EffectMode, ExportResolution, VisualSettings } from './types';
import { DEFAULT_FOCUS_SOUND } from './focus-sound';

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
  libraryCover: 'library:cover',
  libraryReveal: 'library:reveal',
  reveal: 'file:reveal',
  updateGet: 'updates:get',
  updateCheck: 'updates:check',
  updateDownload: 'updates:download',
  updateInstall: 'updates:install',
  updateAutomatic: 'updates:automatic',
  updatePage: 'updates:page',
  updateState: 'updates:state',
  aboutLink: 'about:open-link',
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
  leadIn: 0,
  holdAfterClick: 1.6,
  holdAfterTyping: 2.2,
  holdAfterScroll: 1.4,
  holdAfterDrag: 1.5,
  mergeGap: 0.3,
  settleDuration: 0.85,
  focusPan: 0.6,
  focusDeadZone: 0.06,
  focusRegionCoverage: 0.78,
  maximumZoom: 4,
  typingTilt: 0.15,
  zoomInRatio: 0.7,
  pointerSmoothingSamples: 6,
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
  focusSound: { ...DEFAULT_FOCUS_SOUND },
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
  custom: ['#eeeeee', '#ffffff', '#dedede'],
  bloom: ['#071830', '#367dc8', '#193e81'],
  silk: ['#f4f4f3', '#d7d8da', '#9a9da2'],
  aurora: ['#c3b1e1', '#8766bf', '#171d50'],
  dunes: ['#8ca3bb', '#eedac6', '#b77c5d'],
  cobalt: ['#07142c', '#497fc3', '#122653'],
  prism: ['#eef3f9', '#c6d2e8', '#9fadd0'],
  coast: ['#a7c5d5', '#dce6e8', '#d0b49c'],
  sunrise: ['#e1b7c5', '#efc9af', '#ce846e'],
  pearl: ['#f6f6f4', '#e3e3e0', '#bfc2c2'],
  slate: ['#202226', '#474b53', '#111318'],
  mist: ['#e9e9e6', '#f5f4f0', '#b6b7b5'],
  midnight: ['#10111c', '#292640', '#080910'],
  ripple: ['#092846', '#427eaf', '#18374e'],
  opal: ['#d7d7e8', '#efdedf', '#abbfd3'],
  mesh: ['#292242', '#946187', '#385877'],
  frosted: ['#edf2f4', '#c8d6e0', '#8ba7bf'],
  alpine: ['#a8c5e4', '#dfe5ee', '#627b9e'],
  twilight: ['#ce9286', '#ecc9a9', '#5d5874'],
  lavender: ['#c5bfd9', '#a695bb', '#554d79'],
  shore: ['#263952', '#66849c', '#162b43'],
  mono: ['#111113', '#59595b', '#d9d9d8'],
  linen: ['#eae3d9', '#f7f2e9', '#c4b6a3'],
  eclipse: ['#101113', '#555960', '#0d1014'],
  horizon: ['#1a1b1d', '#5c5d61', '#171819'],
};

export const WALLPAPER_IDS = ['bloom', 'silk', 'aurora', 'dunes', 'cobalt', 'prism', 'coast', 'sunrise', 'pearl', 'slate', 'mist', 'midnight', 'ripple', 'opal', 'mesh', 'frosted', 'alpine', 'twilight', 'lavender', 'shore', 'mono', 'linen', 'eclipse', 'horizon'] as const;
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
