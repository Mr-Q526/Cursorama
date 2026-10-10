import { DEFAULT_SETTINGS, FRAME_LIMITS } from '../../shared';
import type { BackgroundImageAsset, VisualSettings } from '../../shared';
import { wallpaperRevision } from './backgrounds';
import { clamp } from './motion';

export interface FrameMaterial {
  strength: number;
  radius: number;
  outset: number;
  blur: number;
  feather: number;
}

export const GLASS_MATERIAL = {
  backdropWidth: 720, backdropBlur: 18, blurOverscan: 3,
  opacity: 0.65, reflection: 0.28, tint: 0.06, highlight: 0.12,
  maskBlur: 0.65,
  edgeMix: 0.32, centerWeight: 0.25, axialWeight: 0.125, cornerWeight: 0.0625,
} as const;

const GLASS = GLASS_MATERIAL;

export function frameMaterial(settings: VisualSettings, outputWidth: number, frameWidth: number, frameHeight: number): FrameMaterial {
  const scale = outputWidth / FRAME_LIMITS.referenceWidth;
  const strength = clamp(settings.edgeGlass ?? DEFAULT_SETTINGS.edgeGlass ?? 0, 0, FRAME_LIMITS.edgeGlass) / FRAME_LIMITS.edgeGlass;
  return {
    strength,
    radius: clamp(settings.radius * scale, 0, Math.min(frameWidth, frameHeight) / 2),
    outset: FRAME_LIMITS.glassOutset * scale * strength,
    blur: Math.max(scale, FRAME_LIMITS.glassBlur * scale * strength),
    feather: scale * (1 + FRAME_LIMITS.glassFeather * strength),
  };
}

export class FrameGlass {
  readonly backdrop = document.createElement('canvas');
  private readonly material = document.createElement('canvas');
  private readonly sharp = document.createElement('canvas');
  private readonly backdropContext: CanvasRenderingContext2D;
  private readonly materialContext: CanvasRenderingContext2D;
  private readonly sharpContext: CanvasRenderingContext2D;
  private backdropKey = '';

  constructor() {
    const backdrop = this.backdrop.getContext('2d', { alpha: false });
    const material = this.material.getContext('2d');
    const sharp = this.sharp.getContext('2d');
    if (!backdrop || !material || !sharp) throw new Error('FRAME_GLASS_CONTEXT_UNAVAILABLE');
    this.backdropContext = backdrop; this.materialContext = material; this.sharpContext = sharp;
  }

  prepare(background: HTMLCanvasElement, settings: VisualSettings, customImage?: BackgroundImageAsset): boolean {
    const key = [background.width, background.height, settings.background, settings.background === 'custom' ? customImage?.id : '', settings.backgroundBlur, settings.backgroundDim, wallpaperRevision(settings.background, customImage)].join(':');
    if (key === this.backdropKey) return false;
    const scale = Math.min(1, GLASS.backdropWidth / background.width);
    this.backdrop.width = Math.round(background.width * scale);
    this.backdrop.height = Math.max(1, Math.round(background.height * scale));
    const blur = GLASS.backdropBlur * this.backdrop.width / FRAME_LIMITS.referenceWidth;
    const overscan = blur * GLASS.blurOverscan;
    const ctx = this.backdropContext;
    ctx.drawImage(background, 0, 0, this.backdrop.width, this.backdrop.height);
    ctx.save(); ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(background, -overscan, -overscan, this.backdrop.width + overscan * 2, this.backdrop.height + overscan * 2);
    ctx.restore();
    this.backdropKey = key;
    return true;
  }

  composite(source: HTMLCanvasElement, outputWidth: number, outputHeight: number, frameWidth: number, frameHeight: number, metrics: FrameMaterial): HTMLCanvasElement {
    const { outset, radius, strength } = metrics;
    const width = Math.ceil(frameWidth + outset * 2);
    const height = Math.ceil(frameHeight + outset * 2);
    for (const canvas of [this.material, this.sharp]) {
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    }
    const ctx = this.materialContext;
    ctx.clearRect(0, 0, width, height);
    if (strength > 0) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, width, height, radius + outset); ctx.clip();
      ctx.globalAlpha = strength * GLASS.opacity;
      ctx.drawImage(this.backdrop, (width - outputWidth) / 2, (height - outputHeight) / 2, outputWidth, outputHeight);
      ctx.globalAlpha = strength * GLASS.reflection; ctx.filter = `blur(${metrics.blur}px)`;
      ctx.drawImage(source, outset, outset, frameWidth, frameHeight);
      ctx.filter = 'none'; ctx.globalAlpha = strength * GLASS.tint; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = strength * GLASS.highlight; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = metrics.feather;
      ctx.beginPath(); ctx.roundRect(outset, outset, frameWidth, frameHeight, radius); ctx.stroke(); ctx.restore();
    }
    const sharp = this.sharpContext;
    sharp.clearRect(0, 0, width, height);
    sharp.save();
    sharp.drawImage(source, outset, outset, frameWidth, frameHeight);
    sharp.globalCompositeOperation = 'destination-in';
    sharp.filter = strength ? `blur(${metrics.feather * GLASS.maskBlur}px)` : 'none';
    sharp.beginPath(); sharp.roundRect(outset, outset, frameWidth, frameHeight, radius); sharp.fillStyle = '#ffffff'; sharp.fill();
    sharp.restore();
    ctx.drawImage(this.sharp, 0, 0);
    return this.material;
  }

  dispose(): void {
    for (const canvas of [this.backdrop, this.material, this.sharp]) { canvas.width = 0; canvas.height = 0; }
    this.backdropKey = '';
  }
}
