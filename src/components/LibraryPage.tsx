import { ArrowClockwiseIcon, ArrowRightIcon, FileArrowUpIcon, FilmStripIcon, FolderOpenIcon, MagnifyingGlassIcon, PlayIcon } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { LibraryProject, LibrarySnapshot, LibraryVideo } from '../../shared';
import { formatFileSize, formatLibraryDate, formatTime, formatVideoCount, t } from '../i18n';
import { LibraryCover } from './LibraryCover';

export interface LibraryPageProps {
  library: LibrarySnapshot | null;
  error: boolean;
  loading: boolean;
  disabled: boolean;
  projectId?: string;
  videoId?: string;
  filter: LibraryFilter;
  query: string;
  onFilter: (filter: LibraryFilter) => void;
  onQuery: (query: string) => void;
  onProject: (project: LibraryProject) => void;
  onVideo: (project: LibraryProject, video: LibraryVideo) => void;
  onRefresh: () => void;
  onRecord: () => void;
  onImportProject: () => void;
  onImportVideo: () => void;
}

export type LibraryFilter = 'projects' | 'videos';

interface ImportMenuProps { disabled: boolean; onProject: () => void; onVideo: () => void; }

function ImportMenu({ disabled, onProject, onVideo }: ImportMenuProps) {
  const copy = t.library;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open || disabled) return;
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const dismiss = (event: PointerEvent): void => { if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false); };
    const keyboard = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); buttonRef.current?.focus(); return; }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      const controls = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      if (!controls.length) return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const current = controls.findIndex((control) => control === document.activeElement);
      controls[(current + direction + controls.length) % controls.length]?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    rootRef.current?.addEventListener('keydown', keyboard);
    const root = rootRef.current;
    return () => { document.removeEventListener('pointerdown', dismiss); root?.removeEventListener('keydown', keyboard); };
  }, [open, disabled]);
  const choose = (action: () => void): void => { setOpen(false); buttonRef.current?.focus(); action(); };
  return <div className="library-import-menu" ref={rootRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={buttonRef} type="button" className="soft-button" aria-haspopup="menu" aria-expanded={open && !disabled} aria-controls={menuId} onClick={() => setOpen(!open)} disabled={disabled}><FileArrowUpIcon size={17} />{copy.import}</button>
    {open && !disabled && <div id={menuId} className="library-import-options" role="menu" aria-label={copy.import}>
      <button type="button" role="menuitem" onClick={() => choose(onProject)}><FolderOpenIcon size={16} />{copy.importProject}</button>
      <button type="button" role="menuitem" onClick={() => choose(onVideo)}><FilmStripIcon size={16} />{copy.importVideo}</button>
    </div>}
  </div>;
}

export function LibraryPage(props: LibraryPageProps) {
  const { filter, query, onFilter, onQuery } = props;
  const copy = t.library;
  const search = query.trim().toLocaleLowerCase();
  const allProjects = props.library?.projects ?? [];
  const allVideos = allProjects.flatMap((project) => project.videos.map((video) => ({ project, video }))).sort((first, second) => second.video.createdAt.localeCompare(first.video.createdAt));
  const projects = allProjects.filter((item) => item.name.toLocaleLowerCase().includes(search));
  const videos = allVideos.filter(({ project, video }) => `${project.name} ${video.name}`.toLocaleLowerCase().includes(search));
  const empty = filter === 'projects' ? projects.length === 0 : videos.length === 0;
  return <main className="library-page content-page" aria-label={copy.title}>
    <div className="content-page-heading"><div><h1>{copy.pageTitle}</h1><p>{copy.pageDescription}</p></div><div className="library-heading-actions"><ImportMenu disabled={props.disabled} onProject={props.onImportProject} onVideo={props.onImportVideo} /><button type="button" className="soft-button" onClick={props.onRefresh} disabled={props.loading || props.disabled}><ArrowClockwiseIcon size={17} className={props.loading ? 'spin' : undefined} />{copy.refresh}</button></div></div>
    <div className="library-toolbar">
      <div className="library-tabs" role="group" aria-label={copy.title}><button type="button" aria-pressed={filter === 'projects'} onClick={() => onFilter('projects')}>{copy.projects}<span>{allProjects.length}</span></button><button type="button" aria-pressed={filter === 'videos'} onClick={() => onFilter('videos')}>{copy.videos}<span>{allVideos.length}</span></button></div>
      <label className="library-search"><MagnifyingGlassIcon size={17} /><input aria-label={copy.search} placeholder={copy.search} value={query} onChange={(event) => onQuery(event.currentTarget.value)} /></label>
    </div>
    <div className="library-content" aria-busy={props.loading}>
      {props.error ? <div className="library-empty"><FolderOpenIcon size={34} weight="thin" /><p>{copy.loadFailed}</p><button type="button" className="soft-button" onClick={props.onRefresh} disabled={props.loading || props.disabled}>{copy.retry}</button></div>
        : !props.library && props.loading ? <div className="library-empty"><ArrowClockwiseIcon size={28} className="spin" /><p>{copy.loading}</p></div>
        : empty ? <div className="library-empty">{filter === 'projects' ? <FolderOpenIcon size={40} weight="thin" /> : <FilmStripIcon size={40} weight="thin" />}<h2>{search ? copy.searchEmpty : filter === 'projects' ? copy.emptyLibrary : copy.noVideos}</h2>{!search && filter === 'projects' && <><p>{copy.emptyLibraryHint}</p><div className="library-empty-actions"><button type="button" className="primary-button" onClick={props.onRecord} disabled={props.disabled}>{t.editor.newRecording}</button></div></>}</div>
        : <div className="library-grid">
          {filter === 'projects' ? projects.map((project) => <article className="library-card" key={project.id}>
            <button type="button" className="library-card-open" data-project-id={project.id} aria-current={props.projectId === project.id && !props.videoId ? 'true' : undefined} onClick={() => props.onProject(project)} disabled={props.disabled}>
              <div className="library-card-poster"><LibraryCover projectId={project.id} revision={project.updatedAt} cover={project.cover} /><span className="library-cover-duration">{formatTime(project.duration)}</span><span className="library-cover-open"><ArrowRightIcon size={18} /></span></div>
              <div className="library-card-details"><strong title={project.name}>{project.name}</strong><span>{project.width} × {project.height}<span className="library-card-separator">·</span>{formatVideoCount(project.videos.length)}</span></div>
            </button>
            <div className="library-card-footer"><time dateTime={project.updatedAt}>{formatLibraryDate(project.updatedAt)}</time>{project.videos[0] && <button type="button" className="text-button library-latest" data-video-id={project.videos[0].id} onClick={() => props.onVideo(project, project.videos[0])} disabled={props.disabled}><PlayIcon size={12} weight="fill" />{copy.latest}</button>}</div>
          </article>) : videos.map(({ project, video }) => <article className="library-card" key={video.id}>
            <button type="button" className="library-card-open" data-video-id={video.id} aria-current={props.videoId === video.id ? 'true' : undefined} onClick={() => props.onVideo(project, video)} disabled={props.disabled}>
              <div className="library-card-poster"><LibraryCover projectId={project.id} videoId={video.id} revision={video.createdAt} cover={video.cover} /><span className="library-cover-duration">{video.format.toUpperCase()}</span><span className="library-cover-open"><PlayIcon size={18} weight="fill" /></span></div>
              <div className="library-card-details"><strong title={video.name}>{video.name}</strong><span>{project.name}<span className="library-card-separator">·</span>{formatFileSize(video.size)}</span></div>
            </button>
            <div className="library-card-footer"><time dateTime={video.createdAt}>{formatLibraryDate(video.createdAt)}</time><FilmStripIcon size={15} /></div>
          </article>)}
        </div>}
    </div>
    {Boolean(props.library?.unavailable) && <p className="library-warning" role="status">{copy.unavailable}</p>}
  </main>;
}
