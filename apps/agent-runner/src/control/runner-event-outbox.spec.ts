import { describe, expect, it } from 'vitest';
import { MAX_RUNNER_EVENTS, MAX_RUNNER_OUTPUT_BYTES } from '@kiditem/shared/agent-runtime';
import { RunnerEventOutbox } from './runner-event-outbox';

const runnerInstanceId = '11111111-1111-4111-8111-111111111111';
const leaseId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';

describe('RunnerEventOutbox', () => {
  it('keeps one event batch in flight and retries the byte-identical body before advancing sequence', async () => {
    const outbox = new RunnerEventOutbox({ runnerInstanceId, leaseId });
    outbox.enqueue({ kind: 'attempt.started', attemptId });
    const bodies: string[] = [];

    await expect(outbox.flush(async (body) => { bodies.push(body); throw new Error('temporary'); })).rejects.toThrow('temporary');
    await outbox.flush(async (body) => { bodies.push(body); return { eventSeq: 1, accepted: true }; });

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(outbox.nextEventSeq()).toBe(2);
  });

  it('bounds uploaded output and redacts token-like text before constructing an event', () => {
    const token = 'A'.repeat(43);
    const outbox = new RunnerEventOutbox({ runnerInstanceId, leaseId, redactionTokens: [token] });
    outbox.enqueueOutput(attemptId, `stderr Bearer ${token}`);

    expect(outbox.peekBody()).not.toContain(token);
    expect(outbox.peekBody()).not.toContain('stderr Bearer');
    expect(Buffer.byteLength(outbox.peekBody()!, 'utf8')).toBeLessThan(MAX_RUNNER_OUTPUT_BYTES + 1_000);
  });

  it('drops excess output while preserving reserved control capacity even while one batch awaits acknowledgement', () => {
    const outbox = new RunnerEventOutbox({ runnerInstanceId, leaseId });
    outbox.enqueue({ kind: 'attempt.started', attemptId });
    outbox.peekBody(); // holds the first batch in-flight.
    for (let index = 0; index < MAX_RUNNER_EVENTS * 4; index += 1) {
      outbox.enqueue({ kind: 'attempt.output', attemptId, output: `safe-${index}` });
    }
    expect(() => outbox.enqueue({ kind: 'attempt.terminal', attemptId, terminalReason: 'success' })).not.toThrow();
  });

  it('packs a maximal schema-valid prefix under aggregate output bytes and does not strand terminal delivery', async () => {
    const outbox = new RunnerEventOutbox({ runnerInstanceId, leaseId });
    outbox.enqueue({ kind: 'attempt.output', attemptId, output: 'a'.repeat(MAX_RUNNER_OUTPUT_BYTES) });
    outbox.enqueue({ kind: 'attempt.output', attemptId, output: 'b'.repeat(MAX_RUNNER_OUTPUT_BYTES) });
    outbox.enqueue({ kind: 'attempt.terminal', attemptId, terminalReason: 'success' });
    const bodies: string[] = [];

    await outbox.flush(async (body) => {
      bodies.push(body);
      return { eventSeq: JSON.parse(body).eventSeq, accepted: true };
    });

    const batch = JSON.parse(bodies[0]!) as { events: Array<{ kind: string; output?: string }> };
    const outputBytes = batch.events.reduce((total, event) => total + (event.output ? Buffer.byteLength(event.output, 'utf8') : 0), 0);
    expect(outputBytes).toBe(MAX_RUNNER_OUTPUT_BYTES);
    expect(batch.events.map((event) => event.kind)).toEqual(['attempt.output', 'attempt.terminal']);
    expect(bodies[0]).not.toContain('b'.repeat(64));
  });
});
