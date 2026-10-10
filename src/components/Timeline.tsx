import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { ArrowClockwiseIcon, CursorClickIcon, FilmStripIcon, MusicNotesIcon, MouseSimpleIcon, PlusIcon, ScissorsIcon, SparkleIcon, SubtitlesIcon, TrashIcon } from '@phosphor-icons/react';
import type { Project } from '../../shared';
import { segmentRanges, SOURCE_MEDIA_ID, timelineDuration } from '../../shared';
import { clamp, DEMO, drawDemo, loadTimelineMedia, releaseMedia, seekVideo } from '../engine';
import { formatMultiplier, formatPreciseTime, formatTime, t } from '../i18n';
import { IconButton } from './Controls';
import type { EditSelection } from './EditPanel';
import { MusicTimelineClip, useMusicWaveforms } from './MusicWaveform';
import { timelineAudioCatalog } from '../i18n/timeline-audio';

export interface TimelineProps {
  project: Project; time: number; selectedId?: string; editSelection?: EditSelection; canDelete: boolean;
  onSeek: (time: number) => void; onSelect: (id: string) => void; onRegenerate: () => void; onAdd: () => void;
  onEditSelect: (selection: EditSelection) => void; onSplit: () => void; onDelete: () => void;
  onImportMusic: () => void; onAddSubtitle: () => void;
}
const PRIMARY_TRACK_COUNT = 2;
const THUMBNAILS = { count: 10, width: 160, height: 100 } as const;

function useThumbnails(project: Project): Record<string, string[]> {
  const [thumbnails, setThumbnails] = useState<{ signature: string; images: Record<string, string[]> }>();
  const sourceType = project.sourceType;
  const sources = segmentRanges(project).map(({ segment }) => ({
    id: segment.id, mediaId: segment.mediaId, sourceIn: segment.sourceIn, sourceOut: segment.sourceOut,
    url: (segment.mediaId === SOURCE_MEDIA_ID ? project.videoUrl : project.media?.[segment.mediaId]?.url) ?? null,
  }));
  const signature = JSON.stringify([sourceType, project.videoUrl ?? null, sources]);
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    const videos = new Map<string, HTMLVideoElement>();
    const canvas = document.createElement('canvas'); canvas.width = THUMBNAILS.width; canvas.height = THUMBNAILS.height;
    const context = canvas.getContext('2d');
    const generate = async (): Promise<void> => {
      if (!context) return;
      const result: Record<string, string[]> = {};
      for (const segment of sources) {
        if (cancelled) return;
        const images: string[] = [];
        const url = segment.url;
        if (segment.mediaId === SOURCE_MEDIA_ID && sourceType === 'demo') {
          const source = document.createElement('canvas'); source.width = DEMO.width; source.height = DEMO.height;
          const sourceContext = source.getContext('2d'); if (!sourceContext) return;
          drawDemo(sourceContext, segment.sourceIn); context.drawImage(source, 0, 0, canvas.width, canvas.height);
          images.push(canvas.toDataURL('image/jpeg', 0.65));
        } else if (url) {
          let video = videos.get(segment.mediaId);
          if (!video) {
            const loaded = await loadTimelineMedia(url, 'video', abort.signal);
            if (!(loaded instanceof HTMLVideoElement)) throw new Error('INVALID_VIDEO_THUMBNAIL_SOURCE');
            if (cancelled) { releaseMedia(loaded); return; }
            video = loaded; videos.set(segment.mediaId, video);
          }
          for (let index = 0; index < THUMBNAILS.count && !cancelled; index++) {
            await seekVideo(video, Math.max(segment.sourceIn, segment.sourceIn + (segment.sourceOut - segment.sourceIn) * index / THUMBNAILS.count));
            if (cancelled) return;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            images.push(canvas.toDataURL('image/jpeg', 0.65));
          }
        }
        result[segment.id] = images;
      }
      if (!cancelled) setThumbnails({ signature, images: result });
    };
    void generate().catch((error: unknown) => { if (!cancelled) { setThumbnails({ signature, images: {} }); console.warn('THUMBNAILS_FAILED', error); } });
    return () => { cancelled = true; abort.abort(); for (const video of videos.values()) releaseMedia(video); };
  }, [signature]);
  return thumbnails?.signature === signature ? thumbnails.images : {};
}

export function Timeline({ project, time, selectedId, editSelection, canDelete, onSeek, onSelect, onRegenerate, onAdd, onEditSelect, onSplit, onDelete, onImportMusic, onAddSubtitle }: TimelineProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [showPointer, setShowPointer] = useState(false);
  const hasMusic = Boolean(project.editing?.music.length);
  const hasSubtitles = Boolean(project.editing?.subtitles.length);
  const trackCount = PRIMARY_TRACK_COUNT + Number(showPointer) + Number(hasMusic) + Number(hasSubtitles);
  const thumbnails = useThumbnails(project);
  const waveforms = useMusicWaveforms(project);
  const duration = timelineDuration(project);
  const ranges = segmentRanges(project);
  const ticks = Array.from({ length: 9 }, (_, index) => duration * index / 8);
  const effects = ranges.flatMap(({ segment, outputStart }) => segment.mediaId !== SOURCE_MEDIA_ID ? [] : project.clips.filter((clip) => clip.end > segment.sourceIn && clip.start < segment.sourceOut).map((clip) => ({ clip, segmentId: segment.id, start: outputStart + (Math.max(clip.start, segment.sourceIn) - segment.sourceIn) / segment.speed, end: outputStart + (Math.min(clip.end, segment.sourceOut) - segment.sourceIn) / segment.speed })));
  const clicks = ranges.flatMap(({ segment, outputStart }) => segment.mediaId !== SOURCE_MEDIA_ID ? [] : project.samples.filter((sample) => sample.kind === 'click' && sample.time >= segment.sourceIn && sample.time < segment.sourceOut).map((sample) => ({ ...sample, time: outputStart + (sample.time - segment.sourceIn) / segment.speed })));
  const seekPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const bounds = railRef.current?.getBoundingClientRect();
    if (bounds) onSeek(clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * duration);
  };
  return <section className="timeline-panel editing-timeline" style={{ '--track-count': trackCount } as CSSProperties} aria-label={t.editor.timeline}><div className="timeline-heading"><div className="timeline-title"><FilmStripIcon size={17} /><h2>{t.editor.timeline}</h2></div><div className="timeline-actions"><button type="button" className="icon-button" data-action="toggle-pointer-track" title={t.studio.pointerTrack} aria-label={t.studio.pointerTrack} aria-pressed={showPointer} onClick={() => setShowPointer((current) => !current)}><MouseSimpleIcon size={16} /></button><IconButton icon={ScissorsIcon} label={t.editing.split} onClick={onSplit} size={16} /><IconButton icon={TrashIcon} label={t.editing.delete} onClick={onDelete} disabled={!canDelete} size={16} /><IconButton icon={MusicNotesIcon} label={t.editing.insertMusic} onClick={onImportMusic} size={16} /><IconButton icon={SubtitlesIcon} label={t.editing.addSubtitle} onClick={onAddSubtitle} size={16} /><IconButton icon={ArrowClockwiseIcon} label={t.editor.regenerate} onClick={onRegenerate} size={16} /><IconButton icon={PlusIcon} label={t.editor.addShot} onClick={onAdd} size={16} /></div></div><div className="timeline-body"><div className="track-labels"><div className="ruler-spacer" /><div><FilmStripIcon size={14} />{t.editing.videoTrack}</div><div><SparkleIcon size={14} />{t.editor.motionTrack}</div>{showPointer && <div><CursorClickIcon size={14} />{t.editor.cursorTrack}</div>}{hasMusic && <div className="music-track-label" title={timelineAudioCatalog.visualHint}><MusicNotesIcon size={14} />{t.editing.musicTrack}</div>}{hasSubtitles && <div><SubtitlesIcon size={14} />{t.editing.subtitleTrack}</div>}</div><div className="timeline-rails" ref={railRef}>
    <div className="ruler" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekPointer(event); }} onPointerMove={(event) => { if (event.buttons === 1) seekPointer(event); }}><div className="ruler-ticks">{ticks.map((tick) => <span key={tick} style={{ left: `${tick / duration * 100}%` }}>{formatPreciseTime(tick)}</span>)}</div></div>
    <div className="editing-video-track">{ranges.map(({ segment, outputStart, outputEnd }, index) => <button type="button" key={segment.id} data-segment-id={segment.id} aria-label={`${t.editing.segment} ${index + 1}`} className={`timeline-segment ${editSelection?.kind === 'segment' && editSelection.id === segment.id ? 'selected' : ''}`} style={{ left: `${outputStart / duration * 100}%`, width: `${(outputEnd - outputStart) / duration * 100}%` }} onPointerDown={(event) => { onEditSelect({ kind: 'segment', id: segment.id }); const bounds = railRef.current?.getBoundingClientRect(); if (bounds) onSeek(clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * duration); }}><div className="thumbnail-strip">{(thumbnails[segment.id] ?? []).map((thumbnail, thumbnailIndex) => <img src={thumbnail} alt="" draggable={false} key={thumbnailIndex} />)}</div><span className="track-overlay"><FilmStripIcon size={12} />{segment.mediaId === SOURCE_MEDIA_ID ? project.name : project.mediaAssets?.find(({ id }) => id === segment.mediaId)?.name}</span>{segment.speed !== 1 && <span className="segment-speed">{formatMultiplier(segment.speed)}</span>}</button>)}</div>
    <div className="motion-track">{effects.map(({ clip, segmentId, start, end }, index) => <button type="button" title={`${t.editor.shot} ${index + 1} · ${formatMultiplier(clip.zoom)}`} aria-label={`${t.editor.shot} ${index + 1}`} key={`${clip.id}:${segmentId}`} className={`motion-clip ${selectedId === clip.id ? 'selected' : ''} ${!clip.enabled ? 'disabled' : ''}`} style={{ left: `${start / duration * 100}%`, width: `${(end - start) / duration * 100}%` }} onClick={() => { onSelect(clip.id); onSeek(start + Math.min((end - start) / 2, 0.8)); }}><SparkleIcon size={12} /><span>{formatMultiplier(clip.zoom)}</span></button>)}</div>
    {showPointer && <div className="cursor-track" onPointerDown={seekPointer}><div className="cursor-baseline" />{clicks.map((sample, index) => <span className="click-mark" key={index} style={{ left: `${sample.time / duration * 100}%` }} />)}</div>}
    {hasMusic && <div className="music-track" title={timelineAudioCatalog.visualHint}>{project.editing?.music.map((music) => <MusicTimelineClip key={music.id} clip={music} name={project.mediaAssets?.find(({ id }) => id === music.mediaId)?.name ?? t.editing.musicTrack} waveform={waveforms[music.mediaId]?.waveform} failed={waveforms[music.mediaId]?.failed ?? !project.media?.[music.mediaId]} limited={waveforms[music.mediaId]?.limited} selected={editSelection?.kind === 'music' && editSelection.id === music.id} duration={duration} onSelect={() => { onEditSelect({ kind: 'music', id: music.id }); onSeek(music.start); }} />)}</div>}
    {hasSubtitles && <div className="subtitle-track">{project.editing?.subtitles.map((subtitle) => <button type="button" key={subtitle.id} className={`media-clip ${editSelection?.kind === 'subtitle' && editSelection.id === subtitle.id ? 'selected' : ''}`} style={{ left: `${subtitle.start / duration * 100}%`, width: `${(subtitle.end - subtitle.start) / duration * 100}%` }} onClick={() => { onEditSelect({ kind: 'subtitle', id: subtitle.id }); onSeek(subtitle.start); }}><SubtitlesIcon size={12} /><span>{subtitle.text || t.editing.subtitlePlaceholder}</span></button>)}{!project.editing?.subtitles.length && <button type="button" className="track-empty" onClick={onAddSubtitle}>{t.editing.noSubtitle}</button>}</div>}
    {project.trimStart > 0 && <div className="trim-shade" style={{ left: 0, width: `${project.trimStart / duration * 100}%` }} />}{project.trimEnd < duration && <div className="trim-shade" style={{ right: 0, width: `${(1 - project.trimEnd / duration) * 100}%` }} />}<div className="playhead" style={{ left: `${time / duration * 100}%` }}><span /></div>
  </div></div><div className="timeline-footer"><span>{t.editing.tracksHint}</span><span>{formatTime(project.trimEnd - project.trimStart)}</span></div></section>;
}
