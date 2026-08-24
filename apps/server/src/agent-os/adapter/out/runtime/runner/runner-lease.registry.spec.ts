import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { AttemptLaunchSpec, RunnerEventBatch, RunnerHello } from '@kiditem/shared/agent-runtime';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerLeaseRegistry } from './runner-lease.registry';

const instanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const replacementInstanceId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';
const replacementAttemptId = '318f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('RunnerLeaseRegistry', () => {
  it('invokes one durable reconciliation for every Attempt assigned to a lost thirty-second lease', async () => {
    vi.useFakeTimers();
    try {
      const commands = new RunnerCommandQueue({ commandId: () => '618f4eb1-9078-7a1e-9514-b19b5732f5de' });
      const interrupts = vi.fn(async () => undefined);
      const recovery = vi.fn(async () => undefined);
      const registry = registryFor({ commands, interruptAttempt: interrupts });
      registry.setLossHandlers({
        interruptAttempt: interrupts,
        revokeLease: vi.fn(),
        reconcileLeaseLoss: recovery,
      } as never);
      const lease = registry.hello(hello());
      await deliverAttempt(registry, commands, lease.leaseId);

      await vi.advanceTimersByTimeAsync(30_001);

      expect(recovery).toHaveBeenCalledTimes(1);
      expect(recovery).toHaveBeenCalledWith({ leaseId: lease.leaseId, attemptIds: [attemptId] });
      expect(interrupts).not.toHaveBeenCalled();
      registry.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconciles an undelivered business Attempt and never gives its start or input to a replacement probing lease', async () => {
    vi.useFakeTimers();
    try {
      const commandIds = [
        '638f4eb1-9078-7a1e-9514-b19b5732f5de',
        '638f4eb1-9078-7a1e-9514-b19b5732f5df',
      ];
      const commands = new RunnerCommandQueue({ commandId: () => commandIds.shift()! });
      const reconciliation = vi.fn(async () => undefined);
      const revokeLease = vi.fn();
      const registry = registryFor({ commands });
      registry.setLossHandlers({
        interruptAttempt: vi.fn(async () => undefined),
        revokeLease,
        reconcileLeaseLoss: reconciliation,
      });
      const prior = registry.hello(hello());
      const start = commands.enqueueStart({
        launch: launchSpec(),
        deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
        leaseGeneration: registry.generationForLease({ runnerInstanceId: instanceId, leaseId: prior.leaseId }),
      });
      const input = commands.enqueueInput({
        attemptId,
        input: 'live business follow-up',
        deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      });

      const replacement = registry.hello(hello({ runnerInstanceId: replacementInstanceId }));
      const replacementPoll = registry.poll({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId });
      await vi.advanceTimersByTimeAsync(20_000);

      expect(replacement.status).toBe('probing');
      expect(reconciliation).toHaveBeenCalledTimes(1);
      expect(reconciliation).toHaveBeenCalledWith({ leaseId: prior.leaseId, attemptIds: [attemptId] });
      expect(revokeLease).toHaveBeenCalledWith(prior.leaseId);
      await expect(replacementPoll).resolves.toEqual({ commands: [] });
      expect(commands.take()).toEqual({ commands: [] });
      registry.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fences an old business generation before a replacement canary can mark the new lease ready', async () => {
    let releaseReconciliation!: () => void;
    const reconciliation = vi.fn(async () => new Promise<void>((resolve) => { releaseReconciliation = resolve; }));
    const commands = new RunnerCommandQueue({ commandId: sequenceCommandIds() });
    const leaseIds = [
      '738f4eb1-9078-7a1e-9514-b19b5732f5de',
      '738f4eb1-9078-7a1e-9514-b19b5732f5df',
    ];
    const registry = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => leaseIds.shift()!,
    });
    registry.setLossHandlers({
      interruptAttempt: vi.fn(async () => undefined),
      revokeLease: vi.fn(),
      reconcileLeaseLoss: reconciliation,
    });
    const prior = registry.hello(hello());
    const oldStart = commands.enqueueStart({
      launch: launchSpec(),
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      leaseGeneration: registry.generationForLease({ runnerInstanceId: instanceId, leaseId: prior.leaseId }),
    });
    commands.enqueueInput({
      attemptId,
      input: 'must never cross the lost generation',
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
    });

    const replacement = registry.hello(hello({ runnerInstanceId: replacementInstanceId }));
    const canary = commands.enqueueStart({
      launch: { ...launchSpec('418f4eb1-9078-7a1e-9514-b19b5732f5de'), mcpToolScope: 'readiness_canary' },
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      leaseGeneration: registry.generationForLease({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId }),
    });

    await expect(registry.poll({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId }))
      .resolves.toEqual({ commands: [canary] });
    commands.acknowledge({ commandId: canary.commandId, attemptId: canary.attemptId, commandHash: canary.commandHash });
    registry.markReady({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId });
    const next = commands.enqueueStart({
      launch: launchSpec(replacementAttemptId),
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      leaseGeneration: registry.generationForLease({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId }),
    });

    await expect(registry.poll({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId }))
      .resolves.toEqual({ commands: [next] });
    expect(commands.take().commands).not.toContainEqual(oldStart);
    expect(reconciliation).toHaveBeenCalledWith({ leaseId: prior.leaseId, attemptIds: [attemptId] });

    releaseReconciliation();
    registry.dispose();
  });

  it('fails closed and falls back once when durable lease-loss reconciliation rejects', async () => {
    const commands = new RunnerCommandQueue({ commandId: sequenceCommandIds() });
    const interrupts = vi.fn(async () => undefined);
    const reconciliation = vi.fn(async () => { throw new Error('durable_reconciliation_unavailable'); });
    const leaseIds = [
      '748f4eb1-9078-7a1e-9514-b19b5732f5de',
      '748f4eb1-9078-7a1e-9514-b19b5732f5df',
    ];
    const registry = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: interrupts,
      leaseId: () => leaseIds.shift()!,
    });
    registry.setLossHandlers({ interruptAttempt: interrupts, revokeLease: vi.fn(), reconcileLeaseLoss: reconciliation });
    const prior = registry.hello(hello());
    const oldStart = commands.enqueueStart({
      launch: launchSpec(),
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      leaseGeneration: registry.generationForLease({ runnerInstanceId: instanceId, leaseId: prior.leaseId }),
    });

    const replacement = registry.hello(hello({ runnerInstanceId: replacementInstanceId }));
    registry.markReady({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId });
    await settleAsync();
    await settleAsync();

    expect(reconciliation).toHaveBeenCalledTimes(1);
    expect(reconciliation).toHaveBeenCalledWith({ leaseId: prior.leaseId, attemptIds: [attemptId] });
    expect(interrupts).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveBeenCalledWith(attemptId);
    expect(commands.take().commands).not.toContainEqual(oldStart);

    const next = commands.enqueueStart({
      launch: launchSpec(replacementAttemptId),
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      leaseGeneration: registry.generationForLease({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId }),
    });
    await expect(registry.poll({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId }))
      .resolves.toEqual({ commands: [next] });
    registry.dispose();
  });

  it('delivers the scoped readiness start and its live input while a lease is still probing', async () => {
    const commandIds = [
      '648f4eb1-9078-7a1e-9514-b19b5732f5de',
      '648f4eb1-9078-7a1e-9514-b19b5732f5df',
    ];
    const commands = new RunnerCommandQueue({ commandId: () => commandIds.shift()! });
    const registry = registryFor({ commands });
    const lease = registry.hello(hello());
    const start = commands.enqueueStart({
      launch: { ...launchSpec(), mcpToolScope: 'readiness_canary' },
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      leaseGeneration: registry.generationForLease({ runnerInstanceId: instanceId, leaseId: lease.leaseId }),
    });

    await expect(registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId }))
      .resolves.toEqual({ commands: [start] });
    commands.acknowledge({ commandId: start.commandId, attemptId, commandHash: start.commandHash });
    const input = commands.enqueueInput({
      attemptId,
      input: 'readiness second input',
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
    });
    await expect(registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId }))
      .resolves.toEqual({ commands: [input] });
    registry.dispose();
  });

  it('creates a probing lease only for an exact strict hello and reuses a canonical duplicate', () => {
    const registry = registryFor();
    const first = registry.hello(hello());
    const duplicate = registry.hello(hello());

    expect(first).toMatchObject({ runnerInstanceId: instanceId, status: 'probing', leaseTtlMs: 30_000 });
    expect(duplicate).toEqual(first);
    expect(() => registry.hello({ ...hello(), platform: 'windows' })).toThrow('runner_hello_conflict');
    registry.dispose();
  });

  it('invalidates a former instance and interrupts assigned live Attempts when a new Runner arrives', async () => {
    const interrupts = vi.fn(async () => undefined);
    const commands = new RunnerCommandQueue({ commandId: () => '618f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const registry = registryFor({ commands, interruptAttempt: interrupts });
    const prior = registry.hello(hello());
    await deliverAttempt(registry, commands, prior.leaseId);

    const replacement = registry.hello(hello({ runnerInstanceId: replacementInstanceId }));

    expect(replacement.runnerInstanceId).toBe(replacementInstanceId);
    expect(interrupts).toHaveBeenCalledWith(attemptId);
    expect(registry.isValid({ runnerInstanceId: instanceId, leaseId: prior.leaseId })).toBe(false);
    registry.dispose();
  });

  it('does not redeliver an unacknowledged start to a replacement while old-lease cleanup is pending', async () => {
    vi.useFakeTimers();
    try {
      let releaseLoss!: () => void;
      const loss = new Promise<void>((resolve) => { releaseLoss = resolve; });
      const interrupts = vi.fn(async () => loss);
      const commands = new RunnerCommandQueue({ commandId: () => '619f4eb1-9078-7a1e-9514-b19b5732f5de' });
      const registry = registryFor({ commands, interruptAttempt: interrupts });
      const prior = registry.hello(hello());
      await deliverAttempt(registry, commands, prior.leaseId);

      const replacement = registry.hello(hello({ runnerInstanceId: replacementInstanceId }));
      const replacementPoll = registry.poll({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId });
      await vi.advanceTimersByTimeAsync(20_000);

      await expect(replacementPoll).resolves.toEqual({ commands: [] });
      expect(interrupts).toHaveBeenCalledWith(attemptId);
      releaseLoss();
      registry.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not deliver later input for an Attempt already assigned to the replaced lease', async () => {
    vi.useFakeTimers();
    try {
      let releaseLoss!: () => void;
      const loss = new Promise<void>((resolve) => { releaseLoss = resolve; });
      const commands = new RunnerCommandQueue({ commandId: () => '719f4eb1-9078-7a1e-9514-b19b5732f5de' });
      const registry = registryFor({ commands, interruptAttempt: vi.fn(async () => loss) });
      const prior = registry.hello(hello());
      await deliverAttempt(registry, commands, prior.leaseId);
      commands.enqueueInput({ attemptId, input: 'do not cross leases', deadlineAt: new Date('2026-08-24T00:10:00.000Z') });

      const replacement = registry.hello(hello({ runnerInstanceId: replacementInstanceId }));
      const replacementPoll = registry.poll({ runnerInstanceId: replacementInstanceId, leaseId: replacement.leaseId });
      await vi.advanceTimersByTimeAsync(20_000);

      await expect(replacementPoll).resolves.toEqual({ commands: [] });
      releaseLoss();
      registry.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('can bind the final lifecycle and token revocation hooks after registry construction', async () => {
    const commands = new RunnerCommandQueue({ commandId: () => '718f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const registry = registryFor({ commands });
    const interrupts = vi.fn(async () => undefined);
    const revokeLease = vi.fn();
    registry.setLossHandlers({ interruptAttempt: interrupts, revokeLease });
    const prior = registry.hello(hello());
    await deliverAttempt(registry, commands, prior.leaseId);

    registry.hello(hello({ runnerInstanceId: replacementInstanceId }));

    expect(revokeLease).toHaveBeenCalledWith(prior.leaseId);
    expect(interrupts).toHaveBeenCalledWith(attemptId);
    registry.dispose();
  });

  it('allows one outstanding poll, returns 204-equivalent null after twenty seconds, and expires the lease at thirty', async () => {
    vi.useFakeTimers();
    const interrupts = vi.fn(async () => undefined);
    const commands = new RunnerCommandQueue({ commandId: () => '818f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const registry = registryFor({ commands, interruptAttempt: interrupts });
    const lease = registry.hello(hello());
    const delivered = await deliverAttempt(registry, commands, lease.leaseId);
    commands.acknowledge({ commandId: delivered.commandId, attemptId, commandHash: delivered.commandHash });

    const pending = registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId });
    await expect(registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId }))
      .rejects.toThrow('runner_poll_conflict');
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(pending).resolves.toEqual({ commands: [] });
    expect(registry.isValid({ runnerInstanceId: instanceId, leaseId: lease.leaseId })).toBe(true);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(registry.isValid({ runnerInstanceId: instanceId, leaseId: lease.leaseId })).toBe(false);
    expect(interrupts).toHaveBeenCalledWith(attemptId);
    registry.dispose();
    vi.useRealTimers();
  });

  it('returns queued commands promptly while retaining their stable unacknowledged identity', async () => {
    const commands = new RunnerCommandQueue({ commandId: () => '318f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const registry = registryFor({ commands });
    const lease = registry.hello(hello());
    registry.markReady({ runnerInstanceId: instanceId, leaseId: lease.leaseId });
    const start = commands.enqueueStart({
      launch: launchSpec(),
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      leaseGeneration: registry.generationForLease({ runnerInstanceId: instanceId, leaseId: lease.leaseId }),
    });
    await expect(registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId }))
      .resolves.toEqual({ commands: [start] });
    commands.acknowledge({ commandId: start.commandId, attemptId, commandHash: start.commandHash });
    const command = commands.enqueueInterrupt({ attemptId, deadlineAt: new Date('2026-08-24T00:10:00.000Z') });

    await expect(registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId }))
      .resolves.toEqual({ commands: [command] });
    await expect(registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId }))
      .resolves.toEqual({ commands: [command] });
    registry.dispose();
  });

  it('binds a live Attempt only after delivering its start command to the active lease', async () => {
    const commands = new RunnerCommandQueue({ commandId: () => '618f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const interrupts = vi.fn(async () => undefined);
    const registry = registryFor({ commands, interruptAttempt: interrupts });
    const lease = registry.hello(hello());
    registry.markReady({ runnerInstanceId: instanceId, leaseId: lease.leaseId });
    commands.enqueueStart({
      launch: launchSpec(),
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      leaseGeneration: registry.generationForLease({ runnerInstanceId: instanceId, leaseId: lease.leaseId }),
    });

    await registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId });
    registry.hello(hello({ runnerInstanceId: replacementInstanceId }));

    expect(interrupts).toHaveBeenCalledWith(attemptId);
    registry.dispose();
  });

  it('rejects an event for an Attempt that was not delivered to the active lease', async () => {
    const commands = new RunnerCommandQueue({ commandId: () => '718f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const registry = registryFor({ commands });
    const lease = registry.hello(hello());
    registry.markReady({ runnerInstanceId: instanceId, leaseId: lease.leaseId });
    commands.enqueueStart({
      launch: launchSpec(),
      deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
      leaseGeneration: registry.generationForLease({ runnerInstanceId: instanceId, leaseId: lease.leaseId }),
    });
    await registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId });

    await expect(registry.acceptEventBatch({
      runnerInstanceId: instanceId,
      leaseId: lease.leaseId,
      eventSeq: 1,
      events: [{ kind: 'attempt.output', attemptId: '818f4eb1-9078-7a1e-9514-b19b5732f5de', output: 'stale' }],
    }, async () => undefined)).rejects.toThrow('runner_event_attempt_unassigned');
    registry.dispose();
  });

  it('rechecks the active lease after a serialized event application races with replacement', async () => {
    const commands = new RunnerCommandQueue({ commandId: () => '918f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const registry = registryFor({ commands });
    const lease = registry.hello(hello());
    await deliverAttempt(registry, commands, lease.leaseId);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = registry.acceptEventBatch(eventBatch(lease.leaseId, 1), async () => {
      await gate;
    });

    await Promise.resolve();
    registry.hello(hello({ runnerInstanceId: replacementInstanceId }));
    release();

    await expect(pending).rejects.toThrow('runner_lease_invalid');
    registry.dispose();
  });

  it('replays an identical event sequence acknowledgement but rejects a changed body or a sequence gap', async () => {
    const commands = new RunnerCommandQueue({ commandId: () => 'a18f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const registry = registryFor({ commands });
    const lease = registry.hello(hello());
    await deliverAttempt(registry, commands, lease.leaseId);
    const apply = vi.fn(async () => undefined);
    const first = eventBatch(lease.leaseId, 1);

    await expect(registry.acceptEventBatch(first, apply)).resolves.toEqual({ eventSeq: 1, accepted: true });
    await expect(registry.acceptEventBatch(first, apply)).resolves.toEqual({ eventSeq: 1, accepted: true });
    expect(apply).toHaveBeenCalledTimes(1);
    await expect(registry.acceptEventBatch({ ...first, events: [{ kind: 'attempt.output', attemptId, output: 'changed' }] }, apply))
      .rejects.toThrow('runner_event_replay_conflict');
    await expect(registry.acceptEventBatch(eventBatch(lease.leaseId, 3), apply))
      .rejects.toThrow('runner_event_sequence_conflict');
    registry.dispose();
  });

  it('releases successful terminal ownership so a replacement only interrupts live Attempts', async () => {
    const interrupts = vi.fn(async () => undefined);
    const commands = new RunnerCommandQueue({ commandId: () => 'b18f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const registry = registryFor({ commands, interruptAttempt: interrupts });
    const lease = registry.hello(hello());
    await deliverAttempt(registry, commands, lease.leaseId);
    const terminal: RunnerEventBatch = {
      runnerInstanceId: instanceId,
      leaseId: lease.leaseId,
      eventSeq: 1,
      events: [{ kind: 'attempt.terminal', attemptId, terminalReason: 'runtime_error' }],
    };

    await expect(registry.acceptEventBatch(terminal, async () => {
      // The production event handler terminalizes both durable state and the
      // local command state before the registry releases lease ownership.
      commands.markTerminal(attemptId);
    }))
      .resolves.toEqual({ eventSeq: 1, accepted: true });
    await expect(registry.acceptEventBatch(terminal, async () => {
      commands.markTerminal(attemptId);
    }))
      .resolves.toEqual({ eventSeq: 1, accepted: true });
    registry.hello(hello({ runnerInstanceId: replacementInstanceId }));

    expect(interrupts).not.toHaveBeenCalled();
    registry.dispose();
  });
});

function registryFor(overrides: {
  commands?: RunnerCommandQueue;
  interruptAttempt?: (attemptId: string) => Promise<void>;
} = {}): RunnerLeaseRegistry {
  return new RunnerLeaseRegistry({
    commands: overrides.commands ?? new RunnerCommandQueue({ commandId: () => '418f4eb1-9078-7a1e-9514-b19b5732f5de' }),
    interruptAttempt: overrides.interruptAttempt ?? (async () => undefined),
    leaseId: () => '518f4eb1-9078-7a1e-9514-b19b5732f5de',
  });
}

function hello(overrides: Partial<RunnerHello> = {}): RunnerHello {
  return {
    kind: 'hello',
    runnerInstanceId: instanceId,
    platform: 'macos',
    nodeMajor: 22,
    controlRevision: 'kiditem-runner-control-v1',
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
    runtimes: {
      codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
      claude_cli: { version: '2.1.241', loginVerified: true, nonPersistentSettingsVerified: true },
    },
    ...overrides,
  };
}

function eventBatch(leaseId: string, eventSeq: number): RunnerEventBatch {
  return {
    runnerInstanceId: instanceId,
    leaseId,
    eventSeq,
    events: [{ kind: 'attempt.started', attemptId }],
  };
}

function launchSpec(id = attemptId): AttemptLaunchSpec {
  return {
    attemptId: id,
    runtime: 'codex_cli',
    model: 'gpt-5',
    prompt: 'durable work',
    workspacePolicy: 'empty_ephemeral_v1',
    timeoutMs: 60_000,
    mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${id}/mcp`,
    attemptToken: randomBytes(32).toString('base64url'),
    mcpToolScope: 'business',
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
  };
}

async function deliverAttempt(registry: RunnerLeaseRegistry, commands: RunnerCommandQueue, leaseId: string) {
  registry.markReady({ runnerInstanceId: instanceId, leaseId });
  commands.enqueueStart({
    launch: launchSpec(),
    deadlineAt: new Date('2026-08-24T00:10:00.000Z'),
    leaseGeneration: registry.generationForLease({ runnerInstanceId: instanceId, leaseId }),
  });
  const batch = await registry.poll({ runnerInstanceId: instanceId, leaseId });
  return batch.commands[0] as import('@kiditem/shared/agent-runtime').RunnerStartCommand;
}

function sequenceCommandIds(): () => string {
  let sequence = 0;
  return () => `758f4eb1-9078-7a1e-9514-${String(sequence++).padStart(12, '0')}`;
}

async function settleAsync(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
