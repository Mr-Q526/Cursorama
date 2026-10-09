import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowClockwiseIcon, CursorClickIcon, FilmStripIcon, PlusIcon, SparkleIcon } from '@phosphor-icons/react';
import type { Project } from '../../shared';
import { clamp, DEMO, drawDemo, loadVideo, seekVideo } from '../engine';
import { formatMultiplier, formatTime, t } from '../i18n';
import { IconButton } from './Controls';

export interface TimelineProps { project: Project; time: number; selectedId?: string; onSeek: (time: number) => void; onSelect: (id: string) => void; onRegenerate: () => void; onAdd: () => void; }
const THUMBNAILS = { count: 10, width: 160, height: 100 } as const;

function useThumbnails(project: Project): string[] {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    let video: HTMLVideoElement | undefined;
    const canvas = document.createElement('canvas'); canvas.width = THUMBNAILS.width; canvas.height = THUMBNAILS.height;
    const context = canvas.getContext('2d');
    const generate = async (): Promise<void> => {
      if (!context) return;
      if (project.sourceType === 'demo') {
        const source = document.createElement('canvas'); source.width = DEMO.width; source.height = DEMO.height;
        const sourceContext = source.getContext('2d'); if (!sourceContext) return;
        drawDemo(sourceContext, 0); context.drawImage(source, 0, 0, canvas.width, canvas.height);
        setThumbnails(Array.from({ length: THUMBNAILS.count }, () => canvas.toDataURL('image/jpeg', 0.65)));
      } else if (project.videoUrl) {
        video = await loadVideo(project.videoUrl);
        const result: string[] = [];
        for (let index = 0; index < THUMBNAILS.count && !cancelled; index++) {
          await seekVideo(video, Math.min(project.duration - 0.1, project.duration * index / THUMBNAILS.count));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          result.push(canvas.toDataURL('image/jpeg', 0.65));
        }
        if (!cancelled) setThumbnails(result);
      }
    };
    void generate().catch((error: unknown) => { if (!cancelled) console.warn('THUMBNAILS_FAILED', error); });
    return () => { cancelled = true; if (video) { video.pause(); video.removeAttribute('src'); video.load(); } };
  }, [project.sourceType, project.videoUrl, project.duration]);
  return thumbnails;
}

export function Timeline({ project, time, selectedId, onSeek, onSelect, onRegenerate, onAdd }: TimelineProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const thumbnails = useThumbnails(project);
  const ticks = Array.from({ length: 9 }, (_, index) => project.duration * index / 8);
  const clicks = project.samples.filter((sample) => sample.kind === 'click');
  const seekPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const bounds = railRef.current?.getBoundingClientRect();
    if (bounds) onSeek(clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * project.duration);
  };
  return <section className="timeline-panel" aria-label={t.editor.timeline}><div className="timeline-heading"><div className="timeline-title"><FilmStripIcon size={17} /><h2>{t.editor.timeline}</h2><span className="small-tag">{project.clips.filter((clip) => clip.enabled).length} {t.editor.autoShots}</span></div><div className="timeline-actions"><button className="text-button" type="button" onClick={onRegenerate}><ArrowClockwiseIcon size={15} />{t.editor.regenerate}</button><button className="soft-button small" type="button" onClick={onAdd}><PlusIcon size={14} />{t.editor.addShot}</button></div></div><div className="timeline-body"><div className="track-labels"><div className="ruler-spacer" /><div><FilmStripIcon size={15} />{t.editor.videoTrack}</div><div><SparkleIcon size={15} />{t.editor.motionTrack}</div><div><CursorClickIcon size={15} />{t.editor.cursorTrack}</div></div><div className="timeline-rails" ref={railRef}>
    <div className="ruler" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekPointer(event); }} onPointerMove={(event) => { if (event.buttons === 1) seekPointer(event); }}><div className="ruler-ticks">{ticks.map((tick) => <span key={tick} style={{ left: `${tick / project.duration * 100}%` }}>{formatTime(tick)}</span>)}</div></div>
    <div className="video-track" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekPointer(event); }} onPointerMove={(event) => { if (event.buttons === 1) seekPointer(event); }}><div className="thumbnail-strip">{thumbnails.map((thumbnail, index) => <img src={thumbnail} alt="" draggable={false} key={index} />)}</div><div className="track-overlay"><FilmStripIcon size={13} />{project.name}</div>{project.trimStart > 0 && <div className="trim-shade" style={{ left: 0, width: `${project.trimStart / project.duration * 100}%` }} />}{project.trimEnd < project.duration && <div className="trim-shade" style={{ right: 0, width: `${(1 - project.trimEnd / project.duration) * 100}%` }} />}</div>
    <div className="motion-track">{project.clips.map((clip, index) => <button type="button" title={`${t.editor.shot} ${index + 1} · ${formatMultiplier(clip.zoom)}`} aria-label={`${t.editor.shot} ${index + 1}`} key={clip.id} className={`motion-clip ${selectedId === clip.id ? 'selected' : ''} ${!clip.enabled ? 'disabled' : ''}`} style={{ left: `${clip.start / project.duration * 100}%`, width: `${(clip.end - clip.start) / project.duration * 100}%` }} onClick={() => { onSelect(clip.id); onSeek(clip.start + Math.min((clip.end - clip.start) / 2, 0.8)); }}><SparkleIcon size={12} /><span>{formatMultiplier(clip.zoom)}</span></button>)}</div>
    <div className="cursor-track" onPointerDown={seekPointer}><div className="cursor-baseline" />{clicks.map((sample, index) => <span className="click-mark" key={index} style={{ left: `${sample.time / project.duration * 100}%` }} />)}</div><div className="playhead" style={{ left: `${time / project.duration * 100}%` }}><span /></div>
  </div></div><div className="timeline-footer"><span>{t.editor.quickHint}</span><span>{formatTime(project.trimEnd - project.trimStart)}<span className="footer-divider">·</span>{project.clips.length} {t.editor.shot}</span><IconButton icon={PlusIcon} label={t.editor.addShot} onClick={onAdd} size={14} /></div></section>;
}
