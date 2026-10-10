/** 48 秒 Cursorama 宣传片的确定性时间线。真实界面素材与动态视觉共同渲染。 */
import { promoCatalog as copy } from '../../src/i18n/promo';
import { backdrop, brandBar, clamp, cursor, ease, FILM, mix, PALETTE, panel, revealText, ring, smooth, text } from './drawing';
import type { Rectangle } from './drawing';

export interface FilmAssets { logo: HTMLImageElement; editor: HTMLImageElement; backgroundLibrary: HTMLImageElement; glass: HTMLImageElement; soundtrack: HTMLImageElement; demo: HTMLVideoElement; backgrounds: HTMLVideoElement; editing: HTMLVideoElement; camera: HTMLVideoElement; }
export interface FrameResult { time: number; scene: number; }
const SCENES = [0, 6, 12, 20, 28, 36, 42, FILM.duration] as const;
const GEOMETRY = { appWidth: 1920, appHeight: 1080, margin: 86, revealSeconds: 0.7, transitionSeconds: 0.42, safeEnd: 0.045 } as const;
const APP_PREVIEW: Rectangle = { x: 583, y: 149, width: 1124, height: 633 };
const CAMERA_SAMPLES = { starts: [2.6, 4.4, 6.35], rates: [0.35, 0.45, 0.45], step: 8 / 3 } as const;
let assets: FilmAssets;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

function imageAsset(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const result = new Image(); result.onload = () => resolve(result); result.onerror = () => reject(new Error(`PROMO_IMAGE_FAILED: ${path}`)); result.src = path; });
}

function videoAsset(path: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const result = document.createElement('video'); result.preload = 'auto'; result.muted = true; result.playsInline = true;
    result.addEventListener('loadeddata', () => resolve(result), { once: true }); result.addEventListener('error', () => reject(new Error(`PROMO_VIDEO_FAILED: ${path}`)), { once: true });
    result.src = path; result.load();
  });
}

async function seek(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.min(Math.max(0, time), Math.max(0, video.duration - GEOMETRY.safeEnd));
  if (Math.abs(video.currentTime - target) < 0.002 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => { clearTimeout(timeout); video.removeEventListener('seeked', onSeek); video.removeEventListener('error', onError); };
    const onError = (): void => { cleanup(); reject(new Error('PROMO_SEEK_FAILED')); };
    const onSeek = (): void => { cleanup(); resolve(); };
    const timeout = setTimeout(onError, 10_000);
    video.addEventListener('seeked', onSeek, { once: true }); video.addEventListener('error', onError, { once: true }); video.currentTime = target;
  });
}

export async function prepare(elementId = 'film'): Promise<void> {
  const element = document.getElementById(elementId);
  if (!(element instanceof HTMLCanvasElement)) throw new Error('PROMO_CANVAS_MISSING');
  const context = element.getContext('2d', { alpha: false });
  if (!context) throw new Error('PROMO_CONTEXT_MISSING');
  canvas = element; ctx = context; canvas.width = FILM.width; canvas.height = FILM.height;
  const [logo, editor, backgroundLibrary, glass, soundtrack, demo, backgrounds, editing, camera] = await Promise.all([
    imageAsset('assets/icon.png'), imageAsset('assets/editor.png'), imageAsset('assets/background-library.png'), imageAsset('assets/glass-controls.png'), imageAsset('assets/soundtrack-panel.png'),
    videoAsset('assets/demo.mp4'), videoAsset('assets/backgrounds.mp4'), videoAsset('assets/editing.mp4'), videoAsset('assets/auto-camera.mp4'),
  ]);
  assets = { logo, editor, backgroundLibrary, glass, soundtrack, demo, backgrounds, editing, camera };
  await document.fonts.ready;
}

function header(title: string, subtitle: string, local: number): void {
  revealText(ctx, title, GEOMETRY.margin, 237, 76, local / GEOMETRY.revealSeconds);
  text(ctx, subtitle, GEOMETRY.margin + 4, 298, 29, { color: PALETTE.muted, weight: 400, alpha: ease((local - 0.35) / 0.8) });
}

function hook(local: number): void {
  const first = ease((local - 0.15) / 0.9);
  const second = ease((local - 1.45) / 0.9);
  ctx.save(); ctx.translate(1000, 520); ctx.rotate(-0.16);
  ctx.strokeStyle = '#c5fa5814'; ctx.lineWidth = 105; ctx.beginPath(); ctx.ellipse(0, 0, 745, 360, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  revealText(ctx, copy.hookFirst, 144, 455, 147, first);
  revealText(ctx, copy.hookSecond, 144, 649, 147, second, { color: PALETTE.lime });
  const progress = smooth((local - 0.8) / 3.6);
  const x = mix(1390, 1530, progress); const y = 294 + Math.sin(progress * Math.PI) * 380;
  for (let trail = 5; trail >= 1; trail--) { ctx.globalAlpha = (6 - trail) * 0.06; cursor(ctx, x - trail * 22, y + trail * 18, 3.8, -0.24, false); }
  ctx.globalAlpha = 1;
  cursor(ctx, x, y, 4.3, -0.24);
  const click = clamp((local - 3.35) / 0.8); ring(ctx, x + 10, y + 15, mix(22, 280, click), Math.sin(click * Math.PI) * 0.8, PALETTE.lime, 4);
  text(ctx, copy.director, 152, 816, 32, { color: PALETTE.muted, weight: 400, alpha: ease((local - 2.8) / 0.8) });
  if (local > 5.15) { ctx.fillStyle = PALETTE.lime; const p = ease((local - 5.15) / 0.85); ctx.beginPath(); ctx.arc(x, y, p * 2400, 0, Math.PI * 2); ctx.fill(); }
}

function reveal(local: number): void {
  ctx.save(); ctx.strokeStyle = '#c5fa5822'; ctx.lineWidth = 1.5;
  for (let index = 0; index < 5; index++) ring(ctx, 1460, 536, 300 + index * 96 + local * 9, 0.45, PALETTE.lime, 1.5);
  ctx.restore();
  const p = ease(local / 1.15);
  revealText(ctx, copy.brand, 86, 298, 151, local / 0.8, { latin: true, weight: 700 });
  revealText(ctx, copy.director, 91, 405, 59, (local - 0.35) / 0.8, { color: PALETTE.lime });
  text(ctx, copy.intro, 94, 493, 29, { color: PALETTE.muted, weight: 400, alpha: ease((local - 0.8) / 0.8) });
  const drift = Math.sin(local * 0.65) * 15;
  panel(ctx, assets.editor, { x: mix(980, 680, p), y: mix(370, 325, p) + drift, width: 1160, height: 1160 * assets.editor.height / assets.editor.width, rotation: mix(-0.12, -0.032, p) + Math.sin(local * 0.6) * 0.008, skew: mix(-0.22, -0.04, p), alpha: p });
  cursor(ctx, 1570 + Math.sin(local) * 18, 814, 2.4, -0.25);
}

function focus(local: number): void {
  header(copy.focusTitle, copy.focusBody, local);
  const p = ease(local / 0.8);
  const x = mix(300, 570, p); const w = mix(1510, 1250, p);
  panel(ctx, assets.demo, { x, y: 345 + (1 - p) * 80, width: w, height: w * assets.demo.videoHeight / assets.demo.videoWidth, rotation: 0, radius: 18 });
  const stage = Math.floor(local / 2.6);
  const captions = copy.focusBody.split(' · ');
  captions.forEach((caption, index) => {
    const active = index === Math.min(stage, captions.length - 1);
    text(ctx, caption, 100, 452 + index * 129, active ? 67 : 45, { color: active ? PALETTE.lime : PALETTE.muted, weight: active ? 700 : 400, alpha: ease((local - 0.4 - index * 0.16) / 0.6) });
  });
}

function motion(local: number): void {
  header(copy.motionTitle, copy.motionBody, local);
  const active = Math.min(copy.motionModes.length - 1, Math.floor(local / 2.66));
  const rotation = Math.sin(local * 0.62) * 0.037;
  const width = 1150 + Math.sin(local * 0.45) * 36;
  panel(ctx, assets.demo, { x: 650, y: 345, width, height: width * APP_PREVIEW.height / APP_PREVIEW.width, rotation, skew: Math.sin(local * 0.55) * 0.07, radius: 26 }, APP_PREVIEW);
  copy.motionModes.forEach((value, index) => {
    const isActive = active === index;
    ctx.fillStyle = isActive ? PALETTE.lime : PALETTE.edge; ctx.fillRect(91, 449 + index * 129, 5, 51);
    text(ctx, value, 122, 490 + index * 129, 48, { color: isActive ? PALETTE.lime : PALETTE.muted, weight: isActive ? 700 : 400 });
  });
  const pulse = (local % 2.66) / 2.66;
  ring(ctx, 1717, 305, 17 + pulse * 29, (1 - pulse) * 0.65, PALETTE.lime, 3);
}

function backgrounds(local: number): void {
  header(copy.backgroundTitle, copy.backgroundBody, local);
  const p = ease(local / 0.9);
  panel(ctx, assets.backgroundLibrary, { x: 80, y: 403, width: 1000, height: 648, rotation: -0.047, alpha: 0.33 });
  panel(ctx, assets.backgrounds, { x: mix(730, 582, p), y: 347, width: 1250, height: 1250 * assets.backgrounds.videoHeight / assets.backgrounds.videoWidth, rotation: 0.019 * Math.sin(local * 0.8), alpha: p });
  cursor(ctx, 217 + Math.sin(local * 0.7) * 45, 641, 2.6, -0.15);
}

function editing(local: number): void {
  const exporting = local > 3.55;
  header(exporting ? copy.exportTitle : copy.editTitle, exporting ? copy.exportSpecs : copy.editBody, local);
  const p = ease(local / 0.8);
  panel(ctx, assets.editing, { x: 390, y: 322 + (1 - p) * 100, width: 1280, height: 1280 * assets.editing.videoHeight / assets.editing.videoWidth, rotation: 0, alpha: p });
  const progress = clamp(local / 6);
  ctx.save(); ctx.translate(86, 382); ctx.strokeStyle = PALETTE.lime; ctx.lineWidth = 4;
  const heights = [38, 91, 64, 138, 80, 154, 63, 103, 54, 114, 58];
  heights.forEach((height, index) => {
    const shift = 0.65 + Math.sin(local * 6 - index * 0.8) * 0.35;
    ctx.beginPath(); ctx.moveTo(index * 11, 118 - height * shift / 2); ctx.lineTo(index * 11, 118 + height * shift / 2); ctx.stroke();
  }); ctx.restore();
  ring(ctx, 1762, 860, 38 + progress * 20, 0.9, PALETTE.lime, 4);
}

function closing(local: number): void {
  const scale = mix(1.35, 1, ease(local / 1));
  ctx.save(); ctx.translate(960, 538); ctx.scale(scale, scale); ctx.translate(-960, -538);
  revealText(ctx, copy.closingFirst, 153, 394, 110, local / 0.8);
  revealText(ctx, copy.closingSecond, 153, 551, 134, (local - 0.4) / 0.8, { color: PALETTE.lime });
  ctx.drawImage(assets.logo, 140, 674, 115, 115);
  revealText(ctx, copy.brand, 287, 750, 97, (local - 1.2) / 0.8, { latin: true });
  text(ctx, copy.availability, 153, 858, 28, { color: PALETTE.muted, weight: 400, alpha: ease((local - 1.7) / 0.8) });
  text(ctx, copy.destination, 153, 914, 31, { color: PALETTE.white, latin: true, weight: 500, alpha: ease((local - 2) / 0.8) });
  ctx.restore();
  cursor(ctx, 1510, 460 + Math.sin(local * 0.5) * 40, 5.9, -0.2);
  const click = clamp((local - 2.3) / 1.2);
  ring(ctx, 1520, 465, mix(24, 310, click), Math.sin(click * Math.PI) * 0.65, PALETTE.lime, 3);
  if (local > 5.5) { ctx.globalAlpha = clamp((local - 5.5) / 0.5) * 0.35; ctx.fillStyle = PALETTE.black; ctx.fillRect(0, 0, FILM.width, FILM.height); ctx.globalAlpha = 1; }
}

export async function renderFrame(time: number): Promise<FrameResult> {
  if (!assets || !ctx) throw new Error('PROMO_NOT_READY');
  const safeTime = Math.max(0, Math.min(FILM.duration - 1 / FILM.fps, time));
  const scene = Math.min(SCENES.length - 2, SCENES.findIndex((start, index) => index < SCENES.length - 1 && safeTime >= start && safeTime < SCENES[index + 1]));
  const local = safeTime - SCENES[scene];
  if (scene === 2) await seek(assets.demo, local);
  if (scene === 3) {
    const mode = Math.min(CAMERA_SAMPLES.starts.length - 1, Math.floor(local / CAMERA_SAMPLES.step));
    await seek(assets.demo, CAMERA_SAMPLES.starts[mode] + (local - mode * CAMERA_SAMPLES.step) * CAMERA_SAMPLES.rates[mode]);
  }
  if (scene === 4) await seek(assets.backgrounds, local);
  if (scene === 5) await seek(assets.editing, local);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; backdrop(ctx, safeTime);
  if (scene !== 0 && scene !== 6) brandBar(ctx, assets.logo, copy.brand, safeTime);
  const renderers = [hook, reveal, focus, motion, backgrounds, editing, closing]; renderers[scene](local);
  if (scene > 0 && local < GEOMETRY.transitionSeconds) {
    const p = ease(local / GEOMETRY.transitionSeconds);
    ctx.fillStyle = PALETTE.lime; ctx.fillRect(mix(0, FILM.width, p), 0, FILM.width, FILM.height);
  }
  return { time: safeTime, scene };
}

export function jpeg(): string { return canvas.toDataURL('image/jpeg', 0.97).split(',')[1]; }
export function png(): string { return canvas.toDataURL('image/png').split(',')[1]; }
export { FILM, APP_PREVIEW };
