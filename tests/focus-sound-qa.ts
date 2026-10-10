import { DEFAULT_FOCUS_SOUND, focusSoundCues } from '../shared';
import type { Project } from '../shared';
import { createDemoProject, renderExport } from '../src/engine';
import { insertSoundtrack, loadSoundtrackAsset, SOUNDTRACKS } from '../src/soundtracks';

export interface FocusSoundExportReport {
  isolated: string;
  disabled: string;
  mixed: string;
  musicOnly: string;
  cues: number[];
}
const QA = { duration: 4, fps: 30, firstCue: 0.75, secondCue: 2.5, focusVolume: 0.7, musicVolume: 0.08 } as const;

async function exportFixture(project: Project): Promise<string> {
  const result = await renderExport(project, { resolution: '720p', format: 'mp4', fps: QA.fps, quality: 'standard' }, () => undefined, new AbortController().signal);
  if (result.cancelled || !result.path) throw new Error('QA_FOCUS_EXPORT_MISSING');
  return result.path;
}

export async function runFocusSoundExportQA(): Promise<FocusSoundExportReport> {
  const demo = createDemoProject();
  const project: Project = {
    ...demo, name: '聚焦音效独立导出验证', duration: QA.duration, trimStart: 0, trimEnd: QA.duration, samples: [], hasAudio: false,
    clips: [QA.firstCue, QA.secondCue].map((start, index) => ({ id: `focus-${index}`, start, end: start + 1, x: 0.6, y: 0.4, zoom: 2, mode: 'focus', enabled: true, manual: true })),
    settings: { ...demo.settings, autoZoom: true, focusSound: { ...DEFAULT_FOCUS_SOUND, id: 'glass-chime', volume: QA.focusVolume } },
  };
  const isolated = await exportFixture(project);
  const disabled = await exportFixture({ ...project, name: '聚焦音效关闭导出验证', settings: { ...project.settings, focusSound: { ...DEFAULT_FOCUS_SOUND, enabled: false } } });
  const asset = await loadSoundtrackAsset(SOUNDTRACKS[0]);
  try {
    const inserted = insertSoundtrack(project, asset, 0).project;
    if (!inserted.editing) throw new Error('QA_FOCUS_MUSIC_MISSING');
    const mixedProject: Project = { ...inserted, name: '配乐与聚焦音效混合验证', editing: { ...inserted.editing, music: inserted.editing.music.map((clip) => ({ ...clip, volume: QA.musicVolume })) } };
    const mixed = await exportFixture(mixedProject);
    const musicOnly = await exportFixture({ ...mixedProject, name: '聚焦音效对照配乐验证', settings: { ...mixedProject.settings, focusSound: { ...DEFAULT_FOCUS_SOUND, enabled: false } } });
    return { isolated, disabled, mixed, musicOnly, cues: focusSoundCues(project).map(({ time }) => time) };
  } finally { URL.revokeObjectURL(asset.url); }
}
