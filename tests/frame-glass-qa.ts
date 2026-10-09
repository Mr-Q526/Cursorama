import { FRAME_LIMITS } from '../shared';
import { createDemoProject, FrameGlass, frameGeometry, frameMaterial, VideoRenderer } from '../src/engine';

export interface GlassFrameReport {
  softenedEdges: boolean;
  centerPreserved: boolean;
  scaled: boolean;
  flatFallback: boolean;
  maxCenterDifference: number;
  image: string;
}

const GLASS_QA = { width: 1280, height: 720, centerWidth: 160, centerHeight: 100, tolerance: 3, minimumEdgeDifference: 5, radius: 60, halfStrength: 0.5 } as const;

function centerPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const context = canvas.getContext('2d'); if (!context) throw new Error('QA_GLASS_CONTEXT_MISSING');
  return context.getImageData(Math.floor((canvas.width - GLASS_QA.centerWidth) / 2), Math.floor((canvas.height - GLASS_QA.centerHeight) / 2), GLASS_QA.centerWidth, GLASS_QA.centerHeight).data;
}

function difference(first: Uint8ClampedArray, second: Uint8ClampedArray): number {
  let maximum = 0;
  for (let index = 0; index < first.length; index++) maximum = Math.max(maximum, Math.abs(first[index] - second[index]));
  return maximum;
}

export function runGlassFrameQA(): GlassFrameReport {
  let maxCenterDifference = 0;
  let image = '';
  for (const width of [GLASS_QA.width, GLASS_QA.width * 2]) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width * 9 / 16;
    const context = canvas.getContext('2d'); if (!context) throw new Error('QA_GLASS_CONTEXT_MISSING');
    const renderer = new VideoRenderer(canvas);
    const project = createDemoProject();
    project.settings = { ...project.settings, background: 'ink', shadow: 0, autoZoom: false, followCursor: false, edgeGlass: 0 };
    const geometry = frameGeometry(canvas.width, canvas.height, project.width, project.height, project.settings.padding);
    const outset = FRAME_LIMITS.glassOutset * width / FRAME_LIMITS.referenceWidth;
    const edgeY = Math.floor((canvas.height - geometry.height) / 2 - outset * GLASS_QA.halfStrength);
    try {
      for (const radius of [0, GLASS_QA.radius]) {
        project.settings.radius = radius; project.settings.edgeGlass = 0;
        renderer.render(project, 0);
        const center = centerPixels(canvas);
        const edge = context.getImageData(width / 2, edgeY, 1, 1).data;
        project.settings.edgeGlass = FRAME_LIMITS.edgeGlass;
        renderer.render(project, 0);
        maxCenterDifference = Math.max(maxCenterDifference, difference(center, centerPixels(canvas)));
        if (difference(edge, context.getImageData(width / 2, edgeY, 1, 1).data) < GLASS_QA.minimumEdgeDifference) throw new Error(`QA_GLASS_RIM_MISSING_${width}_${radius}`);
      }
      if (width === GLASS_QA.width) image = canvas.toDataURL('image/png');
      project.settings.background = 'paper'; project.settings.edgeGlass = 0;
      renderer.render(project, 0); const lightCenter = centerPixels(canvas);
      project.settings.edgeGlass = FRAME_LIMITS.edgeGlass; renderer.render(project, 0);
      maxCenterDifference = Math.max(maxCenterDifference, difference(lightCenter, centerPixels(canvas)));
    } finally { renderer.dispose(); }
  }
  if (maxCenterDifference > GLASS_QA.tolerance) throw new Error(`QA_GLASS_CENTER_BLURRED_${maxCenterDifference}`);
  const fallback = new FrameGlass();
  const background = document.createElement('canvas'); background.width = GLASS_QA.width; background.height = GLASS_QA.height;
  const source = document.createElement('canvas'); source.width = GLASS_QA.width / 2; source.height = GLASS_QA.height / 2;
  const sourceContext = source.getContext('2d'); const backgroundContext = background.getContext('2d');
  if (!sourceContext || !backgroundContext) throw new Error('QA_GLASS_FALLBACK_CONTEXT_MISSING');
  sourceContext.fillStyle = '#ffffff'; sourceContext.fillRect(0, 0, source.width, source.height);
  sourceContext.fillStyle = '#000000'; sourceContext.fillRect(source.width / 2, 0, source.width / 2, source.height);
  backgroundContext.fillStyle = '#000000'; backgroundContext.fillRect(0, 0, background.width, background.height);
  const project = createDemoProject();
  try {
    fallback.prepare(background, project.settings);
    const clearMetrics = frameMaterial({ ...project.settings, edgeGlass: 0 }, background.width, source.width, source.height);
    const clear = centerPixels(fallback.composite(source, background.width, background.height, source.width, source.height, clearMetrics));
    const glassMetrics = frameMaterial({ ...project.settings, edgeGlass: FRAME_LIMITS.edgeGlass }, background.width, source.width, source.height);
    const frosted = fallback.composite(source, background.width, background.height, source.width, source.height, glassMetrics);
    if (difference(clear, centerPixels(frosted)) > GLASS_QA.tolerance) throw new Error('QA_GLASS_FALLBACK_CENTER_BLURRED');
    const rim = frosted.getContext('2d')?.getImageData(frosted.width / 2, glassMetrics.outset * GLASS_QA.halfStrength, 1, 1).data;
    if (!rim || rim[3] === 0) throw new Error('QA_GLASS_FALLBACK_RIM_MISSING');
  } finally { fallback.dispose(); }
  return { softenedEdges: true, centerPreserved: true, scaled: true, flatFallback: true, maxCenterDifference, image };
}
