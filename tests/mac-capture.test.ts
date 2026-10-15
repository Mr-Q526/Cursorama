import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ execute: vi.fn(), empty: { isEmpty: () => true }, image: { isEmpty: () => false }, decode: vi.fn() }));
vi.mock('node:util', () => ({ promisify: () => native.execute }));
vi.mock('electron', () => ({ app: { isPackaged: false }, nativeImage: { createEmpty: () => native.empty, createFromDataURL: native.decode } }));
import { macWindowSources } from '../electron/mac-capture';

describe('macOS 全屏窗口补充枚举', () => {
  it('保留其他 Space 的窗口 ID，按进程排除自身而非名称前缀', async () => {
    native.execute.mockResolvedValue({ stdout: JSON.stringify([
      { id: 'window:42:0', name: 'Cursorama 使用指南 — 浏览器', pid: process.pid + 1 },
      { id: 'window:43:0', name: '另一个 Space 的全屏窗口', pid: process.pid + 1 },
      { id: 'window:44:0', name: '编辑器', pid: process.pid },
    ]) });
    expect((await macWindowSources(false)).map((source) => source.id)).toEqual(['window:42:0', 'window:43:0']);
    expect((await macWindowSources(true)).map((source) => source.id)).toContain('window:44:0');
    expect(native.execute).toHaveBeenCalledWith(expect.stringContaining('capture-helper'), ['list'], expect.objectContaining({ timeout: 12_000 }));
  });
  it('为补充窗口解码原生缩略图与应用图标，不再返回空图', async () => {
    native.decode.mockReturnValue(native.image);
    const thumbnail = 'data:image/png;base64,dGh1bWJuYWls';
    const appIcon = 'data:image/png;base64,aWNvbg==';
    native.execute.mockResolvedValue({ stdout: JSON.stringify([{ id: 'window:99:0', name: 'ChatGPT — ChatGPT', pid: process.pid + 1, thumbnail, appIcon }]) });
    const [source] = await macWindowSources(false, ['window:99:0']);
    expect(source.thumbnail.isEmpty()).toBe(false);
    expect(source.appIcon.isEmpty()).toBe(false);
    expect(native.decode).toHaveBeenCalledWith(thumbnail);
    expect(native.decode).toHaveBeenCalledWith(appIcon);
    expect(native.execute).toHaveBeenLastCalledWith(expect.any(String), ['list', 'window:99:0'], expect.any(Object));
  });
  it('拒绝无效窗口协议', async () => {
    native.execute.mockResolvedValue({ stdout: JSON.stringify([{ id: 'screen:42:0', name: '屏幕' }, null, { id: 'window:NaN:0', name: '损坏窗口' }]) });
    expect(await macWindowSources(true)).toEqual([]);
    native.execute.mockResolvedValue({ stdout: '{}' });
    await expect(macWindowSources(true)).rejects.toThrow('INVALID_MAC_WINDOW_LIST');
  });
});
