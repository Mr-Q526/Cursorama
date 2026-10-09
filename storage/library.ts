import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { isLibraryCover, MAX_PROJECT_HEADER, PROJECT_HEADER_SIZE, PROJECT_MAGIC, parseProject, projectBytes, readProjectBytes, resolveTimeline, SOURCE_MEDIA_ID, timelineDuration, unpackProjectMedia, validateProjectMediaPayload } from '../shared';
import type { ExportRequest, ExportResult, LibraryProject, LibrarySnapshot, LibraryVideo, ProjectData, StorageSettings, StorageTarget, StoredProject } from '../shared';
import { checkedLibraryPath, defaultLibraryRoot, EXPORTS_DIRECTORY, LibraryLocations } from './locations';
import type { LibraryLocationOptions } from './locations';
import { atomicReplace } from './files';
import { generateLibraryThumbnail } from './thumbnails';
import type { ThumbnailSource } from './thumbnails';

const PROJECT_FILE = 'project.cursorama';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VIDEO_PATTERN = /^([0-9a-f-]{36})\.(mp4|webm)$/;
const COVER_CACHE_DIRECTORY = '.covers';
const COVER_SAMPLE_OFFSET = 0.5;

export type VideoWriter = (target: string) => Promise<void>;
interface ProjectLocation { directory: string; root: string; file: string; }
interface VideoLocation { directory: string; root: string; }
interface CoverCache { revision: string; image: string; }
interface CoverInput { source: ThumbnailSource; revision: string; directory: string; root: string; key: string; image?: string; }

export class LocalLibrary {
  readonly root: string;
  private readonly locations: LibraryLocations;
  private pending: Promise<void> = Promise.resolve();
  private readonly pendingCovers = new Map<string, Promise<string | null>>();

  constructor(root = defaultLibraryRoot(), options: LibraryLocationOptions = {}) {
    this.root = path.resolve(root);
    this.locations = new LibraryLocations(this.root, options);
  }

  private identify(id: string): string {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('INVALID_LIBRARY_ID');
    return id;
  }

  private async ensure(): Promise<void> {
    await this.locations.ready();
    await this.locations.reveal('projects');
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.then(() => undefined, () => undefined);
    return next;
  }

  private async findProject(id: string): Promise<ProjectLocation> {
    this.identify(id);
    await this.locations.ready();
    for (const root of this.locations.projects) {
      const directory = path.join(root, id);
      const file = path.join(directory, PROJECT_FILE);
      try {
        await checkedLibraryPath(directory, root);
        await checkedLibraryPath(file, root);
        return { directory, root, file };
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    }
    throw new Error('PROJECT_NOT_FOUND');
  }

  private async header(file: string, root: string): Promise<ProjectData> {
    const handle = await open(await checkedLibraryPath(file, root), 'r');
    try {
      const prefix = Buffer.alloc(PROJECT_HEADER_SIZE);
      const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
      if (bytesRead !== prefix.length || prefix.subarray(0, PROJECT_MAGIC.length).toString() !== PROJECT_MAGIC) throw new Error('INVALID_PROJECT');
      const length = prefix.readUInt32LE(PROJECT_MAGIC.length);
      const info = await handle.stat();
      if (length > MAX_PROJECT_HEADER || length + PROJECT_HEADER_SIZE > info.size) throw new Error('INVALID_PROJECT');
      const metadata = Buffer.alloc(length);
      const read = await handle.read(metadata, 0, length, PROJECT_HEADER_SIZE);
      if (read.bytesRead !== length) throw new Error('INVALID_PROJECT');
      const data = parseProject(JSON.parse(metadata.toString()) as unknown);
      if (data.sourceType === 'video' && info.size === length + PROJECT_HEADER_SIZE) throw new Error('MISSING_VIDEO');
      return data;
    } finally { await handle.close(); }
  }

  private async videos(id: string, name: string, project: ProjectLocation): Promise<LibraryVideo[]> {
    const sources: VideoLocation[] = [
      ...this.locations.exports.map((root) => ({ directory: path.join(root, id), root })),
      { directory: path.join(project.directory, EXPORTS_DIRECTORY), root: project.root },
    ];
    const videos = new Map<string, LibraryVideo>();
    for (const source of sources) {
      let files: string[];
      try { files = await readdir(await checkedLibraryPath(source.directory, source.root)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      for (const file of files) {
        const match = file.match(VIDEO_PATTERN);
        if (!match || !ID_PATTERN.test(match[1]) || videos.has(match[1])) continue;
        const target = path.join(source.directory, file);
        const info = await lstat(target);
        if (!info.isFile() || info.isSymbolicLink() || info.size === 0) continue;
        await checkedLibraryPath(target, source.root);
        videos.set(match[1], { id: match[1], name, path: target, format: match[2] as LibraryVideo['format'], createdAt: info.mtime.toISOString(), size: info.size });
      }
    }
    return [...videos.values()].sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }

  private async snapshot(): Promise<LibrarySnapshot> {
    await this.ensure();
    const projects = new Map<string, LibraryProject>();
    let unavailable = 0;
    for (const root of this.locations.projects) {
      let entries: Dirent[];
      try { entries = await readdir(await checkedLibraryPath(root, root), { withFileTypes: true }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        if (root === this.locations.current.projectDirectory) throw error;
        console.warn('LIBRARY_DIRECTORY_UNAVAILABLE', error instanceof Error ? error.message : String(error));
        unavailable++; continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || !ID_PATTERN.test(entry.name) || projects.has(entry.name)) continue;
        try {
          const directory = path.join(root, entry.name);
          await checkedLibraryPath(directory, root);
          const file = path.join(directory, PROJECT_FILE);
          const data = await this.header(file, root);
          const info = await lstat(file);
          const videos = await this.videos(entry.name, data.name, { directory, root, file });
          const modifiedAt = info.mtime.toISOString();
          const updatedAt = videos[0]?.createdAt && videos[0].createdAt > modifiedAt ? videos[0].createdAt : modifiedAt;
          projects.set(entry.name, { id: entry.name, name: data.name, path: file, updatedAt, duration: timelineDuration(data), width: data.width, height: data.height, videos, ...(data.libraryCover ? { cover: data.libraryCover } : {}) });
        } catch (error) {
          console.warn('LIBRARY_ENTRY_UNAVAILABLE', entry.name, error instanceof Error ? error.message : String(error));
          unavailable++;
        }
      }
    }
    return { root: this.root, storage: this.locations.current, projects: [...projects.values()].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)), unavailable };
  }

  list(): Promise<LibrarySnapshot> { return this.mutate(() => this.snapshot()); }

  configure(settings: StorageSettings): Promise<LibrarySnapshot> {
    return this.mutate(async () => { await this.locations.update(settings); return this.snapshot(); });
  }

  storageDirectory(target: StorageTarget): Promise<string> {
    return this.mutate(() => this.locations.reveal(target));
  }

  async saveProject(data: ProjectData, bytes?: ArrayBuffer, projectId?: string): Promise<ExportResult> {
    const validated = parseProject(data);
    validateProjectMediaPayload(validated, bytes);
    const id = projectId ? this.identify(projectId) : randomUUID();
    return this.mutate(async () => {
      await this.ensure();
      const root = this.locations.current.projectDirectory;
      const location = projectId ? await this.findProject(id) : { directory: path.join(root, id), root, file: path.join(root, id, PROJECT_FILE) };
      if (!projectId) await mkdir(location.directory);
      await checkedLibraryPath(location.directory, location.root);
      const temporary = path.join(location.directory, `${randomUUID()}.partial`);
      try {
        await writeFile(temporary, projectBytes(validated, bytes), { flag: 'wx' });
        await atomicReplace(temporary, location.file);
      } finally { await rm(temporary, { force: true }); }
      return { cancelled: false, path: location.file, projectId: id };
    });
  }

  openProject(id: string): Promise<StoredProject> {
    return this.mutate(async () => {
      const project = await this.findProject(id);
      return readProjectBytes(await readFile(await checkedLibraryPath(project.file, project.root)));
    });
  }

  async exportVideo(request: ExportRequest, writer: VideoWriter): Promise<ExportResult> {
    if (!request.projectId || !['mp4', 'webm'].includes(request.format)) throw new Error('PROJECT_NOT_SAVED');
    const id = this.identify(request.projectId);
    return this.mutate(async () => {
      await this.findProject(id);
      const root = await this.locations.reveal('exports');
      const directory = path.join(root, id);
      await mkdir(directory, { recursive: true });
      await checkedLibraryPath(directory, root);
      const videoId = randomUUID();
      const file = path.join(directory, `${videoId}.${request.format}`);
      const temporary = path.join(directory, `${videoId}.partial.${request.format}`);
      try {
        await writer(temporary);
        if ((await lstat(await checkedLibraryPath(temporary, root))).size === 0) throw new Error('EMPTY_VIDEO');
        await atomicReplace(temporary, file);
      } finally { await rm(temporary, { force: true }); }
      return { cancelled: false, path: file, projectId: id, videoId };
    });
  }

  private async findVideo(projectId: string, videoId: string): Promise<string> {
    const id = this.identify(videoId);
    const project = await this.findProject(projectId);
    const video = (await this.videos(projectId, '', project)).find((item) => item.id === id);
    if (!video) throw new Error('VIDEO_NOT_FOUND');
    return video.path;
  }

  videoPath(projectId: string, videoId: string): Promise<string> {
    return this.mutate(() => this.findVideo(projectId, videoId));
  }

  async cover(projectId: string, binary: string, videoId?: string): Promise<string | null> {
    this.identify(projectId); if (videoId) this.identify(videoId);
    const input = await this.mutate<CoverInput>(async () => {
      const project = await this.findProject(projectId);
      const data = await this.header(project.file, project.root);
      const target = videoId ? await this.findVideo(projectId, videoId) : project.file;
      const info = await lstat(target);
      return {
        directory: project.directory, root: project.root, key: videoId ?? 'project',
        revision: `${info.size}:${info.mtimeMs}`,
        source: { path: videoId ? target : undefined, time: videoId ? COVER_SAMPLE_OFFSET : Math.min(data.trimEnd - 0.01, data.trimStart + COVER_SAMPLE_OFFSET) },
        image: videoId ? undefined : data.libraryCover,
      };
    });
    if (input.image) return input.image;
    const key = `${projectId}:${input.key}:${input.revision}`;
    const existing = this.pendingCovers.get(key); if (existing) return existing;
    const result = this.loadCover(projectId, binary, input);
    this.pendingCovers.set(key, result);
    try { return await result; } finally { this.pendingCovers.delete(key); }
  }

  private async loadCover(projectId: string, binary: string, input: CoverInput): Promise<string | null> {
    const directory = path.join(input.directory, COVER_CACHE_DIRECTORY);
    const target = path.join(directory, `${input.key}.json`);
    try {
      const cached = JSON.parse(await readFile(await checkedLibraryPath(target, input.root), 'utf8')) as Partial<CoverCache>;
      if (cached.revision === input.revision && isLibraryCover(cached.image)) return cached.image;
    } catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('LIBRARY_COVER_CACHE_UNAVAILABLE', projectId, input.key, error instanceof Error ? error.message : String(error));
    }
    try {
      if (!input.source.path) {
        const stored = await this.openProject(projectId);
        if (!stored.bytes) return null;
        const mapping = resolveTimeline(stored.data, input.source.time);
        const media = unpackProjectMedia(stored.data, stored.bytes);
        input.source.bytes = mapping.mediaId === SOURCE_MEDIA_ID ? media.sourceBytes : media.assets.get(mapping.mediaId);
        input.source.time = mapping.sourceTime;
        if (!input.source.bytes) return null;
      }
      const image = await generateLibraryThumbnail(binary, input.source);
      await mkdir(directory, { recursive: true }); await checkedLibraryPath(directory, input.root);
      const temporary = path.join(directory, `${randomUUID()}.partial`);
      try {
        await writeFile(temporary, JSON.stringify({ revision: input.revision, image } satisfies CoverCache), { flag: 'wx' });
        await atomicReplace(temporary, target);
      } finally { await rm(temporary, { force: true }); }
      return image;
    } catch (error) { console.warn('LIBRARY_COVER_GENERATION_FAILED', projectId, input.key, error instanceof Error ? error.message : String(error)); return null; }
  }

  revealPath(projectId?: string, videoId?: string): Promise<string> {
    return this.mutate(async () => {
      await this.ensure();
      if (videoId && projectId) return this.findVideo(projectId, videoId);
      return projectId ? (await this.findProject(projectId)).file : this.locations.reveal('projects');
    });
  }
}

export { defaultLibraryRoot } from './locations';
