import { t } from '../src/i18n';
import { createDemoProject, frameGeometry, VideoRenderer } from '../src/engine';

export interface PreviewUIReport { focusRemoved: boolean; playbackControls: boolean; seek: boolean; pause: boolean; }
export interface RoundedFrameReport { corners: boolean; scaled: boolean; }
export interface FrameStepReport { right: boolean; left: boolean; rangeKeyboard: boolean; pausesPlayback: boolean; frameDisplay: boolean; }

const PREVIEW_QA = { poll: 40, timeout: 6000, radius: 60, cornerInset: 2, colorTolerance: 8, paintDelay: 160, clickX: 0.65, clickY: 0.6 } as const;
const FRAME_QA = { start: 2, rate: 30, tolerance: 0.00001, step: 1 / 30 } as const;

async function until(check: () => boolean): Promise<void> {
  const deadline = performance.now() + PREVIEW_QA.timeout;
  while (!check()) { if (performance.now() >= deadline) throw new Error('QA_PREVIEW_TIMEOUT'); await new Promise<void>((resolve) => setTimeout(resolve, PREVIEW_QA.poll)); }
}

export async function runFullscreenControlsQA(): Promise<PreviewUIReport> {
  await until(() => Boolean(document.fullscreenElement && document.querySelector('.fullscreen-playback input[type="range"]')));
  const controls = document.querySelector<HTMLElement>('.fullscreen-playback');
  if (!document.fullscreenElement || !controls || !controls.querySelector(`[aria-label="${t.playback.seek}"]`) || document.querySelector('.preview-hint')) throw new Error('QA_FULLSCREEN_CONTROLS_MISSING');
  const play = controls.querySelector<HTMLButtonElement>(`[aria-label="${t.editor.play}"]`);
  if (!play) throw new Error('QA_FULLSCREEN_PLAY_MISSING');
  play.click();
  await until(() => Boolean(controls.querySelector(`[aria-label="${t.editor.pause}"]`)));
  const pause = controls.querySelector<HTMLButtonElement>(`[aria-label="${t.editor.pause}"]`); pause?.click();
  await until(() => Boolean(controls.querySelector(`[aria-label="${t.editor.play}"]`)));
  const seek = controls.querySelector<HTMLInputElement>('input[type="range"]');
  if (!seek) throw new Error('QA_FULLSCREEN_PROGRESS_MISSING');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(seek, '2'); seek.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => controls.querySelector('.time-display')?.textContent?.startsWith('00:02') === true);
  const stage = document.querySelector('.preview-stage');
  const canvas = stage?.querySelector('canvas');
  if (!canvas) throw new Error('QA_PREVIEW_CANVAS_MISSING');
  await new Promise<void>((resolve) => setTimeout(resolve, PREVIEW_QA.paintDelay));
  const frame = canvas.toDataURL();
  const clips = document.querySelectorAll('.motion-clip').length;
  const bounds = canvas.getBoundingClientRect();
  const position = { bubbles: true, clientX: bounds.x + bounds.width * PREVIEW_QA.clickX, clientY: bounds.y + bounds.height * PREVIEW_QA.clickY };
  canvas.dispatchEvent(new PointerEvent('pointerdown', position));
  canvas.dispatchEvent(new MouseEvent('click', position));
  await new Promise<void>((resolve) => setTimeout(resolve, PREVIEW_QA.paintDelay));
  if (canvas.toDataURL() !== frame || document.querySelectorAll('.motion-clip').length !== clips || getComputedStyle(canvas).cursor !== 'default') throw new Error('QA_PREVIEW_CLICK_CHANGED_FOCUS');
  return { focusRemoved: true, playbackControls: true, seek: true, pause: true };
}

export async function runFrameStepUIQA(): Promise<FrameStepReport> {
  const range = document.querySelector<HTMLInputElement>('.playback-controls input[type="range"]');
  if (!range) throw new Error('QA_FRAME_RANGE_MISSING');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(range, String(FRAME_QA.start)); range.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => Math.abs(Number(range.value) - FRAME_QA.start) < FRAME_QA.tolerance);
  const key = (code: 'ArrowLeft' | 'ArrowRight', target: HTMLElement = document.body): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code, key: code }));
  };
  key('ArrowRight');
  await until(() => Math.abs(Number(range.value) - (FRAME_QA.start + FRAME_QA.step)) < FRAME_QA.tolerance);
  if (!document.querySelector('.time-display')?.textContent?.startsWith('00:02:01')) throw new Error('QA_FRAME_DISPLAY');
  key('ArrowLeft');
  await until(() => Math.abs(Number(range.value) - FRAME_QA.start) < FRAME_QA.tolerance);
  range.focus(); key('ArrowRight', range);
  await until(() => Math.abs(Number(range.value) - (FRAME_QA.start + FRAME_QA.step)) < FRAME_QA.tolerance);
  const play = document.querySelector<HTMLButtonElement>(`[aria-label="${t.editor.play}"]`);
  play?.click();
  await until(() => Boolean(document.querySelector(`[aria-label="${t.editor.pause}"]`)));
  const controlsButton = document.querySelector<HTMLButtonElement>(`[aria-label="${t.editor.pause}"]`);
  if (!controlsButton) throw new Error('QA_FRAME_PLAY_MISSING');
  controlsButton.focus(); key('ArrowLeft', controlsButton);
  await until(() => Boolean(document.querySelector(`[aria-label="${t.editor.play}"]`)));
  const stopped = Number(range.value);
  await new Promise<void>((resolve) => setTimeout(resolve, PREVIEW_QA.paintDelay));
  if (Math.abs(Number(range.value) - stopped) > FRAME_QA.tolerance) throw new Error('QA_FRAME_PLAYBACK_NOT_PAUSED');
  controlsButton.blur(); range.blur();
  return { right: true, left: true, rangeKeyboard: true, pausesPlayback: true, frameDisplay: true };
}

export function runRoundedFrameQA(): RoundedFrameReport {
  for (const width of [1280, 2560]) {
    const height = width * 9 / 16;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('QA_ROUNDED_CONTEXT_MISSING');
    const renderer = new VideoRenderer(canvas);
    const project = createDemoProject();
    project.settings = { ...project.settings, radius: PREVIEW_QA.radius, background: 'ink', shadow: 0, autoZoom: false, followCursor: false, clickEffect: false };
    const geometry = frameGeometry(width, height, project.width, project.height, project.settings.padding);
    const inset = PREVIEW_QA.cornerInset * width / 1280;
    const frameX = (width - geometry.width) / 2;
    const frameY = (height - geometry.height) / 2;
    const points = [[frameX + inset, frameY + inset], [frameX + geometry.width - inset, frameY + inset], [frameX + inset, frameY + geometry.height - inset], [frameX + geometry.width - inset, frameY + geometry.height - inset]];
    try {
      renderer.render({ ...project, sourceType: 'video' }, 0);
      const baseline = points.map(([x, y]) => Array.from(context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data));
      renderer.render(project, 0);
      points.forEach(([x, y], index) => {
        const pixel = context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        if (Array.from(pixel).some((channel, channelIndex) => Math.abs(channel - baseline[index][channelIndex]) > PREVIEW_QA.colorTolerance)) throw new Error(`QA_ROUNDED_CORNER_LEAK_${index}_${width}`);
      });
    } finally { renderer.dispose(); }
  }
  return { corners: true, scaled: true };
}
