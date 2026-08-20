import { Fragment, type ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  const pattern = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*)/giu;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/iu);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <s key={index}>{part.slice(2, -2)}</s>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function block(paragraph: string, index: number): ReactNode {
  if (paragraph.startsWith('### ')) return <h4 key={index}>{inline(paragraph.slice(4))}</h4>;
  if (paragraph.startsWith('## ')) return <h3 key={index}>{inline(paragraph.slice(3))}</h3>;
  if (paragraph.startsWith('# ')) return <h2 key={index}>{inline(paragraph.slice(2))}</h2>;
  if (paragraph.split('\n').every((line) => line.startsWith('- '))) return <ul key={index}>{paragraph.split('\n').map((line, item) => <li key={item}>{inline(line.slice(2))}</li>)}</ul>;
  if (paragraph.startsWith('> ')) return <blockquote key={index}>{inline(paragraph.slice(2).replaceAll('\n> ', '\n'))}</blockquote>;
  return <p key={index}>{paragraph.split('\n').map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{inline(line)}</Fragment>)}</p>;
}

export function RichPostText({ text }: { text: string }) {
  return <div className="rich-post-text">{text.split(/\n{2,}/gu).map(block)}</div>;
}
