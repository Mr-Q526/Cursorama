import { useEffect, useRef, useState } from 'react';
import type { LibraryProject, LibraryVideo } from '../../shared';
import { listLibrary, openLibraryVideo } from '../library';
import type { LibraryVideoSource } from '../library';
import type { AppPage, PreviewPageTarget } from './useAppPage';

export interface LibraryPreviewSelection { project: LibraryProject; video: LibraryVideo; source: LibraryVideoSource; }

export function useLibraryPreview(page: AppPage, target: PreviewPageTarget | undefined, onUnavailable: () => void) {
  const [selection, setSelection] = useState<LibraryPreviewSelection | null>(null);
  const [loading, setLoading] = useState(false);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;
  const projectId = target?.projectId;
  const videoId = target?.videoId;

  useEffect(() => {
    setSelection(null);
    if (page !== 'preview' || !projectId || !videoId) { setLoading(false); return; }
    let disposed = false;
    let source: LibraryVideoSource | undefined;
    const release = (): void => { if (source?.revoke) URL.revokeObjectURL(source.url); source = undefined; };
    setLoading(true);
    void (async (): Promise<void> => {
      try {
        const library = await listLibrary();
        if (disposed) return;
        const project = library.projects.find((item) => item.id === projectId);
        const video = project?.videos.find((item) => item.id === videoId);
        if (!project || !video) throw new Error('LIBRARY_PREVIEW_NOT_FOUND');
        source = await openLibraryVideo(project.id, video.id, video.format);
        if (disposed) { release(); return; }
        setSelection({ project, video, source });
      } catch (error: unknown) {
        release();
        if (!disposed) { console.error('LIBRARY_PREVIEW_OPEN_FAILED', error); unavailableRef.current(); }
      } finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; release(); };
  }, [page, projectId, videoId]);

  const videoSelection = page === 'preview' && selection && selection.project.id === projectId && selection.video.id === videoId ? selection : null;
  return { videoSelection, previewLoading: page === 'preview' && Boolean(target) && (loading || !videoSelection) };
}
