import { BACKGROUNDS, BACKGROUND_LIMITS, WALLPAPER_IDS } from '../../shared';
import type { BackgroundId, VisualSettings, WallpaperId } from '../../shared';

export interface WallpaperAsset { image: string; }
export interface BackgroundCover { x: number; y: number; width: number; height: number; }
interface WallpaperEntry { image: HTMLImageElement; ready: boolean; revision: number; promise: Promise<void>; }
type BackgroundAppearance = Pick<VisualSettings, 'background' | 'backgroundBlur' | 'backgroundDim'>;
const WALLPAPER_BASE = `${import.meta.env?.BASE_URL ?? './'}wallpapers/`;
const images = new Map<WallpaperId, WallpaperEntry>();
const GLOW = { x: 0.7, radius: 0.85, center: '#ffffff55', edge: '#ffffff00' } as const;

export const WALLPAPER_ASSETS: Record<WallpaperId, WallpaperAsset> = {
  bloom: { image: `${WALLPAPER_BASE}bloom.svg` },
  silk: { image: `${WALLPAPER_BASE}silk.svg` },
  aurora: { image: `${WALLPAPER_BASE}aurora.svg` },
  dunes: { image: `${WALLPAPER_BASE}dunes.svg` },
};

export function isWallpaper(background: BackgroundId): background is WallpaperId {
  return (WALLPAPER_IDS as readonly string[]).includes(background);
}

export function wallpaperRevision(background: BackgroundId): number {
  return isWallpaper(background) ? images.get(background)?.revision ?? 0 : 0;
}

export function prepareBackground(background: BackgroundId): Promise<void> {
  if (!isWallpaper(background)) return Promise.resolve();
  const existing = images.get(background);
  if (existing) return existing.promise;
  const image = new Image();
  let entry: WallpaperEntry;
  const promise = new Promise<void>((resolve, reject) => {
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) { reject(new Error('WALLPAPER_EMPTY')); return; }
      entry.ready = true; entry.revision++; image.onload = null; image.onerror = null; resolve();
    };
    image.onerror = () => { image.onload = null; image.onerror = null; images.delete(background); reject(new Error('WALLPAPER_LOAD_FAILED')); };
  });
  entry = { image, promise, ready: false, revision: 0 };
  images.set(background, entry); image.src = WALLPAPER_ASSETS[background].image;
  return promise;
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

  render(output: CanvasRenderingContext2D, width: number, height: number, settings: BackgroundAppearance): void {
    const id = settings.background;
    const entry = isWallpaper(id) ? images.get(id) : undefined;
    if (isWallpaper(id) && !entry) void prepareBackground(id).catch((error: unknown) => console.error('WALLPAPER_PREVIEW_FAILED', error));
    const blur = settings.backgroundBlur ?? 0;
    const dim = settings.backgroundDim ?? 0;
    const key = [id, width, height, blur, dim, entry?.revision ?? 0].join(':');
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
      } else if (!isWallpaper(id)) {
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
