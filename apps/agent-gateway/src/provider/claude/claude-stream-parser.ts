import { ProviderEventSchema, type ProviderEvent } from '@kiditem/shared/agent-runtime';
import { redactForGatewayEvent } from '../../security/redaction';
import { claudeCapabilityApprovalRequiredEvent } from '../capability-approval-required';

const MAX_TRACKED_TOOLS = 64;

/** Parses Claude's documented stream-json surface and discards every raw record. */
export class ClaudeStreamParser {
  private buffer = '';
  /** Only opaque provider tool IDs and safe names are retained while a turn is live. */
  private readonly toolNames = new Map<string, string>();

  constructor(private readonly options: Readonly<{ redactionTokens?: readonly string[]; maxBytes?: number }> = {}) {}

  receive(chunk: string): ProviderEvent[] {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, 'utf8') > (this.options.maxBytes ?? 64 * 1024)) throw new Error('claude_stream_too_large');
    const events: ProviderEvent[] = [];
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (!line.trim()) continue;
      let record: Record<string, unknown>;
      try { record = JSON.parse(line) as Record<string, unknown>; } catch { throw new Error('claude_stream_invalid'); }
      const text = assistantText(record);
      if (text) events.push({ kind: 'assistant.delta', delta: redactForGatewayEvent(bound(text, 16_000), this.options.redactionTokens) });
      events.push(...this.toolEvents(record));
      if (record.type === 'error' || (record.type === 'result' && record.is_error === true)) {
        events.push({ kind: 'status', status: 'failed' });
      } else if (record.type === 'result') {
        events.push({ kind: 'status', status: 'completed' });
      }
    }
    return events;
  }

  private toolEvents(record: Record<string, unknown>): ProviderEvent[] {
    const content = messageContent(record);
    if (!content) return [];
    const events: ProviderEvent[] = [];
    if (record.type === 'assistant') {
      for (const item of content) {
        const part = object(item);
        if (part?.type !== 'tool_use') continue;
        const id = safeToolId(part.id);
        const name = safeToolName(part.name);
        if (!id || !name || this.toolNames.has(id) || this.toolNames.size >= MAX_TRACKED_TOOLS) continue;
        this.toolNames.set(id, name);
        events.push(ProviderEventSchema.parse({ kind: 'tool.status', name, status: 'started' }));
      }
    } else if (record.type === 'user') {
      for (const item of content) {
        const part = object(item);
        if (part?.type !== 'tool_result') continue;
        const id = safeToolId(part.tool_use_id);
        const name = id ? this.toolNames.get(id) : undefined;
        if (!id || !name) continue;
        this.toolNames.delete(id);
        events.push(ProviderEventSchema.parse({ kind: 'tool.status', name, status: part.is_error === true ? 'failed' : 'completed' }));
        if (part.is_error !== true) {
          const approval = claudeCapabilityApprovalRequiredEvent(name, part.content);
          if (approval) events.push(approval);
        }
      }
    }
    return events;
  }
}

function assistantText(record: Record<string, unknown>): string | null {
  if (record.type !== 'assistant') return null;
  const content = messageContent(record);
  if (!content) return null;
  const parts = content.flatMap((item) => {
    const part = object(item);
    return part?.type === 'text' && typeof part.text === 'string' ? [part.text] : [];
  });
  return parts.length ? parts.join('\n') : null;
}

function messageContent(record: Record<string, unknown>): unknown[] | null {
  const message = object(record.message);
  return message && Array.isArray(message.content) ? message.content : null;
}

function safeToolId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_.:-]{1,200}$/.test(normalized) ? normalized : null;
}

function safeToolName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_.:-]{1,200}$/.test(normalized) ? normalized : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function bound(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
