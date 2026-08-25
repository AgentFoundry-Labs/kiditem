import { describe, expect, it, vi } from 'vitest';
import { AgentWorkIntakeModule, createAgentWorkIntake } from './agent-work-intake.module';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { LiveAttemptOutputChannel } from '../../../adapter/out/runtime/attempt/live-attempt-output-channel';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';

const principal = {
  organizationId: '018f4eb1-9078-7a1e-9514-b19b5732f5de',
  userId: '118f4eb1-9078-7a1e-9514-b19b5732f5de',
};

type AgentVersionFixture = {
  id: string;
  agentDefinitionKey: string;
  runtimeType: string;
  capabilityKeys: string[];
  instructionProfileRef: string;
};

describe('AgentWorkIntakeModule', () => {
  it('exposes a pure composition factory for the root provider token', () => {
    const intake = createAgentWorkIntake(
      { activeVersion: vi.fn() } as never,
      { root: vi.fn(), followUp: vi.fn() } as never,
      { start: vi.fn() } as never,
      { send: vi.fn() } as never,
      { bind: vi.fn(), closeUnboundOutput: vi.fn() } as never,
    );

    expect(intake).toBeInstanceOf(AgentWorkIntakeModule);
  });

  it('resolves the active version and launches only after durable root admission', async () => {
    const steps: string[] = [];
    const queries = {
      activeVersion: vi.fn(async () => version()),
    };
    const commands = {
      root: vi.fn(async () => {
        steps.push('durable-root');
        return rootAdmission();
      }),
    };
    const launch = {
      start: vi.fn(async () => {
        steps.push('launch');
      }),
    };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      { send: vi.fn() } as never,
      { bind: vi.fn(), closeUnboundOutput: vi.fn() } as never,
    );

    await expect(intake.startRoot({
      principal,
      objective: 'Research backpacks',
    })).resolves.toMatchObject({ attempt: { id: '418f4eb1-9078-7a1e-9514-b19b5732f5de' } });

    expect(steps).toEqual(['durable-root', 'launch']);
    expect(commands.root).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: principal.organizationId,
      createdByUserId: principal.userId,
      cliVersion: '0.149.1',
      reportedModel: 'gpt-5',
      input: { prompt: 'Research backpacks' },
    }));
    expect(launch.start).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
      runtime: 'codex_cli',
      profile: { model: 'gpt-5' },
      prompt: 'Research backpacks',
      organizationId: principal.organizationId,
      userId: principal.userId,
    }));
  });

  it('starts the explicitly selected code-owned Agent definition with Copilot live output', async () => {
    const queries = {
      activeVersion: vi.fn(async () => version({
        agentDefinitionKey: 'sourcing',
        capabilityKeys: ['sourcing.scrapeProductUrl'],
        instructionProfileRef: 'agent-config/prompts/agents/sourcing.md',
      })),
      threadContinuation: vi.fn(async () => null),
    };
    const commands = { root: vi.fn(async () => rootAdmission()) };
    const launch = { start: vi.fn(async () => undefined) };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      { send: vi.fn() } as never,
      { bind: vi.fn() } as never,
    );

    await intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Find a product source',
      messageCommandKey: 'message-root-1',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-1' },
    });

    expect(queries.activeVersion).toHaveBeenCalledWith('sourcing');
    expect(commands.root).toHaveBeenCalledWith(expect.objectContaining({
      assignedAgentVersionId: '618f4eb1-9078-7a1e-9514-b19b5732f5de',
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      reportedModel: 'gpt-5.6',
      input: {
        prompt: 'Find a product source',
        rootAdmission: rootAdmissionReceipt('Find a product source', 'message-root-1'),
      },
    }));
    expect(launch.start).toHaveBeenCalledWith(expect.objectContaining({
      runtime: 'codex_cli',
      profile: { model: 'gpt-5.6' },
      instructionProfileRef: 'agent-config/prompts/agents/sourcing.md',
      capabilityKeys: ['sourcing.scrapeProductUrl'],
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-1' },
    }));
  });

  it('rebinds an exact durable root admission instead of injecting its initial prompt into the live Attempt', async () => {
    const receipt = rootAdmissionReceipt('Find a product source', 'message-root-replay-1');
    const live = { send: vi.fn() };
    const output = { bind: vi.fn(), closeUnboundOutput: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: false,
        agentDefinitionKey: 'sourcing',
        rootAdmission: {
          attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
          taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
          terminal: false,
          ...receipt,
        },
      })),
    };
    const commands = { root: vi.fn(), followUp: vi.fn() };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Find a product source',
      messageCommandKey: 'message-root-replay-1',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'retry-root-run' },
    })).resolves.toEqual({
      kind: 'root',
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
    });

    expect(output.bind).toHaveBeenCalledWith({
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
      threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      runId: 'retry-root-run',
    });
    expect(live.send).not.toHaveBeenCalled();
    expect(commands.root).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('returns the immutable first root receipt after explicit Continue instead of binding the newer Attempt', async () => {
    const receipt = rootAdmissionReceipt('Find a product source', 'message-root-after-continue-1');
    const live = { send: vi.fn() };
    const output = { bind: vi.fn(), closeUnboundOutput: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '518f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: false,
        agentDefinitionKey: 'sourcing',
        rootAdmission: {
          attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
          taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
          terminal: true,
          ...receipt,
        },
      })),
    };
    const commands = { root: vi.fn(), followUp: vi.fn() };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Find a product source',
      messageCommandKey: 'message-root-after-continue-1',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'root-after-continue-retry' },
    })).resolves.toEqual({
      kind: 'root',
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
    });

    expect(output.bind).not.toHaveBeenCalled();
    expect(output.closeUnboundOutput).toHaveBeenCalledWith({
      threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      runId: 'root-after-continue-retry',
    });
    expect(live.send).not.toHaveBeenCalled();
    expect(commands.root).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('rejects same-key root replay drift instead of routing it as a live input', async () => {
    const live = { send: vi.fn() };
    const output = { bind: vi.fn(), closeUnboundOutput: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: false,
        agentDefinitionKey: 'sourcing',
        rootAdmission: {
          attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
          taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
          terminal: false,
          ...rootAdmissionReceipt('Original prompt', 'message-root-replay-1'),
        },
      })),
    };
    const commands = { root: vi.fn(), followUp: vi.fn() };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Changed prompt',
      messageCommandKey: 'message-root-replay-1',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'retry-root-run' },
    })).rejects.toMatchObject({ code: 'root_admission_replay_conflict' });

    expect(live.send).not.toHaveBeenCalled();
    expect(commands.root).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('coalesces concurrent exact root starts before a second durable admission and rebinds the follower output', async () => {
    const receipt = rootAdmissionReceipt('Find a product source', 'message-root-concurrent-1');
    let durableRootVisible = false;
    const existing = {
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
      predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
      terminal: false,
      agentDefinitionKey: 'sourcing',
      rootAdmission: {
        attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: false,
        ...receipt,
      },
    };
    const live = { send: vi.fn() };
    const output = { bind: vi.fn(), closeUnboundOutput: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => durableRootVisible ? existing : null),
      activeVersion: vi.fn(async () => version({
        agentDefinitionKey: 'sourcing',
        capabilityKeys: ['sourcing.scrapeProductUrl'],
        instructionProfileRef: 'agent-config/prompts/agents/sourcing.md',
      })),
    };
    const rootEntered = deferred<void>();
    const releaseRoot = deferred<ReturnType<typeof rootAdmission>>();
    const commands = {
      root: vi.fn(async () => {
        rootEntered.resolve();
        return releaseRoot.promise;
      }),
      followUp: vi.fn(),
    };
    const launch = { start: vi.fn(async () => undefined) };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );
    const input = {
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Find a product source',
      messageCommandKey: 'message-root-concurrent-1',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'root-run-1' },
    };

    const leader = intake.startThread(input);
    await rootEntered.promise;
    const follower = intake.startThread({ ...input, output: { ...input.output, runId: 'root-run-2' } });
    durableRootVisible = true;
    releaseRoot.resolve(rootAdmission());
    const results = await Promise.all([leader, follower]);

    expect(results).toEqual([
      expect.objectContaining({ kind: 'root', attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de' }),
      expect.objectContaining({ kind: 'root', attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de' }),
    ]);
    expect(commands.root).toHaveBeenCalledTimes(1);
    expect(launch.start).toHaveBeenCalledTimes(1);
    expect(output.bind).toHaveBeenCalledWith({
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
      threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      runId: 'root-run-2',
    });
    expect(live.send).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
  });

  it('fails closed when a root uniqueness collision cannot yet read its durable receipt', async () => {
    const live = { send: vi.fn() };
    const output = { bind: vi.fn(), closeUnboundOutput: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => null),
      activeVersion: vi.fn(async () => version({
        agentDefinitionKey: 'sourcing',
        capabilityKeys: ['sourcing.scrapeProductUrl'],
        instructionProfileRef: 'agent-config/prompts/agents/sourcing.md',
      })),
    };
    const commands = {
      root: vi.fn(async () => { throw new AgentOsRuntimeError('root_task_already_exists'); }),
      followUp: vi.fn(),
    };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Find a product source',
      messageCommandKey: 'message-root-late-read-1',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'late-root-run' },
    })).rejects.toMatchObject({ code: 'root_task_already_exists' });

    expect(live.send).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('closes only the retry output when an exact root admission is already terminal', async () => {
    const receipt = rootAdmissionReceipt('Find a product source', 'message-root-terminal-1');
    const live = { send: vi.fn() };
    const output = { bind: vi.fn(), closeUnboundOutput: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: true,
        agentDefinitionKey: 'sourcing',
        rootAdmission: {
          attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
          taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
          terminal: true,
          ...receipt,
        },
      })),
    };
    const commands = { root: vi.fn(), followUp: vi.fn() };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Find a product source',
      messageCommandKey: 'message-root-terminal-1',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'terminal-root-retry' },
    })).resolves.toMatchObject({
      kind: 'root',
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
    });

    expect(output.bind).not.toHaveBeenCalled();
    expect(output.closeUnboundOutput).toHaveBeenCalledWith({
      threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      runId: 'terminal-root-retry',
    });
    expect(live.send).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('resolves the task immutable AgentVersion before a REST follow-up and finalizes its exact launch context', async () => {
    const queries = {
      activeVersion: vi.fn(),
      taskVersion: vi.fn(async () => version({
        agentDefinitionKey: 'sourcing',
        runtimeType: 'claude_cli',
        capabilityKeys: ['sourcing.scrapeProductUrl'],
        instructionProfileRef: 'agent-config/prompts/agents/sourcing.md',
      })),
      continuationContext: vi.fn(async () => ({
        prompt: 'bounded durable continuation',
        input: { prompt: 'Continue', resourceRefs: [], operationRefs: [] },
      })),
    };
    const commands = {
      followUp: vi.fn(async () => ({
        attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        ordinal: 2,
      })),
    };
    const launch = { start: vi.fn(async () => undefined) };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      { ...runtimeEnvironment(), AGENT_SOURCING_MODEL: 'claude-source' },
      { send: vi.fn() } as never,
      { bind: vi.fn() } as never,
    );

    await intake.continue({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
      predecessorAttemptId: '518f4eb1-9078-7a1e-9514-b19b5732f5de',
      prompt: 'Continue',
    });

    expect(queries.activeVersion).not.toHaveBeenCalled();
    expect(queries.taskVersion).toHaveBeenCalledWith({
      organizationId: principal.organizationId,
      userId: principal.userId,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    expect(commands.followUp).toHaveBeenCalledWith(expect.objectContaining({
      cliVersion: '2.1.245',
      reportedModel: 'claude-source',
      input: { prompt: 'Continue', resourceRefs: [], operationRefs: [] },
    }));
    expect(launch.start).toHaveBeenCalledWith(expect.objectContaining({
      runtime: 'claude_cli',
      profile: { model: 'claude-source' },
      prompt: 'bounded durable continuation',
      instructionProfileRef: 'agent-config/prompts/agents/sourcing.md',
    }));
  });

  it('rejects a new terminal-thread message instead of creating or launching another Attempt', async () => {
    const queries = {
      activeVersion: vi.fn(async () => version()),
      taskVersion: vi.fn(async () => version({ runtimeType: 'claude_cli' })),
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '518f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: true,
        agentDefinitionKey: 'operator',
      })),
      continuationContext: vi.fn(async () => ({
        prompt: 'bounded explicit Continue prompt',
        input: { prompt: 'Continue', resourceRefs: [], operationRefs: [] },
      })),
    };
    const commands = {
      root: vi.fn(async () => { throw new AgentOsRuntimeError('root_task_already_exists'); }),
      followUp: vi.fn(async () => ({
        attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        ordinal: 2,
      })),
    };
    const launch = { start: vi.fn(async () => undefined) };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      { send: vi.fn() } as never,
      { bind: vi.fn(), closeUnboundOutput: vi.fn() } as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'operator',
      prompt: 'Continue',
      messageCommandKey: 'message-terminal-1',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-2' },
    })).rejects.toMatchObject({ code: 'agent_thread_terminal' });

    expect(queries.threadContinuation).toHaveBeenCalledWith({
      organizationId: principal.organizationId,
      userId: principal.userId,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    expect(queries.taskVersion).not.toHaveBeenCalled();
    expect(queries.continuationContext).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('rejects an arbitrary Agent definition before it can query, admit, or launch', async () => {
    const queries = { activeVersion: vi.fn() };
    const commands = { root: vi.fn() };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      { send: vi.fn() } as never,
      { bind: vi.fn() } as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'arbitrary',
      prompt: 'Do not admit this',
    })).rejects.toMatchObject({ code: 'agent_definition_not_supported' });

    expect(queries.activeVersion).not.toHaveBeenCalled();
    expect(commands.root).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('does not launch when the readiness-owning durable admission rejects', async () => {
    const queries = { activeVersion: vi.fn(async () => version()) };
    const commands = { root: vi.fn(async () => { throw new Error('runner_not_ready'); }) };
    const launch = { start: vi.fn(async () => undefined) };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      { send: vi.fn() } as never,
      { bind: vi.fn() } as never,
    );

    await expect(intake.startRoot({ principal, objective: 'Research backpacks' }))
      .rejects.toThrow('runner_not_ready');

    expect(launch.start).not.toHaveBeenCalled();
  });

  it('routes an owned live thread prompt into its exact Attempt without admitting new work', async () => {
    const live = { send: vi.fn(async () => undefined) };
    const output = { bind: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: false,
        agentDefinitionKey: 'sourcing',
      })),
    };
    const commands = { root: vi.fn(), followUp: vi.fn() };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Narrow this to ergonomic school bags',
      messageCommandKey: 'message-live-2',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-live-2' },
    })).resolves.toEqual({
      kind: 'live_input',
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
    });

    expect(queries.threadContinuation).toHaveBeenCalledWith({
      organizationId: principal.organizationId,
      userId: principal.userId,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    expect(live.send).toHaveBeenCalledWith({
      organizationId: principal.organizationId,
      requestedByUserId: principal.userId,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
      content: 'Narrow this to ergonomic school bags',
      turnId: 'message-live-2',
    });
    expect(output.bind).toHaveBeenCalledWith({
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
      threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      runId: 'run-live-2',
    });
    expect(commands.root).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('does not acknowledge or rebind a live thread when the exact Attempt input cannot be enqueued', async () => {
    const live = { send: vi.fn(async () => { throw new Error('runner_not_ready'); }) };
    const output = { bind: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: false,
        agentDefinitionKey: 'sourcing',
      })),
    };
    const commands = { root: vi.fn(), followUp: vi.fn() };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Continue safely',
      messageCommandKey: 'message-live-failure',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-live-failure' },
    })).rejects.toThrow('runner_not_ready');

    expect(output.bind).not.toHaveBeenCalled();
    expect(commands.root).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('reports a just-terminal live Attempt without admitting or launching another Attempt', async () => {
    const live = { send: vi.fn(async () => { throw new AgentOsRuntimeError('attempt_not_live'); }) };
    const output = { bind: vi.fn(), closeUnboundOutput: vi.fn() };
    const queries = {
      threadContinuation: vi.fn()
        .mockResolvedValueOnce({
          taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
          predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
          terminal: false,
          agentDefinitionKey: 'sourcing',
        })
        .mockResolvedValueOnce({
          taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
          predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
          terminal: true,
          agentDefinitionKey: 'sourcing',
        }),
    };
    const commands = {
      root: vi.fn(),
      followUp: vi.fn(),
    };
    const launch = { start: vi.fn(async () => undefined) };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Continue safely',
      messageCommandKey: 'message-after-terminal-race',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-after-terminal-race' },
    })).rejects.toMatchObject({ code: 'agent_thread_terminal' });

    expect(live.send).toHaveBeenCalledTimes(1);
    expect(output.bind).not.toHaveBeenCalled();
    expect(output.closeUnboundOutput).toHaveBeenCalledWith({
      threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      runId: 'run-after-terminal-race',
    });
    expect(commands.root).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('keeps a queue-accepted message as one live admission when terminalization wins before output rebind', async () => {
    const output = new LiveAttemptOutputChannel();
    const live = {
      send: vi.fn(async () => {
        // The Runner accepted attempt.input, then its terminal event wins
        // before intake can bind this Copilot run to the old Attempt.
        output.finish({
          attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
          outcome: 'completed',
        });
      }),
    };
    const queries = {
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: false,
        agentDefinitionKey: 'sourcing',
      })),
    };
    const commands = {
      root: vi.fn(),
      followUp: vi.fn(),
    };
    const launch = { start: vi.fn(async () => undefined) };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output,
    );
    let lateOutputCompleted = false;
    output.stream({
      threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      runId: 'run-terminal-between-send-and-bind',
    }).subscribe({ complete: () => { lateOutputCompleted = true; } });

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Continue safely',
      messageCommandKey: 'message-terminal-between-send-and-bind',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-terminal-between-send-and-bind' },
    })).resolves.toMatchObject({
      kind: 'live_input',
      attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
    });

    expect(live.send).toHaveBeenCalledTimes(1);
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(commands.root).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
    expect(lateOutputCompleted).toBe(true);
    expect(output.current('218f4eb1-9078-7a1e-9514-b19b5732f5de')).toBeNull();
  });

  it('keeps live input at-least-once without creating duplicate Attempts for duplicate submissions', async () => {
    const live = { send: vi.fn(async () => undefined) };
    const output = { bind: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: false,
        agentDefinitionKey: 'sourcing',
      })),
    };
    const commands = { root: vi.fn(), followUp: vi.fn() };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );
    const input = {
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Continue safely',
      messageCommandKey: 'message-live-duplicate',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-live-duplicate' },
    };

    const results = await Promise.all([intake.startThread(input), intake.startThread(input)]);

    expect(results).toEqual([
      expect.objectContaining({ kind: 'live_input', attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de' }),
      expect.objectContaining({ kind: 'live_input', attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de' }),
    ]);
    expect(live.send).toHaveBeenCalledTimes(2);
    expect(commands.root).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });

  it('does not cross an immutable AgentVersion pin when an existing thread belongs to another Agent', async () => {
    const live = { send: vi.fn() };
    const output = { bind: vi.fn() };
    const queries = {
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: false,
        agentDefinitionKey: 'sourcing',
      })),
    };
    const commands = { root: vi.fn(), followUp: vi.fn() };
    const launch = { start: vi.fn() };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
      live as never,
      output as never,
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'operator',
      prompt: 'Do not cross Agent boundaries',
      messageCommandKey: 'message-mismatch',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-mismatch' },
    })).rejects.toMatchObject({ code: 'agent_thread_agent_mismatch' });

    expect(live.send).not.toHaveBeenCalled();
    expect(output.bind).not.toHaveBeenCalled();
    expect(commands.root).not.toHaveBeenCalled();
    expect(commands.followUp).not.toHaveBeenCalled();
    expect(launch.start).not.toHaveBeenCalled();
  });
});

function runtimeEnvironment(): NodeJS.ProcessEnv {
  return {
    KIDITEM_APPLICATION_VERSION: 'app',
    KIDITEM_GIT_SHA: 'git',
    AGENT_OPERATOR_MODEL: 'gpt-5',
    AGENT_SOURCING_MODEL: 'gpt-5.6',
  };
}

function rootAdmission() {
  return {
    session: { id: '218f4eb1-9078-7a1e-9514-b19b5732f5de', organizationId: principal.organizationId },
    task: { id: '318f4eb1-9078-7a1e-9514-b19b5732f5de', organizationId: principal.organizationId, sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de' },
    attempt: { id: '418f4eb1-9078-7a1e-9514-b19b5732f5de', ordinal: 1 },
  };
}

function rootAdmissionReceipt(prompt: string, messageCommandKey: string, agentDefinitionKey = 'sourcing') {
  return {
    messageCommandKey,
    inputHash: canonicalOwnerInputHash({ agentDefinitionKey, prompt }),
  };
}

function version(overrides: Partial<AgentVersionFixture> = {}): AgentVersionFixture {
  return {
    id: '618f4eb1-9078-7a1e-9514-b19b5732f5de',
    agentDefinitionKey: 'operator',
    runtimeType: 'codex_cli',
    capabilityKeys: ['sourcing.scrapeProductUrl'],
    instructionProfileRef: 'agent-config/prompts/agents/operator.md',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
