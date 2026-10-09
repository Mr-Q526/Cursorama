import { ASPECTS, RESOLUTIONS } from '../../shared';
import type { AspectRatio, ExportOptions, ExportResolution, Project } from '../../shared';

const QUALITY = {
  minimumPreviewHeight: 1080, maximumPreviewHeight: 2160, pixelAlignment: 2,
  referencePixels: 1920 * 1080, referenceFps: 30,
  recordingBitsPerPixel: 0.2, minimumRecordingBitrate: 12_000_000, maximumBitrate: 100_000_000,
  exportBitrate: { standard: 8_000_000, high: 16_000_000 },
} as const;

export interface PreviewSize { displayWidth: number; displayHeight: number; pixelWidth: number; pixelHeight: number; }

export function previewDimensions(aspect: AspectRatio, availableWidth: number, availableHeight: number, dpr: number): PreviewSize {
  const ratio = ASPECTS[aspect];
  const displayWidth = Math.max(1, Math.min(availableWidth, availableHeight * ratio));
  const displayHeight = displayWidth / ratio;
  const desiredHeight = Math.max(QUALITY.minimumPreviewHeight, displayHeight * Math.max(1, dpr));
  const pixelHeight = Math.round(Math.min(QUALITY.maximumPreviewHeight, desiredHeight) / QUALITY.pixelAlignment) * QUALITY.pixelAlignment;
  const pixelWidth = Math.round(pixelHeight * ratio / QUALITY.pixelAlignment) * QUALITY.pixelAlignment;
  return { displayWidth, displayHeight, pixelWidth, pixelHeight };
}

export function recordingBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(QUALITY.maximumBitrate, Math.max(QUALITY.minimumRecordingBitrate, width * height * fps * QUALITY.recordingBitsPerPixel)));
}

export function exportBitrate(width: number, height: number, options: ExportOptions): number {
  const scale = width * height / QUALITY.referencePixels * options.fps / QUALITY.referenceFps;
  return Math.round(Math.min(QUALITY.maximumBitrate, QUALITY.exportBitrate[options.quality] * Math.max(1, scale)));
}

export function preferredResolution(sourceHeight: number): ExportResolution {
  if (sourceHeight > RESOLUTIONS['1440p']) return '2160p';
  if (sourceHeight > RESOLUTIONS['1080p']) return '1440p';
  return '1080p';
}

export function hasEmbeddedCursor(project: Pick<Project, 'cursorEmbedded' | 'sourceType'>): boolean {
  return project.cursorEmbedded ?? project.sourceType === 'video';
}
