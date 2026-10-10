import type { UpdateState } from './updates';
import type { AboutLink } from './about';
import type { DesktopWindowState } from './window';
import type { RecordingCommand, RecordingOverlayState, RecordingProgress } from './recording';

export type EffectMode = 'focus' | 'cinematic' | 'orbit' | 'overview';
export type NeutralBackgroundId = 'silver' | 'smoke' | 'graphite' | 'charcoal' | 'ink' | 'paper';
export type WallpaperId = 'bloom' | 'silk' | 'aurora' | 'dunes' | 'cobalt' | 'prism' | 'coast' | 'sunrise' | 'pearl' | 'slate' | 'mist' | 'midnight' | 'ripple' | 'opal' | 'mesh' | 'frosted' | 'alpine' | 'twilight' | 'lavender' | 'shore' | 'mono' | 'linen' | 'eclipse' | 'horizon';
export type BackgroundId = NeutralBackgroundId | WallpaperId | 'custom';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3';
export type CursorStyle = 'arrow' | 'dot' | 'none';
export type ExportResolution = '720p' | '1080p' | '1440p' | '2160p';
export type ExportFormat = 'mp4' | 'webm';
export type ExportFps = 30 | 60;
export type EditorTab = 'motion' | 'cursor' | 'background' | 'canvas' | 'edit' | 'audio';
export type PointerKind = 'move' | 'click' | 'typing' | 'scroll' | 'drag';
export type FocusSoundId = 'soft-tap' | 'air-sweep' | 'glass-chime' | 'gentle-pop';

export interface FocusSoundSettings {
  enabled: boolean;
  id: FocusSoundId;
  volume: number;
}

export interface FocusRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  source: 'caret' | 'control';
}

export interface PointerSample {
  time: number;
  x: number;
  y: number;
  kind: PointerKind;
  button?: 'left' | 'right';
  focus?: FocusRegion;
}

export interface MotionClip {
  id: string;
  start: number;
  end: number;
  x: number;
  y: number;
  zoom: number;
  mode: EffectMode;
  enabled: boolean;
  manual: boolean;
}

export interface VisualSettings {
  mode: EffectMode;
  autoZoom: boolean;
  followCursor: boolean;
  zoom: number;
  tilt: number;
  easing: number;
  background: BackgroundId;
  backgroundBlur?: number;
  backgroundDim?: number;
  padding: number;
  radius: number;
  edgeGlass?: number;
  shadow: number;
  aspect: AspectRatio;
  cursor: CursorStyle;
  cursorSize: number;
  clickEffect: boolean;
  spotlight: boolean;
  focusSound?: FocusSoundSettings;
}

export interface MediaAssetData {
  id: string;
  name: string;
  kind: 'video' | 'audio';
  mimeType: string;
  duration: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

export type BackgroundImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface BackgroundImageData {
  id: string;
  name: string;
  mimeType: BackgroundImageMimeType;
  width: number;
  height: number;
}

export interface BackgroundImageAsset extends BackgroundImageData {
  url: string;
  blob: Blob;
}

export interface MediaAsset extends MediaAssetData {
  url: string;
  blob: Blob;
}

export interface VideoSegment {
  id: string;
  mediaId: string;
  sourceIn: number;
  sourceOut: number;
  speed: number;
  volume: number;
}

export interface MusicClip {
  id: string;
  mediaId: string;
  start: number;
  sourceIn: number;
  sourceOut: number;
  volume: number;
}

export interface SubtitleClip {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface EditingTimeline {
  segments: VideoSegment[];
  music: MusicClip[];
  subtitles: SubtitleClip[];
}

export interface ProjectData {
  schemaVersion: 1;
  name: string;
  duration: number;
  frameRate?: number;
  width: number;
  height: number;
  samples: PointerSample[];
  clips: MotionClip[];
  settings: VisualSettings;
  trimStart: number;
  trimEnd: number;
  sourceType: 'demo' | 'video';
  hasAudio: boolean;
  cursorEmbedded?: boolean;
  libraryCover?: string;
  editing?: EditingTimeline;
  mediaAssets?: MediaAssetData[];
  backgroundImage?: BackgroundImageData;
}

export interface Project extends ProjectData {
  videoUrl?: string;
  videoBlob?: Blob;
  media?: Record<string, MediaAsset>;
  backgroundImageAsset?: BackgroundImageAsset;
  hasAudio: boolean;
}

export interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  kind: 'screen' | 'window';
  displayId: string;
}

export interface CaptureOptions {
  sourceId: string;
  microphone: boolean;
  systemAudio: boolean;
  fps: ExportFps;
}

export interface NativePointer {
  x: number;
  y: number;
  timestamp: number;
  kind: PointerKind;
  button?: 'left' | 'right';
  focus?: FocusRegion;
  inside: boolean;
}

export interface ExportOptions {
  resolution: ExportResolution;
  format: ExportFormat;
  fps: ExportFps;
  quality: 'standard' | 'high';
}

export interface ExportRequest {
  bytes: ArrayBuffer;
  mimeType: string;
  format: ExportFormat;
  name: string;
  quality: 'standard' | 'high';
  duration: number;
  fps: ExportFps;
  projectId?: string;
}

export interface ExportResult {
  cancelled: boolean;
  path?: string;
  projectId?: string;
  videoId?: string;
}

export interface LibraryVideo {
  id: string;
  name: string;
  path: string;
  format: ExportFormat;
  createdAt: string;
  size: number;
  cover?: string;
}

export interface LibraryProject {
  id: string;
  name: string;
  path: string;
  updatedAt: string;
  duration: number;
  width: number;
  height: number;
  videos: LibraryVideo[];
  cover?: string;
}

export interface LibrarySnapshot {
  root: string;
  storage: StorageSettings;
  projects: LibraryProject[];
  unavailable: number;
}

export interface StorageSettings {
  projectDirectory: string;
  exportDirectory: string;
}

export type StorageTarget = 'projects' | 'exports';

export interface StoredProject {
  data: ProjectData;
  bytes?: ArrayBuffer;
}

export interface DesktopBridge {
  platform: string;
  getWindowState(): Promise<DesktopWindowState>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<DesktopWindowState>;
  closeWindow(): Promise<void>;
  onWindowState(callback: (state: DesktopWindowState) => void): () => void;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<UpdateState>;
  setAutomaticUpdates(enabled: boolean): Promise<UpdateState>;
  openUpdatePage(): Promise<void>;
  openAboutLink(target: AboutLink): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
  listSources(): Promise<CaptureSource[]>;
  selectSource(options: CaptureOptions): Promise<void>;
  startPointer(sourceId: string): Promise<void>;
  stopPointer(): Promise<void>;
  recordingState(active: boolean): Promise<void>;
  syncRecordingProgress(progress: RecordingProgress): Promise<void>;
  getRecordingOverlay(): Promise<RecordingOverlayState>;
  requestRecordingCommand(command: RecordingCommand): Promise<void>;
  onRecordingCommand(callback: (command: RecordingCommand) => void): () => void;
  onRecordingOverlay(callback: (state: RecordingOverlayState) => void): () => void;
  configurePrompter(script: string, enabled: boolean): Promise<void>;
  togglePrompter(): Promise<void>;
  onPointer(callback: (sample: NativePointer) => void): () => void;
  onStopRecording(callback: () => void): () => void;
  exportVideo(request: ExportRequest): Promise<ExportResult>;
  saveProject(data: ProjectData, bytes?: ArrayBuffer, projectId?: string): Promise<ExportResult>;
  openProject(): Promise<{ data: ProjectData; bytes?: ArrayBuffer } | null>;
  listLibrary(): Promise<LibrarySnapshot>;
  configureLibrary(settings: StorageSettings): Promise<LibrarySnapshot>;
  chooseLibraryDirectory(target: StorageTarget): Promise<string | null>;
  revealStorageDirectory(target: StorageTarget): Promise<void>;
  openLibraryProject(projectId: string): Promise<StoredProject>;
  openLibraryVideo(projectId: string, videoId: string): Promise<ArrayBuffer>;
  getLibraryCover(projectId: string, videoId?: string): Promise<string | null>;
  revealLibrary(projectId?: string, videoId?: string): Promise<void>;
  revealFile(path: string): Promise<void>;
  onEncodeProgress(callback: (progress: number) => void): () => void;
}

export interface CameraState {
  zoom: number;
  x: number;
  y: number;
  rotateX: number;
  rotateY: number;
  cursorX: number;
  cursorY: number;
  clickAge: number;
  clipId?: string;
}
