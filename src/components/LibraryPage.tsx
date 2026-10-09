import { useState } from 'react';
import { ArrowClockwiseIcon, ArrowRightIcon, FilmStripIcon, FolderOpenIcon, MagnifyingGlassIcon, MonitorPlayIcon, PlayIcon } from '@phosphor-icons/react';
import type { LibraryProject, LibrarySnapshot, LibraryVideo } from '../../shared';
import { formatFileSize, formatLibraryDate, formatTime, formatVideoCount, t } from '../i18n';

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
        : <table className="library-table"><thead><tr><th>{copy.name}</th><th>{filter === 'projects' ? copy.duration : copy.format}</th><th>{filter === 'projects' ? copy.updated : copy.created}</th><th>{filter === 'projects' ? copy.output : copy.fileSize}</th></tr></thead><tbody>
          {filter === 'projects' ? projects.map((project) => <tr key={project.id}>
            <td><button type="button" className="library-item" data-project-id={project.id} aria-current={props.projectId === project.id && !props.videoId ? 'true' : undefined} onClick={() => props.onProject(project)} disabled={props.disabled}><span className="library-item-icon"><MonitorPlayIcon size={23} /></span><span><strong>{project.name}</strong><small>{project.width} × {project.height}</small></span><ArrowRightIcon className="library-item-arrow" size={17} /></button></td>
            <td>{formatTime(project.duration)}</td><td>{formatLibraryDate(project.updatedAt)}</td><td><div className="library-output"><span>{formatVideoCount(project.videos.length)}</span>{project.videos[0] && <button type="button" className="text-button library-latest" data-video-id={project.videos[0].id} onClick={() => props.onVideo(project, project.videos[0])} disabled={props.disabled}><PlayIcon size={13} weight="fill" />{copy.latest}</button>}</div></td>
          </tr>) : videos.map(({ project, video }) => <tr key={video.id}>
            <td><button type="button" className="library-item" data-video-id={video.id} aria-current={props.videoId === video.id ? 'true' : undefined} onClick={() => props.onVideo(project, video)} disabled={props.disabled}><span className="library-item-icon"><FilmStripIcon size={23} /></span><span><strong>{video.name}</strong><small>{project.name}</small></span><PlayIcon className="library-item-arrow" size={17} /></button></td>
            <td><span className="library-format">{video.format.toUpperCase()}</span></td><td>{formatLibraryDate(video.createdAt)}</td><td>{formatFileSize(video.size)}</td>
          </tr>)}
        </tbody></table>}
    </div>
    {Boolean(props.library?.unavailable) && <p className="library-warning" role="status">{copy.unavailable}</p>}
  </main>;
}
