import { describe, expect, it } from 'vitest';
import { ClaudeStreamParser } from './claude-stream-parser';

describe('ClaudeStreamParser', () => {
  it('returns bounded normalized text and a strict result envelope rather than raw provider payload', () => {
    const parser = new ClaudeStreamParser({ redactionTokens: ['A'.repeat(43)] });
    const updates = parser.receive(`${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'safe response' }] } })}\n${JSON.stringify({ type: 'result', result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [], needsInput: null, error: null } })}\n`);
    expect(updates.output).toEqual(['safe response']);
    expect(updates.result).toMatchObject({ outcome: 'completed', summary: 'done' });
    expect(updates.result).not.toHaveProperty('needsInput');
    expect(updates.result).not.toHaveProperty('error');
    expect(JSON.stringify(updates)).not.toContain('message');
  });

  it.each([
    [
      'needs_input',
      { outcome: 'needs_input', summary: 'input required', resourceRefs: [], operationRefs: [], needsInput: { code: 'need_sku', prompt: 'Provide a SKU.' }, error: null },
      { outcome: 'needs_input', summary: 'input required', resourceRefs: [], operationRefs: [], needsInput: { code: 'need_sku', prompt: 'Provide a SKU.' } },
    ],
    [
      'failed',
      { outcome: 'failed', summary: 'failed', resourceRefs: [], operationRefs: [], needsInput: null, error: { code: 'provider_failed', message: 'Try again.' } },
      { outcome: 'failed', summary: 'failed', resourceRefs: [], operationRefs: [], error: { code: 'provider_failed', message: 'Try again.' } },
    ],
  ])('normalizes strict nullable structured output for %s', (_outcome, structuredOutput, expected) => {
    const parser = new ClaudeStreamParser();
    const update = parser.receive(`${JSON.stringify({ type: 'result', structured_output: structuredOutput })}\n`);

    expect(update.result).toEqual(expected);
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

  it('converts a provider-defined stream result error into a bounded terminal signal without retaining its payload', () => {
    const parser = new ClaudeStreamParser();
    const update = parser.receive(`${JSON.stringify({
      type: 'result', subtype: 'error_during_execution', is_error: true,
      error: 'provider detail that must never reach Runner events',
    })}\n`);

    expect(update).toEqual({ output: [], providerFailure: true });
    expect(JSON.stringify(update)).not.toContain('provider detail');
  });
});
