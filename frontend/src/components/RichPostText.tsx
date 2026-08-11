import { Fragment, type ReactNode } from 'react';

function inlineBold(line: string): ReactNode[] {
  return line.split(/(\*\*[^*\n]+\*\*)/gu).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>);
}

export function RichPostText({ text }: { text: string }) {
  return <div className="rich-post-text">{text.split(/\n{2,}/gu).map((paragraph, paragraphIndex) =>
    <p key={paragraphIndex}>{paragraph.split('\n').map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{inlineBold(line)}</Fragment>)}</p>)}</div>;
}
