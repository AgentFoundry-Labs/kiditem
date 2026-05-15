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
      agentType: 'image_edit',
      requestId: 'request-1',
      status: 'pending',
    });

    const result = await controller.createRunRequest('org-1', USER, {
      agentType: 'image_edit',
      sourceType: 'product_content',
      sourceId: 'product-1',
      payload: {
        preset: 'color_guide',
        image_urls: [
          'https://example.com/a.png',
          'https://example.com/b.png',
        ],
      },
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
      agentType: 'image_edit',
      requestId: 'request-scheduled',
      status: 'pending',
    });

    await controller.createRunRequest('org-1', USER, {
      agentType: 'image_edit',
      sourceType: 'product_content',
      scheduledFor: '2026-06-01T00:00:00.000Z',
      payload: { preset: 'enhance', image_url: 'https://example.com/a.png' },
    });

    expect(runner.executeRequest).not.toHaveBeenCalled();
  });
});
