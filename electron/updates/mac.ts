import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { UPDATE_CONFIG } from '../../shared';
import type { UpdateDriver } from './service';

interface MacAsset { name: string; url: string; size: number; digest: string; }
interface MacRelease { version: string; notes: string; asset: MacAsset; }
export interface MacUpdateOptions {
  version: string;
  arch: string;
  cacheDirectory: string;
  openInstaller: (file: string) => Promise<string>;
  request?: typeof fetch;
}

function stableVersion(value: string): number[] | null {
  return /^v?\d+\.\d+\.\d+$/.test(value) ? value.replace(/^v/, '').split('.').map(Number) : null;
}
function newer(version: string, current: string): boolean {
  const next = stableVersion(version); const previous = stableVersion(current);
  if (!next || !previous) return false;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== previous[index]) return next[index] > previous[index];
  }
  return false;
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function releaseAsset(value: unknown, version: string, arch: string): MacAsset | null {
  if (!record(value) || value.name !== `Cursorama-${version}-mac-${arch}.dmg` || typeof value.url !== 'string' || typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size <= 0 || typeof value.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.digest)) return null;
  const url = new URL(value.url);
  const prefix = `/${UPDATE_CONFIG.owner}/${UPDATE_CONFIG.repository}/releases/download/`;
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith(prefix) || url.username || url.password) return null;
  return { name: String(value.name), url: url.href, size: value.size, digest: value.digest.slice(7) };
}

/** Mac 试用版通过校验后的 DMG 更新，保留系统安装及安全确认流程。 */
export function createMacUpdateDriver(options: MacUpdateOptions): UpdateDriver {
  const request = options.request ?? fetch;
  const controller = new AbortController();
  let selected: MacRelease | null = null;
  let downloaded: string | null = null;
  const signal = (timeout: number): AbortSignal => AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]);
  return {
    installation: 'installer',
    async check() {
      selected = null;
      if (options.arch !== 'arm64' && options.arch !== 'x64') throw new Error('MAC_UPDATE_ARCH_UNSUPPORTED');
      const response = await request(`https://raw.githubusercontent.com/${UPDATE_CONFIG.owner}/${UPDATE_CONFIG.repository}/main/updates/mac-${options.arch}.json`, { signal: signal(30_000), headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`MAC_UPDATE_FEED_${response.status}`);
      const manifest: unknown = await response.json();
      if (!record(manifest) || manifest.schema !== 1 || manifest.arch !== options.arch || typeof manifest.version !== 'string' || !stableVersion(manifest.version)) throw new Error('MAC_UPDATE_FEED_INVALID');
      const version = manifest.version.replace(/^v/, '');
      const asset = releaseAsset(manifest.asset, version, options.arch);
      if (!asset) throw new Error('MAC_UPDATE_ASSET_INVALID');
      if (!newer(version, options.version)) return null;
      selected = { version, notes: typeof manifest.notes === 'string' ? manifest.notes : '', asset };
      return { version, notes: selected.notes };
    },
    async download(progress) {
      if (!selected) throw new Error('MAC_UPDATE_NOT_SELECTED');
      downloaded = null;
      const asset = selected.asset;
      await mkdir(options.cacheDirectory, { recursive: true, mode: 0o700 });
      const destination = path.join(options.cacheDirectory, asset.name);
      const temporary = `${destination}.partial`;
      await rm(temporary, { force: true });
      try {
        const response = await request(asset.url, { signal: signal(15 * 60_000) });
        if (!response.ok || !response.body) throw new Error(`MAC_UPDATE_DOWNLOAD_${response.status}`);
        const hash = createHash('sha256');
        const file = await open(temporary, 'wx', 0o600);
        let size = 0;
        const reader = response.body.getReader();
        try {
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            const chunk = result.value;
            size += chunk.byteLength;
            if (size > asset.size) throw new Error('MAC_UPDATE_SIZE_MISMATCH');
            hash.update(chunk); await file.writeFile(chunk);
            progress(Math.min(99, size / asset.size * 100));
          }
          if (size !== asset.size || hash.digest('hex') !== asset.digest) throw new Error('MAC_UPDATE_HASH_MISMATCH');
          await file.sync();
        } finally {
          try { await reader.cancel(); } finally { reader.releaseLock(); await file.close(); }
        }
        await rename(temporary, destination);
        downloaded = destination;
        progress(100);
      } finally { await rm(temporary, { force: true }); }
    },
    async install() {
      if (!downloaded) throw new Error('MAC_UPDATE_NOT_DOWNLOADED');
      // 打开前再次校验，防止下载完成后缓存被改写。
      const file = await open(downloaded, 'r');
      const hash = createHash('sha256');
      try { for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk); }
      finally { await file.close(); }
      if (hash.digest('hex') !== selected?.asset.digest) throw new Error('MAC_UPDATE_HASH_MISMATCH');
      const error = await options.openInstaller(downloaded);
      if (error) throw new Error(error);
    },
    dispose() { controller.abort(); },
  };
}
