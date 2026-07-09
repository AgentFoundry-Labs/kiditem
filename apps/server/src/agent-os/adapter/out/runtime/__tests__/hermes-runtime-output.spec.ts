import { describe, expect, it } from 'vitest';
import { parseHermesRuntimeOutput } from '../hermes-runtime-output';

describe('parseHermesRuntimeOutput', () => {
  it('extracts session id and usage metadata without returning metadata as final text', () => {
    const parsed = parseHermesRuntimeOutput({
      stdout: [
        'session_id: hermes-session-123',
        '{"type":"token_usage","input_tokens":37,"output_tokens":11,"cached_input_tokens":5,"cost_micros":"900"}',
        '{"decisionType":"delegate","targetAgentType":"sourcing"}',
      ].join('\n'),
      durationMs: 42,
    });

    expect(parsed).toEqual({
      finalText: '{"decisionType":"delegate","targetAgentType":"sourcing"}',
      sessionId: 'hermes-session-123',
      usage: {
        inputTokens: 37,
        outputTokens: 11,
        cachedInputTokens: 5,
        costMicros: 900n,
      },
      transcriptEvents: [
        {
          type: 'assistant',
          message: '{"decisionType":"delegate","targetAgentType":"sourcing"}',
          data: { line: 3, durationMs: 42 },
        },
      ],
    });
  });

  it('parses compact usage lines emitted by Hermes wrappers', () => {
    const parsed = parseHermesRuntimeOutput({
      stdout: [
        '[usage] input_tokens=100 output_tokens=25 cached_input_tokens=10 cost_micros=1700',
        'Operator finished.',
      ].join('\n'),
    });

    expect(parsed.finalText).toBe('Operator finished.');
    expect(parsed.usage).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      cachedInputTokens: 10,
      costMicros: 1700n,
    });
  });

  it('keeps unknown JSON as final text because Operator strict JSON may be the answer', () => {
    const parsed = parseHermesRuntimeOutput({
      stdout: '{"decisionType":"ask_user","message":"승인할까요?"}',
    });

    expect(parsed.sessionId).toBeNull();
    expect(parsed.usage).toEqual({});
    expect(parsed.finalText).toBe('{"decisionType":"ask_user","message":"승인할까요?"}');
  });

  it('reads session id and usage metadata from stderr without promoting stderr text to final text', () => {
    const parsed = parseHermesRuntimeOutput({
      stdout: 'Operator finished.',
      stderr: [
        'session_id: hermes-session-stderr',
        '{"type":"usage","input_tokens":8,"output_tokens":2,"cached_input_tokens":1,"cost_micros":"44"}',
        'diagnostic output that should stay out of final text',
      ].join('\n'),
    });

    expect(parsed).toEqual({
      finalText: 'Operator finished.',
      sessionId: 'hermes-session-stderr',
      usage: {
        inputTokens: 8,
        outputTokens: 2,
        cachedInputTokens: 1,
        costMicros: 44n,
      },
      transcriptEvents: [
        {
          type: 'assistant',
          message: 'Operator finished.',
          data: { line: 1 },
        },
      ],
    });
  });
});
