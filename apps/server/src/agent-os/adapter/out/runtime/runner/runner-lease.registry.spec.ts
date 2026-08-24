import { describe, expect, it, vi } from 'vitest';
import type { RunnerEventBatch, RunnerHello } from '@kiditem/shared/agent-runtime';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerLeaseRegistry } from './runner-lease.registry';

const instanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const replacementInstanceId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('RunnerLeaseRegistry', () => {
  it('creates a probing lease only for an exact strict hello and reuses a canonical duplicate', () => {
    const registry = registryFor();
    const first = registry.hello(hello());
    const duplicate = registry.hello(hello());

    expect(first).toMatchObject({ runnerInstanceId: instanceId, status: 'probing', leaseTtlMs: 30_000 });
    expect(duplicate).toEqual(first);
    expect(() => registry.hello({ ...hello(), platform: 'windows' })).toThrow('runner_hello_conflict');
    registry.dispose();
  });

  it('invalidates a former instance and interrupts assigned live Attempts when a new Runner arrives', () => {
    const interrupts = vi.fn(async () => undefined);
    const registry = registryFor({ interruptAttempt: interrupts });
    const prior = registry.hello(hello());
    registry.assignAttempt({ leaseId: prior.leaseId, attemptId });

    const replacement = registry.hello(hello({ runnerInstanceId: replacementInstanceId }));

    expect(replacement.runnerInstanceId).toBe(replacementInstanceId);
    expect(interrupts).toHaveBeenCalledWith(attemptId);
    expect(registry.isValid({ runnerInstanceId: instanceId, leaseId: prior.leaseId })).toBe(false);
    registry.dispose();
  });

  it('can bind the final lifecycle and token revocation hooks after registry construction', () => {
    const registry = registryFor();
    const interrupts = vi.fn(async () => undefined);
    const revokeLease = vi.fn();
    registry.setLossHandlers({ interruptAttempt: interrupts, revokeLease });
    const prior = registry.hello(hello());
    registry.assignAttempt({ leaseId: prior.leaseId, attemptId });

    registry.hello(hello({ runnerInstanceId: replacementInstanceId }));

    expect(revokeLease).toHaveBeenCalledWith(prior.leaseId);
    expect(interrupts).toHaveBeenCalledWith(attemptId);
    registry.dispose();
  });

  it('allows one outstanding poll, returns 204-equivalent null after twenty seconds, and expires the lease at thirty', async () => {
    vi.useFakeTimers();
    const interrupts = vi.fn(async () => undefined);
    const registry = registryFor({ interruptAttempt: interrupts });
    const lease = registry.hello(hello());
    registry.assignAttempt({ leaseId: lease.leaseId, attemptId });

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
    const command = commands.enqueueInterrupt({ attemptId, deadlineAt: new Date('2026-08-24T00:10:00.000Z') });

    await expect(registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId }))
      .resolves.toEqual({ commands: [command] });
    await expect(registry.poll({ runnerInstanceId: instanceId, leaseId: lease.leaseId }))
      .resolves.toEqual({ commands: [command] });
    registry.dispose();
  });

  it('replays an identical event sequence acknowledgement but rejects a changed body or a sequence gap', async () => {
    const registry = registryFor();
    const lease = registry.hello(hello());
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
