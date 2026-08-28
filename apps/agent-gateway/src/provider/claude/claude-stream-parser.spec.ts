import { describe, expect, it } from 'vitest';
import { ClaudeStreamParser } from './claude-stream-parser';

describe('ClaudeStreamParser', () => {
  it('normalizes only bounded provider stream text and terminal status, discarding raw records', () => {
    const token = 'A'.repeat(43);
    const parser = new ClaudeStreamParser({ redactionTokens: [token] });
    const events = parser.receive(`${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: `Safe ${token}` }] } })}\n${JSON.stringify({ type: 'result', is_error: false })}\n`);

    expect(events).toEqual([
      { kind: 'assistant.delta', delta: 'Safe [redacted]' },
      { kind: 'status', status: 'completed' },
    ]);
    expect(JSON.stringify(events)).not.toContain(token);
    expect(JSON.stringify(events)).not.toContain('message');
  });

  it('turns malformed, oversized, and provider error records into bounded failures', () => {
    const parser = new ClaudeStreamParser({ maxBytes: 32 });
    expect(() => parser.receive('{bad}\n')).toThrow('claude_stream_invalid');
    expect(() => parser.receive('x'.repeat(33))).toThrow('claude_stream_too_large');
    expect(new ClaudeStreamParser().receive(`${JSON.stringify({ type: 'result', is_error: true, error: 'private billing data' })}\n`))
      .toEqual([{ kind: 'status', status: 'failed' }]);
  });

  it('normalizes Claude tool-use lifecycle events without retaining tool input or results', () => {
    const parser = new ClaudeStreamParser();
    const secret = 'provider-tool-input-and-result-must-not-cross-the-boundary';
    const events = parser.receive([
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tool-use-1', name: 'mcp__kiditem__capability_invoke', input: { secret } }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-use-1', is_error: false, content: secret }] } }),
      JSON.stringify({ type: 'result', is_error: false }),
    ].join('\n') + '\n');

    expect(events).toEqual([
      { kind: 'tool.status', name: 'mcp__kiditem__capability_invoke', status: 'started' },
      { kind: 'tool.status', name: 'mcp__kiditem__capability_invoke', status: 'completed' },
      { kind: 'status', status: 'completed' },
    ]);
    expect(JSON.stringify(events)).not.toContain(secret);
    expect(JSON.stringify(events)).not.toContain('tool_use_id');
  });

});
