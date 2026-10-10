import { packProjectMedia, projectBytes, readProjectBytes, unpackProjectMedia } from '../shared';
import type { MediaAsset, Project } from '../shared';
import { createDemoProject, loadVideo, projectMetadata, renderExport, runtimeFromStored, seekVideo } from '../src/engine';
import { t } from '../src/i18n';
import { getSoundtrack, insertSoundtrack, loadSoundtrackAsset, SOUNDTRACK_DEFAULTS, SOUNDTRACK_FILTERS, SOUNDTRACKS } from '../src/soundtracks';

export interface SoundtrackAssetReport { protocol: string; count: number; bytes: number; decoded: boolean; stereo: boolean; restoredMedia: boolean; }
export interface SoundtrackExportReport { path: string; duration: number; volume: number; }
export interface SoundtrackDecodedExportReport { duration: number; audioLevel: number; }
export interface SoundtrackUIReport { cards: number; categories: boolean; auditionStarted: boolean; auditionStopped: boolean; inserted: boolean; projectId: string; restored: boolean; editOpened: boolean; removed: boolean; }
const QA = { timeout: 30_000, poll: 50, duration: 4, fps: 30, durationTolerance: 0.15, audioMinimum: 0.001, stopSettle: 200, name: '原创配乐真实导出验证' } as const;

async function until<T>(stage: string, read: () => T | undefined | Promise<T | undefined>): Promise<T> {
  const deadline = performance.now() + QA.timeout;
  while (performance.now() < deadline) {
    const result = await read();
    if (result !== undefined) return result;
    await new Promise<void>((resolve) => setTimeout(resolve, QA.poll));
  }
  throw new Error(`QA_SOUNDTRACK_TIMEOUT:${stage}:${JSON.stringify({ cards: document.querySelectorAll('.soundtrack-card').length, active: document.querySelector('.soundtrack-card.playing')?.getAttribute('data-soundtrack-id'), progressed: document.querySelectorAll('.soundtrack-waveform .played').length, music: document.querySelectorAll('.music-track .media-clip').length, saving: document.querySelector('.save-status')?.textContent, toast: document.querySelector('.toast')?.textContent })}`);
}

function fixture(): Project {
  return { ...createDemoProject(), name: QA.name, duration: QA.duration, trimStart: 0, trimEnd: QA.duration, samples: [], clips: [], settings: { ...createDemoProject().settings, autoZoom: false, followCursor: false, cursor: 'none', clickEffect: false } };
}

function releaseProject(project: Project): void {
  for (const asset of Object.values(project.media ?? {})) URL.revokeObjectURL(asset.url);
  if (project.videoUrl) URL.revokeObjectURL(project.videoUrl);
  if (project.backgroundImageAsset) URL.revokeObjectURL(project.backgroundImageAsset.url);
}

export async function runSoundtrackAssetsQA(): Promise<SoundtrackAssetReport> {
  const assets: MediaAsset[] = [];
  const audio = new AudioContext();
  let restored: Project | undefined;
  try {
    let project = fixture();
    for (const track of SOUNDTRACKS) {
      const asset = await loadSoundtrackAsset(track);
      assets.push(asset);
      const decoded = await audio.decodeAudioData(await asset.blob.arrayBuffer());
      if (decoded.numberOfChannels !== 2 || Math.abs(decoded.duration - track.duration) > QA.durationTolerance || Math.abs(asset.duration - track.duration) > QA.durationTolerance) throw new Error(`QA_SOUNDTRACK_DECODE:${track.id}`);
      project = insertSoundtrack(project, asset, 0).project;
    }
    const stored = readProjectBytes(projectBytes(projectMetadata(project), await packProjectMedia(project)));
    const unpacked = unpackProjectMedia(stored.data, stored.bytes);
    restored = runtimeFromStored(stored);
    if (unpacked.assets.size !== SOUNDTRACKS.length || restored.editing?.music.length !== SOUNDTRACKS.length) throw new Error('QA_SOUNDTRACK_RESTORE_COUNT');
    for (const asset of assets) {
      const restoredAsset = restored.media?.[asset.id];
      if (!restoredAsset || restoredAsset.blob.size !== asset.blob.size || !unpacked.assets.get(asset.id)) throw new Error('QA_SOUNDTRACK_RESTORE_BYTES');
    }
    return { protocol: location.protocol, count: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.blob.size, 0), decoded: true, stereo: true, restoredMedia: true };
  } finally {
    for (const asset of assets) URL.revokeObjectURL(asset.url);
    if (restored) releaseProject(restored);
    if (audio.state !== 'closed') await audio.close();
  }
}

export async function runSoundtrackExportQA(): Promise<SoundtrackExportReport> {
  const asset = await loadSoundtrackAsset(SOUNDTRACKS[0]);
  try {
    const { project } = insertSoundtrack(fixture(), asset, 0);
    const result = await renderExport(project, { resolution: '720p', format: 'mp4', fps: QA.fps, quality: 'standard' }, () => undefined, new AbortController().signal);
    if (!result.path || result.cancelled) throw new Error('QA_SOUNDTRACK_EXPORT_MISSING');
    return { path: result.path, duration: QA.duration, volume: SOUNDTRACK_DEFAULTS.volume };
  } finally { URL.revokeObjectURL(asset.url); }
}

export async function verifySoundtrackDecodedExportQA(url: string): Promise<SoundtrackDecodedExportReport> {
  const video = await loadVideo(url);
  const audio = new AudioContext();
  try {
    if (Math.abs(video.duration - QA.duration) > QA.durationTolerance) throw new Error('QA_SOUNDTRACK_EXPORT_DURATION');
    const input = audio.createMediaElementSource(video);
    const analyser = audio.createAnalyser();
    const muted = audio.createGain(); muted.gain.value = 0;
    input.connect(analyser); analyser.connect(muted); muted.connect(audio.destination);
    await audio.resume(); await seekVideo(video, 1); await video.play();
    const waveform = new Float32Array(analyser.fftSize);
    const audioLevel = await until('export-audio-level', () => {
      analyser.getFloatTimeDomainData(waveform);
      const level = Math.sqrt(waveform.reduce((sum, value) => sum + value * value, 0) / waveform.length);
      if (level >= QA.audioMinimum) return level;
      if (video.ended) throw new Error('QA_SOUNDTRACK_EXPORT_SILENT');
      return undefined;
    });
    return { duration: video.duration, audioLevel };
  } finally {
    video.pause(); video.removeAttribute('src'); video.load();
    if (audio.state !== 'closed') await audio.close();
  }
}

function button(label: string, root: Document | HTMLElement = document): HTMLButtonElement {
  const element = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label);
  if (!element || element.disabled) throw new Error(`QA_SOUNDTRACK_BUTTON:${label}`);
  return element;
}

export async function runSoundtrackUIQA(): Promise<SoundtrackUIReport> {
  const desktop = window.desktop;
  if (!desktop) throw new Error('QA_SOUNDTRACK_DESKTOP_REQUIRED');
  const launcher = document.querySelector<HTMLButtonElement>('[data-action="open-audio"]');
  if (!launcher || launcher.disabled) throw new Error('QA_SOUNDTRACK_ENTRY_MISSING');
  launcher.click();
  await until('open-panel', () => document.querySelector('.soundtrack-panel') ? true : undefined);
  const count = document.querySelectorAll('.soundtrack-card').length;
  if (count !== SOUNDTRACKS.length) throw new Error('QA_SOUNDTRACK_CARDS');
  for (const category of SOUNDTRACK_FILTERS) {
    button(t.soundtracks.categories[category], document.querySelector<HTMLElement>('.soundtrack-filters') ?? document).click();
    const expected = category === 'all' ? SOUNDTRACKS.length : SOUNDTRACKS.filter((item) => item.category === category).length;
    await until(`filter-${category}`, () => document.querySelectorAll('.soundtrack-card').length === expected ? true : undefined);
  }
  button(t.soundtracks.categories.all, document.querySelector<HTMLElement>('.soundtrack-filters') ?? document).click();
  const first = getSoundtrack('clear-morning');
  const title = t.soundtracks.tracks[first.id].title;
  await until('reset-filter', () => document.querySelector(`[data-soundtrack-id="${first.id}"]`) ? true : undefined);
  button(`${t.soundtracks.preview} · ${title}`).click();
  await until('audition-started', () => {
    if (document.querySelector('.soundtrack-error')) throw new Error('QA_SOUNDTRACK_AUDITION_ERROR');
    return document.querySelector('.soundtrack-card.playing .soundtrack-waveform .played') ? true : undefined;
  });
  button(`${t.soundtracks.stop} · ${title}`).click();
  await until('audition-stopped', () => !document.querySelector('.soundtrack-card.playing') && !document.querySelector('.soundtrack-waveform .played') ? true : undefined);
  await new Promise<void>((resolve) => setTimeout(resolve, QA.stopSettle));
  if (document.querySelector('.soundtrack-card.playing')) throw new Error('QA_SOUNDTRACK_AUDITION_RESUMED');
  const progress = document.querySelector<HTMLInputElement>('.playback-progress');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!progress || !setter) throw new Error('QA_SOUNDTRACK_PLAYHEAD');
  setter.call(progress, '0'); progress.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise<void>((resolve) => setTimeout(resolve, QA.poll));
  const musicBefore = document.querySelectorAll('.music-track .media-clip').length;
  button(`${t.soundtracks.add} · ${title}`).click();
  await until('inserted-track', () => document.querySelectorAll('.music-track .media-clip').length === musicBefore + 1 ? true : undefined);
  const saved = await until('saved-project', async () => {
    const id = document.querySelector<HTMLElement>('.project-bar')?.dataset.projectId;
    if (!id || document.querySelector('.save-status')?.textContent !== t.library.saved) return undefined;
    const stored = await desktop.openLibraryProject(id);
    const media = stored.data.mediaAssets?.find((item) => item.name === `${title}.mp3`);
    const music = stored.data.editing?.music.find((item) => item.mediaId === media?.id);
    return media && music ? { id, stored, media, music } : undefined;
  });
  if (saved.music.volume !== SOUNDTRACK_DEFAULTS.volume || saved.music.sourceIn !== 0 || saved.music.start !== 0) throw new Error('QA_SOUNDTRACK_INSERT_SETTINGS');
  const payload = unpackProjectMedia(saved.stored.data, saved.stored.bytes).assets.get(saved.media.id);
  if (!payload || payload.byteLength !== first.bytes) throw new Error('QA_SOUNDTRACK_PERSIST_BYTES');
  button(t.navigation.library).click();
  const projectButton = await until('library-project', () => document.querySelector<HTMLButtonElement>(`.library-page [data-project-id="${saved.id}"]`) ?? undefined);
  projectButton.click();
  await until('restored-project', () => document.querySelector<HTMLElement>('.project-bar')?.dataset.projectId === saved.id && !document.querySelector('.processing-overlay') && document.querySelectorAll('.music-track .media-clip').length === musicBefore + 1 ? true : undefined);
  const reopen = document.querySelector<HTMLButtonElement>('[data-action="open-audio"]');
  if (!reopen || reopen.disabled) throw new Error('QA_SOUNDTRACK_REOPEN_ENTRY');
  reopen.click();
  await until('reopened-panel', () => document.querySelector('.soundtrack-panel') ? true : undefined);
  button(`${t.soundtracks.selectMusic} · ${title}.mp3`).click();
  await until('music-editor', () => document.querySelector('.editing-asset-name')?.textContent === `${title}.mp3` ? true : undefined);
  button(t.editing.delete).click();
  await until('removed-track', () => document.querySelectorAll('.music-track .media-clip').length === musicBefore ? true : undefined);
  button(t.editor.background).click();
  await until('back-to-background', () => document.querySelector('[data-action="more-backgrounds"]') ? true : undefined);
  return { cards: count, categories: true, auditionStarted: true, auditionStopped: true, inserted: true, projectId: saved.id, restored: true, editOpened: true, removed: true };
}
