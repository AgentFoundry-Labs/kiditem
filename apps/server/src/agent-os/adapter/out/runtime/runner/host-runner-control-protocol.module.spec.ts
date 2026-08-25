import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AttemptTokenRegistry } from './attempt-token.registry';
import {
  HostRunnerControlSession,
  type HostRunnerControlSessionPort,
} from './host-runner-control-session.module';
import { HostRunnerAttemptExecutorService } from './host-runner-attempt-executor.service';
import { HostRunnerAttemptControlAdapter } from './host-runner-attempt-control.adapter';
import { AgentLiveMessageService } from '../../../../application/service/work/agent-live-message.service';
import type { AttemptLaunchSpec, RunnerEventBatch, RunnerHello } from '@kiditem/shared/agent-runtime';

const runnerInstanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const replacementRunnerInstanceId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';
const deadline = new Date('2026-08-25T00:10:00.000Z');

describe('HostRunnerControlSession', () => {
  it('owns one lease, delivery/ack fencing, terminal cleanup, and readiness admission through its public interface', async () => {
    const fixture = createFixture();
    const control: HostRunnerControlSessionPort = fixture.control;
    const lease = control.http.hello(hello(runnerInstanceId));
    control.readiness.recordVerifiedCanary({
      runnerInstanceId,
      leaseId: lease.leaseId,
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      deployIdentity: '1.0.0:abc123',
    });
    control.attempts.startBusiness({
      launch: launch(attemptId),
      binding: binding(attemptId),
      deadlineAt: deadline,
    });

    const delivery = await control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId });
    expect(delivery.commands).toHaveLength(1);
    const [command] = delivery.commands;
    expect(command).toMatchObject({ kind: 'attempt.start', attemptId });

    const batch: RunnerEventBatch = {
      runnerInstanceId,
      leaseId: lease.leaseId,
      eventSeq: 1,
      events: [
        { kind: 'command_ack', commandId: command.commandId, attemptId, commandHash: command.commandHash },
        { kind: 'attempt.started', attemptId },
        {
          kind: 'attempt.terminal',
          attemptId,
          terminalReason: 'protocol_success',
          result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] },
        },
      ],
    };

    await expect(control.http.events(batch)).resolves.toEqual({ eventSeq: 1, accepted: true });
    await expect(control.http.events(batch)).resolves.toEqual({ eventSeq: 1, accepted: true });

    expect(fixture.work.transitionAttempt).toHaveBeenNthCalledWith(1, expect.objectContaining({ attemptId, from: 'starting', to: 'running' }));
    expect(fixture.work.transitionAttempt).toHaveBeenNthCalledWith(2, expect.objectContaining({ attemptId, from: 'running', to: 'succeeded' }));
    expect(fixture.work.transitionAttempt).toHaveBeenCalledTimes(2);
    expect(fixture.work.finalizeTaskFromAttempt).toHaveBeenCalledWith({ attemptId, at: expect.any(Date) });
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledWith(attemptId);
    expect(fixture.output.finish).toHaveBeenCalledWith({ attemptId, outcome: 'completed', summary: 'done' });
    expect(control.attempts.requireReady()).toEqual({ runnerInstanceId, leaseId: lease.leaseId });
    control.dispose();
  });

  it('owns loss recovery after lease replacement instead of leaving cleanup with an HTTP adapter', async () => {
    const fixture = createFixture();
    const first = fixture.control.http.hello(hello(runnerInstanceId));
    fixture.control.readiness.recordVerifiedCanary({
      runnerInstanceId,
      leaseId: first.leaseId,
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      deployIdentity: '1.0.0:abc123',
    });
    fixture.control.attempts.startBusiness({ launch: launch(attemptId), binding: binding(attemptId), deadlineAt: deadline });
    await fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: first.leaseId });

    fixture.control.http.hello(hello(replacementRunnerInstanceId));
    await settle();
    await settle();

    expect(fixture.work.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      attemptId,
      to: 'process_interrupted',
    }));
    expect(fixture.work.finalizeTaskFromAttempt).toHaveBeenCalledWith({ attemptId, at: expect.any(Date) });
    expect(fixture.capacity.releaseAttempt).toHaveBeenCalledWith(attemptId);
    fixture.control.dispose();
  });

  it('terminalizes a cancelled pre-start Attempt before a launch token or command can survive', async () => {
    vi.useFakeTimers();
    const fixture = createFixture();
    try {
      const lease = ready(fixture);
      fixture.work.transitionAttempt.mockResolvedValue({ transitioned: false });
      const executor = new HostRunnerAttemptExecutorService({
        admission: { assert: async () => undefined },
        prompts: { resolve: async ({ prompt }: { prompt: string }) => prompt },
        control: fixture.control.attempts,
        loopbackOrigin: 'http://127.0.0.1:4000',
        now: () => new Date('2026-08-25T00:00:00.000Z'),
      });

      await expect(executor.interrupt(attemptId)).resolves.toBeUndefined();

      expect(fixture.work.transitionAttempt).toHaveBeenNthCalledWith(1, expect.objectContaining({
        attemptId,
        from: 'running',
        to: 'process_interrupted',
      }));
      expect(fixture.work.transitionAttempt).toHaveBeenNthCalledWith(2, expect.objectContaining({
        attemptId,
        from: 'starting',
        to: 'process_interrupted',
      }));
      expect(fixture.work.finalizeTaskFromAttempt).toHaveBeenCalledWith({ attemptId, at: expect.any(Date) });
      expect(fixture.capacity.releaseAttempt).toHaveBeenCalledTimes(1);
      expect(fixture.tokens.size).toBe(0);
      expect(() => fixture.control.attempts.startBusiness({
        launch: launch(attemptId),
        binding: binding(attemptId),
        deadlineAt: deadline,
      })).toThrow('attempt_terminal');
      expect(fixture.tokens.size).toBe(0);

      const pending = fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId });
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(pending).resolves.toEqual({ commands: [] });
    } finally {
      fixture.control.dispose();
      vi.useRealTimers();
    }
  });

  it('keeps a started Attempt on the at-least-once interrupt command path', async () => {
    const fixture = createFixture();
    try {
      const lease = ready(fixture);
      fixture.control.attempts.startBusiness({ launch: launch(attemptId), binding: binding(attemptId), deadlineAt: deadline });

      await fixture.control.attempts.interrupt({ attemptId, deadlineAt: deadline });
      await fixture.control.attempts.interrupt({ attemptId, deadlineAt: deadline });

      await expect(fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId })).resolves.toMatchObject({
        commands: [
          { kind: 'attempt.start', attemptId },
          { kind: 'attempt.interrupt', attemptId },
        ],
      });
      expect(fixture.work.transitionAttempt).not.toHaveBeenCalled();
      expect(fixture.work.finalizeTaskFromAttempt).not.toHaveBeenCalled();
      expect(fixture.capacity.releaseAttempt).not.toHaveBeenCalled();
    } finally {
      fixture.control.dispose();
    }
  });

  it('preserves a caller-owned live-message key through service, control, and queue without coalescing a later identical turn', async () => {
    const fixture = createFixture();
    try {
      const lease = ready(fixture);
      fixture.control.attempts.startBusiness({ launch: launch(attemptId), binding: binding(attemptId), deadlineAt: deadline });
      const controls = new HostRunnerAttemptControlAdapter({
        control: fixture.control.attempts,
        now: () => new Date('2026-08-25T00:00:00.000Z'),
      });
      const messages = new AgentLiveMessageService({
        deliver: async (input) => controls.send({
          attemptId: input.attemptId,
          turnId: input.turnId,
          message: input.content,
        }),
      }, {
        loadLiveAttempt: vi.fn(async () => ({ taskStatus: 'open', live: true })),
      } as never);
      const message = {
        organizationId: 'organization-id',
        requestedByUserId: 'user-id',
        sessionId: 'session-id',
        taskId: 'task-id',
        attemptId,
        content: 'Continue with the same product.',
      };

      await messages.send({ ...message, turnId: 'logical-message-1' });
      await messages.send({ ...message, turnId: 'logical-message-1' });
      await messages.send({ ...message, turnId: 'logical-message-2' });
      await expect(messages.send({
        ...message,
        turnId: 'logical-message-1',
        content: 'Changed content for the same logical message.',
      })).rejects.toThrow('runner_input_command_conflict');

      await expect(fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId }))
        .resolves.toMatchObject({
          commands: [
            { kind: 'attempt.start', attemptId },
            { kind: 'attempt.input', attemptId, input: 'Continue with the same product.' },
            { kind: 'attempt.input', attemptId, input: 'Continue with the same product.' },
          ],
        });
    } finally {
      fixture.control.dispose();
    }
  });

  it('keeps the first start deadline when a launch adapter retries the same Attempt', async () => {
    const fixture = createFixture();
    const lease = fixture.control.http.hello(hello(runnerInstanceId));
    fixture.control.readiness.recordVerifiedCanary({
      runnerInstanceId,
      leaseId: lease.leaseId,
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      deployIdentity: '1.0.0:abc123',
    });

    fixture.control.attempts.startBusiness({ launch: launch(attemptId), binding: binding(attemptId), deadlineAt: deadline });
    fixture.control.attempts.startBusiness({
      launch: launch(attemptId),
      binding: binding(attemptId),
      deadlineAt: new Date(deadline.getTime() + 60_000),
    });

    await expect(fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId })).resolves.toMatchObject({
      commands: [{ kind: 'attempt.start', deadlineAt: deadline.toISOString() }],
    });
    fixture.control.dispose();
  });

  it('reuses one canonical business start before and after acknowledgement without duplicating delivery', async () => {
    vi.useFakeTimers();
    try {
      const fixture = createFixture();
      const lease = ready(fixture);
      const initial = { launch: launch(attemptId), binding: binding(attemptId), deadlineAt: deadline };

      fixture.control.attempts.startBusiness(initial);
      fixture.control.attempts.startBusiness({
        launch: { ...initial.launch },
        binding: { ...initial.binding, capabilityKeys: [...initial.binding.capabilityKeys] },
        deadlineAt: new Date(deadline.getTime() + 60_000),
      });

      const firstDelivery = await fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId });
      expect(firstDelivery.commands).toHaveLength(1);
      const [command] = firstDelivery.commands;
      expect(command).toMatchObject({ kind: 'attempt.start', attemptId, deadlineAt: deadline.toISOString() });

      await fixture.control.http.events({
        runnerInstanceId,
        leaseId: lease.leaseId,
        eventSeq: 1,
        events: [{ kind: 'command_ack', commandId: command.commandId, attemptId, commandHash: command.commandHash }],
      });

      fixture.control.attempts.startBusiness({
        launch: { ...initial.launch },
        binding: { ...initial.binding, capabilityKeys: [...initial.binding.capabilityKeys] },
        deadlineAt: new Date(deadline.getTime() + 120_000),
      });

      const afterAckPoll = fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId });
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(afterAckPoll).resolves.toEqual({ commands: [] });
      fixture.control.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  for (const phase of ['before acknowledgement', 'after acknowledgement'] as const) {
    it(`rejects changed launch or MCP binding ${phase}`, async () => {
      const fixture = createFixture();
      const lease = ready(fixture);
      const initial = { launch: launch(attemptId), binding: binding(attemptId), deadlineAt: deadline };
      fixture.control.attempts.startBusiness(initial);
      const [command] = (await fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId })).commands;

      if (phase === 'after acknowledgement') {
        await fixture.control.http.events({
          runnerInstanceId,
          leaseId: lease.leaseId,
          eventSeq: 1,
          events: [{ kind: 'command_ack', commandId: command.commandId, attemptId, commandHash: command.commandHash }],
        });
      }

      const changedStarts = [
        { launch: { ...initial.launch, prompt: 'Changed durable work.' }, binding: initial.binding },
        { launch: { ...initial.launch, model: 'gpt-5.6-different' }, binding: initial.binding },
        { launch: { ...initial.launch, timeoutMs: 30_000 }, binding: initial.binding },
        { launch: initial.launch, binding: { ...initial.binding, agentVersionId: 'different-agent-version-id' } },
      ];

      for (const changed of changedStarts) {
        expect(() => fixture.control.attempts.startBusiness({
          launch: changed.launch,
          binding: changed.binding,
          deadlineAt: new Date(deadline.getTime() + 60_000),
        })).toThrow('runner_start_command_conflict');
      }
      fixture.control.dispose();
    });
  }

  it('bounds replay metadata and clears it when terminal or lease-loss fencing removes the Attempt', async () => {
    const fixture = createFixture({ commandQueue: { maxEntries: 1 } });
    const lease = ready(fixture);
    fixture.control.attempts.startBusiness({ launch: launch(attemptId), binding: binding(attemptId), deadlineAt: deadline });
    await fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId });

    expect(() => fixture.control.attempts.startBusiness({
      launch: launch('318f4eb1-9078-7a1e-9514-b19b5732f5de'),
      binding: binding('318f4eb1-9078-7a1e-9514-b19b5732f5de'),
      deadlineAt: deadline,
    })).toThrow('runner_command_backpressure');

    await fixture.control.http.events({
      runnerInstanceId,
      leaseId: lease.leaseId,
      eventSeq: 1,
      events: [{
        kind: 'attempt.terminal',
        attemptId,
        terminalReason: 'protocol_success',
        result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] },
      }],
    });

    const secondAttemptId = '318f4eb1-9078-7a1e-9514-b19b5732f5de';
    fixture.control.attempts.startBusiness({
      launch: launch(secondAttemptId),
      binding: binding(secondAttemptId),
      deadlineAt: deadline,
    });
    await fixture.control.http.poll({ kind: 'poll', runnerInstanceId, leaseId: lease.leaseId });

    const replacement = fixture.control.http.hello(hello(replacementRunnerInstanceId));
    await settle();
    await settle();
    fixture.control.readiness.recordVerifiedCanary({
      runnerInstanceId: replacementRunnerInstanceId,
      leaseId: replacement.leaseId,
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      deployIdentity: '1.0.0:abc123',
    });

    expect(() => fixture.control.attempts.startBusiness({
      launch: launch(secondAttemptId),
      binding: binding(secondAttemptId),
      deadlineAt: deadline,
    })).toThrow('attempt_terminal');
    expect(() => fixture.control.attempts.startBusiness({
      launch: launch('418f4eb1-9078-7a1e-9514-b19b5732f5de'),
      binding: binding('418f4eb1-9078-7a1e-9514-b19b5732f5de'),
      deadlineAt: deadline,
    })).not.toThrow();
    fixture.control.dispose();
  });

  it('keeps legacy control primitives private to the session Module', () => {
    const publicConsumers = [
      'host-runner-attempt-executor.service.ts',
      '../attempt/agent-attempt-runtime-admission.service.ts',
      'host-runner-attempt-control.adapter.ts',
      '../../../in/http/runtime/runner-control.controller.ts',
      '../../../in/http/runtime/attempt-mcp-http.controller.ts',
      '../../../../../readiness/readiness.service.ts',
    ];

    for (const path of publicConsumers) {
      const source = readFileSync(resolve(__dirname, path), 'utf8');
      expect(source).toContain('host-runner-control-session.module');
      expect(source).not.toContain('RunnerLeaseRegistry');
      expect(source).not.toContain('RunnerCommandQueue');
      expect(source).not.toContain('RunnerEventHandlerService');
      expect(source).not.toContain('RunnerReadinessService');
      expect(source).not.toContain('RunnerAttemptRuntimeControlService');
    }
  });
});

function createFixture(overrides: Partial<Pick<ConstructorParameters<typeof HostRunnerControlSession>[0], 'commandQueue'>> = {}) {
  const work = {
    reconcile: vi.fn(async () => ({ reconciled: 0, attemptIds: [] })),
    transitionAttempt: vi.fn(async () => ({ transitioned: true })),
    finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: true, status: 'completed' })),
    transitionTask: vi.fn(async () => ({ status: 'completed' })),
    deleteTerminalSession: vi.fn(async () => ({ deleted: true })),
  };
  const capacity = { releaseAttempt: vi.fn() };
  const output = { publish: vi.fn(), finish: vi.fn() };
  const tokens = new AttemptTokenRegistry({ randomBytes, now: () => new Date('2026-08-25T00:00:00.000Z') });
  const control = new HostRunnerControlSession({
    tokens,
    work,
    capacity,
    output,
    loopbackOrigin: 'http://127.0.0.1:4000',
    leaseId: sequenceLeaseIds(),
    now: () => new Date('2026-08-25T00:00:00.000Z'),
    ...overrides,
  });
  return { control, work, capacity, output, tokens };
}

function ready(fixture: ReturnType<typeof createFixture>) {
  const lease = fixture.control.http.hello(hello(runnerInstanceId));
  fixture.control.readiness.recordVerifiedCanary({
    runnerInstanceId,
    leaseId: lease.leaseId,
    runtime: 'codex_cli',
    model: 'gpt-5.6',
    deployIdentity: '1.0.0:abc123',
  });
  return lease;
}

function hello(id: string): RunnerHello {
  return {
    kind: 'hello',
    runnerInstanceId: id,
    platform: 'macos',
    nodeMajor: 22,
    controlRevision: 'kiditem-runner-control-v1',
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
    runtimes: {
      codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
      claude_cli: { version: '2.1.245', loginVerified: true, nonPersistentSettingsVerified: true },
    },
  };
}

function launch(id: string): Omit<AttemptLaunchSpec, 'attemptToken'> {
  return {
    attemptId: id,
    runtime: 'codex_cli',
    model: 'gpt-5.6',
    prompt: 'Return a bounded result.',
    workspacePolicy: 'empty_ephemeral_v1',
    timeoutMs: 60_000,
    mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${id}/mcp`,
    mcpToolScope: 'business',
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
  };
}

function binding(id: string) {
  return {
    attemptId: id,
    organizationId: 'organization-id',
    sessionId: 'session-id',
    taskId: 'task-id',
    agentVersionId: 'agent-version-id',
    userId: 'user-id',
    capabilityKeys: [],
  };
}

function sequenceLeaseIds(): () => string {
  let index = 1;
  return () => `318f4eb1-9078-7a1e-9514-b19b5732f5${(index++).toString(16).padStart(2, '0')}`;
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
