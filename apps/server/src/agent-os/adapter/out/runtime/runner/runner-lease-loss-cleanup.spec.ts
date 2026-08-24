import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptLaunchSpec, RunnerHello, RunnerLeaseResponse } from '@kiditem/shared/agent-runtime';
import { RUNNER_COMMAND_QUEUE_MAX_ENTRIES, RunnerCommandQueue } from './runner-command.queue';
import { RunnerLeaseRegistry } from './runner-lease.registry';

const LOSS_CLEANUP_ATTEMPT_CAP = RUNNER_COMMAND_QUEUE_MAX_ENTRIES;
const deadlineAt = new Date('2026-08-25T00:10:00.000Z');

describe('RunnerLeaseRegistry loss-cleanup drain', () => {
  it('coalesces 5,000 zero-attempt replacements behind one pending reconciliation and keeps business delivery closed', async () => {
    const never = deferred<void>();
    const reconciliation = vi.fn(() => never.promise);
    const fixture = fixtureFor({ reconciliation });
    const first = fixture.registry.hello(hello(1));
    let replacement = first;

    for (let index = 2; index <= 5_001; index += 1) {
      replacement = fixture.registry.hello(hello(index));
    }
    await settle();

    expect(reconciliation).toHaveBeenCalledTimes(1);
    expect(reconciliation).toHaveBeenCalledWith({ leaseId: first.leaseId, attemptIds: [] });
    expect(() => fixture.registry.markReady(leaseInput(5_001, replacement))).toThrow('runner_not_ready');

    const business = enqueueStart(fixture, replacement, 5_001, 9_001, 'business');
    const canary = enqueueStart(fixture, replacement, 5_001, 9_002, 'readiness_canary');
    await expect(fixture.registry.poll(leaseInput(5_001, replacement))).resolves.toEqual({ commands: [canary] });
    expect(fixture.commands.take().commands).toContainEqual(business);
    fixture.registry.dispose();
  });

  it('runs a second drain only for a fenced Attempt that arrived while the first reconciliation awaited', async () => {
    const firstReconciliation = deferred<void>();
    const secondReconciliation = deferred<void>();
    const reconciliation = vi.fn()
      .mockImplementationOnce(() => firstReconciliation.promise)
      .mockImplementationOnce(() => secondReconciliation.promise);
    const fixture = fixtureFor({ reconciliation });
    const first = fixture.registry.hello(hello(1));
    fixture.registry.markReady(leaseInput(1, first));
    enqueueStart(fixture, first, 1, 101, 'business');

    const second = fixture.registry.hello(hello(2));
    enqueueStart(fixture, second, 2, 102, 'business');
    const third = fixture.registry.hello(hello(3));
    await settle();

    expect(reconciliation).toHaveBeenCalledTimes(1);
    expect(reconciliation).toHaveBeenLastCalledWith({ leaseId: first.leaseId, attemptIds: [id(101)] });
    expect(() => fixture.registry.markReady(leaseInput(3, third))).toThrow('runner_not_ready');

    firstReconciliation.resolve();
    await settle();

    expect(reconciliation).toHaveBeenCalledTimes(2);
    expect(reconciliation).toHaveBeenLastCalledWith({ leaseId: second.leaseId, attemptIds: [id(102)] });
    expect(() => fixture.registry.markReady(leaseInput(3, third))).toThrow('runner_not_ready');

    secondReconciliation.resolve();
    await settle();

    expect(fixture.registry.markReady(leaseInput(3, third)).status).toBe('ready');
    fixture.registry.dispose();
  });

  it('falls back exactly once for every distinct fenced Attempt coalesced while reconciliation was pending', async () => {
    const firstReconciliation = deferred<void>();
    const reconciliation = vi.fn()
      .mockImplementationOnce(() => firstReconciliation.promise)
      .mockImplementationOnce(async () => { throw new Error('durable_reconciliation_unavailable'); });
    const interrupts = vi.fn(async () => undefined);
    const fixture = fixtureFor({ reconciliation, interrupts });
    const first = fixture.registry.hello(hello(1));
    fixture.registry.markReady(leaseInput(1, first));
    enqueueStart(fixture, first, 1, 201, 'business');

    const second = fixture.registry.hello(hello(2));
    enqueueStart(fixture, second, 2, 202, 'business');
    const third = fixture.registry.hello(hello(3));
    await settle();

    expect(reconciliation).toHaveBeenCalledTimes(1);
    firstReconciliation.reject(new Error('durable_reconciliation_unavailable'));
    await settle();

    expect(reconciliation).toHaveBeenCalledTimes(2);
    expect(interrupts).toHaveBeenCalledTimes(2);
    expect(interrupts).toHaveBeenNthCalledWith(1, id(201));
    expect(interrupts).toHaveBeenNthCalledWith(2, id(202));
    expect(fixture.registry.markReady(leaseInput(3, third)).status).toBe('ready');
    fixture.registry.dispose();
  });

  it.each(['resolve', 'reject'] as const)('disposes a pending drain without a late %s settlement restarting or mutating it', async (outcome) => {
    const pending = deferred<void>();
    const reconciliation = vi.fn(() => pending.promise);
    const interrupts = vi.fn(async () => undefined);
    const fixture = fixtureFor({ reconciliation, interrupts });
    const first = fixture.registry.hello(hello(1));
    fixture.registry.markReady(leaseInput(1, first));
    enqueueStart(fixture, first, 1, 301, 'business');

    const second = fixture.registry.hello(hello(2));
    enqueueStart(fixture, second, 2, 302, 'business');
    fixture.registry.hello(hello(3));
    await settle();
    expect(reconciliation).toHaveBeenCalledTimes(1);

    let unhandled: unknown;
    const onUnhandled = (error: unknown) => { unhandled = error; };
    process.on('unhandledRejection', onUnhandled);
    try {
      fixture.registry.dispose();
      if (outcome === 'resolve') pending.resolve();
      else pending.reject(new Error('durable_reconciliation_unavailable'));
      await settle();
      await settle();

      expect(reconciliation).toHaveBeenCalledTimes(1);
      expect(interrupts).not.toHaveBeenCalled();
      expect(unhandled).toBeUndefined();
      expect(() => fixture.registry.hello(hello(4))).toThrow('runner_registry_disposed');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('fails closed when lost Attempt buffering exceeds the bounded command-capacity invariant', async () => {
    const reconciliation = vi.fn(async () => undefined);
    const fixture = fixtureFor({ reconciliation, maxEntries: LOSS_CLEANUP_ATTEMPT_CAP + 1 });
    const first = fixture.registry.hello(hello(1));
    fixture.registry.markReady(leaseInput(1, first));
    for (let index = 0; index <= LOSS_CLEANUP_ATTEMPT_CAP; index += 1) {
      enqueueStart(fixture, first, 1, 10_000 + index, 'business');
    }

    const replacement = fixture.registry.hello(hello(2));
    await settle();

    expect(reconciliation).toHaveBeenCalledTimes(1);
    expect(reconciliation.mock.calls[0]?.[0]?.attemptIds).toHaveLength(LOSS_CLEANUP_ATTEMPT_CAP);
    expect(() => fixture.registry.markReady(leaseInput(2, replacement))).toThrow('runner_not_ready');
    fixture.registry.dispose();
  });
});

function fixtureFor(input: {
  reconciliation: (input: { leaseId: string; attemptIds: readonly string[] }) => Promise<void>;
  interrupts?: (attemptId: string) => Promise<void>;
  maxEntries?: number;
}) {
  const commands = new RunnerCommandQueue({ commandId: sequenceIds(20_000), maxEntries: input.maxEntries });
  const interrupts = input.interrupts ?? vi.fn(async () => undefined);
  const registry = new RunnerLeaseRegistry({
    commands,
    interruptAttempt: interrupts,
    leaseId: sequenceIds(30_000),
  });
  registry.setLossHandlers({
    interruptAttempt: interrupts,
    revokeLease: vi.fn(),
    reconcileLeaseLoss: input.reconciliation,
  });
  return { registry, commands };
}

function enqueueStart(
  fixture: ReturnType<typeof fixtureFor>,
  lease: RunnerLeaseResponse,
  runnerIndex: number,
  attemptIndex: number,
  mcpToolScope: 'business' | 'readiness_canary',
) {
  const attemptId = id(attemptIndex);
  return fixture.commands.enqueueStart({
    launch: launchSpec(attemptId, mcpToolScope),
    deadlineAt,
    leaseGeneration: fixture.registry.generationForLease({ runnerInstanceId: id(runnerIndex), leaseId: lease.leaseId }),
  });
}

function leaseInput(runnerIndex: number, lease: RunnerLeaseResponse) {
  return { runnerInstanceId: id(runnerIndex), leaseId: lease.leaseId };
}

function hello(index: number): RunnerHello {
  return {
    kind: 'hello',
    runnerInstanceId: id(index),
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

function launchSpec(attemptId: string, mcpToolScope: 'business' | 'readiness_canary'): AttemptLaunchSpec {
  return {
    attemptId,
    runtime: 'codex_cli',
    model: 'gpt-5',
    prompt: 'durable work',
    workspacePolicy: 'empty_ephemeral_v1',
    timeoutMs: 60_000,
    mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${attemptId}/mcp`,
    attemptToken: randomBytes(32).toString('base64url'),
    mcpToolScope,
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
  };
}

function id(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function sequenceIds(start: number): () => string {
  let next = start;
  return () => id(next++);
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
