import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptLaunchSpec, RunnerEventBatch, RunnerHello } from '@kiditem/shared/agent-runtime';
import { AttemptTokenRegistry } from './attempt-token.registry';
import {
  HostRunnerControlSession,
  type HostRunnerControlSessionPort,
} from './host-runner-control-session.module';

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

function createFixture() {
  const work = {
    reconcile: vi.fn(async () => ({ reconciled: 0, attemptIds: [] })),
    transitionAttempt: vi.fn(async () => ({ transitioned: true })),
    finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: true, status: 'completed' })),
    transitionTask: vi.fn(async () => ({ status: 'completed' })),
    deleteTerminalSession: vi.fn(async () => ({ deleted: true })),
  };
  const capacity = { releaseAttempt: vi.fn() };
  const output = { publish: vi.fn(), finish: vi.fn() };
  const control = new HostRunnerControlSession({
    tokens: new AttemptTokenRegistry({ randomBytes, now: () => new Date('2026-08-25T00:00:00.000Z') }),
    work,
    capacity,
    output,
    loopbackOrigin: 'http://127.0.0.1:4000',
    leaseId: sequenceLeaseIds(),
    now: () => new Date('2026-08-25T00:00:00.000Z'),
  });
  return { control, work, capacity, output };
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
      claude_cli: { version: '2.1.241', loginVerified: true, nonPersistentSettingsVerified: true },
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
