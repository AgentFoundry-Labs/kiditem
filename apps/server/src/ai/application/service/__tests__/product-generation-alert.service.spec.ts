import { describe, expect, it, vi } from 'vitest';
import { ProductGenerationAlertService } from '../product-generation-alert.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000003';
const BATCH_ID = '00000000-0000-4000-8000-000000000004';
const OPERATION_KEY = `product-generation:${BATCH_ID}`;

function makeAlert(metadata: Record<string, unknown>) {
  return {
    id: 'alert-1',
    organizationId: ORGANIZATION_ID,
    operationKey: OPERATION_KEY,
    kind: 'operation',
    status: 'running',
    type: 'product_generation',
    severity: 'info',
    title: '상품 생성 중: 자석 다트게임',
    message: null,
    targetType: 'sourcing_candidate',
    targetId: CANDIDATE_ID,
    sourceType: 'sourcing_candidate',
    sourceId: CANDIDATE_ID,
    actorUserId: USER_ID,
    href: `/product-pipeline/collected-products/${CANDIDATE_ID}`,
    progress: 0.15,
    metadata,
    isRead: false,
    readAt: null,
    actionTaskId: null,
    startedAt: new Date(),
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePrisma() {
  return {
    contentGeneration: {
      findFirst: vi.fn(),
    },
    thumbnailGeneration: {
      findFirst: vi.fn(),
    },
  };
}

describe('ProductGenerationAlertService', () => {
  it('starts one parent operation alert with both children queued', async () => {
    const prisma = makePrisma();
    const operationAlerts = {
      start: vi.fn().mockResolvedValue(makeAlert({})),
      findByOperationKey: vi.fn(),
      progress: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const service = new ProductGenerationAlertService(prisma as never, operationAlerts as never);

    await service.start({
      organizationId: ORGANIZATION_ID,
      actorUserId: USER_ID,
      batchId: BATCH_ID,
      candidateId: CANDIDATE_ID,
      productName: '자석 다트게임',
      href: `/product-pipeline/collected-products/${CANDIDATE_ID}`,
    });

    expect(operationAlerts.start).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      operationKey: OPERATION_KEY,
      type: 'product_generation',
      title: '상품 생성 중: 자석 다트게임',
      sourceType: 'sourcing_candidate',
      sourceId: CANDIDATE_ID,
      targetType: 'sourcing_candidate',
      targetId: CANDIDATE_ID,
      actorUserId: USER_ID,
      href: `/product-pipeline/collected-products/${CANDIDATE_ID}`,
      progress: 0.15,
      metadata: expect.objectContaining({
        productGenerationBatchId: BATCH_ID,
        productName: '자석 다트게임',
        children: {
          detail_page: 'queued',
          thumbnail: 'queued',
        },
        childIds: {
          detailPageGenerationId: null,
          thumbnailGenerationId: null,
        },
      }),
    }));
  });

  it('records a child id without changing the parent to a terminal state', async () => {
    const prisma = makePrisma();
    const operationAlerts = {
      start: vi.fn(),
      findByOperationKey: vi.fn().mockResolvedValue(makeAlert({
        children: { detail_page: 'queued', thumbnail: 'queued' },
        childIds: { detailPageGenerationId: null, thumbnailGenerationId: null },
      })),
      progress: vi.fn().mockResolvedValue(makeAlert({})),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const service = new ProductGenerationAlertService(prisma as never, operationAlerts as never);

    await service.recordChildStarted({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: OPERATION_KEY,
      childKind: 'detail_page',
      childId: 'content-generation-1',
    });

    expect(operationAlerts.progress).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({
        progress: 0.25,
        metadata: expect.objectContaining({
          children: { detail_page: 'queued', thumbnail: 'queued' },
          childIds: {
            detailPageGenerationId: 'content-generation-1',
            thumbnailGenerationId: null,
          },
        }),
      }),
    );
    expect(operationAlerts.succeed).not.toHaveBeenCalled();
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('keeps parent alert running after one child succeeds', async () => {
    const prisma = makePrisma();
    prisma.contentGeneration.findFirst.mockResolvedValueOnce({ status: 'READY' });
    prisma.thumbnailGeneration.findFirst.mockResolvedValueOnce(null);
    const operationAlerts = {
      start: vi.fn(),
      findByOperationKey: vi.fn().mockResolvedValue(makeAlert({
        children: { detail_page: 'queued', thumbnail: 'queued' },
        childIds: { detailPageGenerationId: null, thumbnailGenerationId: null },
      })),
      progress: vi.fn().mockResolvedValue(makeAlert({})),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const service = new ProductGenerationAlertService(prisma as never, operationAlerts as never);

    await service.markChildFinished({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: OPERATION_KEY,
      childKind: 'detail_page',
      status: 'succeeded',
      childId: 'content-generation-1',
    });

    expect(operationAlerts.progress).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({
        progress: 0.6,
        metadata: expect.objectContaining({
          children: { detail_page: 'succeeded', thumbnail: 'queued' },
          childIds: {
            detailPageGenerationId: 'content-generation-1',
            thumbnailGenerationId: null,
          },
        }),
      }),
    );
    expect(operationAlerts.succeed).not.toHaveBeenCalled();
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('succeeds parent alert after both children succeed', async () => {
    const prisma = makePrisma();
    prisma.contentGeneration.findFirst.mockResolvedValueOnce({ status: 'READY' });
    prisma.thumbnailGeneration.findFirst.mockResolvedValueOnce({ status: 'succeeded' });
    const operationAlerts = {
      start: vi.fn(),
      findByOperationKey: vi.fn().mockResolvedValue(makeAlert({
        productName: '자석 다트게임',
        children: { detail_page: 'queued', thumbnail: 'queued' },
        childIds: {
          detailPageGenerationId: 'content-generation-1',
          thumbnailGenerationId: null,
        },
      })),
      progress: vi.fn(),
      succeed: vi.fn().mockResolvedValue(makeAlert({})),
      fail: vi.fn(),
    };
    const service = new ProductGenerationAlertService(prisma as never, operationAlerts as never);

    await service.markChildFinished({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: OPERATION_KEY,
      childKind: 'thumbnail',
      status: 'succeeded',
      childId: 'thumbnail-generation-1',
    });

    expect(operationAlerts.succeed).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({
        message: '상세페이지와 썸네일 생성이 완료되었습니다.',
        progress: 1,
        metadata: expect.objectContaining({
          children: { detail_page: 'succeeded', thumbnail: 'succeeded' },
          childIds: {
            detailPageGenerationId: 'content-generation-1',
            thumbnailGenerationId: 'thumbnail-generation-1',
          },
        }),
      }),
    );
  });

  it('recomputes terminal parent state from child ledgers instead of stale metadata', async () => {
    const prisma = makePrisma();
    prisma.contentGeneration.findFirst.mockResolvedValueOnce({ status: 'READY' });
    prisma.thumbnailGeneration.findFirst.mockResolvedValueOnce({ status: 'succeeded' });
    const operationAlerts = {
      start: vi.fn(),
      findByOperationKey: vi.fn().mockResolvedValue(makeAlert({
        productName: '자석 다트게임',
        children: { detail_page: 'queued', thumbnail: 'queued' },
        childIds: {
          detailPageGenerationId: 'content-generation-1',
          thumbnailGenerationId: 'thumbnail-generation-1',
        },
      })),
      progress: vi.fn(),
      succeed: vi.fn().mockResolvedValue(makeAlert({})),
      fail: vi.fn(),
    };
    const service = new ProductGenerationAlertService(prisma as never, operationAlerts as never);

    await service.markChildFinished({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: OPERATION_KEY,
      childKind: 'thumbnail',
      status: 'succeeded',
      childId: 'thumbnail-generation-1',
    });

    expect(operationAlerts.succeed).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({
        metadata: expect.objectContaining({
          children: { detail_page: 'succeeded', thumbnail: 'succeeded' },
        }),
      }),
    );
    expect(operationAlerts.progress).not.toHaveBeenCalled();
  });

  it('does not let synthetic enqueue IDs overwrite recorded child ledger IDs', async () => {
    const prisma = makePrisma();
    prisma.contentGeneration.findFirst.mockResolvedValueOnce({ status: 'FAILED' });
    prisma.thumbnailGeneration.findFirst.mockResolvedValueOnce(null);
    const operationAlerts = {
      start: vi.fn(),
      findByOperationKey: vi.fn().mockResolvedValue(makeAlert({
        productName: '자석 다트게임',
        children: { detail_page: 'queued', thumbnail: 'queued' },
        childIds: {
          detailPageGenerationId: 'content-generation-1',
          thumbnailGenerationId: null,
        },
      })),
      progress: vi.fn().mockResolvedValue(makeAlert({})),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const service = new ProductGenerationAlertService(prisma as never, operationAlerts as never);

    await service.markChildFinished({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: OPERATION_KEY,
      childKind: 'detail_page',
      status: 'failed',
      childId: 'detail-enqueue',
      errorMessage: 'queue down',
    });

    expect(operationAlerts.progress).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({
        metadata: expect.objectContaining({
          childIds: {
            detailPageGenerationId: 'content-generation-1',
            thumbnailGenerationId: null,
          },
        }),
      }),
    );
  });

  it('fails parent alert after any child fails and both children are terminal', async () => {
    const prisma = makePrisma();
    prisma.contentGeneration.findFirst.mockResolvedValueOnce({ status: 'FAILED' });
    prisma.thumbnailGeneration.findFirst.mockResolvedValueOnce({ status: 'succeeded' });
    const operationAlerts = {
      start: vi.fn(),
      findByOperationKey: vi.fn().mockResolvedValue(makeAlert({
        productName: '자석 다트게임',
        children: { detail_page: 'queued', thumbnail: 'queued' },
        childIds: {
          detailPageGenerationId: 'content-generation-1',
          thumbnailGenerationId: null,
        },
      })),
      progress: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn().mockResolvedValue(makeAlert({})),
    };
    const service = new ProductGenerationAlertService(prisma as never, operationAlerts as never);

    await service.markChildFinished({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: OPERATION_KEY,
      childKind: 'thumbnail',
      status: 'succeeded',
      childId: 'thumbnail-generation-1',
    });

    expect(operationAlerts.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({
        message: '상품 생성 일부 실패: 상세페이지 생성 실패',
        progress: 1,
        metadata: expect.objectContaining({
          children: { detail_page: 'failed', thumbnail: 'succeeded' },
        }),
      }),
    );
  });

  it('does not reopen a cancelled parent product generation alert when a child finishes late', async () => {
    const prisma = makePrisma();
    const operationAlerts = {
      start: vi.fn(),
      findByOperationKey: vi.fn().mockResolvedValue(
        { ...makeAlert({}), status: 'cancelled', metadata: {}, progress: 0.5 },
      ),
      progress: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const service = new ProductGenerationAlertService(prisma as never, operationAlerts as never);

    const result = await service.markChildFinished({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: OPERATION_KEY,
      childKind: 'detail_page',
      status: 'succeeded',
      childId: 'cg-1',
    });

    expect(operationAlerts.progress).not.toHaveBeenCalled();
    expect(operationAlerts.succeed).not.toHaveBeenCalled();
    expect(operationAlerts.fail).not.toHaveBeenCalled();
    expect(result?.status).toBe('cancelled');
  });
});
