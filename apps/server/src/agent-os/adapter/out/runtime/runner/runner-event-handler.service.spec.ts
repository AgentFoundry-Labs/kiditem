import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptLaunchSpec, RunnerEventBatch } from '@kiditem/shared/agent-runtime';
import { AttemptTokenRegistry } from './attempt-token.registry';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerEventHandlerService } from './runner-event-handler.service';
import { RunnerLeaseRegistry } from './runner-lease.registry';

const instanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('RunnerEventHandlerService', () => {
  it('is the only event path that transitions starting to running and publishes bounded future-only output', async () => {
    const fixture = await handlerFixture();

    await fixture.handler.handle(batch(fixture.leaseId, 1, [
      { kind: 'attempt.started', attemptId },
      { kind: 'attempt.output', attemptId, output: 'live delta' },
    ]));

    expect(fixture.work.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      attemptId, from: 'starting', to: 'running',
    }));
    expect(fixture.output.publish).toHaveBeenCalledWith({ attemptId, output: 'live delta' });
  });

  it('revokes the Attempt token before terminal publication and releases process-local capacity exactly once', async () => {
    const fixture = await handlerFixture();
    const order: string[] = [];
    fixture.tokens.revokeAttempt = vi.fn((id: string) => { order.push(`revoke:${id}`); }) as never;
    fixture.work.transitionAttempt.mockImplementation(async () => { order.push('transition'); return { transitioned: true }; });
    fixture.work.finalizeTaskFromAttempt.mockImplementation(async () => { order.push('finalize'); return { finalized: true, status: 'completed' }; });
    fixture.output.finish.mockImplementation(() => { order.push('publish'); });

    const terminal = batch(fixture.leaseId, 1, [{
      kind: 'attempt.terminal', attemptId, terminalReason: 'success', result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] },
    }]);
    await fixture.handler.handle(terminal);
    await fixture.handler.handle(terminal);

    expect(order.indexOf(`revoke:${attemptId}`)).toBeLessThan(order.indexOf('publish'));
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.output.finish).toHaveBeenCalledWith({ attemptId, outcome: 'completed', summary: 'done' });
  });

  it('owns lease-loss terminalization rather than leaving an assigned Attempt running', async () => {
    const fixture = await handlerFixture();

    await fixture.handler.interruptAttempt(attemptId);

    expect(fixture.work.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      attemptId, to: 'process_interrupted',
    }));
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledWith(attemptId);
  });

  it('does not acknowledge or release a terminal event until a transient durable finalization retry succeeds', async () => {
    const fixture = await handlerFixture();
    fixture.tokens.revokeAttempt = vi.fn() as never;
    fixture.work.finalizeTaskFromAttempt
      .mockRejectedValueOnce(new Error('transient_finalization_failure'))
      .mockResolvedValueOnce({ finalized: true, status: 'completed' });
    const terminal = batch(fixture.leaseId, 1, [{
      kind: 'attempt.terminal', attemptId, terminalReason: 'success',
      result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] },
    }]);

    await expect(fixture.handler.handle(terminal)).rejects.toThrow('transient_finalization_failure');
    expect(fixture.capacity.releaseAttempt).not.toHaveBeenCalled();
    expect(fixture.tokens.revokeAttempt).not.toHaveBeenCalled();
    expect(fixture.output.finish).not.toHaveBeenCalled();

    await expect(fixture.handler.handle(terminal)).resolves.toEqual({ eventSeq: 1, accepted: true });
    expect(fixture.work.finalizeTaskFromAttempt).toHaveBeenCalledTimes(2);
    expect(fixture.tokens.revokeAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.output.finish).toHaveBeenCalledTimes(1);
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight terminalization across concurrent terminal signals', async () => {
    const fixture = await handlerFixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fixture.work.finalizeTaskFromAttempt.mockImplementation(async () => {
      await gate;
      return { finalized: true, status: 'completed' };
    });

    const first = fixture.handler.interruptAttempt(attemptId);
    const second = fixture.handler.interruptAttempt(attemptId);
    await Promise.resolve();
    release();
    await Promise.all([first, second]);

    expect(fixture.work.transitionAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.work.finalizeTaskFromAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
  });

  it('does not revoke an Attempt token twice when future-output completion is retried', async () => {
    const fixture = await handlerFixture();
    fixture.tokens.revokeAttempt = vi.fn() as never;
    fixture.output.finish
      .mockImplementationOnce(() => { throw new Error('future_output_failure'); })
      .mockImplementationOnce(() => undefined);
    const terminal = batch(fixture.leaseId, 1, [{
      kind: 'attempt.terminal', attemptId, terminalReason: 'success',
      result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] },
    }]);

    await expect(fixture.handler.handle(terminal)).rejects.toThrow('future_output_failure');
    expect(fixture.tokens.revokeAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.capacity.releaseAttempt).not.toHaveBeenCalled();

    await expect(fixture.handler.handle(terminal)).resolves.toEqual({ eventSeq: 1, accepted: true });
    expect(fixture.tokens.revokeAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.output.finish).toHaveBeenCalledTimes(2);
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
  });

  it('resumes after a later command-cleanup failure without replaying completed token or output stages', async () => {
    const fixture = await handlerFixture();
    fixture.tokens.revokeAttempt = vi.fn() as never;
    fixture.commands.markTerminal = vi.fn()
      .mockImplementationOnce(() => { throw new Error('queue_cleanup_failure'); })
      .mockImplementationOnce(() => undefined) as never;
    const terminal = batch(fixture.leaseId, 1, [{
      kind: 'attempt.terminal', attemptId, terminalReason: 'success',
      result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] },
    }]);

    await expect(fixture.handler.handle(terminal)).rejects.toThrow('queue_cleanup_failure');
    expect(fixture.tokens.revokeAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.output.finish).toHaveBeenCalledTimes(1);
    expect(fixture.capacity.releaseAttempt).not.toHaveBeenCalled();

    await expect(fixture.handler.handle(terminal)).resolves.toEqual({ eventSeq: 1, accepted: true });
    expect(fixture.tokens.revokeAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.output.finish).toHaveBeenCalledTimes(1);
    expect(fixture.commands.markTerminal).toHaveBeenCalledTimes(2);
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a delivered command rejection after terminal cleanup removes that command from the active queue', async () => {
    const fixture = await handlerFixture();

    await expect(fixture.handler.handle(batch(fixture.leaseId, 1, [{
      kind: 'attempt.rejected',
      attemptId,
      commandId: fixture.command.commandId,
      code: 'invalid_state',
    }]))).resolves.toEqual({ eventSeq: 1, accepted: true });

    expect(fixture.work.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      attemptId,
      to: 'failed',
    }));
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
  });

  it('retries a rejected command after command cleanup without weakening the lease ownership fence', async () => {
    const fixture = await handlerFixture();
    fixture.capacity.releaseAttempt
      .mockImplementationOnce(() => { throw new Error('capacity_release_failure'); })
      .mockImplementationOnce(() => undefined);
    const rejected = batch(fixture.leaseId, 1, [{
      kind: 'attempt.rejected',
      attemptId,
      commandId: fixture.command.commandId,
      code: 'invalid_state',
    }]);

    await expect(fixture.handler.handle(rejected)).rejects.toThrow('capacity_release_failure');
    await expect(fixture.handler.handle(rejected)).resolves.toEqual({ eventSeq: 1, accepted: true });
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(2);
  });
});

async function handlerFixture() {
  const queue = new RunnerCommandQueue({ commandId: () => '218f4eb1-9078-7a1e-9514-b19b5732f5de' });
  const leases = new RunnerLeaseRegistry({
    commands: queue,
    interruptAttempt: async () => undefined,
    leaseId: () => '318f4eb1-9078-7a1e-9514-b19b5732f5de',
  });
  const leaseId = leases.hello({
    kind: 'hello', runnerInstanceId: instanceId, platform: 'macos', nodeMajor: 22,
    controlRevision: 'kiditem-runner-control-v1', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2',
    runtimes: {
      codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
      claude_cli: { version: '2.1.241', loginVerified: true, nonPersistentSettingsVerified: true },
    },
  }).leaseId;
  queue.enqueueStart({ launch: launchSpec(), deadlineAt: new Date('2026-08-24T00:10:00.000Z') });
  const delivered = await leases.poll({ runnerInstanceId: instanceId, leaseId });
  const tokens = new AttemptTokenRegistry();
  const work = {
    transitionAttempt: vi.fn(async () => ({ transitioned: true })),
    finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: true, status: 'completed' })),
  };
  const capacity = { releaseAttempt: vi.fn() };
  const output = { publish: vi.fn(), finish: vi.fn() };
  return {
    handler: new RunnerEventHandlerService({ leases, commands: queue, tokens, work, capacity, output }),
    leaseId, command: delivered.commands[0] as import('@kiditem/shared/agent-runtime').RunnerStartCommand, commands: queue, tokens, work, capacity, output,
  };
}

function batch(leaseId: string, eventSeq: number, events: RunnerEventBatch['events']): RunnerEventBatch {
  return { runnerInstanceId: instanceId, leaseId, eventSeq, events };
}

function launchSpec(): AttemptLaunchSpec {
  return {
    attemptId,
    runtime: 'codex_cli',
    model: 'gpt-5',
    prompt: 'durable work',
    workspacePolicy: 'empty_ephemeral_v1',
    timeoutMs: 60_000,
    mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${attemptId}/mcp`,
    attemptToken: randomBytes(32).toString('base64url'),
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
  };
}
