import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { parseReleaseNotes, type ReleaseNoteInline } from '../updates';

export interface ReleaseNotesProps { source: string; }

function inlineContent(content: ReleaseNoteInline[]): ReactNode {
  return content.map(({ text, style }, index) => {
    if (style === 'strong') return <strong key={index}>{text}</strong>;
    if (style === 'emphasis') return <em key={index}>{text}</em>;
    if (style === 'code') return <code key={index}>{text}</code>;
    return text;
  });
}

export function ReleaseNotes({ source }: ReleaseNotesProps) {
  const blocks = useMemo(() => parseReleaseNotes(source), [source]);
  return <div className="release-notes">{blocks.map((block, index) => {
    if (block.kind === 'heading') return <h3 key={index}>{inlineContent(block.content)}</h3>;
    if (block.kind === 'paragraph') return <p key={index}>{inlineContent(block.content)}</p>;
    const List = block.ordered ? 'ol' : 'ul';
    return <List key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inlineContent(item)}</li>)}</List>;
  })}</div>;
}
