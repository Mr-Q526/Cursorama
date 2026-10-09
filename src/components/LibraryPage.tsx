import { useState } from 'react';
import { ArrowClockwiseIcon, ArrowRightIcon, FilmStripIcon, FolderOpenIcon, MagnifyingGlassIcon, PlayIcon } from '@phosphor-icons/react';
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
  onProject: (project: LibraryProject) => void;
  onVideo: (project: LibraryProject, video: LibraryVideo) => void;
  onRefresh: () => void;
  onRecord: () => void;
  onImport: () => void;
}

export type LibraryFilter = 'projects' | 'videos';

export function LibraryPage(props: LibraryPageProps) {
  const [filter, setFilter] = useState<LibraryFilter>('projects');
  const [query, setQuery] = useState('');
  const copy = t.library;
  const search = query.trim().toLocaleLowerCase();
  const allProjects = props.library?.projects ?? [];
  const allVideos = allProjects.flatMap((project) => project.videos.map((video) => ({ project, video }))).sort((first, second) => second.video.createdAt.localeCompare(first.video.createdAt));
  const projects = allProjects.filter((item) => item.name.toLocaleLowerCase().includes(search));
  const videos = allVideos.filter(({ project, video }) => `${project.name} ${video.name}`.toLocaleLowerCase().includes(search));
  const empty = filter === 'projects' ? projects.length === 0 : videos.length === 0;
  return <main className="library-page content-page" aria-label={copy.title}>
    <div className="content-page-heading"><div><h1>{copy.pageTitle}</h1><p>{copy.pageDescription}</p></div><button type="button" className="soft-button" onClick={props.onRefresh} disabled={props.loading || props.disabled}><ArrowClockwiseIcon size={17} className={props.loading ? 'spin' : undefined} />{copy.refresh}</button></div>
    <div className="library-toolbar">
      <div className="library-tabs" role="group" aria-label={copy.title}><button type="button" aria-pressed={filter === 'projects'} onClick={() => setFilter('projects')}>{copy.projects}<span>{allProjects.length}</span></button><button type="button" aria-pressed={filter === 'videos'} onClick={() => setFilter('videos')}>{copy.videos}<span>{allVideos.length}</span></button></div>
      <label className="library-search"><MagnifyingGlassIcon size={17} /><input aria-label={copy.search} placeholder={copy.search} value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
    </div>
    <div className="library-content" aria-busy={props.loading}>
      {props.error ? <div className="library-empty"><FolderOpenIcon size={34} weight="thin" /><p>{copy.loadFailed}</p><button type="button" className="soft-button" onClick={props.onRefresh} disabled={props.loading || props.disabled}>{copy.retry}</button></div>
        : !props.library && props.loading ? <div className="library-empty"><ArrowClockwiseIcon size={28} className="spin" /><p>{copy.loading}</p></div>
        : empty ? <div className="library-empty">{filter === 'projects' ? <FolderOpenIcon size={40} weight="thin" /> : <FilmStripIcon size={40} weight="thin" />}<h2>{search ? copy.searchEmpty : filter === 'projects' ? copy.emptyLibrary : copy.noVideos}</h2>{!search && filter === 'projects' && <><p>{copy.emptyLibraryHint}</p><div className="library-empty-actions"><button type="button" className="primary-button" onClick={props.onRecord} disabled={props.disabled}>{t.editor.newRecording}</button><button type="button" className="soft-button" onClick={props.onImport} disabled={props.disabled}>{copy.import}</button></div></>}</div>
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
