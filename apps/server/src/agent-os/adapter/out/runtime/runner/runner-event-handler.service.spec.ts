import { describe, expect, it, vi } from 'vitest';
import type { RunnerEventBatch } from '@kiditem/shared/agent-runtime';
import { AttemptTokenRegistry } from './attempt-token.registry';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerEventHandlerService } from './runner-event-handler.service';
import { RunnerLeaseRegistry } from './runner-lease.registry';

const instanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('RunnerEventHandlerService', () => {
  it('is the only event path that transitions starting to running and publishes bounded future-only output', async () => {
    const fixture = handlerFixture();

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
    const fixture = handlerFixture();
    const order: string[] = [];
    fixture.tokens.revokeAttempt = vi.fn((id: string) => { order.push(`revoke:${id}`); }) as never;
    fixture.work.transitionAttempt.mockImplementation(async () => { order.push('transition'); return { transitioned: true }; });
    fixture.work.finalizeTaskFromAttempt.mockImplementation(async () => { order.push('finalize'); return { finalized: true, status: 'completed' }; });
    fixture.output.finish.mockImplementation(() => { order.push('publish'); });

    await fixture.handler.handle(batch(fixture.leaseId, 1, [{
      kind: 'attempt.terminal', attemptId, terminalReason: 'success', result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] },
    }]));
    await fixture.handler.handle(batch(fixture.leaseId, 2, [{
      kind: 'attempt.terminal', attemptId, terminalReason: 'success', result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] },
    }]));

    expect(order.indexOf(`revoke:${attemptId}`)).toBeLessThan(order.indexOf('publish'));
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.output.finish).toHaveBeenCalledWith({ attemptId, outcome: 'completed', summary: 'done' });
  });

  it('owns lease-loss terminalization rather than leaving an assigned Attempt running', async () => {
    const fixture = handlerFixture();

    await fixture.handler.interruptAttempt(attemptId);

    expect(fixture.work.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      attemptId, to: 'process_interrupted',
    }));
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledWith(attemptId);
  });
});

function handlerFixture() {
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
  const tokens = new AttemptTokenRegistry();
  const work = {
    transitionAttempt: vi.fn(async () => ({ transitioned: true })),
    finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: true, status: 'completed' })),
  };
  const capacity = { releaseAttempt: vi.fn() };
  const output = { publish: vi.fn(), finish: vi.fn() };
  return {
    handler: new RunnerEventHandlerService({ leases, commands: queue, tokens, work, capacity, output }),
    leaseId, tokens, work, capacity, output,
  };
}

function batch(leaseId: string, eventSeq: number, events: RunnerEventBatch['events']): RunnerEventBatch {
  return { runnerInstanceId: instanceId, leaseId, eventSeq, events };
}
