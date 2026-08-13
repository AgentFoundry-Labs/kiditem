import { SuggestedRepliesResultSchema } from '@kiditem/shared/agent-interaction';

interface PublicAgentMessage {
  id: string;
  role: string;
  content?: unknown;
  toolCallId?: string;
}

export function findLatestEligibleSuggestion(
  messages: readonly PublicAgentMessage[],
): { toolMessageId: string; sourceMessageId: string } | null {
  const assistantMessageIds = new Set<string>();
  let eligible: { toolMessageId: string; sourceMessageId: string } | null = null;
  for (const message of messages) {
    if (message.role === 'assistant') {
      assistantMessageIds.add(message.id);
      if (hasVisibleContent(message.content)) eligible = null;
      continue;
    }
    if (message.role === 'user') {
      if (hasVisibleContent(message.content)) eligible = null;
      continue;
    }
    if (message.role !== 'tool' || typeof message.content !== 'string') continue;
    const parsedJson = parseJson(message.content);
    const parsed = SuggestedRepliesResultSchema.safeParse(parsedJson);
    if (!parsed.success) continue;
    if (!assistantMessageIds.has(parsed.data.messageId)) continue;
    eligible = {
      toolMessageId: message.id,
      sourceMessageId: parsed.data.messageId,
    };
  }
  return eligible;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hasVisibleContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!Array.isArray(value)) return false;
  return value.some((part) => {
    if (!part || typeof part !== 'object') return false;
    const content = part as { text?: unknown; content?: unknown };
    return (typeof content.text === 'string' && content.text.trim().length > 0) ||
      (typeof content.content === 'string' && content.content.trim().length > 0);
  });
}
