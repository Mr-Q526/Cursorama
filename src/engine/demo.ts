import { DEFAULT_SETTINGS, TIME } from '../../shared';
import type { PointerSample, Project } from '../../shared';
import { t } from '../i18n';
import { generateClips, lerp, smoothstep } from './motion';

export const DEMO = { width: 1600, height: 1000, duration: 16, fps: 30 } as const;
const COLORS = {
  background: '#f8f8f8', sidebar: '#f1f1f1', surface: '#ffffff',
  ink: '#333333', secondary: '#8d8d8d', border: '#e8e8e8', accent: '#6e6e6e',
  pastel: '#eaeaea', peach: '#e7e7e7', blue: '#e6e6e6',
} as const;
const WAYPOINTS: readonly (readonly [number, number, number, boolean])[] = [
  [0, 0.51, 0.74, false], [1.4, 0.76, 0.30, false], [2.4, 0.84, 0.225, true],
  [3.8, 0.65, 0.43, false], [5.6, 0.41, 0.53, true],
  [7.4, 0.55, 0.73, false], [8.4, 0.303, 0.763, true],
  [10.3, 0.59, 0.74, false], [11.7, 0.746, 0.46, true],
  [13.5, 0.58, 0.45, false], [16, 0.50, 0.62, false],
];

export function createDemoProject(): Project {
  const samples: PointerSample[] = [];
  for (let index = 0; index < WAYPOINTS.length - 1; index++) {
    const from = WAYPOINTS[index];
    const to = WAYPOINTS[index + 1];
    const steps = Math.ceil((to[0] - from[0]) * DEMO.fps);
    for (let step = 0; step < steps; step++) {
      const progress = step / steps;
      samples.push({ time: lerp(from[0], to[0], progress), x: lerp(from[1], to[1], smoothstep(progress)), y: lerp(from[2], to[2], smoothstep(progress)), kind: 'move' });
    }
    samples.push({ time: to[0], x: to[1], y: to[2], kind: to[3] ? 'click' : 'move', button: to[3] ? 'left' : undefined });
  }
  return {
    schemaVersion: 1, name: t.editor.demoName, duration: DEMO.duration, frameRate: DEMO.fps,
    width: DEMO.width, height: DEMO.height, samples,
    clips: generateClips(samples, DEMO.duration, DEFAULT_SETTINGS.mode),
    settings: { ...DEFAULT_SETTINGS, cursor: 'none' }, trimStart: 0, trimEnd: DEMO.duration,
    sourceType: 'demo', hasAudio: false, cursorEmbedded: false,
  };
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string = COLORS.ink, weight = 400): void {
  ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function projectCard(ctx: CanvasRenderingContext2D, x: number, name: string, body: string, tag: string, palette: string, kind: number, time: number): void {
  const card = { y: 362, width: 365, height: 272, cover: 152 };
  box(ctx, x, card.y, card.width, card.height, 17, COLORS.surface);
  box(ctx, x + 10, card.y + 10, card.width - 20, card.cover, 11, palette);
  ctx.save();
  ctx.translate(x + card.width / 2, card.y + 84);
  if (kind === 0) {
    ctx.rotate(-0.18);
    box(ctx, -87, -47, 140, 97, 8, '#626262');
    box(ctx, -46, -28, 140, 97, 8, '#eeeeee');
    text(ctx, 'L', -22, 24, 62, '#6d6d6d', 600);
    box(ctx, 28, -2, 39, 5, 2, '#a9a9a9');
    box(ctx, 28, 12, 27, 5, 2, '#a9a9a9');
  } else if (kind === 1) {
    ctx.rotate(0.12);
    box(ctx, -96, -53, 192, 117, 10, '#ffffff');
    box(ctx, -83, -37, 33, 86, 5, '#ececec');
    box(ctx, -39, -35, 119, 27, 5, '#aeaeae');
    box(ctx, -39, 3, 53, 46, 5, '#dbdbdb');
    box(ctx, 26, 3, 54, 46, 5, '#eaeaea');
  } else {
    for (let index = 0; index < 4; index++) {
      const colors = ['#8b8b8b', '#c6c6c6', '#dbdbdb', '#ababab'];
      ctx.fillStyle = colors[index];
      ctx.beginPath();
      ctx.arc(-81 + index * 55, Math.sin(index + time / 5) * 5, 43, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  text(ctx, name, x + 23, card.y + 198, 24, COLORS.ink, 600);
  text(ctx, body, x + 23, card.y + 232, 16, COLORS.secondary);
  box(ctx, x + 245, card.y + 180, 95, 28, 14, '#f4f4f4');
  text(ctx, tag, x + 260, card.y + 200, 13, COLORS.accent);
}

export function drawDemo(ctx: CanvasRenderingContext2D, time: number): void {
  const copy = t.demo;
  ctx.save();
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, DEMO.width, DEMO.height);
  ctx.fillStyle = COLORS.sidebar;
  ctx.fillRect(0, 0, 250, DEMO.height);
  ctx.fillStyle = COLORS.border;
  ctx.fillRect(249, 0, 1, DEMO.height);
  box(ctx, 38, 48, 46, 46, 13, COLORS.accent);
  ctx.fillStyle = '#f3f3f3';
  ctx.beginPath(); ctx.arc(60, 70, 12, 0, Math.PI * 2); ctx.fill();
  text(ctx, copy.productName, 99, 80, 30, COLORS.ink, 600);
  text(ctx, copy.workspace, 38, 140, 17, COLORS.secondary);
  const navigation = [copy.overview, copy.projects, copy.calendar, copy.library];
  navigation.forEach((label, index) => {
    const y = 220 + index * 68;
    if (index === 1) box(ctx, 20, y - 33, 210, 53, 10, '#e4e4e4');
    box(ctx, 43, y - 15, 18, 18, 4, index === 1 ? COLORS.accent : '#acacac');
    text(ctx, label, 79, y, 20, index === 1 ? COLORS.accent : '#828282', index === 1 ? 600 : 400);
  });
  text(ctx, copy.team, 40, 570, 16, COLORS.secondary);
  for (let index = 0; index < 3; index++) {
    ctx.fillStyle = ['#c1c1c1', '#bfbfbf', '#bfbfbf'][index];
    ctx.beginPath(); ctx.arc(51 + index * 35, 620, 18, 0, Math.PI * 2); ctx.fill();
  }
  box(ctx, 26, 853, 197, 114, 11, '#e7e7e7');
  text(ctx, copy.tasksHint, 41, 901, 14, '#7c7c7c');
  text(ctx, copy.saved, 41, 938, 15, COLORS.accent);
  box(ctx, 302, 43, 593, 50, 10, '#eeeeee');
  text(ctx, copy.search, 326, 75, 17, '#9d9d9d');
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath(); ctx.arc(1509, 66, 23, 0, Math.PI * 2); ctx.fill();
  text(ctx, 'M', 1499, 74, 21, '#f0f0f0', 500);
  text(ctx, copy.title, 302, 204, 41, COLORS.ink, 600);
  text(ctx, copy.subtitle, 305, 249, 19, COLORS.secondary);
  box(ctx, 1286, 185, 224, 52, 12, COLORS.accent);
  text(ctx, `+  ${copy.newProject}`, 1320, 219, 18, '#fbfbfb', 500);
  text(ctx, copy.allProjects, 305, 327, 20, COLORS.ink, 600);
  text(ctx, copy.inProgress, 474, 327, 18, COLORS.secondary);
  text(ctx, copy.done, 612, 327, 18, COLORS.secondary);
  box(ctx, 302, 344, 79, 3, 2, COLORS.accent);
  projectCard(ctx, 303, copy.cardTitle, copy.cardBody, copy.brand, COLORS.pastel, 0, time);
  projectCard(ctx, 698, copy.cardTitle2, copy.cardBody2, copy.experience, COLORS.peach, 1, time);
  projectCard(ctx, 1093, copy.cardTitle3, copy.cardBody3, copy.inspiration, COLORS.blue, 2, time);
  box(ctx, 303, 676, 760, 274, 17, COLORS.surface);
  text(ctx, copy.week, 330, 721, 23, COLORS.ink, 600);
  [copy.task1, copy.task2, copy.task3].forEach((label, index) => {
    const y = 770 + index * 61;
    const checked = time >= 8.4 && index === 0;
    box(ctx, 333, y - 18, 22, 22, 6, checked ? COLORS.accent : '#ececec');
    if (checked) text(ctx, '✓', 336, y - 1, 17, '#ffffff');
    text(ctx, label, 373, y, 19, checked ? COLORS.secondary : COLORS.ink);
    box(ctx, 946, y - 24, 87, 27, 13, checked ? '#f1f1f1' : '#f3f3f3');
    text(ctx, checked ? copy.done : copy.inProgress, 961, y - 5, 13, COLORS.secondary);
  });
  box(ctx, 1093, 676, 365, 274, 17, '#eeeeee');
  text(ctx, copy.members, 1120, 723, 23, COLORS.ink, 600);
  text(ctx, copy.membersHint, 1120, 763, 16, COLORS.secondary);
  for (let index = 0; index < 4; index++) {
    ctx.fillStyle = ['#9a9a9a', '#b0b0b0', '#a8a8a8', '#b5b5b5'][index];
    ctx.beginPath(); ctx.arc(1157 + index * 61, 840, 32, 0, Math.PI * 2); ctx.fill();
    text(ctx, ['M', 'Y', 'J', 'L'][index], 1148 + index * 61, 848, 22, '#ffffff', 500);
  }
  text(ctx, copy.activity, 1120, 916, 15, COLORS.secondary);
  if (time > 2.4 && time < 4.4) {
    const alpha = Math.min(1, (time - 2.4) * 5, (4.4 - time) * 4);
    ctx.globalAlpha = alpha;
    box(ctx, 596, 891, 417, 60, 13, '#3f3f3f');
    text(ctx, copy.toast, 632, 928, 19, '#f3f3f3');
  }
  ctx.restore();
}

export async function createDemoVideo(duration: number = DEMO.duration): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = DEMO.width; canvas.height = DEMO.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  const stream = canvas.captureStream(DEMO.fps);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  return new Promise((resolve) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); resolve(new Blob(chunks, { type: 'video/webm' })); };
    const start = performance.now();
    const frame = (): void => {
      const time = (performance.now() - start) / TIME.milliseconds;
      drawDemo(context, time);
      if (time < duration) requestAnimationFrame(frame);
      else recorder.stop();
    };
    recorder.start(); frame();
  });
}
