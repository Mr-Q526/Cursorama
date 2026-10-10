/** 动态排版、透视图像、快门与后期合成。全部由同一时间值确定。 */
export interface Point { x: number; y: number; }
export interface Rect { x: number; y: number; width: number; height: number; }
export interface Plane extends Rect { yaw?: number; pitch?: number; roll?: number; opacity?: number; radius?: number; crop?: Rect; }
export interface TextStyle { color?: string; weight?: number; family?: 'display' | 'chinese'; align?: CanvasTextAlign; stroke?: boolean; alpha?: number; tracking?: number; }
export const V2 = { width: 1920, height: 1080, fps: 30, duration: 44, beat: 0.5, shutter: 0.18 } as const;
export const COLOR = { black: '#0b0c0e', white: '#eceee8', orange: '#ff5c35', muted: '#a2a5a5', slate: '#242629' } as const;
export const FONT = { display: '"Bahnschrift", "Segoe UI", sans-serif', chinese: '"Microsoft YaHei", sans-serif' } as const;
const PERSPECTIVE = { distance: 2200, cols: 12, rows: 8, seam: 3, shadow: 60 } as const;
export const unit = (value: number): number => Math.max(0, Math.min(1, value));
export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
export const out = (value: number): number => 1 - (1 - unit(value)) ** 4;
export const sine = (value: number): number => (1 - Math.cos(unit(value) * Math.PI)) / 2;
export const spring = (value: number): number => value <= 0 ? 0 : value >= 1 ? 1 : 1 - Math.exp(-8 * value) * Math.cos(value * 11);

export function words(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, style: TextStyle = {}): void {
  ctx.save(); ctx.globalAlpha *= style.alpha ?? 1; ctx.textAlign = style.align ?? 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = `${style.weight ?? 700} ${size}px ${FONT[style.family ?? 'chinese']}`;
  ctx.letterSpacing = `${style.tracking ?? 0}px`; ctx.fillStyle = style.color ?? COLOR.white; ctx.strokeStyle = style.color ?? COLOR.white; ctx.lineWidth = Math.max(1, size / 110);
  if (style.stroke) ctx.strokeText(value, x, y); else ctx.fillText(value, x, y); ctx.restore();
}

export function kinetic(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, time: number, style: TextStyle = {}): void {
  ctx.save(); ctx.font = `${style.weight ?? 700} ${size}px ${FONT[style.family ?? 'chinese']}`; let advance = 0;
  Array.from(value).forEach((letter, index) => {
    const p = unit((time - index * 0.044) / 0.52); const eased = spring(p);
    ctx.save(); ctx.beginPath(); ctx.rect(x + advance - 10, y - size * 1.17, size * 1.45, size * 1.35); ctx.clip();
    words(ctx, letter, x + advance, y + (1 - eased) * size * 1.35, size, { ...style, alpha: p }); ctx.restore(); advance += ctx.measureText(letter).width + (style.tracking ?? 0);
  }); ctx.restore();
}

export function fill(ctx: CanvasRenderingContext2D, color: string = COLOR.black): void { ctx.fillStyle = color; ctx.fillRect(0, 0, V2.width, V2.height); }

export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, opacity: number): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius); gradient.addColorStop(0, `rgba(255,92,53,${opacity})`); gradient.addColorStop(1, 'rgba(255,92,53,0)'); ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function pathLine(ctx: CanvasRenderingContext2D, time: number, light = false): void {
  ctx.save(); ctx.strokeStyle = light ? '#24262925' : '#eceee81b'; ctx.lineWidth = 1.2;
  for (let line = 0; line < 8; line++) { ctx.beginPath(); ctx.moveTo(-100, 360 + line * 58); ctx.bezierCurveTo(660, -140 + line * 49 + Math.sin(time * 0.4) * 50, 1300, 1200 - line * 58, 2060, 200 + line * 37); ctx.stroke(); }
  ctx.restore();
}

function triangle(ctx: CanvasRenderingContext2D, texture: CanvasImageSource, a: Point, b: Point, c: Point, u: Point, v: Point, w: Point): void {
  const det = u.x * (v.y - w.y) + v.x * (w.y - u.y) + w.x * (u.y - v.y);
  if (Math.abs(det) < 0.001) return;
  const m11 = (a.x * (v.y - w.y) + b.x * (w.y - u.y) + c.x * (u.y - v.y)) / det;
  const m21 = (a.y * (v.y - w.y) + b.y * (w.y - u.y) + c.y * (u.y - v.y)) / det;
  const m12 = (a.x * (w.x - v.x) + b.x * (u.x - w.x) + c.x * (v.x - u.x)) / det;
  const m22 = (a.y * (w.x - v.x) + b.y * (u.x - w.x) + c.y * (v.x - u.x)) / det;
  const dx = (a.x * (v.x * w.y - w.x * v.y) + b.x * (w.x * u.y - u.x * w.y) + c.x * (u.x * v.y - v.x * u.y)) / det;
  const dy = (a.y * (v.x * w.y - w.x * v.y) + b.y * (w.x * u.y - u.x * w.y) + c.y * (u.x * v.y - v.x * u.y)) / det;
  ctx.save(); ctx.beginPath(); const center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  for (const [index, p] of [a, b, c].entries()) { const distance = Math.hypot(p.x - center.x, p.y - center.y); const k = 1 + PERSPECTIVE.seam / distance; const x = center.x + (p.x - center.x) * k, y = center.y + (p.y - center.y) * k; if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.closePath(); ctx.clip(); ctx.transform(m11, m21, m12, m22, dx, dy); ctx.drawImage(texture, 0, 0); ctx.restore();
}

export function plane(ctx: CanvasRenderingContext2D, texture: CanvasImageSource, intrinsicWidth: number, intrinsicHeight: number, box: Plane): void {
  const yaw = box.yaw ?? 0, pitch = box.pitch ?? 0, roll = box.roll ?? 0;
  const crop = box.crop ?? { x: 0, y: 0, width: intrinsicWidth, height: intrinsicHeight };
  const point = (u: number, v: number): Point => {
    const px = (u - 0.5) * box.width, py = (v - 0.5) * box.height;
    const x1 = px * Math.cos(yaw), z1 = -px * Math.sin(yaw);
    const y1 = py * Math.cos(pitch) - z1 * Math.sin(pitch), z2 = py * Math.sin(pitch) + z1 * Math.cos(pitch);
    const factor = PERSPECTIVE.distance / (PERSPECTIVE.distance - z2);
    return { x: box.x + box.width / 2 + (x1 * Math.cos(roll) - y1 * Math.sin(roll)) * factor, y: box.y + box.height / 2 + (x1 * Math.sin(roll) + y1 * Math.cos(roll)) * factor };
  };
  const corners = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
  ctx.save(); ctx.globalAlpha *= box.opacity ?? 1;
  ctx.beginPath(); for (const [index, corner] of corners.entries()) if (index === 0) ctx.moveTo(corner.x, corner.y); else ctx.lineTo(corner.x, corner.y); ctx.closePath();
  ctx.shadowColor = '#0009'; ctx.shadowBlur = PERSPECTIVE.shadow; ctx.shadowOffsetY = 35; ctx.fillStyle = COLOR.black; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.clip();
  for (let row = 0; row < PERSPECTIVE.rows; row++) for (let col = 0; col < PERSPECTIVE.cols; col++) {
    const u1 = col / PERSPECTIVE.cols, u2 = (col + 1) / PERSPECTIVE.cols, v1 = row / PERSPECTIVE.rows, v2 = (row + 1) / PERSPECTIVE.rows;
    const a = point(u1, v1), b = point(u2, v1), c = point(u2, v2), d = point(u1, v2);
    const uv = (u: number, v: number): Point => ({ x: crop.x + u * crop.width, y: crop.y + v * crop.height });
    triangle(ctx, texture, a, b, c, uv(u1, v1), uv(u2, v1), uv(u2, v2)); triangle(ctx, texture, a, c, d, uv(u1, v1), uv(u2, v2), uv(u1, v2));
  }
  ctx.restore();
}

export function flat(ctx: CanvasRenderingContext2D, texture: CanvasImageSource, rect: Rect, radius = 18, crop?: Rect): void {
  ctx.save(); ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius); ctx.clip();
  if (crop) ctx.drawImage(texture, crop.x, crop.y, crop.width, crop.height, rect.x, rect.y, rect.width, rect.height); else ctx.drawImage(texture, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

export class PostEffects {
  private readonly grain: HTMLCanvasElement;
  constructor() {
    this.grain = document.createElement('canvas'); this.grain.width = 256; this.grain.height = 256;
    const ctx = this.grain.getContext('2d'); if (!ctx) throw new Error('PROMO_GRAIN_CONTEXT_FAILED');
    const pixels = ctx.createImageData(this.grain.width, this.grain.height); let seed = 76451;
    for (let index = 0; index < pixels.data.length; index += 4) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const value = seed >>> 24; pixels.data[index] = value; pixels.data[index + 1] = value; pixels.data[index + 2] = value; pixels.data[index + 3] = 255; }
    ctx.putImageData(pixels, 0, 0);
  }
  apply(ctx: CanvasRenderingContext2D, time: number, light: boolean): void {
    ctx.save(); ctx.globalAlpha = light ? 0.035 : 0.044; ctx.globalCompositeOperation = 'soft-light'; const phase = Math.floor(time * V2.fps) % 7;
    const pattern = ctx.createPattern(this.grain, 'repeat'); if (pattern) { ctx.fillStyle = pattern; ctx.translate(phase * 13, phase * 17); ctx.fillRect(-100, -130, V2.width + 200, V2.height + 260); }
    ctx.restore();
  }
}

export function shutter(ctx: CanvasRenderingContext2D, progress: number, orange = false): void {
  const p = unit(progress); if (p === 1) return;
  ctx.save(); ctx.fillStyle = orange ? COLOR.orange : COLOR.black;
  const gap = out(p) * (V2.height + 600), tilt = 140 * (1 - p);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(V2.width, 0); ctx.lineTo(V2.width, V2.height / 2 - gap / 2 + tilt); ctx.lineTo(0, V2.height / 2 - gap / 2 - tilt); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, V2.height); ctx.lineTo(V2.width, V2.height); ctx.lineTo(V2.width, V2.height / 2 + gap / 2 + tilt); ctx.lineTo(0, V2.height / 2 + gap / 2 - tilt); ctx.closePath(); ctx.fill(); ctx.restore();
}
