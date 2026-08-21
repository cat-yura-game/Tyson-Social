import { Fragment, type ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  const pattern = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/giu;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/iu);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('~~')) return <s key={index}>{part.slice(2, -2)}</s>;
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function cells(line: string) { return line.trim().replace(/^\||\|$/gu, '').split('|').map((cell) => cell.trim()); }
function isTable(lines: string[]) { return lines.length >= 2 && lines[0].includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(lines[1]); }

function block(value: string, index: number): ReactNode {
  if (value.startsWith('```') && value.endsWith('```')) return <pre key={index}><code>{value.replace(/^```[^\n]*\n?/u, '').replace(/\n?```$/u, '')}</code></pre>;
  const lines = value.split('\n');
  if (isTable(lines)) return <div className="ai-table-wrap" key={index}><table><thead><tr>{cells(lines[0]).map((cell, cellIndex) => <th key={cellIndex}>{inline(cell)}</th>)}</tr></thead><tbody>{lines.slice(2).filter(Boolean).map((line, rowIndex) => <tr key={rowIndex}>{cells(line).map((cell, cellIndex) => <td key={cellIndex}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
  const heading = value.match(/^(#{1,4})\s+(.+)$/u);
  if (heading) { const body = inline(heading[2]); if (heading[1].length === 1) return <h2 key={index}>{body}</h2>; if (heading[1].length === 2) return <h3 key={index}>{body}</h3>; return <h4 key={index}>{body}</h4>; }
  if (lines.every((line) => /^[-*+]\s+/u.test(line))) return <ul key={index}>{lines.map((line, item) => <li key={item}>{inline(line.replace(/^[-*+]\s+/u, ''))}</li>)}</ul>;
  if (lines.every((line) => /^\d+[.)]\s+/u.test(line))) return <ol key={index}>{lines.map((line, item) => <li key={item}>{inline(line.replace(/^\d+[.)]\s+/u, ''))}</li>)}</ol>;
  if (lines.every((line) => line.startsWith('> '))) return <blockquote key={index}>{lines.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{inline(line.slice(2))}</Fragment>)}</blockquote>;
  if (/^([-*_])(?:\s*\1){2,}\s*$/u.test(value)) return <hr key={index} />;
  return <p key={index}>{lines.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{inline(line)}</Fragment>)}</p>;
}

export function RichAiText({ text }: { text: string }) { return <div className="rich-ai-text">{text.split(/\n{2,}/gu).map(block)}</div>; }
