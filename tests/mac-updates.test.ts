import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMacUpdateDriver } from '../electron/updates/mac';
import { UpdateService } from '../electron/updates/service';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
const payload = Buffer.from('Cursorama mac update fixture');
const digest = createHash('sha256').update(payload).digest('hex');
function release(version: string, arch = 'arm64') {
  return { schema: 1, arch, version, notes: 'Mac 更新', asset: { name: `Cursorama-${version}-mac-${arch}.dmg`, size: payload.length, digest: `sha256:${digest}`, url: `https://github.com/Mr-Q526/Cursorama/releases/download/v${version}/Cursorama-${version}-mac-${arch}.dmg` } };
}
async function setup(manifest: unknown = release('0.3.4')) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cursorama-mac-updates-')); directories.push(directory);
  let corrupt = false;
  const request = vi.fn<typeof fetch>(async (url) => String(url).includes('raw.githubusercontent.com') ? Response.json(manifest) : new Response(corrupt ? Buffer.from('bad') : payload));
  const openInstaller = vi.fn(async (_file: string) => '');
  const driver = createMacUpdateDriver({ version: '0.3.3', arch: 'arm64', cacheDirectory: path.join(directory, 'cache'), request, openInstaller });
  const service = new UpdateService({ version: '0.3.3', preferencesFile: path.join(directory, 'settings.json'), driver, canInstall: () => true, emit: () => undefined });
  return { directory, request, openInstaller, driver, service, corrupt: (value: boolean) => { corrupt = value; } };
}

describe('macOS 在线更新', () => {
  it('使用独立的 Mac 清单，拒绝不匹配的架构并阻止版本回退', async () => {
    const { driver, request } = await setup();
    expect(await driver.check()).toEqual({ version: '0.3.4', notes: 'Mac 更新' });
    expect(String(request.mock.calls[0][0])).toContain('/main/updates/mac-arm64.json'); driver.dispose();
    const current = await setup(release('0.3.3'));
    expect(await current.driver.check()).toBeNull(); current.driver.dispose();
    const older = await setup(release('0.3.2'));
    expect(await older.driver.check()).toBeNull(); older.driver.dispose();
    const wrong = await setup(release('0.3.5', 'x64'));
    await expect(wrong.driver.check()).rejects.toThrow('MAC_UPDATE_FEED_INVALID'); wrong.driver.dispose();
  });
  it('启用 Mac 更新，真实写入并校验安装包，打开后仍可再次打开', async () => {
    const { directory, service, openInstaller } = await setup();
    try {
      expect(service.current.supported).toBe(true); expect(service.current.installation).toBe('installer');
      await service.check(); expect(service.current.status).toBe('available');
      await service.download(); expect(service.current.status).toBe('downloaded'); expect(service.current.progress).toBe(100);
      const file = path.join(directory, 'cache', 'Cursorama-0.3.4-mac-arm64.dmg');
      expect(await readFile(file)).toEqual(payload);
      service.install(); await vi.waitFor(() => expect(openInstaller).toHaveBeenCalledWith(file));
      await vi.waitFor(() => expect(service.current.status).toBe('downloaded'));
      service.install(); await vi.waitFor(() => expect(openInstaller).toHaveBeenCalledTimes(2));
    } finally { service.dispose(); }
  });
  it('拒绝损坏的下载并清理半成品，允许重新下载；拒绝下载后的缓存篡改', async () => {
    const { directory, service, corrupt, openInstaller } = await setup();
    try {
      await service.check(); corrupt(true); await service.download();
      expect(service.current.error).toBe('download'); expect(await readdir(path.join(directory, 'cache'))).toEqual([]);
      corrupt(false); await service.download(); expect(service.current.downloaded).toBe(true);
      await writeFile(path.join(directory, 'cache', 'Cursorama-0.3.4-mac-arm64.dmg'), 'modified');
      service.install(); await vi.waitFor(() => expect(service.current.error).toBe('install'));
      expect(openInstaller).not.toHaveBeenCalled();
    } finally { service.dispose(); }
  });
  it('打开安装包失败可重试，不会一直停在安装中', async () => {
    const { service, openInstaller } = await setup();
    try {
      openInstaller.mockResolvedValue('Launch failed');
      await service.check(); await service.download(); service.install();
      await vi.waitFor(() => expect(service.current.error).toBe('install'));
      openInstaller.mockResolvedValue(''); service.install();
      await vi.waitFor(() => expect(service.current.status).toBe('downloaded'));
    } finally { service.dispose(); }
  });
  it('下载内容长度正确但 SHA-256 错误时仍拒绝', async () => {
    const { driver, request, directory } = await setup();
    try {
      await driver.check(); request.mockResolvedValueOnce(new Response(Buffer.alloc(payload.length)));
      await expect(driver.download(() => undefined)).rejects.toThrow('MAC_UPDATE_HASH_MISMATCH');
      expect(await readdir(path.join(directory, 'cache'))).toEqual([]);
    } finally { driver.dispose(); }
  });
  it('网络失败报告检查失败，重试后恢复，释放驱动会取消请求', async () => {
    const { service, driver, request } = await setup();
    try {
      request.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
      await service.check(); expect(service.current.error).toBe('check');
      await service.check(); expect(service.current.status).toBe('available');
      const signal = request.mock.calls[0][1]?.signal;
      expect(signal?.aborted).toBe(false); driver.dispose(); expect(signal?.aborted).toBe(true);
    } finally { service.dispose(); }
  });
  it('缺失摘要或来源不属于本仓库的资产不能安装', async () => {
    const missing = release('0.3.4'); missing.asset.digest = '';
    const other = release('0.3.5'); other.asset.url = 'https://example.com/installer.dmg';
    for (const manifest of [missing, other]) {
      const { driver } = await setup(manifest);
      try { await expect(driver.check()).rejects.toThrow('MAC_UPDATE_ASSET_INVALID'); await expect(driver.install()).rejects.toThrow('MAC_UPDATE_NOT_DOWNLOADED'); }
      finally { driver.dispose(); }
    }
  });
});
