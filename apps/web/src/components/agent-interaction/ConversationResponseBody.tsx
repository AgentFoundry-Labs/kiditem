import type { ReactNode } from 'react';

type ResponseBlock =
  | { kind: 'code'; language: string | null; content: string }
  | { kind: 'heading'; level: 1 | 2 | 3; content: string }
  | { kind: 'unordered-list'; items: string[] }
  | { kind: 'ordered-list'; items: string[] }
  | { kind: 'paragraph'; content: string };

const INTERNAL_UUID_PATTERN = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;
const CANONICAL_HASH_PATTERN = /\b[0-9a-f]{40,128}\b/gi;
const OWNER_CAPABILITY_KEY_PATTERN = /\b(?:advertising|channels|finance|inventory|operations|orders|products|sourcing|supply)\.[a-z][a-zA-Z0-9_]*\b/g;
const INTERNAL_REFERENCE_PLACEHOLDER = '\uE010';
const LABEL_ONLY_INTERNAL_REFERENCE_LINE_PATTERN = /^\s*(?:[-*+]\s*)?(?:["'`]?[^:\n]+["'`]?\s*:\s*)?(?:["'`]?\uE010["'`]?\s*[,;|/]?\s*)+$/;

/**
 * Small safe presentation subset for assistant text. It deliberately does not
 * evaluate HTML or accept arbitrary URL protocols.
 */
export function ConversationResponseBody({ content }: { content: string }) {
  const blocks = parseResponseBlocks(sanitizeAssistantContent(content));

  return (
    <div className="space-y-3 break-words [overflow-wrap:anywhere]" data-testid="conversation-response-body">
      {blocks.map((block, index) => <ResponseBlockView key={`${block.kind}-${index}`} block={block} />)}
    </div>
  );
}

/**
 * Provider output is untrusted presentation input. Remove only receipt lines
 * that consist entirely of internal references; ordinary requested prose and
 * code must retain their meaning.
 */
function sanitizeAssistantContent(content: string): string {
  return removeInternalReferenceOnlyLines(content);
}

function removeInternalReferenceOnlyLines(content: string): string {
  return content.replace(/\r\n?/g, '\n').split('\n')
    .filter((line) => !isInternalReferenceOnlyLine(line))
    .join('\n');
}

function isInternalReferenceOnlyLine(line: string): boolean {
  if (/\bhttps?:\/\//i.test(line)) return false;

  const normalized = line
    .replace(OWNER_CAPABILITY_KEY_PATTERN, INTERNAL_REFERENCE_PLACEHOLDER)
    .replace(INTERNAL_UUID_PATTERN, INTERNAL_REFERENCE_PLACEHOLDER)
    .replace(CANONICAL_HASH_PATTERN, INTERNAL_REFERENCE_PLACEHOLDER);

  return normalized.includes(INTERNAL_REFERENCE_PLACEHOLDER)
    && LABEL_ONLY_INTERNAL_REFERENCE_LINE_PATTERN.test(normalized);
}

function ResponseBlockView({ block }: { block: ResponseBlock }) {
  switch (block.kind) {
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-sm leading-6 break-words [overflow-wrap:anywhere]">
          <code data-language={block.language ?? undefined}>{block.content}</code>
        </pre>
      );
    case 'heading':
      if (block.level === 1) return <h2 className="text-lg font-semibold">{renderInline(block.content)}</h2>;
      if (block.level === 2) return <h3 className="text-base font-semibold">{renderInline(block.content)}</h3>;
      return <h4 className="text-sm font-semibold">{renderInline(block.content)}</h4>;
    case 'unordered-list':
      return (
        <ul aria-label="글머리 목록" className="list-disc space-y-1 pl-5 text-[15px] leading-6 break-words [overflow-wrap:anywhere]">
          {block.items.map((item, index) => <li key={index}>{renderInline(item)}</li>)}
        </ul>
      );
    case 'ordered-list':
      return (
        <ol aria-label="번호 목록" className="list-decimal space-y-1 pl-5 text-[15px] leading-6 break-words [overflow-wrap:anywhere]">
          {block.items.map((item, index) => <li key={index}>{renderInline(item)}</li>)}
        </ol>
      );
    case 'paragraph':
      return <p className="whitespace-pre-wrap text-[15px] leading-6 break-words [overflow-wrap:anywhere]">{renderInline(block.content)}</p>;
  }
}

function parseResponseBlocks(content: string): ResponseBlock[] {
  const fenced = tokenizeFencedCode(content);
  return fenced.flatMap((segment) => segment.kind === 'code'
    ? [segment]
    : parseProseBlocks(segment.content));
}

function tokenizeFencedCode(content: string): Array<{ kind: 'code'; language: string | null; content: string } | { kind: 'prose'; content: string }> {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const segments: Array<{ kind: 'code'; language: string | null; content: string } | { kind: 'prose'; content: string }> = [];
  let prose: string[] = [];
  const flushProse = () => {
    if (prose.length) segments.push({ kind: 'prose', content: prose.join('\n') });
    prose = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const opener = /^```([^\s`]*)\s*$/.exec(lines[index]);
    if (!opener) {
      prose.push(lines[index]);
      continue;
    }
    let closingIndex = index + 1;
    while (closingIndex < lines.length && !/^```\s*$/.test(lines[closingIndex])) closingIndex += 1;
    if (closingIndex === lines.length) {
      // An unclosed fence is ordinary escaped text, never a code rendering.
      prose.push(lines[index]);
      continue;
    }
    flushProse();
    segments.push({
      kind: 'code',
      language: opener[1] || null,
      content: lines.slice(index + 1, closingIndex).join('\n'),
    });
    index = closingIndex;
  }
  flushProse();
  return segments;
}

function parseProseBlocks(content: string): ResponseBlock[] {
  const lines = content.split('\n');
  const blocks: ResponseBlock[] = [];

  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[index]);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, content: heading[2] });
      index += 1;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^\s*[-*+]\s+(.+)$/.exec(lines[index]);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ kind: 'unordered-list', items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^\s*\d+\.\s+(.+)$/.exec(lines[index]);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ kind: 'ordered-list', items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (paragraph.length && (/^(#{1,3})\s+/.test(lines[index]) || /^\s*[-*+]\s+/.test(lines[index]) || /^\s*\d+\.\s+/.test(lines[index]))) break;
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', content: paragraph.join('\n') });
  }

  return blocks.length ? blocks : [{ kind: 'paragraph', content }];
}

function renderInline(content: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(`[^`\n]+`)|(\[([^\]\n]+)\]\(([^)\s]+)\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenPattern.exec(content))) {
    if (match.index > cursor) nodes.push(content.slice(cursor, match.index));
    if (match[1]) {
      nodes.push(<code key={`code-${key++}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{match[1].slice(1, -1)}</code>);
    } else {
      const label = match[3];
      const href = safeHttpUrl(match[4]);
      nodes.push(href
        ? <a key={`link-${key++}`} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}</a>
        : match[0]);
    }
    cursor = tokenPattern.lastIndex;
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return nodes;
}

function safeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
