import { FilmStripIcon, MusicNotesIcon, ScissorsIcon, SubtitlesIcon, TrashIcon } from '@phosphor-icons/react';
import type { MusicClip, Project, SubtitleClip, VideoSegment } from '../../shared';
import { EDITING_LIMITS, getSegments, SOURCE_MEDIA_ID, timelineDuration } from '../../shared';
import { formatMultiplier, formatPercent, formatSeconds, t } from '../i18n';
import { Slider } from './Controls';

export interface EditSelection { kind: 'segment' | 'music' | 'subtitle'; id: string; }
export interface EditPanelProps {
  project: Project; time: number; selection?: EditSelection; importing: boolean;
  onSplit: () => void; onDelete: () => void; onImport: (kind: 'video' | 'audio') => void; onAddSubtitle: () => void;
  onSelect: (selection: EditSelection) => void;
  onSegment: (id: string, patch: Partial<VideoSegment>) => void;
  onMusic: (id: string, patch: Partial<MusicClip>) => void;
  onSubtitle: (id: string, patch: Partial<SubtitleClip>) => void;
}
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;
const INPUT_STEP = 0.01;

export function EditPanel({ project, time, selection, importing, onSplit, onDelete, onImport, onAddSubtitle, onSelect, onSegment, onMusic, onSubtitle }: EditPanelProps) {
  const copy = t.editing;
  const segments = getSegments(project);
  const segment = selection?.kind === 'segment' ? segments.find(({ id }) => id === selection.id) : undefined;
  const music = selection?.kind === 'music' ? project.editing?.music.find(({ id }) => id === selection.id) : undefined;
  const subtitle = selection?.kind === 'subtitle' ? project.editing?.subtitles.find(({ id }) => id === selection.id) : undefined;
  const duration = timelineDuration(project);
  const limit = segment?.mediaId === SOURCE_MEDIA_ID ? project.duration : project.mediaAssets?.find(({ id }) => id === segment?.mediaId)?.duration ?? project.duration;
  const musicLimit = project.mediaAssets?.find(({ id }) => id === music?.mediaId)?.duration ?? duration;
  const musicName = project.mediaAssets?.find(({ id }) => id === music?.mediaId)?.name;
  const canDelete = Boolean(music || subtitle || (segment && segments.length > 1));
  return <div className="editing-panel">
    <div className="control-section"><p className="section-caption">{copy.tools}<span>{formatSeconds(time)}</span></p>
      <div className="edit-add-grid"><button type="button" className="soft-button" disabled={importing} onClick={() => onImport('video')}><FilmStripIcon size={16} />{copy.insertVideo}</button><button type="button" className="soft-button" disabled={importing} onClick={() => onImport('audio')}><MusicNotesIcon size={16} />{copy.insertMusic}</button><button type="button" className="soft-button" disabled={importing} onClick={onAddSubtitle}><SubtitlesIcon size={16} />{copy.addSubtitle}</button></div>
      {importing && <p className="field-hint" role="status">{copy.importing}</p>}
    </div>
    <div className="control-section"><p className="section-caption">{copy.videoTrack}<span>{segments.length}</span></p><div className="segment-list">{segments.map((item, index) => <button type="button" key={item.id} className={segment?.id === item.id ? 'selected' : ''} onClick={() => onSelect({ kind: 'segment', id: item.id })}><FilmStripIcon size={14} /><span>{item.mediaId === SOURCE_MEDIA_ID ? `${copy.segment} ${index + 1}` : project.mediaAssets?.find(({ id }) => id === item.mediaId)?.name}</span><small>{formatSeconds((item.sourceOut - item.sourceIn) / item.speed)}</small></button>)}</div></div>
    {segment && <div className="control-section"><p className="section-caption">{copy.selectedSegment}</p><div className="number-pair"><label>{copy.sourceIn}<input type="number" step={INPUT_STEP} min={0} max={segment.sourceOut - EDITING_LIMITS.minDuration} value={Number(segment.sourceIn.toFixed(2))} onChange={(event) => onSegment(segment.id, { sourceIn: Math.max(0, Math.min(Number(event.currentTarget.value), segment.sourceOut - EDITING_LIMITS.minDuration)) })} /></label><label>{copy.sourceOut}<input type="number" step={INPUT_STEP} min={segment.sourceIn + EDITING_LIMITS.minDuration} max={limit} value={Number(segment.sourceOut.toFixed(2))} onChange={(event) => onSegment(segment.id, { sourceOut: Math.min(limit, Math.max(Number(event.currentTarget.value), segment.sourceIn + EDITING_LIMITS.minDuration)) })} /></label></div><label className="select-control">{copy.speed}<select value={segment.speed} onChange={(event) => onSegment(segment.id, { speed: Number(event.currentTarget.value) })}>{SPEEDS.map((speed) => <option value={speed} key={speed}>{formatMultiplier(speed)}</option>)}</select></label><div className="slider-stack"><Slider label={copy.originalAudio} value={segment.volume * 100} min={0} max={100} display={formatPercent(segment.volume * 100)} onChange={(volume) => onSegment(segment.id, { volume: volume / 100 })} /></div><p className="field-hint">{copy.segmentHint}</p><button type="button" className="soft-button edit-split" onClick={onSplit}><ScissorsIcon size={15} />{copy.split}</button>{segments.length === 1 && <p className="field-hint">{copy.lastSegment}</p>}</div>}
    {music && <div className="control-section"><p className="section-caption">{copy.selectedMusic}</p><p className="editing-asset-name">{musicName}</p><label className="select-control">{copy.start}<input type="number" step={INPUT_STEP} min={0} max={Math.max(0, duration - (music.sourceOut - music.sourceIn))} value={Number(music.start.toFixed(2))} onChange={(event) => onMusic(music.id, { start: Math.max(0, Math.min(Number(event.currentTarget.value), duration - (music.sourceOut - music.sourceIn))) })} /></label><div className="number-pair"><label>{copy.sourceIn}<input type="number" step={INPUT_STEP} min={0} max={music.sourceOut - EDITING_LIMITS.minDuration} value={Number(music.sourceIn.toFixed(2))} onChange={(event) => onMusic(music.id, { sourceIn: Math.max(0, Math.min(Number(event.currentTarget.value), music.sourceOut - EDITING_LIMITS.minDuration)) })} /></label><label>{copy.sourceOut}<input type="number" step={INPUT_STEP} min={music.sourceIn + EDITING_LIMITS.minDuration} max={Math.min(musicLimit, music.sourceIn + duration - music.start)} value={Number(music.sourceOut.toFixed(2))} onChange={(event) => onMusic(music.id, { sourceOut: Math.min(musicLimit, music.sourceIn + duration - music.start, Math.max(Number(event.currentTarget.value), music.sourceIn + EDITING_LIMITS.minDuration)) })} /></label></div><Slider label={copy.volume} value={music.volume * 100} min={0} max={100} display={formatPercent(music.volume * 100)} onChange={(volume) => onMusic(music.id, { volume: volume / 100 })} /><p className="field-hint">{copy.musicHint}</p></div>}
    {subtitle && <div className="control-section"><p className="section-caption">{copy.selectedSubtitle}</p><label className="select-control">{copy.text}<textarea className="subtitle-editor" rows={4} maxLength={EDITING_LIMITS.maxSubtitleLength} placeholder={copy.subtitlePlaceholder} value={subtitle.text} onChange={(event) => onSubtitle(subtitle.id, { text: event.currentTarget.value })} /></label><div className="number-pair"><label>{copy.start}<input type="number" step={INPUT_STEP} min={0} max={subtitle.end - EDITING_LIMITS.minDuration} value={Number(subtitle.start.toFixed(2))} onChange={(event) => onSubtitle(subtitle.id, { start: Math.max(0, Math.min(Number(event.currentTarget.value), subtitle.end - EDITING_LIMITS.minDuration)) })} /></label><label>{copy.end}<input type="number" step={INPUT_STEP} min={subtitle.start + EDITING_LIMITS.minDuration} max={duration} value={Number(subtitle.end.toFixed(2))} onChange={(event) => onSubtitle(subtitle.id, { end: Math.min(duration, Math.max(Number(event.currentTarget.value), subtitle.start + EDITING_LIMITS.minDuration)) })} /></label></div><p className="field-hint">{copy.subtitleHint}</p></div>}
    {!segment && !music && !subtitle && <p className="field-hint">{copy.selectHint}</p>}
    {selection && <button type="button" className="text-button danger" disabled={!canDelete} onClick={onDelete}><TrashIcon size={15} />{copy.delete}</button>}
  </div>;
}
