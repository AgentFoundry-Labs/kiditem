import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';
import { DurableWorkAgent } from './agent-work-copilotkit.controller';

const organizationId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const userId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const threadId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '418f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('DurableWorkAgent Copilot transport-only intake', () => {
  it('forwards the explicit code-owned Agent definition, thread coordinate, and future-only output to the common intake Module', async () => {
    const fixture = agentFixture('sourcing');
    fixture.intake.startThread.mockResolvedValue({ attemptId, sessionId: threadId, taskId: '318f4eb1-9078-7a1e-9514-b19b5732f5de' });

    await expect(run(fixture.agent)).resolves.toHaveLength(1);

    expect(fixture.intake.startThread).toHaveBeenCalledWith({
      principal: { organizationId, userId },
      sessionId: threadId,
      agentDefinitionKey: 'sourcing',
      prompt: 'Find school bags',
      output: { threadId, runId: 'run' },
    });
  });
});

function agentFixture(agentDefinitionKey: string) {
  const intake = { startThread: vi.fn() };
  return {
    agent: new DurableWorkAgent({ organizationId, userId }, agentDefinitionKey, intake as never),
    intake,
  };
}

async function run(agent: DurableWorkAgent) {
  return firstValueFrom(agent.run({
    threadId,
    runId: 'run',
    messages: [{ role: 'user', content: 'Find school bags' }],
  } as never).pipe(toArray()));
}
