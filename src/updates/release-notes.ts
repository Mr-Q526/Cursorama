export type ReleaseNoteStyle = 'text' | 'strong' | 'emphasis' | 'code';
export interface ReleaseNoteInline { text: string; style: ReleaseNoteStyle; }
export type ReleaseNoteBlock =
  | { kind: 'heading'; content: ReleaseNoteInline[] }
  | { kind: 'paragraph'; content: ReleaseNoteInline[] }
  | { kind: 'list'; ordered: boolean; items: ReleaseNoteInline[][] };

const OMITTED_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'IMG', 'PICTURE', 'SOURCE', 'VIDEO', 'AUDIO', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA']);
const CONTAINER_ELEMENTS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'BLOCKQUOTE', 'TABLE', 'TBODY', 'TR']);
const HEADING_PATTERN = /^H[1-6]$/;
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;
const INLINE_PATTERN = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\([^)]*\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/g;
const MARKDOWN_LIST_PATTERN = /^\s*(?:([-+*])|\d+[.)])\s+(.+)$/;

function markdownInline(source: string): ReleaseNoteInline[] {
  const text = source.replace(MARKDOWN_IMAGE_PATTERN, '').trim();
  const result: ReleaseNoteInline[] = [];
  let offset = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    if (match.index > offset) result.push({ text: text.slice(offset, match.index), style: 'text' });
    result.push({ text: match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5], style: match[1] || match[2] ? 'strong' : match[3] ? 'code' : match[4] ? 'emphasis' : 'text' });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) result.push({ text: text.slice(offset), style: 'text' });
  return result;
}

export function parseMarkdownReleaseNotes(source: string): ReleaseNoteBlock[] {
  const blocks: ReleaseNoteBlock[] = [];
  let paragraph: string[] = [];
  let fenced = false;
  const flush = (): void => {
    const content = markdownInline(paragraph.join('\n'));
    if (content.length) blocks.push({ kind: 'paragraph', content });
    paragraph = [];
  };
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) { flush(); fenced = !fenced; continue; }
    if (fenced) { paragraph.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) { flush(); blocks.push({ kind: 'heading', content: markdownInline(heading[1]) }); continue; }
    const item = MARKDOWN_LIST_PATTERN.exec(line);
    if (item) {
      flush();
      const ordered = !item[1];
      const previous = blocks[blocks.length - 1];
      const content = markdownInline(item[2]);
      if (!content.length) continue;
      if (previous?.kind === 'list' && previous.ordered === ordered) previous.items.push(content);
      else blocks.push({ kind: 'list', ordered, items: [content] });
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { flush(); continue; }
    paragraph.push(line.replace(/^\s*>\s?/, ''));
  }
  flush();
  return blocks;
}

function htmlInline(node: Node, style: ReleaseNoteStyle = 'text'): ReleaseNoteInline[] {
  if (node.nodeType === Node.TEXT_NODE) return [{ text: node.textContent ?? '', style }];
  if (!(node instanceof Element) || OMITTED_ELEMENTS.has(node.tagName)) return [];
  if (node.tagName === 'BR') return [{ text: '\n', style }];
  const nextStyle = node.tagName === 'STRONG' || node.tagName === 'B' ? 'strong' : node.tagName === 'CODE' || node.tagName === 'PRE' ? 'code' : node.tagName === 'EM' || node.tagName === 'I' ? 'emphasis' : style;
  return Array.from(node.childNodes).flatMap((child) => htmlInline(child, nextStyle));
}

function hasContent(content: ReleaseNoteInline[]): boolean { return content.some((item) => item.text.trim()); }

function htmlBlocks(root: Node): ReleaseNoteBlock[] {
  const blocks: ReleaseNoteBlock[] = [];
  let inline: ReleaseNoteInline[] = [];
  const flush = (): void => {
    if (hasContent(inline)) blocks.push({ kind: 'paragraph', content: inline });
    inline = [];
  };
  for (const node of Array.from(root.childNodes)) {
    if (!(node instanceof Element)) { inline.push(...htmlInline(node)); continue; }
    if (OMITTED_ELEMENTS.has(node.tagName)) continue;
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      flush();
      const items = Array.from(node.children).filter((child) => child.tagName === 'LI').map((child) => htmlInline(child)).filter(hasContent);
      if (items.length) blocks.push({ kind: 'list', ordered: node.tagName === 'OL', items });
    } else if (HEADING_PATTERN.test(node.tagName) || node.tagName === 'P' || node.tagName === 'PRE') {
      flush();
      const content = htmlInline(node);
      if (hasContent(content)) blocks.push({ kind: HEADING_PATTERN.test(node.tagName) ? 'heading' : 'paragraph', content });
    } else if (CONTAINER_ELEMENTS.has(node.tagName)) {
      flush(); blocks.push(...htmlBlocks(node));
    } else if (node.tagName === 'HR') { flush(); }
    else inline.push(...htmlInline(node));
  }
  flush();
  return blocks;
}

export function parseReleaseNotes(source: string): ReleaseNoteBlock[] {
  if (!HTML_PATTERN.test(source)) return parseMarkdownReleaseNotes(source);
  // 模板内容保持惰性，只提取允许的文本结构；不挂载远程标签、属性或资源。
  const template = document.createElement('template');
  template.innerHTML = source;
  return htmlBlocks(template.content);
}
