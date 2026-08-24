import { describe, expect, it } from 'vitest';
import { ClaudeStreamParser } from './claude-stream-parser';

describe('ClaudeStreamParser', () => {
  it('returns bounded normalized text and a strict result envelope rather than raw provider payload', () => {
    const parser = new ClaudeStreamParser({ redactionTokens: ['A'.repeat(43)] });
    const updates = parser.receive(`${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'safe response' }] } })}\n${JSON.stringify({ type: 'result', result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] } })}\n`);
    expect(updates.output).toEqual(['safe response']);
    expect(updates.result).toMatchObject({ outcome: 'completed', summary: 'done' });
    expect(JSON.stringify(updates)).not.toContain('message');
  });

  it('rejects unbounded or malformed stream records rather than forwarding raw stderr', () => {
    const parser = new ClaudeStreamParser();
    expect(() => parser.receive('{bad}\n')).toThrow('claude_stream_invalid');
  });

  it('prefers strict structured_output over the ordinary result string', () => {
    const parser = new ClaudeStreamParser();
    const update = parser.receive(`${JSON.stringify({
      type: 'result', result: 'human-readable fallback',
      structured_output: { outcome: 'completed', summary: 'canonical result', resourceRefs: [], operationRefs: [] },
    })}\n`);

    expect(update.result).toMatchObject({ outcome: 'completed', summary: 'canonical result' });
  });
});
