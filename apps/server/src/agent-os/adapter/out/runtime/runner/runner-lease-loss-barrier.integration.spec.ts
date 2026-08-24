import { describe, expect, it, vi } from 'vitest';
import type { AttemptLaunchSpec, RunnerEventBatch, RunnerHello } from '@kiditem/shared/agent-runtime';
import { AgentAttemptReconciler } from '../../../../application/service/work/agent-attempt-reconciler.service';
import { AttemptTokenRegistry } from './attempt-token.registry';
import { HostRunnerAttemptExecutorService } from './host-runner-attempt-executor.service';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerEventHandlerService } from './runner-event-handler.service';
import { RunnerLeaseRegistry } from './runner-lease.registry';
import { RunnerReadinessService } from './runner-readiness.service';

const now = new Date('2026-08-25T00:00:00.000Z');
const firstRunnerId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const secondRunnerId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const thirdRunnerId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';
const oldAttemptId = '318f4eb1-9078-7a1e-9514-b19b5732f5de';
const newAttemptId = '418f4eb1-9078-7a1e-9514-b19b5732f5de';
const canaryId = '518f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('Runner lease-loss cleanup barrier', () => {
  it('keeps a fast replacement canary probing until the real reconciler settles, then admits only a later business Attempt', async () => {
    const recovery = deferred<{ reconciled: number; attemptIds: string[] }>();
    const fixture = productionFixture({ reconcile: () => recovery.promise });
    const first = fixture.leases.hello(hello(firstRunnerId));
    fixture.readiness.recordVerifiedCanary(verified(firstRunnerId, first));
    await fixture.executor.start(liveAttempt(oldAttemptId));

    const replacement = fixture.leases.hello(hello(secondRunnerId));
    await settle();
    expect(fixture.reconcile).toHaveBeenCalledTimes(1);

    const terminal = await completeCanaryUntilTerminal(fixture, secondRunnerId, replacement, canaryId);

    await expect(fixture.handler.handle(terminal)).rejects.toThrow('runner_not_ready');
    expect(fixture.leases.requireActive().status).toBe('probing');
    await expect(fixture.executor.start(liveAttempt(newAttemptId))).rejects.toThrow('runner_not_ready');
    expect(fixture.commands.take().commands).toEqual([]);

    recovery.resolve({ reconciled: 1, attemptIds: [oldAttemptId] });
    await settle();
    await settle();

    await expect(fixture.handler.handle(terminal)).resolves.toEqual({ eventSeq: 4, accepted: true });
    await fixture.executor.start(liveAttempt(newAttemptId));
    const delivered = await fixture.leases.poll({ runnerInstanceId: secondRunnerId, leaseId: replacement.leaseId });

    expect(delivered.commands).toMatchObject([{ kind: 'attempt.start', attemptId: newAttemptId }]);
    expect(fixture.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({ attemptId: oldAttemptId }));
    expect(fixture.transitionAttempt).not.toHaveBeenCalledWith(expect.objectContaining({ attemptId: newAttemptId }));
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledWith(oldAttemptId);
    fixture.dispose();
  });

  it('keeps readiness blocked until rejected reconciliation completes its exactly-once fallback terminal cleanup', async () => {
    const transition = deferred<{ transitioned: boolean }>();
    const fixture = productionFixture({
      reconcile: async () => { throw new Error('durable_reconciliation_unavailable'); },
      transitionAttempt: () => transition.promise,
    });
    const first = fixture.leases.hello(hello(firstRunnerId));
    fixture.readiness.recordVerifiedCanary(verified(firstRunnerId, first));
    await fixture.executor.start(liveAttempt(oldAttemptId));

    const replacement = fixture.leases.hello(hello(secondRunnerId));
    await settle();
    await settle();
    expect(fixture.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({ attemptId: oldAttemptId, from: 'running' }));

    expect(() => fixture.readiness.recordVerifiedCanary(verified(secondRunnerId, replacement))).toThrow('runner_not_ready');
    expect(() => fixture.leases.requireReady()).toThrow('runner_not_ready');

    transition.resolve({ transitioned: true });
    await settle();
    await settle();

    expect(() => fixture.readiness.recordVerifiedCanary(verified(secondRunnerId, replacement))).not.toThrow();
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledWith(oldAttemptId);
    fixture.dispose();
  });

  it('chains pending cleanup barriers across repeated replacements while still delivering probing canaries', async () => {
    const firstCleanup = deferred<void>();
    const secondCleanup = deferred<void>();
    const commands = new RunnerCommandQueue({ commandId: sequenceIds() });
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: sequenceLeaseIds(),
      now: () => now,
    });
    const reconcile = vi.fn(async ({ leaseId }: { leaseId: string }) => {
      if (leaseId === '618f4eb1-9078-7a1e-9514-b19b5732f5de') return firstCleanup.promise;
      return secondCleanup.promise;
    });
    leases.setLossHandlers({
      interruptAttempt: async () => undefined,
      revokeLease: vi.fn(),
      reconcileLeaseLoss: reconcile,
    });
    const first = leases.hello(hello(firstRunnerId));
    leases.markReady({ runnerInstanceId: firstRunnerId, leaseId: first.leaseId });
    commands.enqueueStart({
      launch: launchSpec(oldAttemptId, 'business'),
      deadlineAt: new Date(now.getTime() + 60_000),
      leaseGeneration: leases.generationForLease({ runnerInstanceId: firstRunnerId, leaseId: first.leaseId }),
    });

    const second = leases.hello(hello(secondRunnerId));
    const canary = commands.enqueueStart({
      launch: launchSpec(canaryId, 'readiness_canary'),
      deadlineAt: new Date(now.getTime() + 60_000),
      leaseGeneration: leases.generationForLease({ runnerInstanceId: secondRunnerId, leaseId: second.leaseId }),
    });
    await expect(leases.poll({ runnerInstanceId: secondRunnerId, leaseId: second.leaseId }))
      .resolves.toEqual({ commands: [canary] });

    const third = leases.hello(hello(thirdRunnerId));
    expect(() => leases.markReady({ runnerInstanceId: thirdRunnerId, leaseId: third.leaseId })).toThrow('runner_not_ready');

    firstCleanup.resolve();
    await settle();
    expect(() => leases.markReady({ runnerInstanceId: thirdRunnerId, leaseId: third.leaseId })).toThrow('runner_not_ready');

    secondCleanup.resolve();
    await settle();
    expect(leases.markReady({ runnerInstanceId: thirdRunnerId, leaseId: third.leaseId }).status).toBe('ready');
    expect(reconcile).toHaveBeenCalledTimes(2);
    leases.dispose();
  });
});

function productionFixture(input: {
  reconcile: () => Promise<{ reconciled: number; attemptIds: string[] }>;
  transitionAttempt?: () => Promise<{ transitioned: boolean }>;
}) {
  const commands = new RunnerCommandQueue({ commandId: sequenceIds() });
  const tokens = new AttemptTokenRegistry({ now: () => now });
  const leases = new RunnerLeaseRegistry({
    commands,
    interruptAttempt: async () => undefined,
    leaseId: sequenceLeaseIds(),
    now: () => now,
  });
  const transitionAttempt = vi.fn(input.transitionAttempt ?? (async () => ({ transitioned: true })));
  const work = {
    reconcile: vi.fn(input.reconcile),
    transitionAttempt,
    finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: true, status: 'completed' })),
  };
  const capacity = { releaseAttempt: vi.fn() };
  const reconciler = new AgentAttemptReconciler(
    work,
    capacity,
    { applicationVersion: '1.0.0', gitSha: 'abc123' },
    () => now,
  );
  const readiness = new RunnerReadinessService({
    leases,
    commands,
    tokens,
    loopbackOrigin: 'http://127.0.0.1:4000',
    canaryId: () => canaryId,
    nonce: () => '618f4eb1-9078-7a1e-9514-b19b5732f5de',
    now: () => now,
  });
  const handler = new RunnerEventHandlerService({
    leases,
    commands,
    tokens,
    work,
    capacity,
    output: { publish: vi.fn(), finish: vi.fn() },
    readiness,
    reconciler,
    now: () => now,
  });
  const executor = new HostRunnerAttemptExecutorService({
    admission: { assert: vi.fn(async () => undefined) },
    prompts: { resolve: vi.fn(async ({ prompt }: { prompt: string }) => prompt) },
    tokens,
    commands,
    leases,
    loopbackOrigin: 'http://127.0.0.1:4000',
    now: () => now,
  });
  return {
    commands,
    leases,
    readiness,
    handler,
    executor,
    reconcile: work.reconcile,
    transitionAttempt,
    capacity,
    dispose: () => leases.dispose(),
  };
}

async function completeCanaryUntilTerminal(
  fixture: ReturnType<typeof productionFixture>,
  runnerInstanceId: string,
  lease: { leaseId: string },
  expectedCanaryId: string,
): Promise<RunnerEventBatch> {
  fixture.readiness.beginCanary({ runtime: 'codex_cli', model: 'gpt-5', deployIdentity: '1.0.0:abc123' });
  const start = (await fixture.leases.poll({ runnerInstanceId, leaseId: lease.leaseId })).commands[0]!;
  await fixture.handler.handle(batch(runnerInstanceId, lease.leaseId, 1, [{ kind: 'attempt.started', attemptId: expectedCanaryId }]));
  await fixture.handler.handle(batch(runnerInstanceId, lease.leaseId, 2, [{
    kind: 'command_ack',
    commandId: start.commandId,
    attemptId: expectedCanaryId,
    commandHash: start.commandHash,
  }]));
  fixture.readiness.canaryMcpBinding({ canaryId: expectedCanaryId, leaseId: lease.leaseId })
    .onProbe({ nonce: '618f4eb1-9078-7a1e-9514-b19b5732f5de' });
  const input = (await fixture.leases.poll({ runnerInstanceId, leaseId: lease.leaseId })).commands[0]!;
  await fixture.handler.handle(batch(runnerInstanceId, lease.leaseId, 3, [{
    kind: 'command_ack',
    commandId: input.commandId,
    attemptId: expectedCanaryId,
    commandHash: input.commandHash,
  }]));
  return batch(runnerInstanceId, lease.leaseId, 4, [{
    kind: 'attempt.terminal',
    attemptId: expectedCanaryId,
    terminalReason: 'protocol_success',
    result: { outcome: 'completed', summary: 'ready', resourceRefs: [], operationRefs: [] },
  }]);
}

function batch(
  runnerInstanceId: string,
  leaseId: string,
  eventSeq: number,
  events: RunnerEventBatch['events'],
): RunnerEventBatch {
  return { runnerInstanceId, leaseId, eventSeq, events };
}

function verified(runnerInstanceId: string, lease: { leaseId: string }) {
  return {
    runnerInstanceId,
    leaseId: lease.leaseId,
    runtime: 'codex_cli' as const,
    model: 'gpt-5',
    deployIdentity: '1.0.0:abc123',
  };
}

function liveAttempt(attemptId: string) {
  return {
    attemptId,
    runtime: 'codex_cli' as const,
    profile: { model: 'gpt-5' },
    prompt: 'durable work',
    mcp: {
      attemptId,
      organizationId: 'organization-id',
      sessionId: 'session-id',
      taskId: 'task-id',
      agentVersionId: 'agent-version-id',
      userId: 'user-id',
      capabilityKeys: [],
    },
  };
}

function launchSpec(attemptId: string, mcpToolScope: 'business' | 'readiness_canary'): AttemptLaunchSpec {
  return {
    attemptId,
    runtime: 'codex_cli',
    model: 'gpt-5',
    prompt: 'durable work',
    workspacePolicy: 'empty_ephemeral_v1',
    timeoutMs: 60_000,
    mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${attemptId}/mcp`,
    attemptToken: 'A'.repeat(43),
    mcpToolScope,
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
  };
}

function hello(runnerInstanceId: string): RunnerHello {
  return {
    kind: 'hello',
    runnerInstanceId,
    platform: 'macos',
    nodeMajor: 22,
    controlRevision: 'kiditem-runner-control-v1',
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
    runtimes: {
      codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
      claude_cli: { version: '2.1.241', loginVerified: true, nonPersistentSettingsVerified: true },
    },
  };
}

function sequenceLeaseIds(): () => string {
  const ids = [
    '618f4eb1-9078-7a1e-9514-b19b5732f5de',
    '718f4eb1-9078-7a1e-9514-b19b5732f5de',
    '818f4eb1-9078-7a1e-9514-b19b5732f5de',
  ];
  return () => ids.shift()!;
}

function sequenceIds(): () => string {
  let sequence = 0;
  return () => `918f4eb1-9078-7a1e-9514-${String(sequence++).padStart(12, '0')}`;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
