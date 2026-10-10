import { MusicNotesIcon, PauseIcon, PlayIcon, PlusIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../shared';
import { formatPreciseTime, formatTime } from '../i18n';
import { soundtracksCatalog as copy } from '../i18n/soundtracks';
import { SOUNDTRACK_DEFAULTS, SOUNDTRACK_FILTERS, SOUNDTRACKS } from '../soundtracks';
import type { Soundtrack, SoundtrackFilter, SoundtrackId } from '../soundtracks';

export interface SoundtrackPanelProps {
  project: Project;
  time: number;
  importing: boolean;
  onInsert: (track: Soundtrack) => void;
  onImport: () => void;
  onSelectMusic?: (id: string) => void;
  onPreviewStart?: () => void;
}
interface WaveformProps { waveform: readonly number[]; progress: number; }
const WAVEFORM = { minimumBarPercent: 10, maximumPercent: 100 } as const;

function TrackWaveform({ waveform, progress }: WaveformProps) {
  return <div className="soundtrack-waveform" aria-hidden="true">
    {waveform.map((value, index) => <span key={index} className={progress > index / waveform.length ? 'played' : undefined} style={{ height: `${Math.max(WAVEFORM.minimumBarPercent, value * WAVEFORM.maximumPercent)}%` }} />)}
  </div>;
}

export function SoundtrackPanel({ project, time, importing, onInsert, onImport, onSelectMusic, onPreviewStart }: SoundtrackPanelProps) {
  const [filter, setFilter] = useState<SoundtrackFilter>('all');
  const [active, setActive] = useState<SoundtrackId>();
  const [progress, setProgress] = useState(0);
  const [previewError, setPreviewError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef<SoundtrackId | undefined>(undefined);
  const tracks = filter === 'all' ? SOUNDTRACKS : SOUNDTRACKS.filter(({ category }) => category === filter);
  const music = project.editing?.music ?? [];

  const stopPreview = (): void => {
    requestRef.current++;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    activeRef.current = undefined;
    setActive(undefined); setProgress(0);
  };

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = SOUNDTRACK_DEFAULTS.auditionVolume;
    audioRef.current = audio;
    const update = (): void => { setProgress(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0); };
    const ended = (): void => { activeRef.current = undefined; setActive(undefined); setProgress(0); };
    const failed = (): void => { if (activeRef.current) { ended(); setPreviewError(true); } };
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('ended', ended);
    audio.addEventListener('error', failed);
    return () => {
      requestRef.current++;
      audio.removeEventListener('timeupdate', update); audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed);
      audio.pause(); audio.removeAttribute('src'); audio.load(); audioRef.current = null; activeRef.current = undefined;
    };
  }, []);

  useEffect(() => { if (importing) stopPreview(); }, [importing]);

  const preview = (track: Soundtrack): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (activeRef.current === track.id) { stopPreview(); return; }
    stopPreview();
    onPreviewStart?.();
    setPreviewError(false);
    activeRef.current = track.id;
    setActive(track.id);
    audio.src = track.file;
    const request = requestRef.current;
    void audio.play().catch((error: unknown) => {
      if (request !== requestRef.current) return;
      console.error('SOUNDTRACK_PREVIEW_FAILED', error);
      stopPreview(); setPreviewError(true);
    });
  };

  const insert = (track: Soundtrack): void => { stopPreview(); onInsert(track); };
  const importAudio = (): void => { stopPreview(); onImport(); };

  return <section className="soundtrack-panel" aria-label={copy.title}>
    <p className="soundtrack-intro">{copy.hint}</p>
    <button type="button" className="soft-button soundtrack-import" disabled={importing} onClick={importAudio}><UploadSimpleIcon size={16} />{copy.import}</button>
    <div className="soundtrack-library-header"><span>{copy.library}</span><small>{SOUNDTRACKS.length}</small></div>
    <div className="soundtrack-filters" role="group" aria-label={copy.filterLabel}>
      {SOUNDTRACK_FILTERS.map((id) => <button type="button" key={id} aria-pressed={filter === id} className={filter === id ? 'selected' : ''} onClick={() => { stopPreview(); setFilter(id); }}>{copy.categories[id]}</button>)}
    </div>
    {previewError && <p className="soundtrack-error" role="alert">{copy.previewFailed}</p>}
    <div className="soundtrack-list">
      {tracks.map((track) => {
        const item = copy.tracks[track.id];
        const playing = active === track.id;
        return <article className={`soundtrack-card${playing ? ' playing' : ''}`} key={track.id} data-soundtrack-id={track.id}>
          <div className="soundtrack-card-header">
            <button type="button" className="soundtrack-preview" disabled={importing} aria-label={`${playing ? copy.stop : copy.preview} · ${item.title}`} aria-pressed={playing} onClick={() => preview(track)}>{playing ? <PauseIcon size={17} weight="fill" /> : <PlayIcon size={17} weight="fill" />}</button>
            <div className="soundtrack-card-title"><strong>{item.title}</strong><span>{item.description}</span></div>
            <button type="button" className="soundtrack-add" disabled={importing} title={`${copy.add} · ${item.title}`} aria-label={`${copy.add} · ${item.title}`} onClick={() => insert(track)}><PlusIcon size={16} /></button>
          </div>
          <TrackWaveform waveform={track.waveform} progress={playing ? progress : 0} />
          <div className="soundtrack-card-details"><span>{item.use}</span><span>{formatTime(track.duration)}<i aria-hidden="true">·</i>{track.bpm} {copy.tempoUnit}</span></div>
        </article>;
      })}
    </div>
    {importing && <p className="field-hint" role="status">{copy.adding}</p>}
    <p className="soundtrack-license">{copy.license}</p>
    <div className="soundtrack-current">
      <p className="section-caption">{copy.inserted}<span>{music.length}</span></p>
      {music.length ? <div className="soundtrack-used-list">{music.map((clip) => {
        const name = project.mediaAssets?.find(({ id }) => id === clip.mediaId)?.name;
        return <button type="button" key={clip.id} disabled={importing || !onSelectMusic} aria-label={`${copy.selectMusic} · ${name ?? copy.title}`} onClick={() => { stopPreview(); onSelectMusic?.(clip.id); }}><MusicNotesIcon size={14} /><span>{name}</span><small>{formatTime(clip.start)}</small></button>;
      })}</div> : <p className="field-hint">{copy.empty}</p>}
      <p className="soundtrack-position"><span>{copy.position}</span><span>{formatPreciseTime(time)}</span></p>
      <p className="field-hint">{copy.defaultVolume}</p>
    </div>
  </section>;
}
