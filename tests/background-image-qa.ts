import { backgroundImageMetadata, DEFAULT_SETTINGS, packProjectMedia, projectBytes, readProjectBytes, unpackProjectMedia } from '../shared';
import type { BackgroundImageAsset, BackgroundImageMimeType, Project } from '../shared';
import { importBackgroundImage } from '../src/engine/background-image';
import { BackgroundRenderer, prepareBackground, releaseBackgroundImage, wallpaperRevision } from '../src/engine/backgrounds';
import { createDemoProject } from '../src/engine/demo';
import { projectMetadata, runtimeFromStored } from '../src/engine/project-media';
import { VideoRenderer } from '../src/engine/renderer';
import { loadVideo, renderExport } from '../src/engine/exporter';

export interface CustomBackgroundQAReport {
  formats: BackgroundImageMimeType[];
  imageBytes: number;
  payload: number[];
  image: number[];
  pixels: boolean;
  restored: boolean;
  previewExportMatch: boolean;
  cacheReleased: boolean;
  failedImportsCleaned: boolean;
}

export interface RestoredBackgroundQAReport { dimensions: boolean; pixels: boolean; image: string; }
export interface BackgroundExportQAReport { width: number; height: number; bytes: number[]; pixels: boolean; }

const QA = {
  sourceWidth: 640, sourceHeight: 360, outputWidth: 1280, outputHeight: 720,
  padding: 20, colorTolerance: 2, jpgTolerance: 8,
  firstColor: '#24547b', secondColor: '#d1a3a9', thirdColor: '#ede6d6',
  samplePositions: [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]] as const,
} as const;

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('QA_BACKGROUND_IMAGE_CONTEXT');
  return ctx;
}

export function backgroundImageFixture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = QA.sourceWidth; canvas.height = QA.sourceHeight;
  const ctx = context(canvas);
  ctx.fillStyle = QA.firstColor; ctx.fillRect(0, 0, canvas.width / 2, canvas.height);
  ctx.fillStyle = QA.secondColor; ctx.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height);
  ctx.fillStyle = QA.thirdColor; ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);
  return canvas;
}

function blobFromCanvas(canvas: HTMLCanvasElement, mimeType: BackgroundImageMimeType): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('QA_BACKGROUND_FIXTURE_FAILED')), mimeType));
}

function samples(canvas: HTMLCanvasElement): number[][] {
  const ctx = context(canvas);
  return QA.samplePositions.map(([x, y]) => Array.from(ctx.getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1).data));
}

function assertPixels(actual: number[][], expected: number[][], tolerance: number = QA.colorTolerance): void {
  if (actual.some((pixel, index) => pixel.some((channel, component) => Math.abs(channel - expected[index][component]) > tolerance))) throw new Error('QA_BACKGROUND_IMAGE_PIXELS_DIFFER');
}

function projectWithImage(image: BackgroundImageAsset): Project {
  return { ...createDemoProject(), duration: 1, trimStart: 0, trimEnd: 1, samples: [], clips: [], settings: { ...DEFAULT_SETTINGS, background: 'custom', mode: 'overview', autoZoom: false, followCursor: false, padding: QA.padding, shadow: 0, backgroundBlur: 0, backgroundDim: 0 }, backgroundImage: backgroundImageMetadata(image), backgroundImageAsset: image };
}

function renderImage(project: Project, width: number = QA.outputWidth): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width * QA.outputHeight / QA.outputWidth;
  const renderer = new VideoRenderer(canvas);
  try { renderer.render(project, 0); return canvas; }
  finally { renderer.dispose(); }
}

export async function runCustomBackgroundQA(): Promise<CustomBackgroundQAReport> {
  const fixture = backgroundImageFixture();
  const expected = samples(fixture);
  const formats: BackgroundImageMimeType[] = ['image/png', 'image/jpeg', 'image/webp'];
  const images: BackgroundImageAsset[] = [];
  let restored: Project | undefined;
  try {
    for (const mimeType of formats) {
      const blob = await blobFromCanvas(fixture, mimeType);
      const image = await importBackgroundImage(new File([blob], `背景.${mimeType.split('/')[1]}`, { type: mimeType }));
      images.push(image);
      await prepareBackground('custom', image);
      if (image.width !== QA.sourceWidth || image.height !== QA.sourceHeight) throw new Error('QA_BACKGROUND_IMAGE_DIMENSIONS');
      const canvas = document.createElement('canvas'); canvas.width = QA.outputWidth; canvas.height = QA.outputHeight;
      const renderer = new BackgroundRenderer();
      try { renderer.render(context(canvas), canvas.width, canvas.height, { ...DEFAULT_SETTINGS, background: 'custom' }, image); assertPixels(samples(canvas), expected, mimeType === 'image/png' ? QA.colorTolerance : QA.jpgTolerance); }
      finally { renderer.dispose(); }
    }
    const image = images[0];
    const project = projectWithImage(image);
    const payload = await packProjectMedia(project);
    const file = projectBytes(projectMetadata(project), payload);
    const stored = readProjectBytes(file);
    const packedImage = unpackProjectMedia(stored.data, stored.bytes).assets.get(image.id);
    const originalBytes = new Uint8Array(await image.blob.arrayBuffer());
    if (!packedImage || new Uint8Array(packedImage).some((byte, index) => byte !== originalBytes[index]) || packedImage.byteLength !== originalBytes.byteLength) throw new Error('QA_BACKGROUND_IMAGE_NOT_PACKED');
    restored = runtimeFromStored(stored);
    const reopened = restored.backgroundImageAsset;
    if (!reopened || reopened.url === image.url) throw new Error('QA_BACKGROUND_IMAGE_NOT_RESTORED');
    releaseBackgroundImage(image.url); URL.revokeObjectURL(image.url);
    await prepareBackground('custom', reopened);
    assertPixels(samples(renderImage(restored)), expected);
    assertPixels(samples(renderImage(restored, QA.outputWidth * 2)), expected);
    releaseBackgroundImage(reopened.url);
    const cacheReleased = wallpaperRevision('custom', reopened) === 0;
    if (!cacheReleased) throw new Error('QA_BACKGROUND_IMAGE_CACHE_RETAINED');
    let rejected = 0;
    for (const invalid of [new File(['<svg/>'], '脚本.svg', { type: 'image/svg+xml' }), new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], '损坏.png', { type: 'image/png' })]) {
      try { const unexpected = await importBackgroundImage(invalid); URL.revokeObjectURL(unexpected.url); }
      catch (error: unknown) { if (!(error instanceof Error)) throw error; rejected++; }
    }
    if (rejected !== 2) throw new Error('QA_BACKGROUND_INVALID_FILE_ACCEPTED');
    return { formats, imageBytes: originalBytes.byteLength, payload: Array.from(file), image: Array.from(originalBytes), pixels: true, restored: true, previewExportMatch: true, cacheReleased, failedImportsCleaned: true };
  } finally {
    for (const image of [...images, ...(restored?.backgroundImageAsset ? [restored.backgroundImageAsset] : [])]) { releaseBackgroundImage(image.url); URL.revokeObjectURL(image.url); }
    for (const asset of Object.values(restored?.media ?? {})) URL.revokeObjectURL(asset.url);
    if (restored?.videoUrl) URL.revokeObjectURL(restored.videoUrl);
  }
}

export async function runBackgroundRestoreQA(bytes: number[]): Promise<RestoredBackgroundQAReport> {
  const project = runtimeFromStored(readProjectBytes(new Uint8Array(bytes)));
  const image = project.backgroundImageAsset;
  if (!image) throw new Error('QA_MOVED_PROJECT_IMAGE_MISSING');
  try {
    await prepareBackground('custom', image);
    const canvas = renderImage(project);
    assertPixels(samples(canvas), samples(backgroundImageFixture()));
    if (image.width !== QA.sourceWidth || image.height !== QA.sourceHeight) throw new Error('QA_MOVED_PROJECT_IMAGE_DIMENSIONS');
    return { dimensions: true, pixels: true, image: canvas.toDataURL('image/png') };
  } finally { releaseBackgroundImage(image.url); URL.revokeObjectURL(image.url); if (project.videoUrl) URL.revokeObjectURL(project.videoUrl); }
}

export async function runBackgroundExportQA(bytes: number[]): Promise<BackgroundExportQAReport> {
  if (window.desktop) throw new Error('QA_BACKGROUND_EXPORT_ISOLATED_ONLY');
  const project = runtimeFromStored(readProjectBytes(new Uint8Array(bytes)));
  const click = HTMLAnchorElement.prototype.click;
  let exportedUrl = '';
  let video: HTMLVideoElement | undefined;
  HTMLAnchorElement.prototype.click = function (): void {
    if (this.download && this.href.startsWith('blob:')) exportedUrl = this.href;
    else click.call(this);
  };
  try {
    await renderExport(project, { resolution: '720p', format: 'webm', fps: 30, quality: 'high' }, () => undefined, new AbortController().signal);
    if (!exportedUrl) throw new Error('QA_CUSTOM_BACKGROUND_EXPORT_MISSING');
    const blob = await (await fetch(exportedUrl)).blob();
    video = await loadVideo(exportedUrl);
    if (video.videoWidth !== QA.outputWidth || video.videoHeight !== QA.outputHeight || blob.size === 0) throw new Error('QA_CUSTOM_BACKGROUND_EXPORT_DIMENSIONS');
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    context(canvas).drawImage(video, 0, 0);
    assertPixels(samples(canvas), samples(backgroundImageFixture()), QA.jpgTolerance);
    return { width: video.videoWidth, height: video.videoHeight, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), pixels: true };
  } finally {
    HTMLAnchorElement.prototype.click = click;
    video?.pause(); video?.removeAttribute('src'); video?.load();
    if (exportedUrl) URL.revokeObjectURL(exportedUrl);
    if (project.backgroundImageAsset) { releaseBackgroundImage(project.backgroundImageAsset.url); URL.revokeObjectURL(project.backgroundImageAsset.url); }
    if (project.videoUrl) URL.revokeObjectURL(project.videoUrl);
  }
}
