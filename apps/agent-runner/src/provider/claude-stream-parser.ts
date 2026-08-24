import { MAX_RUNNER_OUTPUT_BYTES } from '@kiditem/shared/agent-runtime';
import { AgentResultEnvelopeSchema, type AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import { redactForRunnerEvent } from '../security/redaction';

export type ClaudeStreamUpdate = Readonly<{ output: readonly string[]; result?: AgentResultEnvelope; providerFailure?: true }>;

/** Parses only bounded normalized Claude stream-json fields; raw provider records are discarded. */
export class ClaudeStreamParser {
  private buffer = '';
  constructor(private readonly options: Readonly<{ redactionTokens?: readonly string[]; maxBytes?: number }> = {}) {}

  receive(chunk: string): ClaudeStreamUpdate {
    this.buffer += chunk;
    const maximum = this.options.maxBytes ?? MAX_RUNNER_OUTPUT_BYTES;
    if (Buffer.byteLength(this.buffer, 'utf8') > maximum) throw new Error('claude_stream_too_large');
    const output: string[] = []; let result: AgentResultEnvelope | undefined; let providerFailure = false;
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n'); const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      if (!line.trim()) continue;
      let record: Record<string, unknown>;
      try { record = JSON.parse(line) as Record<string, unknown>; } catch { throw new Error('claude_stream_invalid'); }
      const text = assistantText(record);
      if (text) output.push(redactForRunnerEvent(text, this.options.redactionTokens));
      if (providerDefinedFailure(record)) { providerFailure = true; continue; }
      if (record.type === 'result') {
        // Claude may include a human-readable `result` beside the strict final schema.
        // The structured field is the only admissible canonical result contract.
        const candidate = record.structured_output ?? record.result;
        const parsed = AgentResultEnvelopeSchema.safeParse(candidate);
        if (!parsed.success) throw new Error('claude_stream_result_invalid');
        result = parsed.data;
      }
    }
    if (providerFailure) return { output, providerFailure: true };
    return result ? { output, result } : { output };
  }
}

/** Stream-json failures are a provider terminal signal, not a model result or Runner output. */
function providerDefinedFailure(record: Record<string, unknown>): boolean {
  return record.type === 'error' || (record.type === 'result' && record.is_error === true);
}

function assistantText(record: Record<string, unknown>): string | null {
  if (record.type !== 'assistant') return null;
  const content = (record.message as Record<string, unknown> | undefined)?.content;
  if (!Array.isArray(content)) return null;
  const parts = content.flatMap((part) => {
    const value = part as Record<string, unknown>;
    return value.type === 'text' && typeof value.text === 'string' ? [value.text] : [];
  });
  return parts.length ? parts.join('\n') : null;
}
