import type { ConversationMessage } from './conversation-api';

export type LiveMessage = Pick<ConversationMessage, 'id' | 'role' | 'content'>;
export type ToolProjection = { id: string; title: string; detail?: string };

export function toLiveMessages(messages: readonly unknown[]): LiveMessage[] {
  return messages.flatMap((message, index) => {
    const record = asRecord(message);
    if (!record || !isLiveRole(record.role)) return [];
    const content = textContent(record.content);
    if (!content) return [];
    return [{
      id: typeof record.id === 'string' ? record.id : `live-${index}`,
      role: record.role,
      content,
    }];
  });
}

export function toolProjectionFromEvent(name: string, value: unknown): ToolProjection | null {
  const payload = asRecord(value);
  if (name !== 'kiditem.provider_tool_status' || !payload
    || typeof payload.name !== 'string' || typeof payload.status !== 'string') return null;
  return {
    id: `tool-${payload.name}-${payload.status}`,
    title: payload.name,
    detail: `${payload.status}${typeof payload.detail === 'string' ? ` · ${payload.detail}` : ''}`,
  };
}

/** One terminal refresh may lag provider flush; clear only a covered live snapshot. */
export function historyCoversLiveMessages(
  history: readonly ConversationMessage[],
  liveMessages: readonly LiveMessage[],
  baseline: ReadonlyMap<string, number>,
): boolean {
  const available = messageCoverageCounts(history);
  const required = messageCoverageCounts(liveMessages);
  for (const [key, count] of required) {
    if ((available.get(key) ?? 0) < (baseline.get(key) ?? 0) + count) return false;
  }
  return true;
}

/** Baseline counts prevent an older identical message from covering a new turn. */
export function messageCoverageCounts(
  messages: readonly Pick<ConversationMessage, 'role' | 'content'>[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const message of messages) {
    const key = `${message.role}\u0000${message.content}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function isLiveRole(value: unknown): value is LiveMessage['role'] {
  return value === 'user' || value === 'assistant' || value === 'tool';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function textContent(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;
  const text = value.flatMap((part) => {
    const record = asRecord(part);
    return record?.type === 'text' && typeof record.text === 'string' ? [record.text] : [];
  }).join('');
  return text || null;
}
