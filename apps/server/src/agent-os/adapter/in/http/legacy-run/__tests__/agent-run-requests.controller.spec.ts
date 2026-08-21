import { describe, expect, it, vi } from 'vitest';
import { AgentRunRequestsController } from '../agent-run-requests.controller';
import type { AgentRunnerPort } from '../../../../application/port/in/agent-runner.port';
import type { AuthUser } from '../../../../../auth/auth.types';

function makeController(result: Awaited<ReturnType<AgentRunnerPort['runByType']>>) {
  const runner = {
    runByType: vi.fn().mockResolvedValue(result),
    executeRequest: vi.fn().mockResolvedValue({
      executed: true,
      requestId: result.requestId,
      runId: result.runId,
    }),
  } satisfies AgentRunnerPort;
  const controller = new AgentRunRequestsController(
    runner as never,
    {} as never,
  );
  return { controller, runner };
}

const USER = { id: 'user-1' } as AuthUser;

describe('AgentRunRequestsController', () => {
  it('starts an immediately-created run request so /api/agent-os/runs callers do not depend on the background worker', async () => {
    const { controller, runner } = makeController({
      ok: true,
      agentType: 'rules_evaluation',
      requestId: 'request-1',
      status: 'pending',
    });

    const result = await controller.createRunRequest('org-1', USER, {
      agentType: 'rules_evaluation',
      sourceType: 'rules.evaluation',
      sourceId: 'rules-1',
      payload: { sample: true },
    });

    expect(result).toMatchObject({ requestId: 'request-1' });
    expect(runner.executeRequest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requestId: 'request-1',
      workerId: 'agent-os-http',
    });
  });

  it('does not kick scheduled requests before their scheduled time', async () => {
    const { controller, runner } = makeController({
      ok: true,
      agentType: 'rules_evaluation',
      requestId: 'request-scheduled',
      status: 'pending',
    });

    await controller.createRunRequest('org-1', USER, {
      agentType: 'rules_evaluation',
      sourceType: 'rules.evaluation',
      scheduledFor: '2026-06-01T00:00:00.000Z',
      payload: { sample: true },
    });

    expect(runner.executeRequest).not.toHaveBeenCalled();
  });
});
