import { describe, expect, it, vi } from 'vitest';
import { AttemptTokenRegistry } from './attempt-token.registry';
import { HostRunnerAttemptExecutorService } from './host-runner-attempt-executor.service';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerLeaseRegistry } from './runner-lease.registry';

const instanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('HostRunnerAttemptExecutorService', () => {
  it('admits and queues a strict launch without spawning an API-local process or carrying a login home', async () => {
    const commands = new RunnerCommandQueue({ commandId: () => '218f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const leases = readyLease(commands);
    const admission = { assert: vi.fn(async () => undefined) };
    const prompts = { resolve: vi.fn(async () => 'resolved durable prompt') };
    const tokens = new AttemptTokenRegistry({ now: () => new Date('2026-08-24T00:00:00.000Z') });
    const executor = new HostRunnerAttemptExecutorService({
      admission,
      prompts,
      tokens,
      commands,
      leases,
      loopbackOrigin: 'http://127.0.0.1:4000',
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    });

    await executor.start({
      attemptId,
      runtime: 'codex_cli',
      profile: { model: 'gpt-5' },
      prompt: 'work',
      instructionProfileRef: 'agent-config/prompts/agents/operator.md',
      mcp: binding(),
    });

    expect(admission.assert).toHaveBeenCalledWith(binding(), 'codex_cli');
    expect(prompts.resolve).toHaveBeenCalledWith({
      reference: 'agent-config/prompts/agents/operator.md', prompt: 'work',
    });
    const [command] = commands.take().commands;
    expect(command).toMatchObject({
      kind: 'attempt.start',
      attemptId,
      launch: {
        runtime: 'codex_cli',
        model: 'gpt-5',
        prompt: 'resolved durable prompt',
        workspacePolicy: 'empty_ephemeral_v1',
        mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${attemptId}/mcp`,
        mcpProtocolRevision: '2026-07-28',
        cliContractIdentity: 'office-cli-contract-v2',
      },
    });
    expect(command?.launch).not.toHaveProperty('loginHome');
    expect(JSON.stringify(command)).not.toContain('loginHome');
    leases.dispose();
  });

  it('queues an idempotent interrupt and revokes the Attempt token before it can call MCP again', async () => {
    const commands = new RunnerCommandQueue({ commandId: () => '318f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const leases = readyLease(commands);
    const tokens = new AttemptTokenRegistry();
    const executor = new HostRunnerAttemptExecutorService({
      admission: { assert: async () => undefined },
      prompts: { resolve: async ({ prompt }: { prompt: string }) => prompt },
      tokens,
      commands,
      leases,
      loopbackOrigin: 'http://127.0.0.1:4000',
    });
    await executor.start({ attemptId, runtime: 'claude_cli', profile: { model: 'claude' }, prompt: 'work', mcp: binding() });
    const raw = (commands.take().commands[0] as { launch: { attemptToken: string } }).launch.attemptToken;

    await executor.interrupt(attemptId);
    await executor.interrupt(attemptId);

    expect(() => tokens.requireBusiness({ raw, attemptId, leaseId: '418f4eb1-9078-7a1e-9514-b19b5732f5de' })).toThrow('attempt_token_invalid');
    expect(commands.take().commands.filter((command) => command.kind === 'attempt.interrupt')).toHaveLength(1);
    leases.dispose();
  });
});

function readyLease(commands: RunnerCommandQueue): RunnerLeaseRegistry {
  const leases = new RunnerLeaseRegistry({
    commands,
    interruptAttempt: async () => undefined,
    leaseId: () => '418f4eb1-9078-7a1e-9514-b19b5732f5de',
  });
  const lease = leases.hello({
    kind: 'hello', runnerInstanceId: instanceId, platform: 'macos', nodeMajor: 22,
    controlRevision: 'kiditem-runner-control-v1', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2',
    runtimes: {
      codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
      claude_cli: { version: '2.1.241', loginVerified: true, nonPersistentSettingsVerified: true },
    },
  });
  leases.markReady({ runnerInstanceId: instanceId, leaseId: lease.leaseId });
  return leases;
}

function binding() {
  return {
    attemptId,
    sessionId: 'session-id',
    taskId: 'task-id',
    agentVersionId: 'agent-version-id',
    organizationId: 'organization-id',
    userId: 'user-id',
    capabilityKeys: ['sourcing.scrapeProductUrl'],
  };
}
