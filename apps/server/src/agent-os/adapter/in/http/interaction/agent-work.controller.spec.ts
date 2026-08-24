import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentWorkController } from './agent-work.controller';

const organizationId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const user = { id: '118f4eb1-9078-7a1e-9514-b19b5732f5de' };
const sessionId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';
const taskId = '318f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '418f4eb1-9078-7a1e-9514-b19b5732f5de';
const predecessorAttemptId = '518f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('AgentWorkController Host Runner admission', () => {
  afterEach(() => {
    delete process.env.KIDITEM_APPLICATION_VERSION;
    delete process.env.KIDITEM_GIT_SHA;
    delete process.env.AGENT_OPERATOR_MODEL;
    delete process.env.KIDITEM_ATTEMPT_LOGIN_HOME;
    delete process.env.KIDITEM_ATTEMPT_CLI_VERSION;
  });

  it('starts a root Attempt with only the model and code-owned Codex train in a clean legacy runtime environment', async () => {
    process.env.KIDITEM_APPLICATION_VERSION = 'app';
    process.env.KIDITEM_GIT_SHA = 'git';
    process.env.AGENT_OPERATOR_MODEL = 'gpt-5';
    const fixture = controllerFixture();
    fixture.queries.activeVersion.mockResolvedValue(version());
    fixture.commands.root.mockResolvedValue({
      session: { id: sessionId, organizationId },
      task: { id: taskId, organizationId, sessionId },
      attempt: { id: attemptId, ordinal: 1 },
    });

    await expect(fixture.controller.start({ objective: 'Research backpacks' }, organizationId, user as never))
      .resolves.toMatchObject({ attempt: { id: attemptId } });

    expect(fixture.commands.root).toHaveBeenCalledWith(expect.objectContaining({
      cliVersion: '0.149.1',
      reportedModel: 'gpt-5',
    }));
    expect(fixture.launch.start).toHaveBeenCalledWith(expect.objectContaining({
      attemptId,
      runtime: 'codex_cli',
      profile: { model: 'gpt-5' },
    }));
  });

  it('starts a durable follow-up with only the model and code-owned Claude train in a clean legacy runtime environment', async () => {
    process.env.KIDITEM_APPLICATION_VERSION = 'app';
    process.env.KIDITEM_GIT_SHA = 'git';
    process.env.AGENT_OPERATOR_MODEL = 'claude-model';
    const fixture = controllerFixture();
    fixture.queries.taskVersion.mockResolvedValue(version({ runtimeType: 'claude_cli' }));
    fixture.queries.continuationContext.mockResolvedValue({
      prompt: 'Continue with durable context',
      input: { prompt: 'Continue with durable context', resourceRefs: [], operationRefs: [] },
    });
    fixture.commands.followUp.mockResolvedValue({ attemptId, sessionId, taskId, ordinal: 2 });

    await expect(fixture.controller.continue(
      sessionId,
      taskId,
      { predecessorAttemptId, prompt: 'Continue' },
      organizationId,
      user as never,
    )).resolves.toMatchObject({ attemptId });

    expect(fixture.commands.followUp).toHaveBeenCalledWith(expect.objectContaining({
      cliVersion: '2.1.241',
      reportedModel: 'claude-model',
    }));
    expect(fixture.launch.start).toHaveBeenCalledWith(expect.objectContaining({
      attemptId,
      runtime: 'claude_cli',
      profile: { model: 'claude-model' },
      prompt: 'Continue with durable context',
    }));
  });
});

function controllerFixture() {
  const queries = {
    activeVersion: vi.fn(),
    taskVersion: vi.fn(),
    continuationContext: vi.fn(),
  };
  const commands = { root: vi.fn(), followUp: vi.fn() };
  const executor = { interrupt: vi.fn(async () => undefined) };
  const launch = { start: vi.fn(async () => undefined) };
  const Controller = AgentWorkController as unknown as new (...args: unknown[]) => AgentWorkController;
  return {
    controller: new Controller(queries, commands, executor, launch),
    queries,
    commands,
    launch,
  };
}

function version(overrides: { runtimeType?: string } = {}) {
  return {
    id: '618f4eb1-9078-7a1e-9514-b19b5732f5de',
    agentDefinitionKey: 'operator',
    runtimeType: 'codex_cli',
    capabilityKeys: [],
    instructionProfileRef: 'agent-config/prompts/agents/operator.md',
    ...overrides,
  };
}
