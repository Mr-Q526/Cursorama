import { BACKGROUNDS, BACKGROUND_LIMITS, WALLPAPER_IDS } from '../../shared';
import type { BackgroundId, BackgroundImageAsset, VisualSettings, WallpaperId } from '../../shared';
import { loadBackgroundImage } from './background-image';

export interface WallpaperAsset { image: string; }
export type WallpaperCollectionId = 'windows' | 'mac' | 'minimal';
export interface WallpaperCollection { id: WallpaperCollectionId; wallpapers: readonly WallpaperId[]; }
export interface BackgroundCover { x: number; y: number; width: number; height: number; }
interface WallpaperEntry { image: HTMLImageElement; ready: boolean; revision: number; promise: Promise<void>; controller?: AbortController; }
type BackgroundAppearance = Pick<VisualSettings, 'background' | 'backgroundBlur' | 'backgroundDim'>;
const WALLPAPER_BASE = `${import.meta.env?.BASE_URL ?? './'}wallpapers/`;
const images = new Map<WallpaperId, WallpaperEntry>();
const customImages = new Map<string, WallpaperEntry>();
const GLOW = { x: 0.7, radius: 0.85, center: '#ffffff55', edge: '#ffffff00' } as const;
let backgroundRevision = 0;

export const WALLPAPER_ASSETS: Record<WallpaperId, WallpaperAsset> = {
  bloom: { image: `${WALLPAPER_BASE}bloom.svg` },
  silk: { image: `${WALLPAPER_BASE}silk.svg` },
  aurora: { image: `${WALLPAPER_BASE}aurora.svg` },
  dunes: { image: `${WALLPAPER_BASE}dunes.svg` },
  cobalt: { image: `${WALLPAPER_BASE}cobalt.svg` },
  prism: { image: `${WALLPAPER_BASE}prism.svg` },
  coast: { image: `${WALLPAPER_BASE}coast.svg` },
  sunrise: { image: `${WALLPAPER_BASE}sunrise.svg` },
  pearl: { image: `${WALLPAPER_BASE}pearl.svg` },
  slate: { image: `${WALLPAPER_BASE}slate.svg` },
  mist: { image: `${WALLPAPER_BASE}mist.svg` },
  midnight: { image: `${WALLPAPER_BASE}midnight.svg` },
  ripple: { image: `${WALLPAPER_BASE}ripple.svg` },
  opal: { image: `${WALLPAPER_BASE}opal.svg` },
  mesh: { image: `${WALLPAPER_BASE}mesh.svg` },
  frosted: { image: `${WALLPAPER_BASE}frosted.svg` },
  alpine: { image: `${WALLPAPER_BASE}alpine.svg` },
  twilight: { image: `${WALLPAPER_BASE}twilight.svg` },
  lavender: { image: `${WALLPAPER_BASE}lavender.svg` },
  shore: { image: `${WALLPAPER_BASE}shore.svg` },
  mono: { image: `${WALLPAPER_BASE}mono.svg` },
  linen: { image: `${WALLPAPER_BASE}linen.svg` },
  eclipse: { image: `${WALLPAPER_BASE}eclipse.svg` },
  horizon: { image: `${WALLPAPER_BASE}horizon.svg` },
};

export const WALLPAPER_COLLECTIONS: readonly WallpaperCollection[] = [
  { id: 'windows', wallpapers: ['bloom', 'silk', 'cobalt', 'prism', 'ripple', 'opal', 'mesh', 'frosted'] },
  { id: 'mac', wallpapers: ['aurora', 'dunes', 'coast', 'sunrise', 'alpine', 'twilight', 'lavender', 'shore'] },
  { id: 'minimal', wallpapers: ['pearl', 'slate', 'mist', 'midnight', 'mono', 'linen', 'eclipse', 'horizon'] },
];

export function isWallpaper(background: BackgroundId): background is WallpaperId {
  return (WALLPAPER_IDS as readonly string[]).includes(background);
}

export function wallpaperRevision(background: BackgroundId, customImage?: BackgroundImageAsset): number {
  if (background === 'custom') return customImage ? customImages.get(customImage.url)?.revision ?? 0 : 0;
  return isWallpaper(background) ? images.get(background)?.revision ?? 0 : 0;
}

export function prepareBackground(background: BackgroundId, customImage?: BackgroundImageAsset): Promise<void> {
  if (background === 'custom') {
    if (!customImage) return Promise.reject(new Error('MISSING_BACKGROUND_IMAGE'));
    const existing = customImages.get(customImage.url);
    if (existing) return existing.promise;
    const entry: WallpaperEntry = { image: new Image(), ready: false, revision: 0, promise: Promise.resolve(), controller: new AbortController() };
    entry.promise = loadBackgroundImage(customImage.url, entry.controller?.signal).then((image) => {
      if (image.naturalWidth !== customImage.width || image.naturalHeight !== customImage.height) throw new Error('BACKGROUND_IMAGE_DIMENSIONS');
      entry.image = image; entry.ready = true; entry.revision = ++backgroundRevision;
    }).catch((error: unknown) => { if (customImages.get(customImage.url) === entry) customImages.delete(customImage.url); throw error; });
    customImages.set(customImage.url, entry);
    return entry.promise;
  }
  if (!isWallpaper(background)) return Promise.resolve();
  const existing = images.get(background);
  if (existing) return existing.promise;
  const image = new Image();
  let entry: WallpaperEntry;
  const promise = new Promise<void>((resolve, reject) => {
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) { reject(new Error('WALLPAPER_EMPTY')); return; }
      entry.ready = true; entry.revision = ++backgroundRevision; image.onload = null; image.onerror = null; resolve();
    };
    image.onerror = () => { image.onload = null; image.onerror = null; images.delete(background); reject(new Error('WALLPAPER_LOAD_FAILED')); };
  });
  entry = { image, promise, ready: false, revision: 0 };
  images.set(background, entry); image.src = WALLPAPER_ASSETS[background].image;
  return promise;
}

export function releaseBackgroundImage(url: string): void {
  const entry = customImages.get(url);
  if (entry) {
    customImages.delete(url);
    entry.controller?.abort();
    entry.image.removeAttribute('src');
  }
}

export function backgroundCover(sourceWidth: number, sourceHeight: number, width: number, height: number, overscan = 0): BackgroundCover {
  const scale = Math.max((width + overscan * 2) / sourceWidth, (height + overscan * 2) / sourceHeight);
  const imageWidth = sourceWidth * scale;
  const imageHeight = sourceHeight * scale;
  return { x: (width - imageWidth) / 2, y: (height - imageHeight) / 2, width: imageWidth, height: imageHeight };
}

export class BackgroundRenderer {
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private key = '';

  constructor() {
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('BACKGROUND_CANVAS_UNAVAILABLE');
    this.context = context;
  }

  render(output: CanvasRenderingContext2D, width: number, height: number, settings: BackgroundAppearance, customImage?: BackgroundImageAsset): void {
    const id = settings.background;
    const entry = id === 'custom' && customImage ? customImages.get(customImage.url) : isWallpaper(id) ? images.get(id) : undefined;
    if ((isWallpaper(id) || id === 'custom' && customImage) && !entry) void prepareBackground(id, customImage).catch((error: unknown) => { if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('WALLPAPER_PREVIEW_FAILED', error); });
    const blur = settings.backgroundBlur ?? 0;
    const dim = settings.backgroundDim ?? 0;
    const key = [id, id === 'custom' ? customImage?.id : '', width, height, blur, dim, entry?.revision ?? 0].join(':');
    if (key !== this.key) {
      this.canvas.width = width; this.canvas.height = height;
      const colors = BACKGROUNDS[id];
      const gradient = this.context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, colors[0]); gradient.addColorStop(0.5, colors[1]); gradient.addColorStop(1, colors[2]);
      this.context.fillStyle = gradient; this.context.fillRect(0, 0, width, height);
      if (entry?.ready) {
        const amount = blur * height / BACKGROUND_LIMITS.referenceHeight;
        const cover = backgroundCover(entry.image.naturalWidth, entry.image.naturalHeight, width, height, amount * BACKGROUND_LIMITS.blurOverscan);
        this.context.save(); this.context.imageSmoothingEnabled = true; this.context.imageSmoothingQuality = 'high';
        this.context.filter = amount ? `blur(${amount}px)` : 'none';
        this.context.drawImage(entry.image, cover.x, cover.y, cover.width, cover.height);
        this.context.restore();
      } else if (!isWallpaper(id) && id !== 'custom') {
        const glow = this.context.createRadialGradient(width * GLOW.x, 0, 0, width * GLOW.x, 0, width * GLOW.radius);
        glow.addColorStop(0, GLOW.center); glow.addColorStop(1, GLOW.edge);
        this.context.fillStyle = glow; this.context.fillRect(0, 0, width, height);
      }
      if (dim) { this.context.fillStyle = `rgba(0, 0, 0, ${dim / 100})`; this.context.fillRect(0, 0, width, height); }
      this.key = key;
    }
    output.drawImage(this.canvas, 0, 0);
  }

  dispose(): void { this.canvas.width = 0; this.canvas.height = 0; this.key = ''; }
}
