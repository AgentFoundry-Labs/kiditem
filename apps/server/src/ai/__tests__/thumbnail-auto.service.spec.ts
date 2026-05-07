import { describe, expect, it, vi } from 'vitest';
import { ThumbnailAutoService } from '../application/service/thumbnail-auto.service';
import type {
  AgentRunnerInput,
  AgentRunnerPort,
  AgentRunnerResult,
} from '../../agent-os/application/port/in/agent-runner.port';

const ORGANIZATION_ID = 'organization-1';

const batchResult = {
  attempted: 1,
  succeeded: 1,
  failed: 0,
  skipped: 0,
  runs: [{ ok: true, productId: 'product-1', generationId: 'generation-1' }],
};

function makeService(runnerResult: AgentRunnerResult) {
  const runner = {
    runByType: vi.fn(
      async (_type: string, _input: AgentRunnerInput): Promise<AgentRunnerResult> => runnerResult,
    ),
  } satisfies AgentRunnerPort;
  const generationService = {
    createAutoBatch: vi.fn(async () => batchResult),
  };
  const service = new ThumbnailAutoService(
    generationService as never,
    runner as never,
  );
  return { service, runner, generationService };
}

describe('ThumbnailAutoService', () => {
  it('delegates to Agent OS runByType and returns the runner runId/status', async () => {
    const { service, runner, generationService } = makeService({
      ok: true,
      runId: 'run-1',
      requestId: 'request-1',
      agentType: 'thumbnail_auto_edit',
      status: 'running',
    });

    const result = await service.runBatch(ORGANIZATION_ID, 5);

    expect(runner.runByType).toHaveBeenCalledWith(
      'thumbnail_auto_edit',
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceType: 'ai.thumbnail_auto_edit',
        payload: { limit: 5 },
      }),
    );
    expect(generationService.createAutoBatch).toHaveBeenCalledWith(ORGANIZATION_ID, 5);
    expect(result).toEqual({
      ...batchResult,
      requestId: 'request-1',
      runId: 'run-1',
      status: 'running',
    });
  });

  it('falls back to requestId when the runner deferred execution', async () => {
    const { service } = makeService({
      ok: true,
      requestId: 'request-only',
      agentType: 'thumbnail_auto_edit',
      status: 'requires_approval',
    });

    const result = await service.runBatch(ORGANIZATION_ID, 5);

    expect(result.requestId).toBe('request-only');
    expect(result.runId).toBeUndefined();
    expect(result.status).toBe('requires_approval');
  });

  it('throws when the Agent OS runner produces neither runId nor requestId', async () => {
    const { service, generationService } = makeService({
      ok: false,
      agentType: 'thumbnail_auto_edit',
      reason: 'agent_instance_not_found',
    });

    await expect(service.runBatch(ORGANIZATION_ID, 5)).rejects.toThrow(
      /agent_instance_not_found/,
    );
    expect(generationService.createAutoBatch).not.toHaveBeenCalled();
  });
});
