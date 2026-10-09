import { LIBRARY_COVER } from '../../shared';

export type CoverCanvas = HTMLCanvasElement | null;

export function previewLibraryCover(canvas: CoverCanvas = document.querySelector<HTMLCanvasElement>('.preview-stage canvas')): string | undefined {
  if (!canvas?.width || !canvas.height) return undefined;
  const cover = document.createElement('canvas');
  cover.width = LIBRARY_COVER.width; cover.height = LIBRARY_COVER.height;
  const context = cover.getContext('2d', { alpha: false });
  if (!context) return undefined;
  const scale = Math.min(cover.width / canvas.width, cover.height / canvas.height);
  const width = canvas.width * scale; const height = canvas.height * scale;
  context.fillStyle = LIBRARY_COVER.background; context.fillRect(0, 0, cover.width, cover.height);
  context.drawImage(canvas, (cover.width - width) / 2, (cover.height - height) / 2, width, height);
  return cover.toDataURL('image/jpeg', LIBRARY_COVER.quality);
}
