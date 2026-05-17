import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OperationCancellationService } from '../operation-cancellation.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    organizationId: ORG,
    kind: 'operation',
    status: 'running',
    type: 'product_generation',
    severity: 'info',
    title: '상품 생성',
    message: null,
    targetType: 'sourcing_candidate',
    targetId: 'candidate-1',
    operationKey: 'product-generation:batch-1',
    sourceType: 'sourcing_candidate',
    sourceId: 'candidate-1',
    actorUserId: USER,
    actionTaskId: null,
    href: '/product-pipeline/collected-products/candidate-1',
    progress: 0.25,
    metadata: {
      childIds: {
        detailPageGenerationId: 'cg-1',
        thumbnailGenerationId: 'tg-1',
      },
    },
    isRead: false,
    readAt: null,
    startedAt: new Date('2026-05-17T00:00:00.000Z'),
    finishedAt: null,
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    ...overrides,
  };
}

function makeService() {
  const operationAlerts = {
    findByOperationKey: vi.fn().mockResolvedValue(makeAlert()),
    cancel: vi.fn().mockResolvedValue(makeAlert({ status: 'cancelled' })),
  };
  const workflows = {
    cancelRun: vi.fn().mockResolvedValue({
      status: 'cancelled',
      workflowRunId: 'wf-run-1',
      cancelledAgentRunRequests: 1,
      cancelledAgentRuns: 0,
    }),
  };
  const agentRunner = {
    cancelRequest: vi.fn().mockResolvedValue({
      cancelledRequests: 1,
      cancelledRuns: 0,
      skippedRequests: 0,
      skippedRuns: 0,
    }),
    cancelRun: vi.fn().mockResolvedValue({
      cancelledRequests: 1,
      cancelledRuns: 1,
      skippedRequests: 0,
      skippedRuns: 0,
    }),
    cancelByWorkflowRun: vi.fn().mockResolvedValue({
      cancelledRequests: 1,
      cancelledRuns: 0,
      skippedRequests: 0,
      skippedRuns: 0,
    }),
  };
  const ai = {
    cancelContentGeneration: vi.fn().mockResolvedValue({
      status: 'cancelled',
      generationId: 'cg-1',
      operationKey: 'detail-page:cg-1',
      preserved: false,
    }),
    cancelThumbnailGeneration: vi.fn().mockResolvedValue({
      status: 'cancelled',
      generationId: 'tg-1',
      operationKey: 'thumbnail-edit:tg-1',
      preserved: false,
    }),
  };
  return {
    operationAlerts,
    workflows,
    agentRunner,
    ai,
    service: new OperationCancellationService(
      operationAlerts as never,
      workflows as never,
      agentRunner as never,
      ai as never,
    ),
  };
}

describe('OperationCancellationService', () => {
  it('cancels product generation children discovered from operation alert metadata', async () => {
    const { service, ai, operationAlerts } = makeService();

    const result = await service.cancel({
      organizationId: ORG,
      actorUserId: USER,
      target: {
        targetType: 'operation_key',
        operationKey: 'product-generation:batch-1',
        reason: '사용자 요청',
      },
    });

    expect(ai.cancelContentGeneration).toHaveBeenCalledWith({
      organizationId: ORG,
      generationId: 'cg-1',
      actorUserId: USER,
      reason: '사용자 요청',
    });
    expect(ai.cancelThumbnailGeneration).toHaveBeenCalledWith({
      organizationId: ORG,
      generationId: 'tg-1',
      actorUserId: USER,
      reason: '사용자 요청',
    });
    expect(operationAlerts.cancel).toHaveBeenCalledWith(
      ORG,
      'product-generation:batch-1',
      expect.objectContaining({
        metadata: expect.objectContaining({
          cancel: expect.objectContaining({
            requestedByUserId: USER,
            reason: '사용자 요청',
            result: 'cancelled',
            requestedAt: expect.any(String),
            target: {
              targetType: 'operation_key',
              operationKey: 'product-generation:batch-1',
            },
            affected: {
              workflowRunIds: [],
              agentRunRequestIds: [],
              agentRunIds: [],
              contentGenerationIds: ['cg-1'],
              thumbnailGenerationIds: ['tg-1'],
            },
            preserved: {
              contentGenerationIds: [],
              thumbnailGenerationIds: [],
            },
          }),
        }),
      }),
    );
    expect(result.status).toBe('cancelled');
    expect(result.affected.contentGenerationIds).toEqual(['cg-1']);
    expect(result.affected.thumbnailGenerationIds).toEqual(['tg-1']);
  });

  it('preserves already-terminal child generation ids in the response', async () => {
    const { service, ai } = makeService();
    ai.cancelContentGeneration.mockResolvedValueOnce({
      status: 'already_terminal',
      generationId: 'cg-1',
      operationKey: 'detail-page:cg-1',
      preserved: true,
    });

    const result = await service.cancel({
      organizationId: ORG,
      actorUserId: USER,
      target: { targetType: 'operation_key', operationKey: 'product-generation:batch-1' },
    });

    expect(result.preserved.contentGenerationIds).toEqual(['cg-1']);
    expect(result.status).toBe('cancelled');
  });

  it('returns already_terminal for an already-terminal operation alert', async () => {
    const { service, operationAlerts, ai } = makeService();
    operationAlerts.findByOperationKey.mockResolvedValueOnce(
      makeAlert({ status: 'succeeded' }),
    );

    const result = await service.cancel({
      organizationId: ORG,
      actorUserId: USER,
      target: { targetType: 'operation_key', operationKey: 'product-generation:batch-1' },
    });

    expect(ai.cancelContentGeneration).not.toHaveBeenCalled();
    expect(operationAlerts.cancel).not.toHaveBeenCalled();
    expect(result.status).toBe('already_terminal');
  });

  it('throws NotFoundException for a missing operation key', async () => {
    const { service, operationAlerts } = makeService();
    operationAlerts.findByOperationKey.mockResolvedValueOnce(null);

    await expect(
      service.cancel({
        organizationId: ORG,
        actorUserId: USER,
        target: { targetType: 'operation_key', operationKey: 'missing' },
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('cancels workflow target and linked agent requests', async () => {
    const { service, workflows } = makeService();

    const result = await service.cancel({
      organizationId: ORG,
      actorUserId: USER,
      target: { targetType: 'workflow_run', runId: 'wf-run-1' },
    });

    expect(workflows.cancelRun).toHaveBeenCalledWith({
      runId: 'wf-run-1',
      organizationId: ORG,
      actorUserId: USER,
      reason: '사용자 요청으로 중단되었습니다.',
    });
    expect(result.affected.workflowRunIds).toEqual(['wf-run-1']);
    expect(result.affected.agentRunRequestIds).toEqual(['linked:wf-run-1:1']);
  });
});
