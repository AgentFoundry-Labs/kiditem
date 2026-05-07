import { describe, expect, it, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { ImageAiService } from '../application/service/image-ai.service';
import type {
  AgentRunnerInput,
  AgentRunnerPort,
  AgentRunnerResult,
} from '../../agent-os/application/port/in/agent-runner.port';

const ORGANIZATION_ID = 'organization-1';

function makeService(runnerResult: AgentRunnerResult) {
  const runner = {
    runByType: vi.fn(
      async (_type: string, _input: AgentRunnerInput): Promise<AgentRunnerResult> => runnerResult,
    ),
  } satisfies AgentRunnerPort;
  const service = new ImageAiService(runner as never);
  return { service, runner };
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

  it('throws instead of inventing an id when Agent OS cannot queue the request', async () => {
    const { service } = makeService({
      ok: false,
      agentType: 'image_edit',
      reason: 'agent_instance_not_found',
    });

    await expect(
      service.createEditTask(
        { image_url: 'https://example.com/a.png', preset: 'enhance' },
        ORGANIZATION_ID,
      ),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
