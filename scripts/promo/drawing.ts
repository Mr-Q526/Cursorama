/** 宣传片共享绘图原语；预览与逐帧导出使用同一套 Canvas 绘图。 */
export interface Point { x: number; y: number; }
export interface Rectangle { x: number; y: number; width: number; height: number; }
export interface PanelOptions extends Rectangle { rotation?: number; skew?: number; alpha?: number; radius?: number; }
export const FILM = { width: 1920, height: 1080, duration: 48, fps: 30, beat: 0.5 } as const;
export const PALETTE = { black: '#111310', white: '#f4f5ee', muted: '#a4a69d', lime: '#c5fa58', grid: '#23261e', edge: '#373b30' } as const;
export const TYPE = { chinese: '"Microsoft YaHei", sans-serif', latin: '"Bahnschrift", "Segoe UI", sans-serif' } as const;
const DRAW = { fullCircle: Math.PI * 2, cursorWidth: 35, cursorHeight: 49, shadowBlur: 48, shadowOffset: 28 } as const;

export const clamp = (value: number): number => Math.max(0, Math.min(1, value));
export const ease = (value: number): number => 1 - (1 - clamp(value)) ** 3;
export const smooth = (value: number): number => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const mix = (start: number, end: number, progress: number): number => start + (end - start) * progress;

export function roundRect(ctx: CanvasRenderingContext2D, box: Rectangle, radius = 24): void {
  ctx.beginPath(); ctx.roundRect(box.x, box.y, box.width, box.height, radius);
}

export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, options: { color?: string; weight?: number; alpha?: number; latin?: boolean; align?: CanvasTextAlign; tracking?: number } = {}): void {
  ctx.save();
  ctx.globalAlpha *= options.alpha ?? 1;
  ctx.fillStyle = options.color ?? PALETTE.white;
  ctx.font = `${options.weight ?? 700} ${size}px ${options.latin ? TYPE.latin : TYPE.chinese}`;
  ctx.textAlign = options.align ?? 'left'; ctx.textBaseline = 'alphabetic';
  if (options.tracking) ctx.letterSpacing = `${options.tracking}px`;
  ctx.fillText(value, x, y); ctx.restore();
}

export function revealText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, progress: number, options: { color?: string; latin?: boolean; weight?: number } = {}): void {
  const p = ease(progress);
  ctx.save(); ctx.beginPath(); ctx.rect(x - 8, y - size * 1.35, FILM.width, size * 1.52); ctx.clip();
  text(ctx, value, x, y + (1 - p) * size * 1.3, size, { ...options, alpha: clamp(progress * 3) }); ctx.restore();
}

export function backdrop(ctx: CanvasRenderingContext2D, time: number, light = false): void {
  ctx.fillStyle = light ? PALETTE.white : PALETTE.black; ctx.fillRect(0, 0, FILM.width, FILM.height);
  const spacing = 120;
  ctx.save(); ctx.strokeStyle = light ? '#dedfd7' : PALETTE.grid; ctx.lineWidth = 1; ctx.globalAlpha = 0.44;
  for (let x = -spacing; x <= FILM.width + spacing; x += spacing) { ctx.beginPath(); ctx.moveTo(x + time * 2, 0); ctx.lineTo(x + time * 2, FILM.height); ctx.stroke(); }
  for (let y = 0; y <= FILM.height; y += spacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FILM.width, y); ctx.stroke(); }
  ctx.restore();
}

export function cursor(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, rotation = 0, lime = true): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scale, scale);
  ctx.shadowColor = '#00000055'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, DRAW.cursorHeight); ctx.lineTo(12, 37); ctx.lineTo(22, 57); ctx.lineTo(30, 53); ctx.lineTo(20, 33); ctx.lineTo(DRAW.cursorWidth, 33); ctx.closePath();
  ctx.fillStyle = lime ? PALETTE.lime : PALETTE.white; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = PALETTE.black; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
}

export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number, color: string = PALETTE.lime, width = 2): void {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, DRAW.fullCircle); ctx.stroke(); ctx.restore();
}

export function panel(ctx: CanvasRenderingContext2D, source: CanvasImageSource, box: PanelOptions, crop?: Rectangle): void {
  ctx.save(); ctx.globalAlpha *= box.alpha ?? 1;
  ctx.translate(box.x + box.width / 2, box.y + box.height / 2); ctx.rotate(box.rotation ?? 0); ctx.transform(1, 0, box.skew ?? 0, 1, 0, 0);
  const local = { x: -box.width / 2, y: -box.height / 2, width: box.width, height: box.height };
  ctx.shadowColor = '#00000080'; ctx.shadowBlur = DRAW.shadowBlur; ctx.shadowOffsetY = DRAW.shadowOffset;
  roundRect(ctx, local, box.radius ?? 18); ctx.fillStyle = PALETTE.black; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.clip();
  if (crop) ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, local.x, local.y, local.width, local.height);
  else ctx.drawImage(source, local.x, local.y, local.width, local.height);
  roundRect(ctx, local, box.radius ?? 18); ctx.strokeStyle = '#ffffff2f'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
}

export function brandBar(ctx: CanvasRenderingContext2D, logo: CanvasImageSource, brand: string, time: number): void {
  ctx.drawImage(logo, 70, 50, 48, 48);
  text(ctx, brand, 132, 84, 27, { latin: true, weight: 600 });
  ctx.fillStyle = PALETTE.edge; ctx.fillRect(70, 1018, 1780, 2);
  ctx.fillStyle = PALETTE.lime; ctx.fillRect(70, 1018, 1780 * clamp(time / FILM.duration), 2);
}
