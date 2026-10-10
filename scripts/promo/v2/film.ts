/** 完整真实操作驱动的 44 秒宣传片：三维光标、动字、透视和结果对比。 */
import { promoV2Catalog as copy } from '../../../src/i18n/promo-v2';
import { ChromeCursor } from './chrome';
import { COLOR, fill, flat, glow, kinetic, lerp, out, pathLine, plane, PostEffects, shutter, sine, spring, unit, V2, words } from './compositor';
import type { Rect } from './compositor';

export interface FilmV2Assets { raw: HTMLVideoElement; focus: HTMLVideoElement; cinematic: HTMLVideoElement; studio: HTMLVideoElement; editor: HTMLImageElement; exportImage: HTMLImageElement; }
export interface FilmV2Frame { time: number; scene: number; }
const CUTS = [0, 4, 8, 18, 27, 35, 39, V2.duration] as const;
const TIMING = { seekTimeout: 15_000, mediaGuard: 0.08, sourceFirst: 1.5, sourceComparisonEnd: 6.5, sourceFinish: 13, styleEditSplit: 4.2, studioOperationEnd: 6.1 } as const;
const TYPE_SIZE = { hero: 156, title: 104, section: 92, body: 28, caption: 25 } as const;
let canvas: HTMLCanvasElement, frame: HTMLCanvasElement, ctx: CanvasRenderingContext2D, output: CanvasRenderingContext2D;
let chrome: ChromeCursor, post: PostEffects, logo: HTMLImageElement;
let assets: FilmV2Assets | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`V2_IMAGE_FAILED:${src}`)); image.src = src; });
}
function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => { const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.playsInline = true; video.addEventListener('loadeddata', () => resolve(video), { once: true }); video.addEventListener('error', () => reject(new Error(`V2_VIDEO_FAILED:${src}`)), { once: true }); video.src = src; video.load(); });
}
async function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  const time = Math.min(Math.max(0, seconds), video.duration - TIMING.mediaGuard);
  if (Math.abs(video.currentTime - time) < 0.002 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => { clearTimeout(timer); video.removeEventListener('seeked', done); video.removeEventListener('error', fail); };
    const done = (): void => { cleanup(); resolve(); }, fail = (): void => { cleanup(); reject(new Error('V2_SEEK_FAILED')); };
    const timer = setTimeout(fail, TIMING.seekTimeout); video.addEventListener('seeked', done, { once: true }); video.addEventListener('error', fail, { once: true }); video.currentTime = time;
  });
}

export async function prepare(designOnly = false): Promise<void> {
  const element = document.getElementById('film'); if (!(element instanceof HTMLCanvasElement)) throw new Error('V2_CANVAS_MISSING');
  canvas = element; canvas.width = V2.width; canvas.height = V2.height;
  frame = document.createElement('canvas'); frame.width = V2.width; frame.height = V2.height;
  const offscreen = frame.getContext('2d', { alpha: false }), target = canvas.getContext('2d', { alpha: false }); if (!offscreen || !target) throw new Error('V2_CONTEXT_FAILED');
  ctx = offscreen; output = target; chrome = new ChromeCursor(); post = new PostEffects(); logo = await loadImage('assets/icon.png');
  if (!designOnly) {
    const [raw, focus, cinematic, studio, editor, exportImage] = await Promise.all([
      loadVideo('assets/source-raw.mp4'), loadVideo('assets/result-focus.mp4'), loadVideo('assets/result-cinematic.mp4'), loadVideo('assets/studio-edit.mp4'), loadImage('assets/editor.png'), loadImage('assets/export.png'),
    ]); assets = { raw, focus, cinematic, studio, editor, exportImage };
  }
  await document.fonts.ready;
}

function stamp(light = false, y = 74): void {
  ctx.save(); if (light) ctx.filter = 'invert(1)'; ctx.drawImage(logo, 73, y - 32, 43, 43); ctx.restore(); words(ctx, copy.brand, 131, y, 27, { color: light ? COLOR.black : COLOR.white, family: 'display', weight: 500 });
}

function sculpture(x: number, y: number, size: number, time: number, intensity = 1): void {
  const pose = { yaw: Math.sin(time * 0.85) * 0.75 * intensity, pitch: -0.16 + Math.cos(time * 0.6) * 0.22, roll: -0.11 + Math.sin(time * 0.5) * 0.19, scale: 0.91, light: time * 0.5 };
  const image = chrome.render(pose);
  ctx.save(); ctx.shadowColor = '#00000066'; ctx.shadowBlur = 55; ctx.shadowOffsetY = 22; ctx.drawImage(image, x, y, size, size); ctx.restore();
}

function intro(t: number): boolean {
  fill(ctx, COLOR.white); pathLine(ctx, t, true); stamp(true);
  const entry = spring(t / 0.85);
  ctx.fillStyle = COLOR.orange; ctx.save(); ctx.translate(1190, 590); ctx.rotate(-0.13); ctx.fillRect(-200, -650, 178, 1370); ctx.restore();
  kinetic(ctx, copy.hookFirst, 93, 403, TYPE_SIZE.hero, t - 0.10, { color: COLOR.black, weight: 700 });
  kinetic(ctx, copy.hookSecond, 93, 602, TYPE_SIZE.hero, t - 0.48, { color: COLOR.black, weight: 700 });
  words(ctx, copy.director, 101, 923, 35, { color: COLOR.black, alpha: out((t - 1) / 0.7), weight: 400 });
  sculpture(lerp(1610, 1010, entry), lerp(500, 180, entry), 1000, t, 1.1);
  if (t > 2.7) {
    const p = out((t - 2.7) / 1.3); ctx.save(); ctx.globalAlpha = p; ctx.translate(960, 540); ctx.rotate(-0.12 * (1 - p)); ctx.scale(lerp(0.7, 1.06, p), lerp(0.7, 1.06, p)); ctx.translate(-960, -540);
    ctx.fillStyle = COLOR.orange; ctx.fillRect(-100, 365, 2140, 290); words(ctx, copy.director, 960, 572, 160, { color: COLOR.black, align: 'center' }); ctx.restore();
  }
  return true;
}

function brand(t: number): boolean {
  fill(ctx); glow(ctx, 1400, 450, 770, 0.18); pathLine(ctx, t + 5);
  const p = out(t / 1.1); ctx.save(); ctx.translate(960, 460); ctx.scale(lerp(1.7, 1.0, p), lerp(1.7, 1.0, p));
  words(ctx, copy.brand, 0, 0, 281, { family: 'display', align: 'center', stroke: true, color: '#6b6d6d' }); ctx.restore();
  sculpture(575 + Math.sin(t) * 50, 52, 890, t + 1.4, 1.4);
  if (t > 2.25 && assets) {
    const q = out((t - 2.25) / 1.6), width = lerp(430, 1260, q);
    plane(ctx, assets.editor, assets.editor.width, assets.editor.height, { x: lerp(1450, 602, q), y: lerp(1000, 251, q), width, height: width * assets.editor.height / assets.editor.width, yaw: lerp(-0.8, -0.05, q), pitch: lerp(0.42, 0.04, q), roll: lerp(-0.15, 0.012, q), opacity: q });
  }
  kinetic(ctx, copy.brand, 94, 889, 82, t - 0.3, { color: COLOR.white, family: 'display' });
  words(ctx, copy.director, 98, 978, 36, { color: COLOR.muted, weight: 400, alpha: out((t - 0.65) / 0.8) });
  return false;
}

function sourceTexture(video: HTMLVideoElement, box: Rect, radius = 16): void {
  const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
  const width = video.videoWidth * scale, height = video.videoHeight * scale;
  ctx.fillStyle = COLOR.black; ctx.fillRect(box.x, box.y, box.width, box.height);
  flat(ctx, video, { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height }, radius);
}

function comparison(t: number): boolean {
  if (!assets) throw new Error('V2_COMPARE_ASSETS_MISSING');
  fill(ctx); stamp();
  const entering = out(t / 0.75);
  if (t < 2.4) {
    kinetic(ctx, copy.record, 84, 284, 105, t - 0.15);
    const width = lerp(1280, 1160, entering); plane(ctx, assets.raw, assets.raw.videoWidth, assets.raw.videoHeight, { x: (V2.width - width) / 2, y: 286, width, height: width * assets.raw.videoHeight / assets.raw.videoWidth, yaw: lerp(-0.12, 0.02, entering), pitch: 0.06, roll: 0 });
  } else {
    const p = out((t - 2.4) / 0.65);
    kinetic(ctx, copy.compare, 84, 256, 91, t - 2.5);
    const inset = 83, gap = 38, width = 857, height = 482;
    sourceTexture(assets.raw, { x: inset, y: 397 + (1 - p) * 120, width, height });
    sourceTexture(assets.focus, { x: inset + width + gap, y: 397 + (1 - p) * 40, width, height });
    ctx.fillStyle = COLOR.orange; ctx.fillRect(978, 378, 856 * p, 3);
    words(ctx, copy.before, inset, 342, 25, { color: COLOR.muted, weight: 400 }); words(ctx, copy.after, 978, 342, 25, { color: COLOR.orange, weight: 500 });
    ctx.strokeStyle = '#eceee818'; ctx.lineWidth = 1; ctx.strokeRect(inset, 397, width, height); ctx.strokeRect(978, 397, width, height);
    if (t > 8.3) {
      const q = sine((t - 8.3) / 1.7); const media = { x: lerp(978, 82, q), y: lerp(397, 194, q), width: lerp(width, 1756, q), height: lerp(height, 987, q) };
      sourceTexture(assets.focus, media, 18); ctx.fillStyle = `rgba(11,12,14,${q * 0.75})`; ctx.fillRect(0, 0, 1920, 128);
    }
  }
  return false;
}

function camera(t: number): boolean {
  if (!assets) throw new Error('V2_CAMERA_ASSETS_MISSING');
  fill(ctx);
  const p = out(t / 0.8); const width = lerp(1850, 1920, p);
  sourceTexture(assets.cinematic, { x: (V2.width - width) / 2, y: 0, width, height: 1080 }, 0);
  const bottom = ctx.createLinearGradient(0, 640, 0, 1080); bottom.addColorStop(0, '#0b0c0e00'); bottom.addColorStop(1, '#0b0c0ef2'); ctx.fillStyle = bottom; ctx.fillRect(0, 640, 1920, 440);
  const stage = t < 4.1 ? copy.cameraFirst : copy.cameraSecond;
  kinetic(ctx, stage, 86, 926, 84, t < 4.1 ? t - 0.45 : t - 4.1, { color: COLOR.white });
  words(ctx, copy.follow, 90, 997, 27, { color: '#d3d6d6', weight: 400, alpha: out((t - 1.2) / 1) });
  ctx.fillStyle = COLOR.orange; ctx.fillRect(86, 802, 90 + unit(t / 9) * 300, 6);
  return false;
}

function style(t: number): boolean {
  if (!assets) throw new Error('V2_STYLE_ASSETS_MISSING');
  fill(ctx, COLOR.white); pathLine(ctx, t + 21, true); stamp(true);
  const edit = t > TIMING.styleEditSplit;
  if (!edit) {
    kinetic(ctx, copy.stylingFirst, 85, 325, 113, t - 0.14, { color: COLOR.black });
    kinetic(ctx, copy.stylingSecond, 85, 477, 96, t - 0.3, { color: COLOR.black });
    words(ctx, copy.stylingBody, 90, 623, 28, { color: '#595e5d', weight: 400, alpha: out((t - 0.65) / 0.7) });
    ctx.save(); ctx.translate(1467, 546); ctx.rotate(-0.13); ctx.fillStyle = COLOR.orange; ctx.fillRect(-273, -530, 600, 1180); ctx.restore();
    const p = spring(t / 0.8), width = 1090;
    plane(ctx, assets.studio, assets.studio.videoWidth, assets.studio.videoHeight, { x: lerp(1950, 755, p), y: 314, width, height: width * assets.studio.videoHeight / assets.studio.videoWidth, yaw: -0.24 + Math.sin(t * 0.4) * 0.10, pitch: 0.13, roll: -0.027 });
  } else {
    const p = out((t - TIMING.styleEditSplit) / 0.75);
    kinetic(ctx, copy.editing, 84, 243, 96, t - TIMING.styleEditSplit - 0.05, { color: COLOR.black });
    const width = Math.min(1510, 700 * assets.studio.videoWidth / assets.studio.videoHeight);
    plane(ctx, assets.studio, assets.studio.videoWidth, assets.studio.videoHeight, { x: (V2.width - width) / 2, y: lerp(550, 330, p), width, height: width * assets.studio.videoHeight / assets.studio.videoWidth, yaw: 0.025, pitch: -0.08 * (1 - p), roll: 0, opacity: p });
    const lengths = [43, 109, 67, 159, 83, 132, 48, 94, 63, 116];
    ctx.save(); ctx.globalAlpha = p; ctx.strokeStyle = COLOR.orange; ctx.lineWidth = 7; lengths.forEach((length, index) => { const k = 0.6 + Math.sin(t * 8 - index) * 0.4; ctx.beginPath(); ctx.moveTo(1620 + index * 15, 240 - length * k / 2); ctx.lineTo(1620 + index * 15, 240 + length * k / 2); ctx.stroke(); }); ctx.restore();
  }
  return true;
}

function exporting(t: number): boolean {
  if (!assets) throw new Error('V2_EXPORT_ASSETS_MISSING');
  fill(ctx); glow(ctx, 1500, 770, 670, 0.2); stamp();
  kinetic(ctx, copy.exporting, 84, 279, 98, t - 0.1); words(ctx, copy.exportSpecs, 89, 357, 29, { color: COLOR.muted, weight: 400, alpha: out((t - 0.45) / 0.8) });
  const p = out(t / 0.8), width = 650;
  const crop = { x: assets.exportImage.width * 0.331, y: assets.exportImage.height * 0.261, width: assets.exportImage.width * 0.338, height: assets.exportImage.height * 0.536 };
  plane(ctx, assets.exportImage, assets.exportImage.width, assets.exportImage.height, { x: lerp(1810, 1130, p), y: 226, width, height: width * crop.height / crop.width, crop, yaw: lerp(-0.75, -0.04, p), pitch: 0.04, roll: -0.018, opacity: p });
  const moving = unit((t - 1.5) / 1.3); sculpture(84 + moving * 200, 470, 620 - moving * 90, t + 4, 0.75);
  return false;
}

function closing(t: number): boolean {
  fill(ctx, COLOR.white); pathLine(ctx, t + 33, true);
  const p = out(t / 0.9); ctx.fillStyle = COLOR.orange; ctx.save(); ctx.translate(1450, 540); ctx.rotate(lerp(-0.55, -0.16, p)); ctx.fillRect(-210, -850, 420, 1800); ctx.restore();
  kinetic(ctx, copy.closingFirst, 93, 337, 136, t - 0.1, { color: COLOR.black });
  kinetic(ctx, copy.closingSecond, 93, 514, 146, t - 0.4, { color: COLOR.black });
  words(ctx, copy.brand, 96, 720, 116, { family: 'display', color: COLOR.black, alpha: out((t - 1.1) / 0.8) });
  words(ctx, copy.availability, 104, 838, 29, { color: '#555b59', weight: 400, alpha: out((t - 1.5) / 0.8) });
  words(ctx, copy.destination, 104, 906, 30, { family: 'display', color: COLOR.black, weight: 500, alpha: out((t - 1.8) / 0.8) });
  sculpture(1025, 221, 920, t + 2.5, 0.95);
  if (t > 4.35) { ctx.save(); ctx.globalAlpha = unit((t - 4.35) / 0.65) * 0.18; fill(ctx, COLOR.black); ctx.restore(); }
  return true;
}

export async function renderFrame(time: number): Promise<FilmV2Frame> {
  const safe = Math.max(0, Math.min(V2.duration - 1 / V2.fps, time));
  const scene = CUTS.findIndex((start, index) => index < CUTS.length - 1 && safe >= start && safe < CUTS[index + 1]);
  const local = safe - CUTS[scene];
  if (assets && scene === 2) {
    const sourceTime = lerp(TIMING.sourceFirst, TIMING.sourceComparisonEnd, local / 10);
    await Promise.all([seek(assets.raw, sourceTime), seek(assets.focus, sourceTime)]);
  }
  if (assets && scene === 3) await seek(assets.cinematic, lerp(TIMING.sourceComparisonEnd, TIMING.sourceFinish, local / 9));
  if (assets && scene === 4) await seek(assets.studio, local / 8 * Math.min(assets.studio.duration - TIMING.mediaGuard, TIMING.studioOperationEnd));
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const renderers = [intro, brand, comparison, camera, style, exporting, closing]; const light = renderers[scene](local);
  post.apply(ctx, safe, light);
  output.setTransform(1, 0, 0, 1, 0, 0); output.globalAlpha = 1; output.drawImage(frame, 0, 0);
  if (scene > 0 && local < V2.shutter) shutter(output, local / V2.shutter, scene === 1 || scene === 4);
  const pulseTimes = [2.7, 4, 8, 10.4, 18, 22.1, 27, 31.2, 35, 39];
  const pulse = Math.max(0, ...pulseTimes.map((cut) => 1 - Math.abs(safe - cut) / 0.075));
  if (pulse > 0) { output.save(); output.globalAlpha = pulse * 0.14; output.globalCompositeOperation = 'screen'; output.filter = 'blur(3px)'; output.drawImage(frame, 12 * pulse, 0); output.restore(); }
  return { time: safe, scene };
}

export function jpeg(): string { return canvas.toDataURL('image/jpeg', 0.97).split(',')[1]; }
export function png(): string { return canvas.toDataURL('image/png').split(',')[1]; }
export function dispose(): void { chrome.dispose(); if (assets) for (const video of [assets.raw, assets.focus, assets.cinematic, assets.studio]) { video.pause(); video.removeAttribute('src'); video.load(); } assets = null; }
export { V2 };
