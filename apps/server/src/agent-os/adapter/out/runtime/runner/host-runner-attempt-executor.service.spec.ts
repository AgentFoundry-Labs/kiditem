import { describe, expect, it, vi } from 'vitest';
import type { RunnerInterruptCommand } from '@kiditem/shared/agent-runtime';
import type { LiveAttemptMcpBinding } from '../../../../application/port/in/capability/live-attempt-execution.capability.port';
import type { HostRunnerControlAttemptPort } from './host-runner-control-session.module';
import { HostRunnerAttemptExecutorService } from './host-runner-attempt-executor.service';

const attemptId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const now = new Date('2026-08-25T00:00:00.000Z');

describe('HostRunnerAttemptExecutorService', () => {
  it('constructs a strict token-free launch and delegates delivery ownership to the control session', async () => {
    const starts: Parameters<HostRunnerControlAttemptPort['startBusiness']>[0][] = [];
    const control = controlRecorder({ starts });
    const admission = { assert: vi.fn(async () => undefined) };
    const prompts = { resolve: vi.fn(async () => 'resolved durable prompt') };
    const executor = new HostRunnerAttemptExecutorService({
      admission,
      prompts,
      control,
      loopbackOrigin: 'http://127.0.0.1:4000',
      now: () => now,
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
    expect(starts).toEqual([expect.objectContaining({
      binding: binding(),
      deadlineAt: new Date('2026-08-25T00:30:00.000Z'),
      launch: expect.objectContaining({
        attemptId,
        runtime: 'codex_cli',
        model: 'gpt-5',
        prompt: 'resolved durable prompt',
        workspacePolicy: 'empty_ephemeral_v1',
        mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${attemptId}/mcp`,
        mcpToolScope: 'business',
        mcpProtocolRevision: '2026-07-28',
        cliContractIdentity: 'office-cli-contract-v2',
      }),
    })]);
    expect(starts[0]?.launch).not.toHaveProperty('attemptToken');
    expect(JSON.stringify(starts[0])).not.toContain('loginHome');
  });

  it('rejects an invalid start deadline before asking the session to deliver a command', async () => {
    const starts: Parameters<HostRunnerControlAttemptPort['startBusiness']>[0][] = [];
    const executor = new HostRunnerAttemptExecutorService({
      admission: { assert: async () => undefined },
      prompts: { resolve: async ({ prompt }: { prompt: string }) => prompt },
      control: controlRecorder({ starts }),
      loopbackOrigin: 'http://127.0.0.1:4000',
      now: () => now,
    });

    await expect(executor.start({
      attemptId,
      runtime: 'claude_cli',
      profile: { model: 'claude' },
      prompt: 'work',
      mcp: binding(),
      deadlineAt: new Date(now.getTime() + 999),
    })).rejects.toThrow('attempt_deadline_invalid');

    expect(starts).toEqual([]);
  });

  it('forwards cleanup interruption to the control session with the current deadline', async () => {
    const interrupts: Parameters<HostRunnerControlAttemptPort['interrupt']>[0][] = [];
    const executor = new HostRunnerAttemptExecutorService({
      admission: { assert: async () => undefined },
      prompts: { resolve: async ({ prompt }: { prompt: string }) => prompt },
      control: controlRecorder({ interrupts }),
      loopbackOrigin: 'http://127.0.0.1:4000',
      now: () => now,
    });

    await executor.interrupt(attemptId);

    expect(interrupts).toEqual([{ attemptId, deadlineAt: now }]);
  });
});

function controlRecorder(input: {
  starts?: Parameters<HostRunnerControlAttemptPort['startBusiness']>[0][];
  interrupts?: Parameters<HostRunnerControlAttemptPort['interrupt']>[0][];
}): Pick<HostRunnerControlAttemptPort, 'startBusiness' | 'interrupt'> {
  return {
    startBusiness(command) {
      input.starts?.push(command);
    },
    interrupt(command): RunnerInterruptCommand {
      input.interrupts?.push(command);
      return {
        kind: 'attempt.interrupt',
        commandId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
        attemptId: command.attemptId,
        deadlineAt: command.deadlineAt.toISOString(),
        commandHash: 'hash',
      };
    },
  };
}

function binding(): LiveAttemptMcpBinding {
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
