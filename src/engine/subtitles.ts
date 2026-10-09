import type { SubtitleClip } from '../../shared';

export interface SubtitleStyle { fontRatio: number; lineHeight: number; maxWidthRatio: number; paddingRatio: number; bottomRatio: number; }
export const SUBTITLE_STYLE: SubtitleStyle = { fontRatio: 0.039, lineHeight: 1.45, maxWidthRatio: 0.82, paddingRatio: 0.022, bottomRatio: 0.075 };
const SUBTITLE_COLORS = { background: 'rgba(0, 0, 0, 0.76)', text: '#ffffff' } as const;
const MAX_SUBTITLE_LINES = 4;

function wrapSubtitle(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const character of paragraph) {
      if (line && context.measureText(line + character).width > width) { lines.push(line); line = character; }
      else line += character;
    }
    lines.push(line);
  }
  return lines.slice(0, MAX_SUBTITLE_LINES);
}

export function drawSubtitles(context: CanvasRenderingContext2D, subtitles: readonly SubtitleClip[], time: number, width: number, height: number): void {
  const active = subtitles.filter((subtitle) => time >= subtitle.start && time < subtitle.end && subtitle.text.trim());
  if (!active.length) return;
  context.save();
  const fontSize = Math.max(14, Math.min(width, height) * SUBTITLE_STYLE.fontRatio);
  const padding = height * SUBTITLE_STYLE.paddingRatio;
  const lineHeight = fontSize * SUBTITLE_STYLE.lineHeight;
  context.font = `500 ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  context.textAlign = 'center'; context.textBaseline = 'middle';
  const lines = wrapSubtitle(context, active.map((subtitle) => subtitle.text).join('\n'), width * SUBTITLE_STYLE.maxWidthRatio);
  const contentWidth = Math.max(...lines.map((line) => context.measureText(line).width));
  const boxWidth = contentWidth + padding * 2;
  const boxHeight = lines.length * lineHeight + padding;
  const x = (width - boxWidth) / 2;
  const y = height * (1 - SUBTITLE_STYLE.bottomRatio) - boxHeight;
  context.fillStyle = SUBTITLE_COLORS.background;
  context.beginPath(); context.roundRect(x, y, boxWidth, boxHeight, fontSize * 0.3); context.fill();
  context.fillStyle = SUBTITLE_COLORS.text;
  lines.forEach((line, index) => context.fillText(line, width / 2, y + padding / 2 + (index + 0.5) * lineHeight));
  context.restore();
}
