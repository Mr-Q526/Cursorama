import { CaretDownIcon, CircleNotchIcon, MagnifyingGlassIcon, MusicNotesIcon, PauseIcon, PlayIcon, PlusIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../../shared';
import { formatPreciseTime, formatTime } from '../i18n';
import { soundtracksCatalog as copy } from '../i18n/soundtracks';
import { soundtrackBrowserCatalog as browser } from '../i18n/soundtrack-browser';
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
const PROGRESS_PERCENT = 100;

function searchText(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().trim(); }

export function SoundtrackPanel({ project, time, importing, onInsert, onImport, onSelectMusic, onPreviewStart }: SoundtrackPanelProps) {
  const [filter, setFilter] = useState<SoundtrackFilter>('all');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<SoundtrackId>();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewError, setPreviewError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef<SoundtrackId | undefined>(undefined);
  const disabledRef = useRef(importing); disabledRef.current = importing;
  const searchRef = useRef<HTMLInputElement>(null);
  const terms = searchText(query).split(/\s+/).filter(Boolean);
  const tracks = SOUNDTRACKS.filter((track) => {
    if (filter !== 'all' && track.category !== filter) return false;
    const item = copy.tracks[track.id];
    const text = searchText(`${item.title} ${item.description} ${item.use} ${copy.categories[track.category]} ${track.id}`);
    return terms.every((term) => text.includes(term));
  });
  const music = project.editing?.music ?? [];

  const stopPreview = useCallback((): void => {
    requestRef.current++;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    activeRef.current = undefined;
    setActive(undefined); setLoading(false); setProgress(0);
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = SOUNDTRACK_DEFAULTS.auditionVolume;
    audioRef.current = audio;
    const update = (): void => { setProgress(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.max(0, Math.min(1, audio.currentTime / audio.duration)) : 0); };
    const ready = (): void => { if (activeRef.current) setLoading(false); };
    const ended = (): void => { activeRef.current = undefined; setActive(undefined); setLoading(false); setProgress(0); };
    const failed = (): void => { if (activeRef.current) { ended(); setPreviewError(true); } };
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('ended', ended);
    audio.addEventListener('error', failed);
    audio.addEventListener('playing', ready);
    return () => {
      requestRef.current++;
      audio.removeEventListener('timeupdate', update); audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed);
      audio.removeEventListener('playing', ready);
      audio.pause(); audio.removeAttribute('src'); audio.load(); audioRef.current = null; activeRef.current = undefined;
    };
  }, []);

  useEffect(() => { if (importing) stopPreview(); }, [importing, stopPreview]);
  useEffect(() => { stopPreview(); }, [project.videoUrl, project.sourceType, stopPreview]);
  useEffect(() => {
    const visibility = (): void => { if (document.hidden) stopPreview(); };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [stopPreview]);

  const preview = (track: Soundtrack): void => {
    const audio = audioRef.current;
    if (!audio || disabledRef.current) return;
    if (activeRef.current === track.id) { stopPreview(); return; }
    stopPreview();
    onPreviewStart?.();
    setPreviewError(false);
    activeRef.current = track.id;
    setActive(track.id);
    setLoading(true);
    audio.src = track.file;
    const request = requestRef.current;
    void audio.play().catch((error: unknown) => {
      if (request !== requestRef.current) return;
      console.error('SOUNDTRACK_PREVIEW_FAILED', error);
      stopPreview(); setPreviewError(true);
    });
  };

  const insert = (track: Soundtrack): void => { if (disabledRef.current) return; stopPreview(); onInsert(track); };
  const importAudio = (): void => { if (disabledRef.current) return; stopPreview(); onImport(); };
  const resetSearch = (): void => { stopPreview(); setFilter('all'); setQuery(''); searchRef.current?.focus(); };

  return <section className="soundtrack-panel" aria-label={copy.title}>
    <div className="soundtrack-library-header"><span>{copy.library}</span><button type="button" className="soundtrack-import" disabled={importing} title={copy.import} aria-label={copy.import} onClick={importAudio}><UploadSimpleIcon size={14} />{browser.import}</button></div>
    <div className="soundtrack-search"><MagnifyingGlassIcon size={15} aria-hidden="true" /><input type="search" ref={searchRef} aria-label={browser.search} placeholder={browser.searchPlaceholder} value={query} onChange={(event) => { stopPreview(); setQuery(event.currentTarget.value); }} />{query && <button type="button" aria-label={browser.clearSearch} onClick={() => { stopPreview(); setQuery(''); searchRef.current?.focus(); }}><XIcon size={13} /></button>}</div>
    <div className="soundtrack-filters"><select aria-label={copy.filterLabel} value={filter} onChange={(event) => { stopPreview(); setFilter(event.currentTarget.value as SoundtrackFilter); }}>{SOUNDTRACK_FILTERS.map((id) => <option key={id} value={id}>{copy.categories[id]}</option>)}</select><small className="soundtrack-result-count" aria-live="polite">{tracks.length}{browser.results}{tracks.length !== SOUNDTRACKS.length && <span> / {SOUNDTRACKS.length}</span>}</small></div>
    {previewError && <p className="soundtrack-error" role="alert">{copy.previewFailed}</p>}
    <div className="soundtrack-list">
      {tracks.map((track) => {
        const item = copy.tracks[track.id];
        const playing = active === track.id;
        const pending = playing && loading;
        return <article className={`soundtrack-card${playing ? ' playing' : ''}`} key={track.id} data-soundtrack-id={track.id} data-preview-progress={playing ? progress : undefined} aria-busy={pending}>
          <div className="soundtrack-card-header">
            <button type="button" className="soundtrack-preview" disabled={importing} title={`${playing ? copy.stop : copy.preview} · ${item.title}`} aria-label={`${playing ? copy.stop : copy.preview} · ${item.title}`} aria-pressed={playing} onClick={() => preview(track)}>{pending ? <CircleNotchIcon className="soundtrack-loading" size={15} /> : playing ? <PauseIcon size={14} weight="fill" /> : <PlayIcon size={14} weight="fill" />}</button>
            <div className="soundtrack-card-title"><strong title={item.description}>{item.title}</strong><span>{copy.categories[track.category]}<i aria-hidden="true">·</i>{formatTime(track.duration)}</span></div>
            <button type="button" className="soundtrack-add" disabled={importing} title={`${copy.add} · ${item.title}`} aria-label={`${copy.add} · ${item.title}`} onClick={() => insert(track)}><PlusIcon size={16} /></button>
          </div>
          {playing && <div className="soundtrack-preview-progress" role="progressbar" aria-label={pending ? browser.loading : browser.previewProgress} aria-valuemin={0} aria-valuemax={PROGRESS_PERCENT} aria-valuenow={Math.round(progress * PROGRESS_PERCENT)}><span style={{ width: `${progress * PROGRESS_PERCENT}%` }} /></div>}
        </article>;
      })}
    </div>
    {!tracks.length && <div className="soundtrack-empty"><MusicNotesIcon size={25} weight="light" /><strong>{browser.noResults}</strong><p>{browser.noResultsHint}</p><button type="button" className="text-button" onClick={resetSearch}>{browser.reset}</button></div>}
    {importing && <p className="field-hint" role="status">{copy.adding}</p>}
    <div className="soundtrack-footer"><span title={copy.license}>{browser.license}</span><span title={browser.position}>{formatPreciseTime(time)}</span></div>
    <details className="soundtrack-current">
      <summary><span>{browser.current}</span><small>{music.length}</small><CaretDownIcon size={12} /></summary>
      {music.length ? <div className="soundtrack-used-list">{music.map((clip) => {
        const name = project.mediaAssets?.find(({ id }) => id === clip.mediaId)?.name;
        return <button type="button" key={clip.id} disabled={importing || !onSelectMusic} aria-label={`${copy.selectMusic} · ${name ?? copy.title}`} onClick={() => { stopPreview(); onSelectMusic?.(clip.id); }}><MusicNotesIcon size={14} /><span>{name}</span><small>{formatTime(clip.start)}</small></button>;
      })}</div> : <p className="field-hint">{copy.empty}</p>}
    </details>
  </section>;
}
