import { describe, expect, it, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { ImageAiService } from '../application/service/image-ai.service';
import type {
  AgentRunnerInput,
  AgentRunnerPort,
  AgentRunnerResult,
} from '../../agent-os/application/port/in/agent-runner.port';

const ORGANIZATION_ID = 'organization-1';
const USER_ID = 'user-7';

function makeOperationAlerts() {
  return {
    start: vi.fn().mockResolvedValue({}),
  };
}

function makeService(runnerResult: AgentRunnerResult) {
  const runner = {
    runByType: vi.fn(
      async (_type: string, _input: AgentRunnerInput): Promise<AgentRunnerResult> => runnerResult,
    ),
  } satisfies AgentRunnerPort;
  const operationAlerts = makeOperationAlerts();
  const service = new ImageAiService(runner as never, operationAlerts as never);
  return { service, runner, operationAlerts };
}

describe('ImageAiService', () => {
  it('returns AgentRunRequest id as taskId so clients can poll requests', async () => {
    const { service, runner } = makeService({
      ok: true,
      requestId: 'request-1',
      runId: 'run-1',
      agentType: 'image_edit',
      status: 'pending',
    });

    const result = await service.createEditTask(
      { image_url: 'https://example.com/a.png', preset: 'enhance' },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(runner.runByType).toHaveBeenCalledWith(
      'image_edit',
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceType: 'ai.image_edit',
        payload: {
          image_url: 'https://example.com/a.png',
          preset: 'enhance',
          user_prompt: '',
        },
      }),
    );
    expect(result).toEqual({ taskId: 'request-1' });
  });

  it('forwards triggeredByUserId to AGENT_RUNNER_PORT.requestedByUserId so the FINALIZED bridge can resolve the actor', async () => {
    const { service, runner } = makeService({
      ok: true,
      requestId: 'request-actor',
      agentType: 'image_edit',
      status: 'pending',
    });

    await service.createEditTask(
      { image_url: 'https://example.com/a.png', preset: 'enhance' },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(runner.runByType).toHaveBeenCalledWith(
      'image_edit',
      expect.objectContaining({ requestedByUserId: USER_ID }),
    );
  });

  it('omits requestedByUserId when no actor is known (system/cron path)', async () => {
    const { service, runner } = makeService({
      ok: true,
      requestId: 'request-system',
      agentType: 'image_edit',
      status: 'pending',
    });

    await service.createEditTask(
      { image_url: 'https://example.com/a.png', preset: 'enhance' },
      ORGANIZATION_ID,
      null,
    );

    const callInput = runner.runByType.mock.calls[0]![1];
    expect(callInput).not.toHaveProperty('requestedByUserId');
  });

  it('opens a producer-owned operation alert keyed by agent_run_request:<requestId> on successful enqueue', async () => {
    const { service, operationAlerts } = makeService({
      ok: true,
      requestId: 'request-9',
      agentType: 'image_edit',
      status: 'pending',
    });

    await service.createEditTask(
      { image_url: 'https://example.com/a.png', preset: 'remove_background', user_prompt: 'crisp' },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: 'image-edit:request-9',
        type: 'image_edit',
        sourceType: 'agent_run_request',
        sourceId: 'request-9',
        actorUserId: USER_ID,
        href: '/image-hub',
        metadata: expect.objectContaining({
          agentType: 'image_edit',
          preset: 'remove_background',
        }),
      }),
    );
  });

  it('does NOT open an operation alert when the runner produced no requestId', async () => {
    // Runner returned only a runId — alert key contract requires requestId
    // because the FINALIZED bridge keys closeBySource on AgentRunRequest.id.
    const { service, operationAlerts } = makeService({
      ok: true,
      runId: 'run-only',
      agentType: 'image_edit',
      status: 'running',
    });

    const result = await service.createEditTask(
      { image_url: 'https://example.com/a.png', preset: 'enhance' },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(result).toEqual({ taskId: 'run-only' });
    expect(operationAlerts.start).not.toHaveBeenCalled();
  });

  it('throws instead of inventing an id when Agent OS cannot queue the request', async () => {
    const { service, operationAlerts } = makeService({
      ok: false,
      agentType: 'image_edit',
      reason: 'agent_instance_not_found',
    });

    await expect(
      service.createEditTask(
        { image_url: 'https://example.com/a.png', preset: 'enhance' },
        ORGANIZATION_ID,
        USER_ID,
      ),
    ).rejects.toThrow(InternalServerErrorException);
    expect(operationAlerts.start).not.toHaveBeenCalled();
  });
});
