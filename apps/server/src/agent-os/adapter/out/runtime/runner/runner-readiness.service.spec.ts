import { describe, expect, it } from 'vitest';
import { AttemptTokenRegistry } from './attempt-token.registry';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerLeaseRegistry } from './runner-lease.registry';
import { RunnerReadinessService } from './runner-readiness.service';

const runnerInstanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const canaryId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('RunnerReadinessService', () => {
  it('promotes Claude only after the live second input is acknowledged, the terminal result is strict, and its readiness token is revoked', async () => {
    const commands = new RunnerCommandQueue({ commandId: sequenceIds() });
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => canaryId,
      nonce: () => '51e975ef-c0a7-4ab1-8007-47c0fd563505',
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    } as never);
    const lease = leases.hello(hello());
    readiness.beginCanary({ runtime: 'claude_cli', model: 'claude-4', deployIdentity: '3.4.5:abc123' });
    const start = commands.take().commands[0] as { launch: { attemptToken: string } };

    readiness.handleRunnerEvent({ kind: 'attempt.started', attemptId: canaryId });
    readiness.canaryMcpBinding({ canaryId, leaseId: lease.leaseId }).onProbe({ nonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505' });
    const input = commands.take().commands.find((command) => command.kind === 'attempt.input')!;
    readiness.handleRunnerEvent({
      kind: 'command_ack',
      commandId: input.commandId,
      attemptId: canaryId,
      commandHash: input.commandHash,
    });
    readiness.handleRunnerEvent({
      kind: 'attempt.terminal',
      attemptId: canaryId,
      terminalReason: 'protocol_success',
      result: { outcome: 'completed', summary: 'canary complete', resourceRefs: [], operationRefs: [] },
    });

    await expect(readiness.assertRuntime('claude_cli', 'claude-4', '3.4.5:abc123')).resolves.toBeUndefined();
    expect(() => tokens.requireReadiness({ raw: start.launch.attemptToken, canaryId, leaseId: lease.leaseId }))
      .toThrow('attempt_token_invalid');
    expect(leases.requireReady()).toEqual({ runnerInstanceId, leaseId: lease.leaseId });
    leases.dispose();
  });

  it('promotes Codex from the direct probe and immediate strict result without a live input command', async () => {
    const commands = new RunnerCommandQueue({ commandId: sequenceIds() });
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => canaryId,
      nonce: () => '51e975ef-c0a7-4ab1-8007-47c0fd563505',
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    } as never);
    const lease = leases.hello(hello());
    readiness.beginCanary({ runtime: 'codex_cli', model: 'gpt-5', deployIdentity: '3.4.5:abc123' });
    const start = commands.take().commands[0] as { launch: { attemptToken: string } };

    readiness.handleRunnerEvent({ kind: 'attempt.started', attemptId: canaryId });
    readiness.canaryMcpBinding({ canaryId, leaseId: lease.leaseId }).onProbe({ nonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505' });

    expect(commands.take().commands).toEqual([
      expect.objectContaining({ kind: 'attempt.start', attemptId: canaryId }),
    ]);
    readiness.handleRunnerEvent({
      kind: 'attempt.terminal',
      attemptId: canaryId,
      terminalReason: 'protocol_success',
      result: { outcome: 'completed', summary: 'canary complete', resourceRefs: [], operationRefs: [] },
    });

    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', '3.4.5:abc123')).resolves.toBeUndefined();
    expect(() => tokens.requireReadiness({ raw: start.launch.attemptToken, canaryId, leaseId: lease.leaseId }))
      .toThrow('attempt_token_invalid');
    leases.dispose();
  });

  it('rejects a Claude terminal before its live input acknowledgement', async () => {
    const commands = new RunnerCommandQueue({ commandId: sequenceIds() });
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => canaryId,
      nonce: () => '51e975ef-c0a7-4ab1-8007-47c0fd563505',
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    } as never);
    const lease = leases.hello(hello());
    readiness.beginCanary({ runtime: 'claude_cli', model: 'claude-4', deployIdentity: '3.4.5:abc123' });

    readiness.handleRunnerEvent({ kind: 'attempt.started', attemptId: canaryId });
    readiness.canaryMcpBinding({ canaryId, leaseId: lease.leaseId }).onProbe({ nonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505' });
    expect(commands.take().commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'attempt.input', attemptId: canaryId }),
    ]));
    readiness.handleRunnerEvent({
      kind: 'attempt.terminal',
      attemptId: canaryId,
      terminalReason: 'protocol_success',
      result: { outcome: 'completed', summary: 'too early', resourceRefs: [], operationRefs: [] },
    });

    await expect(readiness.assertRuntime('claude_cli', 'claude-4', '3.4.5:abc123')).rejects.toThrow('runner_not_ready');
    leases.dispose();
  });

  it('removes a previously ready lease and every verified runtime when a later readiness canary fails', async () => {
    const failedCanaryId = '418f4eb1-9078-7a1e-9514-b19b5732f5de';
    const commands = new RunnerCommandQueue({ commandId: sequenceIds() });
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const ids = [canaryId, failedCanaryId];
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => ids.shift()!,
      nonce: () => '51e975ef-c0a7-4ab1-8007-47c0fd563505',
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    } as never);
    const lease = leases.hello(hello());
    readiness.beginCanary({ runtime: 'codex_cli', model: 'gpt-5', deployIdentity: '3.4.5:abc123' });
    const firstToken = ((commands.take().commands[0] as { launch: { attemptToken: string } }).launch.attemptToken);
    readiness.handleRunnerEvent({ kind: 'attempt.started', attemptId: canaryId });
    readiness.canaryMcpBinding({ canaryId, leaseId: lease.leaseId }).onProbe({ nonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505' });
    readiness.handleRunnerEvent({
      kind: 'attempt.terminal',
      attemptId: canaryId,
      terminalReason: 'protocol_success',
      result: { outcome: 'completed', summary: 'ready', resourceRefs: [], operationRefs: [] },
    });
    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', '3.4.5:abc123')).resolves.toBeUndefined();

    readiness.beginCanary({ runtime: 'claude_cli', model: 'claude-4', deployIdentity: '3.4.5:abc123' });
    const failedStart = commands.take().commands.find((command) => command.attemptId === failedCanaryId) as { launch: { attemptToken: string } };
    readiness.handleRunnerEvent({ kind: 'attempt.started', attemptId: failedCanaryId });
    readiness.handleRunnerEvent({
      kind: 'attempt.terminal',
      attemptId: failedCanaryId,
      terminalReason: 'runtime_error',
    });

    expect(() => leases.requireReady()).toThrow('runner_not_ready');
    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', '3.4.5:abc123')).rejects.toThrow('runner_not_ready');
    expect(() => tokens.requireReadiness({ raw: failedStart.launch.attemptToken, canaryId: failedCanaryId, leaseId: lease.leaseId }))
      .toThrow('attempt_token_invalid');
    expect(() => tokens.requireReadiness({ raw: firstToken, canaryId, leaseId: lease.leaseId }))
      .toThrow('attempt_token_invalid');
    leases.dispose();
  });

  it('binds Codex to its request-scoped MCP callback without queuing a live input', () => {
    const commands = new RunnerCommandQueue({ commandId: sequenceIds() });
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => canaryId,
      nonce: () => '51e975ef-c0a7-4ab1-8007-47c0fd563505',
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    } as never);
    const lease = leases.hello(hello());
    readiness.beginCanary({ runtime: 'codex_cli', model: 'gpt-5', deployIdentity: '3.4.5:abc123' });

    const binding = readiness.canaryMcpBinding({ canaryId, leaseId: lease.leaseId });

    expect(binding.nonce).toBe('51e975ef-c0a7-4ab1-8007-47c0fd563505');
    expect(() => readiness.canaryMcpBinding({ canaryId, leaseId: '318f4eb1-9078-7a1e-9514-b19b5732f5de' }))
      .toThrow('readiness_canary_invalid');
    binding.onProbe({ nonce: binding.nonce });
    expect(commands.take().commands).toHaveLength(1);
    leases.dispose();
  });

  it('queues the live second input only for Claude after the scoped canary tool proves its exact nonce', () => {
    const commands = new RunnerCommandQueue({ commandId: sequenceIds() });
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => canaryId,
      nonce: () => '51e975ef-c0a7-4ab1-8007-47c0fd563505',
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    } as never);
    leases.hello(hello());
    readiness.beginCanary({ runtime: 'claude_cli', model: 'claude-4', deployIdentity: '3.4.5:abc123' });

    expect(commands.take().commands).toHaveLength(1);
    expect(() => readiness.acceptCanaryProbe({ canaryId, nonce: '0b2327bb-cd8b-4f4c-8fa5-142760734c30' }))
      .toThrow('readiness_canary_invalid');
    expect(commands.take().commands).toHaveLength(1);

    readiness.acceptCanaryProbe({ canaryId, nonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505' });
    readiness.acceptCanaryProbe({ canaryId, nonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505' });

    expect(commands.take().commands).toMatchObject([
      { kind: 'attempt.start', attemptId: canaryId },
      { kind: 'attempt.input', attemptId: canaryId, input: expect.stringContaining('AgentResultEnvelope') },
    ]);
    leases.dispose();
  });

  it('uses the minimal tool-free provider prompt for Codex but retains the live model-selected probe for Claude', () => {
    const commands = new RunnerCommandQueue({ commandId: sequenceIds() });
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const ids = [canaryId, '318f4eb1-9078-7a1e-9514-b19b5732f5de'];
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => ids.shift()!,
      nonce: () => '51e975ef-c0a7-4ab1-8007-47c0fd563505',
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    } as never);
    leases.hello(hello());

    readiness.beginCanary({ runtime: 'codex_cli', model: 'gpt-5', deployIdentity: '3.4.5:abc123' });
    readiness.beginCanary({ runtime: 'claude_cli', model: 'claude-4', deployIdentity: '3.4.5:abc123' });
    const starts = commands.take().commands.filter((command) => command.kind === 'attempt.start');
    const codex = starts.find((command) => command.launch.runtime === 'codex_cli')!;
    const claude = starts.find((command) => command.launch.runtime === 'claude_cli')!;

    expect(codex.launch.prompt).toBe('Return only a valid AgentResultEnvelope JSON object. Do not call any MCP tool.');
    expect(codex.launch.prompt).not.toMatch(/readiness|nonce/i);
    expect(claude.launch.prompt).toContain('Use the readiness_probe MCP tool exactly once');
    expect(claude.launch.prompt).toContain('nonce 51e975ef-c0a7-4ab1-8007-47c0fd563505');
    expect(claude.launch.prompt).toContain('wait for one subsequent live user input');
    leases.dispose();
  });

  it('queues an ordinary synthetic start with a readiness-only token while its strict lease is probing', () => {
    const commands = new RunnerCommandQueue({ commandId: () => '318f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => canaryId,
      nonce: () => '51e975ef-c0a7-4ab1-8007-47c0fd563505',
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    } as never);
    const lease = leases.hello(hello());

    const canary = readiness.beginCanary({
      runtime: 'codex_cli',
      model: 'gpt-5',
      deployIdentity: '3.4.5:abc123',
    });
    const [command] = commands.take().commands;

    expect(canary).toEqual({ canaryId });
    expect(command).toMatchObject({
      kind: 'attempt.start',
      attemptId: canaryId,
      launch: {
        attemptId: canaryId,
        runtime: 'codex_cli',
        model: 'gpt-5',
        workspacePolicy: 'empty_ephemeral_v1',
        mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${canaryId}/mcp`,
        mcpToolScope: 'readiness_canary',
        readinessProbeNonce: '51e975ef-c0a7-4ab1-8007-47c0fd563505',
        mcpProtocolRevision: '2026-07-28',
        cliContractIdentity: 'office-cli-contract-v2',
      },
    });
    const raw = (command as { launch: { attemptToken: string } }).launch.attemptToken;
    expect(tokens.requireReadiness({ raw, canaryId, leaseId: lease.leaseId })).toEqual({ canaryId });
    expect(() => tokens.requireBusiness({ raw, attemptId: canaryId, leaseId: lease.leaseId })).toThrow('attempt_token_invalid');
    expect(() => leases.requireReady()).toThrow('runner_not_ready');
    leases.dispose();
  });

  it('revoke only the failed readiness token when enqueueing its synthetic start fails', () => {
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const leases = new RunnerLeaseRegistry({
      commands: new RunnerCommandQueue(),
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = new RunnerReadinessService({
      leases,
      commands: {
        enqueueStart: () => { throw new Error('runner_command_backpressure'); },
        enqueueInput: () => { throw new Error('unexpected_live_input'); },
      },
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => canaryId,
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    } as never);
    const lease = leases.hello(hello());
    const business = tokens.issueBusiness({
      leaseId: lease.leaseId,
      deadline: new Date('2026-08-24T00:10:00.000Z'),
      binding: {
        attemptId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        sessionId: 'session-id',
        taskId: 'task-id',
        agentVersionId: 'agent-version-id',
        organizationId: 'organization-id',
        userId: 'user-id',
        capabilityKeys: [],
      },
    });

    expect(() => readiness.beginCanary({ runtime: 'codex_cli', model: 'gpt-5', deployIdentity: '3.4.5:abc123' }))
      .toThrow('runner_command_backpressure');

    expect(tokens.requireBusiness({
      raw: business.raw,
      attemptId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
      leaseId: lease.leaseId,
    })).toMatchObject({ attemptId: '318f4eb1-9078-7a1e-9514-b19b5732f5de' });
    expect(tokens.size).toBe(1);
    leases.dispose();
  });

  it('reports only bounded verified Runner facts after canary promotion', () => {
    const leases = new RunnerLeaseRegistry({
      commands: new RunnerCommandQueue(),
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = projectionReadiness(leases);
    const lease = leases.hello(hello());
    readiness.recordVerifiedCanary({
      runnerInstanceId,
      leaseId: lease.leaseId,
      runtime: 'codex_cli',
      model: 'gpt-5',
      deployIdentity: '3.4.5:abc123',
    });

    const facts = readiness.snapshot();

    expect(facts).toEqual({
      runnerInstanceId,
      platform: 'macos',
      nodeMajor: 22,
      controlRevision: 'kiditem-runner-control-v1',
      cliContractIdentity: 'office-cli-contract-v2',
      mcpProtocolRevision: '2026-07-28',
      runtimes: {
        codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
        claude_cli: { version: '2.1.245', loginVerified: true, nonPersistentSettingsVerified: true },
      },
    });
    expect(JSON.stringify(facts)).not.toMatch(/token|path|credential/i);
    leases.dispose();
  });

  it('promotes a strict probing lease only when its verified canary is recorded', async () => {
    const leases = new RunnerLeaseRegistry({
      commands: new RunnerCommandQueue(),
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = projectionReadiness(leases);
    const lease = leases.hello(hello());

    expect(lease.status).toBe('probing');
    expect(() => leases.requireReady()).toThrow('runner_not_ready');

    readiness.recordVerifiedCanary({
      runnerInstanceId,
      leaseId: lease.leaseId,
      runtime: 'codex_cli',
      model: 'gpt-5',
      deployIdentity: '3.4.5:abc123',
    });

    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', '3.4.5:abc123')).resolves.toBeUndefined();
    leases.dispose();
  });

  it('does not admit an exact runtime/model/deploy tuple from a generic ready lease alone', async () => {
    const leases = new RunnerLeaseRegistry({
      commands: new RunnerCommandQueue(),
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = projectionReadiness(leases);
    const lease = leases.hello(hello());
    leases.markReady({ runnerInstanceId, leaseId: lease.leaseId });

    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', '3.4.5:abc123'))
      .rejects.toThrow('runner_not_ready');

    readiness.recordVerifiedCanary({
      runnerInstanceId,
      leaseId: lease.leaseId,
      runtime: 'codex_cli',
      model: 'gpt-5',
      deployIdentity: '3.4.5:abc123',
    });

    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', '3.4.5:abc123')).resolves.toBeUndefined();
    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', '3.4.5:different'))
      .rejects.toThrow('runner_not_ready');

    leases.dispose();
  });

  it('projects only a ready strict Runner hello and never probes a provider from the API', async () => {
    const leases = new RunnerLeaseRegistry({
      commands: new RunnerCommandQueue(),
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = projectionReadiness(leases);

    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', 'deploy')).rejects.toThrow('runner_not_ready');
    const lease = leases.hello(hello());
    leases.markReady({ runnerInstanceId, leaseId: lease.leaseId });
    readiness.recordVerifiedCanary({
      runnerInstanceId,
      leaseId: lease.leaseId,
      runtime: 'codex_cli',
      model: 'gpt-5',
      deployIdentity: 'deploy',
    });

    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', 'deploy')).resolves.toBeUndefined();
    leases.dispose();
  });
});

function hello() {
  return {
    kind: 'hello' as const,
    runnerInstanceId,
    platform: 'macos' as const,
    nodeMajor: 22 as const,
    controlRevision: 'kiditem-runner-control-v1' as const,
    mcpProtocolRevision: '2026-07-28' as const,
    cliContractIdentity: 'office-cli-contract-v2' as const,
    runtimes: {
      codex_cli: { version: '0.149.1' as const, loginVerified: true as const, nonPersistentSettingsVerified: true as const },
      claude_cli: { version: '2.1.245' as const, loginVerified: true as const, nonPersistentSettingsVerified: true as const },
    },
  };
}

function projectionReadiness(leases: RunnerLeaseRegistry): RunnerReadinessService {
  return new RunnerReadinessService({
    leases,
    commands: new RunnerCommandQueue(),
    tokens: new AttemptTokenRegistry(),
    loopbackOrigin: 'http://127.0.0.1:4000',
  });
}

function sequenceIds(): () => string {
  let sequence = 0;
  return () => `318f4eb1-9078-7a1e-9514-${String(sequence++).padStart(12, '0')}`;
}
