import { ArrowLeftIcon, FolderOpenIcon, FilmStripIcon } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import type { LibraryVideo } from '../../shared';
import { formatFileSize, formatLibraryDate, t } from '../i18n';

export interface ExportPreviewProps { video: LibraryVideo; url: string; onBack: () => void; onReveal: () => void; onError: () => void; }

export function ExportPreview({ video, url, onBack, onReveal, onError }: ExportPreviewProps) {
  const copy = t.library;
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = videoRef.current;
    return () => { if (element) { element.pause(); element.removeAttribute('src'); element.load(); } };
  }, [url]);
  return <main className="export-preview"><div className="export-preview-heading"><div><span><FilmStripIcon size={18} />{copy.videoPreview}</span><h1>{video.name}</h1><p>{video.format.toUpperCase()}<span> · </span>{formatFileSize(video.size)}<span> · </span>{formatLibraryDate(video.createdAt)}</p></div><button type="button" className="soft-button" onClick={onBack}><ArrowLeftIcon size={16} />{copy.closeVideo}</button></div><div className="export-preview-stage"><video ref={videoRef} key={url} src={url} controls playsInline preload="metadata" onError={onError} aria-label={copy.videoPreview} /></div><div className="export-preview-footer"><p>{copy.videoDescription}</p><button className="text-button" type="button" onClick={onReveal}><FolderOpenIcon size={17} />{copy.reveal}</button></div><p className="export-preview-path">{video.path}</p></main>;
}
