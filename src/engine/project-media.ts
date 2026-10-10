import { resolveTimeline, SOURCE_MEDIA_ID, unpackProjectMedia } from '../../shared';
import type { BackgroundImageAsset, MediaAsset, Project, ProjectData, StoredProject } from '../../shared';

const previewRevisions = new WeakMap<Project, string>();
const FRAME_READY_TOLERANCE = 0.18;
let previewRevision = 0;

export function projectPreviewRevision(project: Project): string {
  const known = previewRevisions.get(project);
  if (known) return known;
  const revision = String(++previewRevision);
  previewRevisions.set(project, revision); return revision;
}

export function isProjectFrameReady(project: Project, time: number, video: HTMLVideoElement | null): boolean {
  const mapping = resolveTimeline(project, time);
  if (mapping.sourceType === 'demo') return true;
  const expectedUrl = mapping.mediaId === SOURCE_MEDIA_ID ? project.videoUrl : project.media?.[mapping.mediaId]?.url;
  return Boolean(video && expectedUrl && video.src === expectedUrl && !video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - mapping.sourceTime) <= FRAME_READY_TOLERANCE);
}

export function projectMetadata(project: Project): ProjectData {
  return {
    schemaVersion: 1, name: project.name, duration: project.duration, width: project.width, height: project.height,
    ...(project.frameRate !== undefined ? { frameRate: project.frameRate } : {}),
    samples: project.samples, clips: project.clips, settings: project.settings, trimStart: project.trimStart,
    trimEnd: project.trimEnd, sourceType: project.sourceType, hasAudio: project.hasAudio, cursorEmbedded: project.cursorEmbedded,
    ...(project.libraryCover ? { libraryCover: project.libraryCover } : {}),
    ...(project.editing ? { editing: project.editing } : {}),
    ...(project.mediaAssets ? { mediaAssets: project.mediaAssets } : {}),
    ...(project.backgroundImage ? { backgroundImage: project.backgroundImage } : {}),
  };
}

export function runtimeFromStored(value: StoredProject): Project {
  const unpacked = unpackProjectMedia(value.data, value.bytes);
  const imageData = value.data.backgroundImage;
  const imageBytes = imageData ? unpacked.assets.get(imageData.id) : undefined;
  if (imageData && !imageBytes) throw new Error('MISSING_BACKGROUND_IMAGE');
  const imageBlob = imageData && imageBytes ? new Blob([imageBytes], { type: imageData.mimeType }) : undefined;
  const backgroundImageAsset: BackgroundImageAsset | undefined = imageData && imageBlob ? { ...imageData, blob: imageBlob, url: URL.createObjectURL(imageBlob) } : undefined;
  const blob = unpacked.sourceBytes ? new Blob([unpacked.sourceBytes], { type: 'video/webm' }) : undefined;
  const media: Record<string, MediaAsset> = {};
  for (const asset of value.data.mediaAssets ?? []) {
    const bytes = unpacked.assets.get(asset.id);
    if (!bytes) throw new Error('MISSING_MEDIA_ASSET');
    const assetBlob = new Blob([bytes], { type: asset.mimeType });
    media[asset.id] = { ...asset, blob: assetBlob, url: URL.createObjectURL(assetBlob) };
  }
  return { ...value.data, videoBlob: blob, videoUrl: blob ? URL.createObjectURL(blob) : undefined, ...(Object.keys(media).length ? { media } : {}), ...(backgroundImageAsset ? { backgroundImageAsset } : {}) };
}

export function pruneProjectMedia(project: Project): Project {
  if (!project.editing || !project.mediaAssets) return project;
  const used = new Set([...project.editing.segments, ...project.editing.music].map((clip) => clip.mediaId));
  const mediaAssets = project.mediaAssets.filter((asset) => used.has(asset.id));
  const media = Object.fromEntries(Object.entries(project.media ?? {}).filter(([id]) => used.has(id)));
  return { ...project, mediaAssets, media };
}
