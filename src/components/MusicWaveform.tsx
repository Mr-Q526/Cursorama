import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MusicNotesIcon } from '@phosphor-icons/react';
import type { MusicClip, Project } from '../../shared';
import { AUDIO_WAVEFORM_BUDGET_ERROR, decodeAudioWaveform, musicEnvelopePoints, sampleMusicWaveform } from '../engine/audio-waveform';
import type { AudioWaveform, MusicWaveformPoint } from '../engine/audio-waveform';
import { timelineAudioCatalog } from '../i18n/timeline-audio';

export interface MusicWaveformState {
  blob: Blob;
  waveform?: AudioWaveform;
  failed: boolean;
  limited: boolean;
}

export interface MusicTimelineClipProps {
  clip: MusicClip;
  name: string;
  waveform?: AudioWaveform;
  failed: boolean;
  limited?: boolean;
  selected: boolean;
  duration: number;
  onSelect: () => void;
}

const GRAPH = { width: 1000, height: 32, center: 16, amplitude: 14, base: 30, curveRange: 28, pixelsPerPoint: 2, minimumPoints: 24, initialPoints: 180, coordinateDigits: 3 } as const;
const coordinate = (value: number): string => value.toFixed(GRAPH.coordinateDigits);
const pointX = (point: MusicWaveformPoint): number => point.position * GRAPH.width;

export function useMusicWaveforms(project: Project): Record<string, MusicWaveformState> {
  const [states, setStates] = useState<Record<string, MusicWaveformState>>({});
  const ids = [...new Set(project.editing?.music.map((clip) => clip.mediaId) ?? [])].sort().join('|');
  useEffect(() => {
    let cancelled = false;
    const assets = [...new Set(project.editing?.music.map((clip) => clip.mediaId) ?? [])].map((id) => project.media?.[id]).filter((asset) => asset !== undefined);
    setStates({});
    const generate = async (): Promise<void> => {
      for (const asset of assets) {
        if (cancelled) return;
        try {
          const waveform = await decodeAudioWaveform(asset.blob, asset.duration);
          if (!cancelled) setStates((previous) => ({ ...previous, [asset.id]: { blob: asset.blob, waveform, failed: false, limited: false } }));
        } catch (error: unknown) {
          if (!cancelled) {
            const limited = error instanceof Error && error.message === AUDIO_WAVEFORM_BUDGET_ERROR;
            if (!limited) console.warn('AUDIO_WAVEFORM_FAILED', asset.id, error);
            setStates((previous) => ({ ...previous, [asset.id]: { blob: asset.blob, failed: true, limited } }));
          }
        }
      }
    };
    void generate();
    return () => { cancelled = true; };
  }, [project.media, ids]);
  return Object.fromEntries(Object.entries(states).filter(([id, state]) => state.blob === project.media?.[id]?.blob));
}

export function MusicTimelineClip({ clip, name, waveform, failed, limited, selected, duration, onSelect }: MusicTimelineClipProps) {
  const element = useRef<HTMLButtonElement>(null);
  const [pointCount, setPointCount] = useState<number>(GRAPH.initialPoints);
  useEffect(() => {
    const button = element.current;
    if (!button) return;
    const observer = new ResizeObserver(([entry]) => setPointCount(Math.max(GRAPH.minimumPoints, Math.ceil(entry.contentRect.width / GRAPH.pixelsPerPoint))));
    observer.observe(button);
    return () => observer.disconnect();
  }, []);
  const samples = useMemo(() => sampleMusicWaveform(waveform, clip, pointCount), [waveform, clip, pointCount]);
  const envelope = useMemo(() => musicEnvelopePoints(clip, pointCount), [clip, pointCount]);
  const wavePath = useMemo(() => {
    if (!waveform || !samples.length) return undefined;
    const edge = (point: MusicWaveformPoint, direction: number): string => `${coordinate(pointX(point))},${coordinate(GRAPH.center + direction * Math.sqrt(point.peak * point.gain) * GRAPH.amplitude)}`;
    return `M${samples.map((point) => edge(point, -1)).join(' L')} L${[...samples].reverse().map((point) => edge(point, 1)).join(' L')} Z`;
  }, [waveform, samples]);
  const gainPath = envelope.map((point, index) => `${index === 0 ? 'M' : 'L'}${coordinate(pointX(point))},${coordinate(GRAPH.base - point.gain * GRAPH.curveRange)}`).join(' ');
  const status = waveform ? 'ready' : limited ? 'limited' : failed ? 'error' : 'loading';
  const tooltip = timelineAudioCatalog.describe(name, clip.volume);
  const style: CSSProperties = { left: `${clip.start / duration * 100}%`, width: `${(clip.sourceOut - clip.sourceIn) / duration * 100}%` };
  return <button ref={element} type="button" data-music-id={clip.id} data-waveform-state={status} data-volume={clip.volume} className={`media-clip music-timeline-clip ${selected ? 'selected' : ''}`} style={style} onClick={onSelect} title={tooltip} aria-label={tooltip}>
    <span className="music-clip-heading"><MusicNotesIcon size={11} /><span>{name}</span><small>{Math.round(clip.volume * 100)}%</small></span>
    <svg className="music-clip-graph" viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`} preserveAspectRatio="none" aria-hidden="true">
      <line className="music-zero-line" x1="0" x2={GRAPH.width} y1={GRAPH.center} y2={GRAPH.center} />
      {wavePath && <path className="music-waveform" d={wavePath} />}
      <path className="music-volume-curve" d={gainPath} vectorEffect="non-scaling-stroke" />
    </svg>
    {!waveform && <span className="music-waveform-status" role="status">{limited ? timelineAudioCatalog.budget : failed ? timelineAudioCatalog.unavailable : timelineAudioCatalog.loading}</span>}
  </button>;
}
