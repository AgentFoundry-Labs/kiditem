import { describe, expect, it, vi } from 'vitest';
import { EMPTY, firstValueFrom, throwError, toArray } from 'rxjs';
import { AttemptFutureOutputChannel } from '../../../out/runtime/attempt/attempt-future-output-channel';
import { DurableWorkAgent, FutureOnlyRunner } from './agent-work-copilotkit.controller';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';

const organizationId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const userId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const threadId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '418f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('DurableWorkAgent Copilot transport-only intake', () => {
  it('forwards the explicit code-owned Agent definition, thread coordinate, and future-only output to the common intake Module', async () => {
    const fixture = agentFixture('sourcing');
    fixture.intake.startThread.mockResolvedValue({ kind: 'root', attemptId, sessionId: threadId, taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de' });

    await expect(run(fixture.agent)).resolves.toHaveLength(2);

    expect(fixture.intake.startThread).toHaveBeenCalledWith({
      principal: { organizationId, userId },
      sessionId: threadId,
      agentDefinitionKey: 'sourcing',
      prompt: 'Find school bags',
      messageCommandKey: 'message-command-1',
      output: { threadId, runId: 'run' },
    });
  });

  it('uses the caller-owned final user-message id as the live command key, never the transport run id', async () => {
    const fixture = agentFixture('sourcing');
    fixture.intake.startThread.mockResolvedValue({
      kind: 'live_input',
      attemptId,
      sessionId: threadId,
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
    });

    await expect(run(fixture.agent, {
      runId: 'fresh-transport-run',
      messageCommandKey: 'stable-logical-turn-1',
    })).resolves.toHaveLength(2);

    expect(fixture.intake.startThread).toHaveBeenCalledWith(expect.objectContaining({
      messageCommandKey: 'stable-logical-turn-1',
      output: { threadId, runId: 'fresh-transport-run' },
    }));
  });

  it('rejects a missing or blank final user-message command key before intake', async () => {
    const fixture = agentFixture('sourcing');

    await expect(firstValueFrom(fixture.agent.run({
      threadId,
      runId: 'run',
      messages: [{ role: 'user', content: 'Find school bags' }],
    } as never))).rejects.toMatchObject({ message: 'copilotkit_message_command_key_required' });
    await expect(firstValueFrom(fixture.agent.run({
      threadId,
      runId: 'run',
      messages: [{ id: '   ', role: 'user', content: 'Find school bags' }],
    } as never))).rejects.toMatchObject({ message: 'copilotkit_message_command_key_required' });

    expect(fixture.intake.startThread).not.toHaveBeenCalled();
  });

  it('renders same logical key content drift as an explicit conflict', async () => {
    const fixture = agentFixture('sourcing');
    fixture.intake.startThread.mockRejectedValue(
      new AgentOsRuntimeError('runner_input_command_conflict'),
    );

    await expect(firstValueFrom(fixture.agent.run({
      threadId,
      runId: 'retry-run',
      messages: [{
        id: 'stable-logical-turn-1',
        role: 'user',
        content: 'Different content for a replayed logical turn.',
      }],
    } as never))).rejects.toMatchObject({
      message: 'runner_input_command_conflict',
      status: 409,
    });
  });

  it('exposes the exact admission coordinate as an AG-UI custom event so Web reconciliation can distinguish a live input from a successor', async () => {
    const fixture = agentFixture('sourcing');
    fixture.intake.startThread.mockResolvedValue({
      kind: 'live_input',
      attemptId,
      sessionId: threadId,
      taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
    });

    await expect(run(fixture.agent)).resolves.toEqual([
      expect.objectContaining({ type: 'RUN_STARTED', threadId, runId: 'run' }),
      {
        type: 'CUSTOM',
        name: 'kiditem.agent_work_admission',
        value: {
          kind: 'live_input',
          attemptId,
          sessionId: threadId,
          taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        },
      },
    ]);
  });
});

describe('FutureOnlyRunner', () => {
  it('discards an unbound future coordinate when pre-admission intake rejects', async () => {
    const live = new AttemptFutureOutputChannel();
    const runner = new FutureOnlyRunner({ interrupt: vi.fn() } as never, live);

    await expect(firstValueFrom(runner.run({
      threadId,
      agent: { run: () => throwError(() => new Error('admission_rejected')) },
      input: { runId: 'rejected-run' },
    } as never).pipe(toArray()))).rejects.toThrow('admission_rejected');

    const streams = (live as unknown as { streams: Map<string, unknown> }).streams;
    expect(streams.has(`${threadId}\u0000rejected-run`)).toBe(false);
  });

  it('keeps a bound Attempt coordinate when its Copilot subscriber disconnects', () => {
    const live = new AttemptFutureOutputChannel();
    live.bind({ attemptId, threadId, runId: 'bound-run' });
    const runner = new FutureOnlyRunner({ interrupt: vi.fn() } as never, live);

    const subscription = runner.run({
      threadId,
      agent: { run: () => EMPTY },
      input: { runId: 'bound-run' },
    } as never).subscribe();
    subscription.unsubscribe();

    expect(live.attemptId({ threadId, runId: 'bound-run' })).toBe(attemptId);
  });
});

function agentFixture(agentDefinitionKey: string) {
  const intake = { startThread: vi.fn() };
  return {
    agent: new DurableWorkAgent({ organizationId, userId }, agentDefinitionKey, intake as never),
    intake,
  };
}

async function run(agent: DurableWorkAgent, input: {
  runId?: string;
  messageCommandKey?: string;
} = {}) {
  return firstValueFrom(agent.run({
    threadId,
    runId: input.runId ?? 'run',
    messages: [{
      id: input.messageCommandKey ?? 'message-command-1',
      role: 'user',
      content: 'Find school bags',
    }],
  } as never).pipe(toArray()));
}
