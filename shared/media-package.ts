import { EDITING_LIMITS, isMediaIdentifier, SOURCE_MEDIA_ID } from './editing';
import type { Project, ProjectData } from './types';

export const MEDIA_PACKAGE_MAGIC = 'CURMED01';
export const MEDIA_PACKAGE_HEADER_SIZE = 12;
export const MEDIA_PACKAGE_LIMITS = {
  maxHeaderBytes: 1024 * 1024,
  maxPayloadBytes: 2 * 1024 * 1024 * 1024 - 1,
  maxEntries: EDITING_LIMITS.maxAssets + 1,
} as const;

export interface MediaPackageEntry {
  id: string;
  offset: number;
  length: number;
}

export interface MediaPackageManifest {
  version: 1;
  entries: MediaPackageEntry[];
}

export interface UnpackedProjectMedia {
  sourceBytes?: ArrayBuffer;
  assets: Map<string, ArrayBuffer>;
}

interface PackedBlob {
  id: string;
  blob: Blob;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const byteSize = (value: unknown, min: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= MEDIA_PACKAGE_LIMITS.maxPayloadBytes;

function expectedMediaIds(project: ProjectData): Set<string> {
  const expected = new Set<string>();
  if (project.sourceType === 'video') expected.add(SOURCE_MEDIA_ID);
  for (const asset of project.mediaAssets ?? []) {
    if (!isMediaIdentifier(asset.id) || asset.id === SOURCE_MEDIA_ID || expected.has(asset.id)) throw new Error('INVALID_MEDIA_ASSETS');
    expected.add(asset.id);
  }
  if (expected.size > MEDIA_PACKAGE_LIMITS.maxEntries) throw new Error('TOO_MANY_MEDIA_ASSETS');
  return expected;
}

export function hasMediaPackageHeader(payload: ArrayBuffer): boolean {
  return payload.byteLength >= MEDIA_PACKAGE_MAGIC.length &&
    new TextDecoder().decode(new Uint8Array(payload, 0, MEDIA_PACKAGE_MAGIC.length)) === MEDIA_PACKAGE_MAGIC;
}

function readManifest(project: ProjectData, payload: ArrayBuffer): { entries: MediaPackageEntry[]; bodyStart: number } {
  if (payload.byteLength < MEDIA_PACKAGE_HEADER_SIZE || payload.byteLength > MEDIA_PACKAGE_LIMITS.maxPayloadBytes) throw new Error('INVALID_MEDIA_PACKAGE');
  const headerLength = new DataView(payload).getUint32(MEDIA_PACKAGE_MAGIC.length, true);
  const bodyStart = MEDIA_PACKAGE_HEADER_SIZE + headerLength;
  if (headerLength === 0 || headerLength > MEDIA_PACKAGE_LIMITS.maxHeaderBytes || bodyStart > payload.byteLength) throw new Error('INVALID_MEDIA_PACKAGE');
  let metadata: unknown;
  try {
    metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(payload, MEDIA_PACKAGE_HEADER_SIZE, headerLength))) as unknown;
  } catch (error: unknown) {
    throw new Error('INVALID_MEDIA_PACKAGE', { cause: error });
  }
  const expected = expectedMediaIds(project);
  if (!isRecord(metadata) || metadata.version !== 1 || !Array.isArray(metadata.entries) || metadata.entries.length !== expected.size) throw new Error('INVALID_MEDIA_PACKAGE');
  let offset = 0;
  const entries = metadata.entries.map((item: unknown): MediaPackageEntry => {
    if (!isRecord(item) || !isMediaIdentifier(item.id) || !expected.delete(item.id) || !byteSize(item.offset, 0) ||
      !byteSize(item.length, 1) || item.offset !== offset || !Number.isSafeInteger(item.offset + item.length) ||
      item.offset + item.length > payload.byteLength - bodyStart) throw new Error('INVALID_MEDIA_PACKAGE');
    offset += item.length;
    return { id: item.id, offset: item.offset, length: item.length };
  });
  if (expected.size !== 0 || bodyStart + offset !== payload.byteLength) throw new Error('INVALID_MEDIA_PACKAGE');
  return { entries, bodyStart };
}

export function validateProjectMediaPayload(project: ProjectData, payload?: ArrayBuffer): void {
  if (!payload || payload.byteLength === 0) {
    if (project.sourceType === 'video') throw new Error('MISSING_VIDEO');
    if (project.mediaAssets?.length) throw new Error('MISSING_MEDIA_ASSET');
    return;
  }
  if (hasMediaPackageHeader(payload)) {
    readManifest(project, payload);
    return;
  }
  if (payload.byteLength > MEDIA_PACKAGE_LIMITS.maxPayloadBytes || project.mediaAssets?.length || project.sourceType !== 'video') throw new Error('INVALID_MEDIA_PACKAGE');
}

export async function packProjectMedia(project: Project): Promise<ArrayBuffer | undefined> {
  const expected = expectedMediaIds(project);
  if (project.sourceType === 'video' && (!project.videoBlob || project.videoBlob.size === 0)) throw new Error('MISSING_VIDEO');
  if ((project.mediaAssets?.length ?? 0) === 0) {
    if (!project.videoBlob || project.sourceType !== 'video') return undefined;
    if (project.videoBlob.size > MEDIA_PACKAGE_LIMITS.maxPayloadBytes) throw new Error('MEDIA_PACKAGE_TOO_LARGE');
    return project.videoBlob.arrayBuffer();
  }
  const blobs: PackedBlob[] = [];
  if (project.videoBlob && project.sourceType === 'video') blobs.push({ id: SOURCE_MEDIA_ID, blob: project.videoBlob });
  for (const asset of project.mediaAssets ?? []) {
    const media = project.media?.[asset.id];
    if (!media || media.id !== asset.id || media.blob.size === 0) throw new Error('MISSING_MEDIA_ASSET');
    blobs.push({ id: asset.id, blob: media.blob });
  }
  if (blobs.length !== expected.size) throw new Error('MISSING_MEDIA_ASSET');
  let offset = 0;
  const entries = blobs.map(({ id, blob }): MediaPackageEntry => {
    if (!byteSize(blob.size, 1)) throw new Error('MEDIA_PACKAGE_TOO_LARGE');
    const entry = { id, offset, length: blob.size };
    offset += blob.size;
    if (!byteSize(offset, 1)) throw new Error('MEDIA_PACKAGE_TOO_LARGE');
    return entry;
  });
  const manifest: MediaPackageManifest = { version: 1, entries };
  const metadata = new TextEncoder().encode(JSON.stringify(manifest));
  const bodyStart = MEDIA_PACKAGE_HEADER_SIZE + metadata.length;
  if (metadata.byteLength > MEDIA_PACKAGE_LIMITS.maxHeaderBytes || bodyStart + offset > MEDIA_PACKAGE_LIMITS.maxPayloadBytes) throw new Error('MEDIA_PACKAGE_TOO_LARGE');
  const result = new Uint8Array(bodyStart + offset);
  result.set(new TextEncoder().encode(MEDIA_PACKAGE_MAGIC));
  new DataView(result.buffer).setUint32(MEDIA_PACKAGE_MAGIC.length, metadata.length, true);
  result.set(metadata, MEDIA_PACKAGE_HEADER_SIZE);
  for (let index = 0; index < blobs.length; index++) result.set(new Uint8Array(await blobs[index].blob.arrayBuffer()), bodyStart + entries[index].offset);
  return result.buffer;
}

export function unpackProjectMedia(project: ProjectData, payload?: ArrayBuffer): UnpackedProjectMedia {
  validateProjectMediaPayload(project, payload);
  const assets = new Map<string, ArrayBuffer>();
  if (!payload || payload.byteLength === 0) return { assets };
  if (!hasMediaPackageHeader(payload)) return { sourceBytes: payload, assets };
  const { entries, bodyStart } = readManifest(project, payload);
  let sourceBytes: ArrayBuffer | undefined;
  for (const { id, offset, length } of entries) {
    const bytes = payload.slice(bodyStart + offset, bodyStart + offset + length);
    if (id === SOURCE_MEDIA_ID) sourceBytes = bytes;
    else assets.set(id, bytes);
  }
  return { sourceBytes, assets };
}
