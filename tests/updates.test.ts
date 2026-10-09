import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_CONFIG, type UpdateState } from '../shared';
import { UpdateService, type UpdateDriver } from '../electron/updates/service';

const VERSION = { current: '0.1.1', next: '0.1.2' } as const;
const roots: string[] = [];
const services: UpdateService[] = [];

async function fixture(supported = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'cursorama-updates-test-'));
  roots.push(root);
  const driver: UpdateDriver = {
    check: vi.fn(async () => null), download: vi.fn(async () => undefined),
    install: vi.fn(() => undefined), dispose: vi.fn(() => undefined),
  };
  const canInstall = vi.fn(() => true);
  const events: UpdateState[] = [];
  const options = { version: VERSION.current, preferencesFile: path.join(root, 'settings', UPDATE_CONFIG.preferencesFile), driver: supported ? driver : null, canInstall, emit: (state: UpdateState): void => { events.push(state); } };
  const service = new UpdateService(options);
  services.push(service);
  return { service, driver, canInstall, events, options };
}

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(async () => {
  services.splice(0).forEach((service) => service.dispose());
  vi.useRealTimers(); vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('桌面更新', () => {
  it('开发模式和不支持的平台不访问更新源', async () => {
    const { service, driver } = await fixture(false);
    await service.start(); await service.check(); await service.download(); service.install();
    await vi.advanceTimersByTimeAsync(UPDATE_CONFIG.checkInterval);
    expect(service.current.status).toBe('unsupported');
    expect(driver.check).not.toHaveBeenCalled(); expect(driver.install).not.toHaveBeenCalled();
  });

  it('启动后和使用期间定时检查，手动检查不会重复触发启动检查', async () => {
    const { service, driver } = await fixture();
    await service.start();
    await vi.advanceTimersByTimeAsync(UPDATE_CONFIG.startupDelay);
    expect(driver.check).toHaveBeenCalledTimes(1); expect(service.current.status).toBe('current');
    await vi.advanceTimersByTimeAsync(UPDATE_CONFIG.checkInterval - UPDATE_CONFIG.startupDelay);
    expect(driver.check).toHaveBeenCalledTimes(2);
    const second = await fixture(); await second.service.start(); await second.service.check();
    await vi.advanceTimersByTimeAsync(UPDATE_CONFIG.startupDelay);
    expect(second.driver.check).toHaveBeenCalledTimes(1);
  });

  it('关闭自动检查后持久化到磁盘，重新启动仍可手动检查', async () => {
    const { service, driver, options } = await fixture();
    await service.start(); await service.setAutomatic(false);
    expect(JSON.parse(await readFile(options.preferencesFile, 'utf8'))).toEqual({ version: UPDATE_CONFIG.preferencesVersion, automatic: false });
    service.dispose();
    const restored = new UpdateService(options); services.push(restored); await restored.start();
    await vi.advanceTimersByTimeAsync(UPDATE_CONFIG.checkInterval);
    expect(driver.check).not.toHaveBeenCalled(); expect(restored.current.automatic).toBe(false);
    await restored.check(); expect(driver.check).toHaveBeenCalledTimes(1);
  });

  it('同时发起的检查只访问一次，检查失败后允许重试', async () => {
    const { service, driver } = await fixture();
    vi.mocked(driver.check).mockRejectedValueOnce(new Error('网络断开'));
    await Promise.all([service.check(), service.check()]);
    expect(driver.check).toHaveBeenCalledTimes(1); expect(service.current.error).toBe('check');
    await service.check(); expect(service.current.status).toBe('current'); expect(service.current.error).toBeNull();
  });

  it('发现新版本后仅下载，重试保留版本信息，校验成功后才允许安装', async () => {
    const { service, driver, canInstall, events } = await fixture();
    vi.mocked(driver.check).mockResolvedValue({ version: VERSION.next, notes: '改善录制体验' });
    await service.check();
    expect(service.current.status).toBe('available'); expect(driver.download).not.toHaveBeenCalled();
    service.install(); expect(driver.install).not.toHaveBeenCalled();
    vi.mocked(driver.download).mockRejectedValueOnce(new Error('校验失败'));
    await service.download(); expect(service.current.error).toBe('download'); expect(service.current.downloaded).toBe(false);
    expect(service.current.latestVersion).toBe(VERSION.next);
    vi.mocked(driver.download).mockImplementation(async (progress) => { progress(50); progress(Number.NaN); progress(130); });
    await service.download(); expect(service.current.status).toBe('downloaded');
    expect(service.current.progress).toBe(UPDATE_CONFIG.maximumProgress); expect(driver.install).not.toHaveBeenCalled();
    canInstall.mockReturnValue(false); service.install(); expect(service.current.error).toBe('busy'); expect(service.current.downloaded).toBe(true);
    canInstall.mockReturnValue(true); service.install(); expect(driver.install).toHaveBeenCalledTimes(1); expect(service.current.status).toBe('installing');
    service.reportInstallFailure(); expect(service.current.error).toBe('install'); expect(service.current.downloaded).toBe(true);
    service.install(); expect(driver.install).toHaveBeenCalledTimes(2);
    expect(events.every((state, index) => index === 0 || state.revision > events[index - 1].revision)).toBe(true);
  });

  it('下载完成后不重复检查或下载，保留已校验的安装包', async () => {
    const { service, driver } = await fixture();
    vi.mocked(driver.check).mockResolvedValue({ version: VERSION.next, notes: '' });
    await service.check(); await service.download(); await service.check(); await service.download();
    expect(driver.check).toHaveBeenCalledTimes(1); expect(driver.download).toHaveBeenCalledTimes(1);
  });
});
