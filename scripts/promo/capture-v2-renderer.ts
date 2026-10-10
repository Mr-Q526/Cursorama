/** 用产品现有录制与渲染器处理本次真实界面录像，不加载内置演示。 */
import { DEFAULT_SETTINGS, PRESETS, packProjectMedia, projectBytes, readProjectBytes } from '../../shared';
import type { EffectMode, ExportResult, Project } from '../../shared';
import { projectMetadata, runtimeFromStored } from '../../src/engine/project-media';
import { prepareRecording, startRecording } from '../../src/engine/recorder';
import type { RecordingSession } from '../../src/engine/recorder';
import { renderExport } from '../../src/engine/exporter';

export interface RawCapture { bytes: number[]; duration: number; width: number; height: number; samples: number; clips: number; }
let recording: RecordingSession | undefined;
let project: Project | undefined;
const DURATION = 16;

export async function begin(sourceId: string): Promise<void> {
  const prepared = await prepareRecording({ sourceId, microphone: false, systemAudio: false, fps: 30 });
  recording = await startRecording(prepared, 0, () => undefined, () => undefined, new AbortController().signal);
}

export async function finish(): Promise<RawCapture> {
  if (!recording) throw new Error('PROMO_V2_RECORDING_MISSING');
  project = await recording.stop(); recording = undefined;
  project.name = '一次真实操作，自动成为演示';
  project.trimStart = 0; project.trimEnd = Math.min(DURATION, project.duration);
  project.settings = { ...DEFAULT_SETTINGS, background: 'silk', padding: 8, radius: 20, edgeGlass: 18, shadow: 42, cursor: 'none', clickEffect: true };
  if (!project.videoBlob) throw new Error('PROMO_V2_SOURCE_MISSING');
  return { bytes: Array.from(new Uint8Array(await project.videoBlob.arrayBuffer())), duration: project.duration, width: project.width, height: project.height, samples: project.samples.length, clips: project.clips.length };
}

export async function render(mode: EffectMode): Promise<ExportResult> {
  if (!project) throw new Error('PROMO_V2_PROJECT_MISSING');
  const preset = PRESETS[mode];
  const output: Project = { ...project, name: `result-${mode}`, settings: { ...project.settings, mode, ...preset }, clips: project.clips.map((clip) => ({ ...clip, mode, zoom: preset.zoom })) };
  return renderExport(output, { resolution: '1080p', format: 'mp4', fps: 30, quality: 'high' }, () => undefined, new AbortController().signal);
}

export async function importRecordedProject(): Promise<void> {
  if (!project) throw new Error('PROMO_V2_PROJECT_MISSING');
  const input = document.querySelector<HTMLInputElement>('input[accept=".cursorama"]');
  if (!input) throw new Error('PROMO_V2_PROJECT_INPUT_MISSING');
  const file = new File([projectBytes(projectMetadata(project), await packProjectMedia(project)).buffer as ArrayBuffer], '真实录制.cursorama');
  const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function restoreRecordedProject(bytes: number[]): void {
  project = runtimeFromStored(readProjectBytes(Uint8Array.from(bytes)));
  project.settings = { ...project.settings, background: 'silk' };
  project.editing = undefined; project.mediaAssets = undefined; project.media = undefined;
}
