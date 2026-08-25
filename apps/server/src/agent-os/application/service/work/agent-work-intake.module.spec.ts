import { describe, expect, it, vi } from 'vitest';
import { AgentWorkIntakeModule, createAgentWorkIntake } from './agent-work-intake.module';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';

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

  it('starts the explicitly selected code-owned Agent definition with Copilot future output', async () => {
    const queries = {
      activeVersion: vi.fn(async () => version({
        agentDefinitionKey: 'sourcing',
        capabilityKeys: ['sourcing.scrapeProductUrl'],
        instructionProfileRef: 'agent-config/prompts/agents/sourcing.md',
      })),
    };
    const commands = { root: vi.fn(async () => rootAdmission()) };
    const launch = { start: vi.fn(async () => undefined) };
    const intake = new AgentWorkIntakeModule(
      queries as never,
      commands as never,
      launch as never,
      runtimeEnvironment(),
    );

    await intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'sourcing',
      prompt: 'Find a product source',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-1' },
    });

    expect(queries.activeVersion).toHaveBeenCalledWith('sourcing');
    expect(commands.root).toHaveBeenCalledWith(expect.objectContaining({
      assignedAgentVersionId: '618f4eb1-9078-7a1e-9514-b19b5732f5de',
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      reportedModel: 'gpt-5.6',
    }));
    expect(launch.start).toHaveBeenCalledWith(expect.objectContaining({
      runtime: 'codex_cli',
      profile: { model: 'gpt-5.6' },
      instructionProfileRef: 'agent-config/prompts/agents/sourcing.md',
      capabilityKeys: ['sourcing.scrapeProductUrl'],
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-1' },
    }));
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
      cliVersion: '2.1.241',
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

  it('turns a terminal thread root collision into one immutable successor before launch', async () => {
    const queries = {
      activeVersion: vi.fn(async () => version()),
      taskVersion: vi.fn(async () => version({ runtimeType: 'claude_cli' })),
      threadContinuation: vi.fn(async () => ({
        taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        predecessorAttemptId: '518f4eb1-9078-7a1e-9514-b19b5732f5de',
        terminal: true,
      })),
      continuationContext: vi.fn(async () => ({
        prompt: 'bounded durable successor prompt',
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
    );

    await expect(intake.startThread({
      principal,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      agentDefinitionKey: 'operator',
      prompt: 'Continue',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-2' },
    })).resolves.toMatchObject({ attemptId: '418f4eb1-9078-7a1e-9514-b19b5732f5de' });

    expect(queries.threadContinuation).toHaveBeenCalledWith({
      organizationId: principal.organizationId,
      userId: principal.userId,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    expect(queries.taskVersion).toHaveBeenCalledWith({
      organizationId: principal.organizationId,
      userId: principal.userId,
      sessionId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    expect(commands.followUp).toHaveBeenCalledWith(expect.objectContaining({
      predecessorAttemptId: '518f4eb1-9078-7a1e-9514-b19b5732f5de',
      intent: 'follow_up',
      input: { prompt: 'Continue', resourceRefs: [], operationRefs: [] },
      cliVersion: '2.1.241',
    }));
    expect(launch.start).toHaveBeenCalledWith(expect.objectContaining({
      runtime: 'claude_cli',
      prompt: 'bounded durable successor prompt',
      output: { threadId: '218f4eb1-9078-7a1e-9514-b19b5732f5de', runId: 'run-2' },
    }));
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
    );

    await expect(intake.startRoot({ principal, objective: 'Research backpacks' }))
      .rejects.toThrow('runner_not_ready');

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
