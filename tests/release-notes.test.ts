import { describe, expect, it } from 'vitest';
import { parseMarkdownReleaseNotes } from '../src/updates';

describe('版本说明的可读文本结构', () => {
  it('将真实发布说明中的标题、强调与条目分开，保留中文内容', () => {
    const blocks = parseMarkdownReleaseNotes('# Cursorama v0.2.0\n\n- **基础剪辑**：分割、裁剪和倍速。\n- **更多背景**：支持分类预览。');
    expect(blocks).toEqual([
      { kind: 'heading', content: [{ text: 'Cursorama v0.2.0', style: 'text' }] },
      { kind: 'list', ordered: false, items: [
        [{ text: '基础剪辑', style: 'strong' }, { text: '：分割、裁剪和倍速。', style: 'text' }],
        [{ text: '更多背景', style: 'strong' }, { text: '：支持分类预览。', style: 'text' }],
      ] },
    ]);
  });

  it('保留链接的可读名称和代码内容，移除远程截图标记', () => {
    expect(parseMarkdownReleaseNotes('安装 `Cursorama.exe`，参考 [使用指南](https://example.test/guide)。\n\n![截图](https://example.test/image.png)')).toEqual([
      { kind: 'paragraph', content: [
        { text: '安装 ', style: 'text' }, { text: 'Cursorama.exe', style: 'code' },
        { text: '，参考 ', style: 'text' }, { text: '使用指南', style: 'text' }, { text: '。', style: 'text' },
      ] },
    ]);
  });

  it('区分有序列表与无序列表，说明段落保持换行', () => {
    const blocks = parseMarkdownReleaseNotes('1. 选择屏幕\r\n2. 开始录制\r\n\r\n操作完成后\r\n可以导出视频。\r\n\r\n- 保留工程');
    expect(blocks.map((block) => block.kind)).toEqual(['list', 'paragraph', 'list']);
    expect(blocks[0]).toMatchObject({ ordered: true, items: [[{ text: '选择屏幕' }], [{ text: '开始录制' }]] });
    expect(blocks[1]).toMatchObject({ content: [{ text: '操作完成后\n可以导出视频。' }] });
    expect(blocks[2]).toMatchObject({ ordered: false });
  });

  it('空说明与仅有截图的说明不生成空段落', () => {
    expect(parseMarkdownReleaseNotes(' \n\r\n')).toEqual([]);
    expect(parseMarkdownReleaseNotes('![演示](https://example.test/demo.png)\n\n---')).toEqual([]);
  });
});

export {};
