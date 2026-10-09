import { packProjectMedia, projectBytes, readProjectBytes, SOURCE_MEDIA_ID, timelineDuration, unpackProjectMedia } from '../shared';
import type { Project } from '../shared';
import { createDemoProject, loadVideo, projectMetadata, runtimeFromStored, seekVideo } from '../src/engine';
import { t } from '../src/i18n';

export interface EditingUIReport {
  projectId: string; split: boolean; deletion: boolean; speed: boolean; localVideo: boolean; music: boolean; subtitles: boolean;
  restoredMedia: boolean; exportPath: string; duration: number; decodedDuration: number; subtitlePixels: number; audioLevel: number; finalSegment: boolean;
}
const QA = { poll: 40, timeout: 30_000, paint: 180, width: 640, height: 360, videoDuration: 1, fps: 30, sourceDuration: 2, subtitle: '字幕烧录验证', projectName: '基础剪辑与素材恢复验证', sampleRate: 24_000, tone: 440, audioVolume: 0.15, pixelTolerance: 28, audioMinimum: 0.005 } as const;
const BLUE = { red: 35, green: 80, blue: 195 } as const;
const RED = { red: 185, green: 45, blue: 45 } as const;

async function until<T>(read: () => T | undefined | Promise<T | undefined>): Promise<T> {
  const deadline = performance.now() + QA.timeout;
  while (performance.now() < deadline) { const result = await read(); if (result !== undefined) return result; await new Promise<void>((resolve) => setTimeout(resolve, QA.poll)); }
  throw new Error(`QA_EDIT_TIMEOUT:${document.querySelector('.toast')?.textContent}`);
}

function button(label: string, root: Document | HTMLElement = document): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label);
  if (!found || found.disabled) throw new Error(`QA_EDIT_BUTTON_MISSING:${label}`);
  return found;
}

function value(input: HTMLInputElement | HTMLTextAreaElement, next: string): void {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('QA_EDIT_SETTER_MISSING');
  setter.call(input, next); input.dispatchEvent(new Event('input', { bubbles: true }));
}

function labelInput(label: string): HTMLInputElement {
  const found = Array.from(document.querySelectorAll<HTMLLabelElement>('.editing-panel label')).find((item) => item.textContent?.startsWith(label))?.querySelector('input');
  if (!found) throw new Error(`QA_EDIT_INPUT_MISSING:${label}`);
  return found;
}

function selectSegment(index: number): void {
  const item = document.querySelectorAll<HTMLButtonElement>('.segment-list button')[index];
  if (!item) throw new Error('QA_EDIT_SEGMENT_MISSING'); item.click();
}

function seek(time: number): void {
  const progress = document.querySelector<HTMLInputElement>('.playback-progress'); if (!progress) throw new Error('QA_EDIT_PROGRESS_MISSING'); value(progress, String(time));
}

async function chooseFile(input: HTMLInputElement, file: File): Promise<void> {
  const files = new DataTransfer(); files.items.add(file); input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => !document.querySelector('.processing-overlay') && !document.querySelector('.editing-panel [role="status"]') ? true : undefined);
}

async function insertFile(kind: 'video' | 'audio', file: File): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('[data-editing-media]'); if (!input) throw new Error('QA_EDIT_MEDIA_INPUT_MISSING');
  const click = input.click; input.click = () => undefined;
  try { button(kind === 'video' ? t.editing.insertVideo : t.editing.insertMusic).click(); }
  finally { input.click = click; }
  const before = document.querySelectorAll('.timeline-segment').length;
  const beforeMusic = document.querySelectorAll('.music-track .media-clip').length;
  await chooseFile(input, file);
  await until(() => (kind === 'video' ? document.querySelectorAll('.timeline-segment').length > before : document.querySelectorAll('.music-track .media-clip').length > beforeMusic) ? true : undefined);
}

async function solidVideo(color: typeof BLUE | typeof RED): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = QA.width; canvas.height = QA.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('QA_EDIT_CONTEXT_MISSING');
  context.fillStyle = `rgb(${color.red},${color.green},${color.blue})`; context.fillRect(0, 0, canvas.width, canvas.height);
  const stream = canvas.captureStream(QA.fps);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
  const chunks: Blob[] = []; recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start();
  const interval = setInterval(() => context.fillRect(0, 0, canvas.width, canvas.height), 1000 / QA.fps);
  await new Promise<void>((resolve) => setTimeout(resolve, QA.videoDuration * 1000));
  recorder.stop(); await stopped; clearInterval(interval); stream.getTracks().forEach((track) => track.stop());
  const { fixWebmDuration } = await import('@fix-webm-duration/fix');
  return fixWebmDuration(new Blob(chunks, { type: recorder.mimeType }), QA.videoDuration * 1000, { logger: false });
}

function toneWav(seconds: number): Blob {
  const samples = Math.ceil(seconds * QA.sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2); const data = new DataView(buffer);
  const write = (offset: number, text: string): void => { Array.from(text).forEach((character, index) => data.setUint8(offset + index, character.charCodeAt(0))); };
  write(0, 'RIFF'); data.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt '); data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, QA.sampleRate, true); data.setUint32(28, QA.sampleRate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); write(36, 'data'); data.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++) data.setInt16(44 + index * 2, Math.sin(index / QA.sampleRate * QA.tone * Math.PI * 2) * QA.audioVolume * 32767, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

function pixelMatches(context: CanvasRenderingContext2D, color: typeof BLUE | typeof RED): boolean {
  const pixel = context.getImageData(QA.width / 2, QA.height / 2, 1, 1).data;
  return [color.red, color.green, color.blue].every((channel, index) => Math.abs(pixel[index] - channel) < QA.pixelTolerance);
}

async function verifyExport(project: Project, bytes: ArrayBuffer): Promise<Pick<EditingUIReport, 'decodedDuration' | 'subtitlePixels' | 'audioLevel' | 'finalSegment'>> {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  const video = await loadVideo(url);
  const canvas = document.createElement('canvas'); canvas.width = QA.width; canvas.height = QA.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('QA_EDIT_CONTEXT_MISSING');
  const audio = new AudioContext();
  try {
    const blue = project.editing?.segments.find((segment) => segment.mediaId !== SOURCE_MEDIA_ID);
    if (!blue) throw new Error('QA_EDIT_IMPORTED_SEGMENT_MISSING');
    let position = 0; for (const segment of project.editing?.segments ?? []) { if (segment.id === blue.id) break; position += (segment.sourceOut - segment.sourceIn) / segment.speed; }
    await seekVideo(video, position + QA.videoDuration / 2);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (!pixelMatches(context, BLUE)) throw new Error('QA_EDIT_INSERTED_VIDEO_NOT_EXPORTED');
    const pixels = context.getImageData(0, QA.height * 0.74, QA.width, QA.height * 0.22).data;
    let subtitlePixels = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 200 && pixels[index + 1] > 200 && pixels[index + 2] > 200) subtitlePixels++;
    if (subtitlePixels < 60) throw new Error('QA_EDIT_SUBTITLE_NOT_BURNED');
    const duration = timelineDuration(project);
    await seekVideo(video, duration - 0.15); context.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (!pixelMatches(context, RED)) throw new Error('QA_EDIT_FINAL_SEGMENT_MISSING');
    const input = audio.createMediaElementSource(video); const analyser = audio.createAnalyser(); const gain = audio.createGain(); gain.gain.value = 0;
    input.connect(analyser); analyser.connect(gain); gain.connect(audio.destination); await audio.resume();
    await seekVideo(video, 0.15); await video.play();
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    const waveform = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(waveform);
    const audioLevel = Math.sqrt(waveform.reduce((sum, sample) => sum + sample * sample, 0) / waveform.length);
    if (audioLevel < QA.audioMinimum) throw new Error(`QA_EDIT_MUSIC_SILENT:${audioLevel}`);
    if (Math.abs(video.duration - duration) > 0.12) throw new Error(`QA_EDIT_EXPORT_DURATION:${video.duration}/${duration}`);
    return { decodedDuration: video.duration, subtitlePixels, audioLevel, finalSegment: true };
  } finally { video.pause(); video.removeAttribute('src'); video.load(); await audio.close(); URL.revokeObjectURL(url); }
}

export async function runEditingUIQA(): Promise<EditingUIReport> {
  const desktop = window.desktop; if (!desktop) throw new Error('QA_EDIT_DESKTOP_REQUIRED');
  const base: Project = { ...createDemoProject(), name: QA.projectName, duration: QA.sourceDuration, trimStart: 0, trimEnd: QA.sourceDuration, settings: { ...createDemoProject().settings, padding: 0, radius: 0, edgeGlass: 0, shadow: 0, autoZoom: false, followCursor: false, clickEffect: false, cursor: 'none' } };
  const projectInput = document.querySelector<HTMLInputElement>('input[accept=".cursorama"]'); if (!projectInput) throw new Error('QA_EDIT_PROJECT_INPUT_MISSING');
  await chooseFile(projectInput, new File([projectBytes(projectMetadata(base), await packProjectMedia(base)).buffer as ArrayBuffer], '剪辑验证.cursorama'));
  await until(() => document.querySelector<HTMLInputElement>('.project-name')?.value === QA.projectName ? true : undefined);
  button(t.editing.tab).click();
  await until(() => document.querySelector('.editing-panel') ? true : undefined);
  seek(1); await new Promise<void>((resolve) => setTimeout(resolve, QA.poll)); button(t.editing.split).click();
  await until(() => document.querySelectorAll('.timeline-segment').length === 2 ? true : undefined);
  selectSegment(0); await new Promise<void>((resolve) => setTimeout(resolve, QA.poll)); button(t.editing.delete).click();
  await until(() => document.querySelectorAll('.timeline-segment').length === 1 ? true : undefined);
  selectSegment(0); await new Promise<void>((resolve) => setTimeout(resolve, QA.poll));
  const speed = document.querySelector<HTMLSelectElement>('.editing-panel select'); if (!speed) throw new Error('QA_EDIT_SPEED_MISSING'); speed.value = '2'; speed.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => document.querySelector<HTMLInputElement>('.playback-progress')?.max === '0.5' ? true : undefined);
  seek(0.5); await new Promise<void>((resolve) => setTimeout(resolve, QA.poll));
  await insertFile('video', new File([await solidVideo(BLUE)], '蓝色片段.webm', { type: 'video/webm' }));
  seek(1.5); await new Promise<void>((resolve) => setTimeout(resolve, QA.poll));
  await insertFile('video', new File([await solidVideo(RED)], '红色片段.webm', { type: 'video/webm' }));
  seek(0); await new Promise<void>((resolve) => setTimeout(resolve, QA.poll));
  await insertFile('audio', new File([toneWav(3)], '音轨验证.wav', { type: 'audio/wav' }));
  seek(0.5); await new Promise<void>((resolve) => setTimeout(resolve, QA.poll)); button(t.editing.addSubtitle).click();
  await until(() => document.querySelector<HTMLTextAreaElement>('.subtitle-editor') ?? undefined);
  const subtitle = document.querySelector<HTMLTextAreaElement>('.subtitle-editor'); if (!subtitle) throw new Error('QA_EDIT_SUBTITLE_INPUT_MISSING'); value(subtitle, QA.subtitle); value(labelInput(t.editing.end), '1.5');
  const saved = await until(async () => {
    const id = document.querySelector<HTMLElement>('.project-bar')?.dataset.projectId; if (!id || document.querySelector('.save-status')?.textContent !== t.library.saved) return undefined;
    const stored = await desktop.openLibraryProject(id); return stored.data.editing?.subtitles.some((item) => item.text === QA.subtitle && item.end === 1.5) && stored.data.mediaAssets?.length === 3 ? { id, stored } : undefined;
  });
  const restored = runtimeFromStored(readProjectBytes(projectBytes(saved.stored.data, saved.stored.bytes)));
  const unpacked = unpackProjectMedia(saved.stored.data, saved.stored.bytes);
  const expectedDuration = 0.5 + (restored.mediaAssets ?? []).filter((asset) => asset.kind === 'video').reduce((duration, asset) => duration + asset.duration, 0);
  if (unpacked.assets.size !== 3 || Math.abs(timelineDuration(restored) - expectedDuration) > 0.001 || restored.editing?.segments[0].speed !== 2) throw new Error(`QA_EDIT_PROJECT_MEDIA_NOT_RESTORED:${unpacked.assets.size}:${timelineDuration(restored)}:${restored.editing?.segments[0].speed}`);
  const exportButton = button(t.editor.exportVideo); exportButton.click();
  const dialog = await until(() => document.querySelector<HTMLElement>('[role="dialog"]') ?? undefined);
  const resolution = Array.from(dialog.querySelectorAll<HTMLSelectElement>('select')).find((item) => item.closest('label')?.textContent?.startsWith(t.export.resolution));
  if (!resolution) throw new Error('QA_EDIT_EXPORT_RESOLUTION_MISSING'); resolution.value = '720p'; resolution.dispatchEvent(new Event('change', { bubbles: true })); button(t.export.export, dialog).click();
  await until(() => { const error = document.querySelector('.error-message'); if (error) throw new Error(`QA_EDIT_EXPORT_FAILED:${error.textContent}`); return document.querySelector('.export-success') ? true : undefined; });
  const item = (await desktop.listLibrary()).projects.find((project) => project.id === saved.id); const output = item?.videos.at(-1); if (!output) throw new Error('QA_EDIT_EXPORTED_FILE_MISSING');
  const verified = await verifyExport(restored, await desktop.openLibraryVideo(saved.id, output.id));
  button(t.export.close, dialog).click();
  await until(() => !document.querySelector('[role="dialog"]') ? true : undefined);
  seek(1);
  await new Promise<void>((resolve) => setTimeout(resolve, QA.paint));
  for (const asset of Object.values(restored.media ?? {})) URL.revokeObjectURL(asset.url);
  if (restored.videoUrl) URL.revokeObjectURL(restored.videoUrl);
  return { projectId: saved.id, split: true, deletion: true, speed: true, localVideo: true, music: true, subtitles: true, restoredMedia: true, exportPath: output.path, duration: timelineDuration(restored), ...verified };
}

export async function restoreEditingUIQA(id: string): Promise<boolean> {
  const desktop = window.desktop; if (!desktop) throw new Error('QA_EDIT_DESKTOP_REQUIRED');
  button(t.navigation.library).click();
  const projectButton = await until(() => document.querySelector<HTMLButtonElement>(`.library-page [data-project-id="${id}"]`) ?? undefined); projectButton.click();
  await until(() => document.querySelectorAll('.timeline-segment').length === 3 && !document.querySelector('.processing-overlay') ? true : undefined);
  const stored = await desktop.openLibraryProject(id);
  if (stored.data.mediaAssets?.length !== 3 || stored.data.editing?.music.length !== 1 || stored.data.editing.subtitles[0]?.text !== QA.subtitle) throw new Error('QA_EDIT_RELOAD_LOST_MEDIA');
  seek(1); await new Promise<void>((resolve) => setTimeout(resolve, QA.paint));
  const preview = document.querySelector<HTMLCanvasElement>('.preview-stage canvas'); if (!preview) throw new Error('QA_EDIT_RELOAD_PREVIEW_MISSING');
  const sample = document.createElement('canvas'); sample.width = QA.width; sample.height = QA.height; const context = sample.getContext('2d'); if (!context) throw new Error('QA_EDIT_CONTEXT_MISSING'); context.drawImage(preview, 0, 0, QA.width, QA.height);
  if (!pixelMatches(context, BLUE)) throw new Error('QA_EDIT_RELOAD_IMPORTED_VIDEO_MISSING');
  return true;
}
