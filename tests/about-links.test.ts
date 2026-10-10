import { describe, expect, it } from 'vitest';
import { ABOUT_LINKS, resolveAboutLink } from '../shared';

describe('关于页面的固定外部入口', () => {
  it('只允许作者、仓库与反馈三个已知页面', () => {
    for (const target of ['author', 'repository', 'feedback'] as const) expect(resolveAboutLink(target)).toBe(ABOUT_LINKS[target]);
  });

  it('拒绝任意地址、继承属性与非字符串参数', () => {
    for (const target of ['https://example.com', 'file:///C:/test', 'javascript:alert(1)', '__proto__', 'constructor', 'toString', '', null, undefined, {}, ['author']]) expect(resolveAboutLink(target)).toBeNull();
  });
});

export {};
