import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import { DurableWorkAgent } from './agent-work-copilotkit.controller';

const organizationId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const userId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const threadId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';
const taskId = '318f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '418f4eb1-9078-7a1e-9514-b19b5732f5de';
const predecessorAttemptId = '518f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('DurableWorkAgent Host Runner admission', () => {
  afterEach(() => {
    delete process.env.KIDITEM_APPLICATION_VERSION;
    delete process.env.KIDITEM_GIT_SHA;
    delete process.env.AGENT_OPERATOR_MODEL;
    delete process.env.KIDITEM_ATTEMPT_LOGIN_HOME;
    delete process.env.KIDITEM_ATTEMPT_CLI_VERSION;
  });

  it('launches a Copilot root through the common path without legacy runtime environment values', async () => {
    process.env.KIDITEM_APPLICATION_VERSION = 'app';
    process.env.KIDITEM_GIT_SHA = 'git';
    process.env.AGENT_OPERATOR_MODEL = 'gpt-5';
    const fixture = agentFixture();
    fixture.queries.activeVersion.mockResolvedValue(version());
    fixture.commands.root.mockResolvedValue(rootAdmission());

    await expect(run(fixture.agent)).resolves.toHaveLength(1);

    expect(fixture.commands.root).toHaveBeenCalledWith(expect.objectContaining({
      cliVersion: '0.149.1',
      reportedModel: 'gpt-5',
    }));
    expect(fixture.launch.start).toHaveBeenCalledWith(expect.objectContaining({
      attemptId,
      runtime: 'codex_cli',
      profile: { model: 'gpt-5' },
      output: { threadId, runId: 'run' },
    }));
  });

  it('launches a terminal-thread Copilot successor with the shared Claude train and durable context', async () => {
    process.env.KIDITEM_APPLICATION_VERSION = 'app';
    process.env.KIDITEM_GIT_SHA = 'git';
    process.env.AGENT_OPERATOR_MODEL = 'claude-model';
    const fixture = agentFixture();
    fixture.queries.activeVersion.mockResolvedValue(version({ runtimeType: 'claude_cli' }));
    fixture.commands.root.mockRejectedValue(new AgentOsRuntimeError('root_task_already_exists'));
    fixture.queries.threadContinuation.mockResolvedValue({ taskId, predecessorAttemptId, terminal: true });
    fixture.queries.continuationContext.mockResolvedValue({
      prompt: 'durable successor prompt',
      input: { prompt: 'durable successor prompt', resourceRefs: [], operationRefs: [] },
    });
    fixture.commands.followUp.mockResolvedValue({ attemptId, sessionId: threadId, taskId, ordinal: 2 });

    await expect(run(fixture.agent)).resolves.toHaveLength(1);

    expect(fixture.commands.followUp).toHaveBeenCalledWith(expect.objectContaining({
      cliVersion: '2.1.241',
      reportedModel: 'claude-model',
    }));
    expect(fixture.launch.start).toHaveBeenCalledWith(expect.objectContaining({
      runtime: 'claude_cli',
      prompt: 'durable successor prompt',
    }));
  });
});

function agentFixture() {
  const queries = {
    activeVersion: vi.fn(),
    threadContinuation: vi.fn(),
    continuationContext: vi.fn(),
  };
  const commands = { root: vi.fn(), followUp: vi.fn() };
  const launch = { start: vi.fn(async () => undefined) };
  return {
    agent: new DurableWorkAgent({ organizationId, userId }, queries as never, commands as never, launch as never),
    queries,
    commands,
    launch,
  };
}

async function run(agent: DurableWorkAgent) {
  return firstValueFrom(agent.run({
    threadId,
    runId: 'run',
    messages: [{ role: 'user', content: 'Find school bags' }],
  } as never).pipe(toArray()));
}

function rootAdmission() {
  return {
    session: { id: threadId, organizationId },
    task: { id: taskId, organizationId, sessionId: threadId },
    attempt: { id: attemptId, ordinal: 1 },
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
