import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AttemptLaunchSpec } from '@kiditem/shared/agent-runtime';
import {
  canonicalStartInputForHash,
  RunnerCommandQueue,
} from './runner-command.queue';

const attemptId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('RunnerCommandQueue', () => {
  it('reuses one start command for canonical retries and redelivers it until acknowledgement', () => {
    const queue = new RunnerCommandQueue({ commandId: fixedCommandIds() });
    const launch = launchSpec();

    const first = queue.enqueueStart({ launch, deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
    const retry = queue.enqueueStart({ launch: { ...launch }, deadlineAt: new Date('2026-08-24T00:10:00.000Z') });

    expect(retry).toEqual(first);
    expect(queue.take()).toEqual({ commands: [first] });
    expect(queue.take()).toEqual({ commands: [first] });
    queue.acknowledge({ commandId: first.commandId, attemptId, commandHash: first.commandHash });
    expect(queue.take()).toEqual({ commands: [] });
  });

  it('hashes a token digest instead of retaining the raw token in canonical start input', () => {
    const launch = launchSpec();
    const canonical = canonicalStartInputForHash(launch);

    expect(canonical).toMatchObject({
      attemptTokenDigest: createHash('sha256').update(launch.attemptToken).digest('hex'),
    });
    expect(canonical).not.toHaveProperty('attemptToken');
    expect(JSON.stringify(canonical)).not.toContain(launch.attemptToken);
  });

  it('rejects start drift and never relaunches a terminal Attempt', () => {
    const queue = new RunnerCommandQueue({ commandId: fixedCommandIds() });
    const launch = launchSpec();
    queue.enqueueStart({ launch, deadlineAt: new Date('2026-08-24T00:10:00.000Z') });

    expect(() => queue.enqueueStart({
      launch: { ...launch, prompt: 'changed durable work' },
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
    })).toThrow('runner_start_command_conflict');

    queue.markTerminal(attemptId);
    expect(() => queue.enqueueStart({ launch, deadlineAt: new Date('2026-08-24T00:10:00.000Z') }))
      .toThrow('attempt_terminal');
  });

  it('keeps input and interrupt commands idempotent without coalescing different inputs', () => {
    const queue = new RunnerCommandQueue({ commandId: fixedCommandIds() });
    const firstInput = queue.enqueueInput({ attemptId, input: 'continue', deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
    const retry = queue.enqueueInput({ attemptId, input: 'continue', deadlineAt: new Date('2026-08-24T00:11:00.000Z') });
    const nextInput = queue.enqueueInput({ attemptId, input: 'change focus', deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
    const interrupt = queue.enqueueInterrupt({ attemptId, deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
    const interruptRetry = queue.enqueueInterrupt({ attemptId, deadlineAt: new Date('2026-08-24T00:10:00.000Z') });

    expect(retry).toEqual(firstInput);
    expect(nextInput.commandId).not.toBe(firstInput.commandId);
    expect(interruptRetry).toEqual(interrupt);
  });

  it('keeps at most eight commands in one delivery batch and evicts terminal records under pressure', () => {
    const queue = new RunnerCommandQueue({ commandId: fixedCommandIds(), maxEntries: 2 });
    const first = queue.enqueueInterrupt({ attemptId, deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
    queue.markTerminal(attemptId);
    queue.enqueueInterrupt({ attemptId: '118f4eb1-9078-7a1e-9514-b19b5732f5de', deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
    queue.enqueueInterrupt({ attemptId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', deadlineAt: new Date('2026-08-24T00:10:00.000Z') });

    expect(queue.has(first.commandId)).toBe(false);
    expect(queue.take().commands).toHaveLength(2);
  });

  it('applies backpressure before an all-active queue exceeds its hard bound', () => {
    const queue = new RunnerCommandQueue({ commandId: fixedCommandIds(), maxEntries: 2 });
    queue.enqueueInput({ attemptId, input: 'first', deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
    queue.enqueueInput({ attemptId, input: 'second', deadlineAt: new Date('2026-08-24T00:10:00.000Z') });

    expect(() => queue.enqueueInput({
      attemptId,
      input: 'third',
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
    })).toThrow('runner_command_backpressure');
    expect((queue as unknown as { records: Map<string, unknown> }).records.size).toBe(2);
    expect((queue as unknown as { idempotency: Map<string, unknown> }).idempotency.size).toBeLessThanOrEqual(2);
  });

  it('frees an acknowledged command slot while retaining a bounded same-input acknowledgement tombstone', () => {
    const queue = new RunnerCommandQueue({ commandId: fixedCommandIds(), maxEntries: 1 });
    const first = queue.enqueueInput({ attemptId, input: 'first', deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
    queue.acknowledge({ commandId: first.commandId, attemptId, commandHash: first.commandHash });

    const second = queue.enqueueInput({
      attemptId,
      input: 'second',
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
    });

    expect(queue.enqueueInput({
      attemptId,
      input: 'first',
      deadlineAt: new Date('2026-08-24T00:11:00.000Z'),
    })).toEqual(first);
    expect(queue.take()).toEqual({ commands: [second] });
    expect((queue as unknown as { records: Map<string, unknown> }).records.size).toBe(1);
    expect((queue as unknown as { idempotency: Map<string, unknown> }).idempotency.size).toBeLessThanOrEqual(1);
    expect((queue as unknown as { idempotencyTombstones: Map<string, unknown> }).idempotencyTombstones.size).toBeLessThanOrEqual(1);
  });

  it('backpressures instead of evicting an acknowledged live start state', () => {
    const queue = new RunnerCommandQueue({ commandId: fixedCommandIds(), maxEntries: 1 });
    const first = queue.enqueueStart({ launch: launchSpec(), deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
    queue.acknowledge({ commandId: first.commandId, attemptId, commandHash: first.commandHash });

    expect(() => queue.enqueueStart({
      launch: launchSpec('218f4eb1-9078-7a1e-9514-b19b5732f5de'),
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
    })).toThrow('runner_command_backpressure');
    expect(queue.hasStartedAttempt(attemptId)).toBe(true);
  });

  it('drops a raw start token when its command is acknowledged while retaining only launch identity metadata', () => {
    const queue = new RunnerCommandQueue({ commandId: fixedCommandIds(), maxEntries: 2 });
    const launch = launchSpec();
    const command = queue.enqueueStart({ launch, deadlineAt: new Date('2026-08-24T00:10:00.000Z') });

    queue.acknowledge({ commandId: command.commandId, attemptId, commandHash: command.commandHash });

    expect(JSON.stringify(queue)).not.toContain(launch.attemptToken);
    expect(queue.hasStartedAttempt(attemptId)).toBe(true);
    expect(queue.startForAttempt(attemptId)).toBeNull();
  });
});

function launchSpec(id = attemptId): AttemptLaunchSpec {
  return {
    attemptId: id,
    runtime: 'codex_cli',
    model: 'gpt-5',
    prompt: 'Perform the durable work.',
    workspacePolicy: 'empty_ephemeral_v1',
    timeoutMs: 60_000,
    mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${id}/mcp`,
    attemptToken: randomBytes(32).toString('base64url'),
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
  };
}

function fixedCommandIds(): () => string {
  let sequence = 0;
  return () => `018f4eb1-9078-7a1e-9514-${String(sequence++).padStart(12, '0')}`;
}
