import { packProjectMedia, projectBytes, readProjectBytes, unpackProjectMedia } from '../shared';
import type { MediaAsset, Project } from '../shared';
import { createDemoProject, loadVideo, projectMetadata, renderExport, runtimeFromStored, seekVideo } from '../src/engine';
import { t } from '../src/i18n';
import { soundtrackBrowserCatalog as browser } from '../src/i18n/soundtrack-browser';
import { getSoundtrack, insertSoundtrack, loadSoundtrackAsset, SOUNDTRACK_DEFAULTS, SOUNDTRACK_FILTERS, SOUNDTRACKS } from '../src/soundtracks';

export interface SoundtrackAssetReport { protocol: string; count: number; bytes: number; decoded: boolean; stereo: boolean; restoredMedia: boolean; }
export interface SoundtrackExportReport { path: string; duration: number; volume: number; }
export interface SoundtrackDecodedExportReport { duration: number; audioLevel: number; }
export interface SoundtrackUIReport { cards: number; categories: boolean; compactRows: boolean; search: boolean; emptySearch: boolean; busyStopped: boolean; auditionStarted: boolean; auditionStopped: boolean; inserted: boolean; projectId: string; waveform: boolean; restoredWaveform: boolean; volumeCurve: boolean; restored: boolean; editOpened: boolean; removed: boolean; }
const QA = { timeout: 30_000, poll: 50, duration: 4, fps: 30, durationTolerance: 0.15, audioMinimum: 0.001, stopSettle: 200, name: '原创配乐真实导出验证' } as const;

async function until<T>(stage: string, read: () => T | undefined | Promise<T | undefined>): Promise<T> {
  const deadline = performance.now() + QA.timeout;
  while (performance.now() < deadline) {
    const result = await read();
    if (result !== undefined) return result;
    await new Promise<void>((resolve) => setTimeout(resolve, QA.poll));
  }
  throw new Error(`QA_SOUNDTRACK_TIMEOUT:${stage}:${JSON.stringify({ cards: document.querySelectorAll('.soundtrack-card').length, active: document.querySelector('.soundtrack-card.playing')?.getAttribute('data-soundtrack-id'), progressed: document.querySelector('.soundtrack-card.playing')?.getAttribute('data-preview-progress'), music: document.querySelectorAll('.music-track .media-clip').length, saving: document.querySelector('.save-status')?.textContent, toast: document.querySelector('.toast')?.textContent })}`);
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

function musicWaveform(id: string): { element: HTMLElement; wave: string; gain: string } | undefined {
  const element = document.querySelector<HTMLElement>(`.music-timeline-clip[data-music-id="${id}"]`);
  if (!element || element.dataset.waveformState !== 'ready') return undefined;
  const wave = element.querySelector<SVGPathElement>('.music-waveform')?.getAttribute('d');
  const gain = element.querySelector<SVGPathElement>('.music-volume-curve')?.getAttribute('d');
  return wave && gain ? { element, wave, gain } : undefined;
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
  if (document.querySelector('.soundtrack-waveform') || Array.from(document.querySelectorAll<HTMLElement>('.soundtrack-card')).some((item) => item.getBoundingClientRect().height > 60)) throw new Error('QA_SOUNDTRACK_ROWS_TOO_TALL');
  const filters = document.querySelector<HTMLSelectElement>('.soundtrack-filters select');
  if (!filters || filters.options.length !== SOUNDTRACK_FILTERS.length) throw new Error('QA_SOUNDTRACK_FILTER_MISSING');
  for (const category of SOUNDTRACK_FILTERS) {
    filters.value = category; filters.dispatchEvent(new Event('change', { bubbles: true }));
    const expected = category === 'all' ? SOUNDTRACKS.length : SOUNDTRACKS.filter((item) => item.category === category).length;
    await until(`filter-${category}`, () => document.querySelectorAll('.soundtrack-card').length === expected ? true : undefined);
  }
  filters.value = 'all'; filters.dispatchEvent(new Event('change', { bubbles: true }));
  const first = getSoundtrack('clear-morning');
  const title = t.soundtracks.tracks[first.id].title;
  await until('reset-filter', () => document.querySelector(`[data-soundtrack-id="${first.id}"]`) ? true : undefined);
  const search = document.querySelector<HTMLInputElement>(`[aria-label="${browser.search}"]`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!search || !setter) throw new Error('QA_SOUNDTRACK_SEARCH_MISSING');
  setter.call(search, title); search.dispatchEvent(new Event('input', { bubbles: true }));
  await until('search-title', () => document.querySelectorAll('.soundtrack-card').length === 1 && document.querySelector(`[data-soundtrack-id="${first.id}"]`) ? true : undefined);
  setter.call(search, '不存在的曲目搜索结果'); search.dispatchEvent(new Event('input', { bubbles: true }));
  await until('search-empty', () => document.querySelectorAll('.soundtrack-card').length === 0 && document.querySelector('.soundtrack-empty') ? true : undefined);
  button(browser.reset).click();
  await until('reset-search', () => document.querySelectorAll('.soundtrack-card').length === count && search.value === '' ? true : undefined);
  button(`${t.soundtracks.preview} · ${title}`).click();
  await until('audition-started', () => {
    if (document.querySelector('.soundtrack-error')) throw new Error('QA_SOUNDTRACK_AUDITION_ERROR');
    return Number(document.querySelector('.soundtrack-card.playing')?.getAttribute('data-preview-progress')) > 0 ? true : undefined;
  });
  button(`${t.soundtracks.stop} · ${title}`).click();
  await until('audition-stopped', () => !document.querySelector('.soundtrack-card.playing') && !document.querySelector('.soundtrack-preview-progress') ? true : undefined);
  await new Promise<void>((resolve) => setTimeout(resolve, QA.stopSettle));
  if (document.querySelector('.soundtrack-card.playing')) throw new Error('QA_SOUNDTRACK_AUDITION_RESUMED');
  button(`${t.soundtracks.preview} · ${title}`).click();
  await until('audition-before-busy', () => Number(document.querySelector('.soundtrack-card.playing')?.getAttribute('data-preview-progress')) > 0 ? true : undefined);
  const settings = document.querySelector<HTMLButtonElement>('[data-action="open-settings"]');
  if (!settings || settings.disabled) throw new Error('QA_SOUNDTRACK_SETTINGS_ENTRY'); settings.click();
  await until('busy-stopped', () => !document.querySelector('.soundtrack-card.playing') && Boolean(document.querySelector('.settings-dialog')) ? true : undefined);
  if (Array.from(document.querySelectorAll<HTMLButtonElement>('.soundtrack-preview, .soundtrack-add')).some((item) => !item.disabled)) throw new Error('QA_SOUNDTRACK_BUSY_CONTROLS_ENABLED');
  button(t.editor.close, document.querySelector<HTMLElement>('.settings-dialog') ?? document).click();
  await until('busy-cleared', () => !document.querySelector('.settings-dialog') && Array.from(document.querySelectorAll<HTMLButtonElement>('.soundtrack-preview')).every((item) => !item.disabled) ? true : undefined);
  const progress = document.querySelector<HTMLInputElement>('.playback-progress');
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
  const waveform = await until('inserted-waveform', () => musicWaveform(saved.music.id));
  const payload = unpackProjectMedia(saved.stored.data, saved.stored.bytes).assets.get(saved.media.id);
  if (!payload || payload.byteLength !== first.bytes) throw new Error('QA_SOUNDTRACK_PERSIST_BYTES');
  button(t.navigation.library).click();
  const projectButton = await until('library-project', () => document.querySelector<HTMLButtonElement>(`.library-page [data-project-id="${saved.id}"]`) ?? undefined);
  projectButton.click();
  await until('restored-project', () => document.querySelector<HTMLElement>('.project-bar')?.dataset.projectId === saved.id && !document.querySelector('.processing-overlay') && document.querySelectorAll('.music-track .media-clip').length === musicBefore + 1 ? true : undefined);
  await until('restored-waveform', () => {
    const restoredWaveform = musicWaveform(saved.music.id);
    return restoredWaveform?.wave === waveform.wave && restoredWaveform.gain === waveform.gain ? true : undefined;
  });
  const reopen = document.querySelector<HTMLButtonElement>('[data-action="open-audio"]');
  if (!reopen || reopen.disabled) throw new Error('QA_SOUNDTRACK_REOPEN_ENTRY');
  reopen.click();
  await until('reopened-panel', () => document.querySelector('.soundtrack-panel') ? true : undefined);
  const current = document.querySelector<HTMLDetailsElement>('.soundtrack-current'); if (!current) throw new Error('QA_SOUNDTRACK_CURRENT_MISSING'); current.open = true;
  button(`${t.soundtracks.selectMusic} · ${title}.mp3`).click();
  await until('music-editor', () => document.querySelector('.editing-asset-name')?.textContent === `${title}.mp3` ? true : undefined);
  const volume = document.querySelector<HTMLInputElement>(`.editing-panel input[type="range"][aria-label="${t.editing.volume}"]`);
  if (!volume) throw new Error('QA_SOUNDTRACK_VOLUME_MISSING');
  setter.call(volume, '65'); volume.dispatchEvent(new Event('input', { bubbles: true }));
  await until('volume-curve', () => {
    const currentWaveform = musicWaveform(saved.music.id);
    return currentWaveform?.element.dataset.volume === '0.65' && currentWaveform.gain !== waveform.gain ? true : undefined;
  });
  setter.call(volume, String(SOUNDTRACK_DEFAULTS.volume * 100)); volume.dispatchEvent(new Event('input', { bubbles: true }));
  await until('restored-volume-curve', () => {
    const currentWaveform = musicWaveform(saved.music.id);
    return currentWaveform?.element.dataset.volume === String(SOUNDTRACK_DEFAULTS.volume) && currentWaveform.gain === waveform.gain ? true : undefined;
  });
  button(t.editing.delete).click();
  await until('removed-track', () => document.querySelectorAll('.music-track .media-clip').length === musicBefore ? true : undefined);
  button(t.editor.background).click();
  await until('back-to-background', () => document.querySelector('[data-action="more-backgrounds"]') ? true : undefined);
  return { cards: count, categories: true, compactRows: true, search: true, emptySearch: true, busyStopped: true, auditionStarted: true, auditionStopped: true, inserted: true, projectId: saved.id, waveform: true, restoredWaveform: true, volumeCurve: true, restored: true, editOpened: true, removed: true };
}
