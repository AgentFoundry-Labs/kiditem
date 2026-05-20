import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OperationCancellationController } from '../operation-cancellation.controller';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

function makeService() {
  return {
    cancel: vi.fn().mockResolvedValue({
      ok: true,
      status: 'cancelled',
      message: '중단 요청이 반영되었습니다.',
      operationKey: 'product-generation:batch-1',
      affected: {
        workflowRunIds: [],
        agentRunRequestIds: [],
        agentRunIds: [],
        contentGenerationIds: ['cg-1'],
        thumbnailGenerationIds: ['tg-1'],
        directAiJobIds: [],
      },
      preserved: {
        contentGenerationIds: [],
        thumbnailGenerationIds: [],
      },
      warnings: [],
    }),
  };
}

describe('OperationCancellationController', () => {
  it('derives organization and actor from decorators, never from the body', async () => {
    const service = makeService();
    const controller = new OperationCancellationController(service as never);

    const result = await controller.cancel(
      {
        targetType: 'operation_key',
        operationKey: 'product-generation:batch-1',
        reason: '사용자 요청',
      },
      ORG,
      { id: USER } as never,
    );

    expect(service.cancel).toHaveBeenCalledWith({
      organizationId: ORG,
      actorUserId: USER,
      target: {
        targetType: 'operation_key',
        operationKey: 'product-generation:batch-1',
        reason: '사용자 요청',
      },
    });
    expect(result.status).toBe('cancelled');
  });

  it('rejects target payloads missing the id field for their target type', async () => {
    const service = makeService();
    const controller = new OperationCancellationController(service as never);

    await expect(
      controller.cancel(
        { targetType: 'workflow_run', reason: '누락' },
        ORG,
        { id: USER } as never,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(service.cancel).not.toHaveBeenCalled();
  });
});
