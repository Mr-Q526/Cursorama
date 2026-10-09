import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { StorageSettings, StorageTarget } from '../shared';
import { atomicReplace } from './files';

export interface LibraryLocationOptions { configFile?: string; legacyRoots?: readonly string[]; }
interface StoredLocations extends StorageSettings { version: number; projectDirectories: string[]; exportDirectories: string[]; }

const STORAGE_VERSION = 1;
const STORAGE_FILE = 'storage.json';
const SETTINGS_DIRECTORY = '.cursorama';
export const PROJECTS_DIRECTORY = 'projects';
export const EXPORTS_DIRECTORY = 'exports';

export function defaultLibraryRoot(): string { return path.resolve(process.env.CURSORAMA_LIBRARY_DIR ?? process.cwd()); }

export function legacyLibraryRoots(): string[] {
  return [process.platform === 'win32' ? 'D:\\projects\\CursoramaLibrary' : path.join(homedir(), 'Documents', 'CursoramaLibrary')];
}

function directory(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || !path.isAbsolute(value.trim())) throw new Error('INVALID_STORAGE_DIRECTORY');
  return path.normalize(value.trim());
}

function unique(values: readonly string[]): string[] {
  return [...new Map(values.map((value) => [process.platform === 'win32' ? value.toLowerCase() : value, value])).values()];
}

function paths(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('INVALID_STORAGE_CONFIGURATION');
  return unique(value.map((item: unknown) => directory(item)));
}

export async function checkedLibraryPath(target: string, root: string): Promise<string> {
  const actualRoot = await realpath(root);
  const actualTarget = await realpath(target);
  const relative = path.relative(actualRoot, actualTarget);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || (await lstat(root)).isSymbolicLink() || (await lstat(target)).isSymbolicLink()) throw new Error('INVALID_LIBRARY_PATH');
  return target;
}

async function writable(target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await checkedLibraryPath(target, target);
  if (!(await lstat(target)).isDirectory()) throw new Error('INVALID_STORAGE_DIRECTORY');
  const probe = path.join(target, `.cursorama-write-${randomUUID()}`);
  try { await writeFile(probe, '', { flag: 'wx' }); }
  finally { await rm(probe, { force: true }); }
}

export class LibraryLocations {
  private value: StoredLocations;
  private readonly configFile: string;
  private initialization: Promise<void> | null = null;

  constructor(root: string, options: LibraryLocationOptions = {}) {
    const projectDirectory = path.join(root, PROJECTS_DIRECTORY);
    const exportDirectory = path.join(root, EXPORTS_DIRECTORY);
    this.configFile = options.configFile ?? path.join(root, SETTINGS_DIRECTORY, STORAGE_FILE);
    this.value = { version: STORAGE_VERSION, projectDirectory, exportDirectory, projectDirectories: unique([projectDirectory, ...(options.legacyRoots ?? []).map((item) => path.join(path.resolve(item), PROJECTS_DIRECTORY))]), exportDirectories: [exportDirectory] };
  }

  get current(): StorageSettings { return { projectDirectory: this.value.projectDirectory, exportDirectory: this.value.exportDirectory }; }
  get projects(): readonly string[] { return this.value.projectDirectories; }
  get exports(): readonly string[] { return this.value.exportDirectories; }

  async ready(): Promise<void> {
    this.initialization ??= this.load();
    await this.initialization;
  }

  private async load(): Promise<void> {
    let contents: string;
    try { contents = await readFile(this.configFile, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    const raw: unknown = JSON.parse(contents);
    if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== STORAGE_VERSION || !('projectDirectory' in raw) || !('exportDirectory' in raw) || !('projectDirectories' in raw) || !('exportDirectories' in raw)) throw new Error('INVALID_STORAGE_CONFIGURATION');
    const projectDirectory = directory(raw.projectDirectory);
    const exportDirectory = directory(raw.exportDirectory);
    this.value = { version: STORAGE_VERSION, projectDirectory, exportDirectory, projectDirectories: unique([projectDirectory, ...paths(raw.projectDirectories), ...this.value.projectDirectories]), exportDirectories: unique([exportDirectory, ...paths(raw.exportDirectories), ...this.value.exportDirectories]) };
  }

  async update(settings: StorageSettings): Promise<void> {
    await this.ready();
    if (!settings || typeof settings !== 'object') throw new Error('INVALID_STORAGE_CONFIGURATION');
    const projectDirectory = directory(settings.projectDirectory);
    const exportDirectory = directory(settings.exportDirectory);
    await writable(projectDirectory);
    await writable(exportDirectory);
    const next: StoredLocations = { version: STORAGE_VERSION, projectDirectory, exportDirectory, projectDirectories: unique([projectDirectory, ...this.value.projectDirectories]), exportDirectories: unique([exportDirectory, ...this.value.exportDirectories]) };
    const parent = path.dirname(this.configFile);
    await mkdir(parent, { recursive: true });
    await checkedLibraryPath(parent, parent);
    const temporary = path.join(parent, `${randomUUID()}.partial`);
    try {
      await writeFile(temporary, JSON.stringify(next, null, 2), { flag: 'wx' });
      await atomicReplace(temporary, this.configFile);
      this.value = next;
    } finally { await rm(temporary, { force: true }); }
  }

  async reveal(target: StorageTarget): Promise<string> {
    await this.ready();
    if (target !== 'projects' && target !== 'exports') throw new Error('INVALID_STORAGE_TARGET');
    const result = target === 'projects' ? this.value.projectDirectory : this.value.exportDirectory;
    await mkdir(result, { recursive: true });
    return checkedLibraryPath(result, result);
  }
}
