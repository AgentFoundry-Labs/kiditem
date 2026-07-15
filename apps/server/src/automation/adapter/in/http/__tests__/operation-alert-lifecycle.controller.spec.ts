import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OperationAlertLifecycleController } from '../operation-alert-lifecycle.controller';
import { OperationAlertOwnershipConflictError } from '../../../../domain/errors/operation-alert-ownership-conflict.error';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const COLLECTION_RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OPERATION_KEY = `browser-collection:${COLLECTION_RUN_ID}`;
const COLLECTION_ORDERING_METADATA = {
  browserCollection: true,
  collectionAttempt: 1,
  collectionUpdatedAt: 1_700_000_001_000,
};

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    organizationId: ORGANIZATION_ID,
    kind: 'operation',
    status: 'running',
    type: 'browser_collection',
    severity: 'info',
    title: '쿠팡 Wing 데이터 수집',
    message: null,
    targetType: null,
    targetId: null,
    operationKey: OPERATION_KEY,
    sourceType: 'browser_collection_session',
    sourceId: 'dashboard.wing_sales',
    actorUserId: USER_ID,
    actionTaskId: null,
    href: `/dashboard?collectionRun=${COLLECTION_RUN_ID}`,
    progress: 0,
    metadata: { lookbackDays: 14 },
    isRead: false,
    readAt: null,
    startedAt: new Date('2026-05-09T00:00:00Z'),
    finishedAt: null,
    createdAt: new Date('2026-05-09T00:00:00Z'),
    updatedAt: new Date('2026-05-09T00:00:00Z'),
    ...overrides,
  };
}

function makeService() {
  return {
    findByOperationKey: vi.fn(),
    start: vi.fn(),
    attention: vi.fn(),
    progress: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    cancel: vi.fn(),
    closeStaleOperations: vi.fn(),
  };
}

function makeController() {
  const service = makeService();
  const controller = new OperationAlertLifecycleController(service as any);
  return { controller, service };
}

describe('OperationAlertLifecycleController.start', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards organizationId and actorUserId while canonicalizing browser-owned title/href', async () => {
    const { controller, service } = makeController();
    service.start.mockResolvedValueOnce(alertRow());

    await controller.start(
      {
        operationKey: OPERATION_KEY,
        type: 'browser_collection',
        title: 'client-supplied title is ignored',
        sourceType: 'browser_collection_session',
        sourceId: 'dashboard.wing_sales',
        href: '/settings',
        metadata: { ...COLLECTION_ORDERING_METADATA, lookbackDays: 14 },
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: OPERATION_KEY,
        actorUserId: USER_ID,
        type: 'browser_collection',
        title: '쿠팡 Wing 데이터 수집',
        sourceType: 'browser_collection_session',
        sourceId: 'dashboard.wing_sales',
        href: `/dashboard?collectionRun=${COLLECTION_RUN_ID}`,
        metadata: { ...COLLECTION_ORDERING_METADATA, lookbackDays: 14 },
      }),
    );
  });

  it('returns the AlertItem-shaped row with ISO date strings', async () => {
    const { controller, service } = makeController();
    service.start.mockResolvedValueOnce(alertRow());

    const result = await controller.start(
      {
        operationKey: OPERATION_KEY,
        type: 'browser_collection',
        title: 'Wing 매출 수집',
        sourceType: 'browser_collection_session',
        sourceId: 'dashboard.wing_sales',
        href: '/dashboard',
        metadata: COLLECTION_ORDERING_METADATA,
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(result.id).toBeDefined();
    expect(result.status).toBe('running');
    expect(result.organizationId).toBe(ORGANIZATION_ID);
    expect(result.actorUserId).toBe(USER_ID);
    expect(result.startedAt).toBe('2026-05-09T00:00:00.000Z');
    expect(result.createdAt).toBe('2026-05-09T00:00:00.000Z');
  });

  it('returns 400 for a forged browser collection producer', async () => {
    const { controller } = makeController();

    await expect(
      controller.start(
        {
          operationKey: OPERATION_KEY,
          type: 'browser_collection',
          title: '임의 조작',
          sourceType: 'browser_collection_session',
          sourceId: 'advertising.forged',
          href: '/settings',
          metadata: COLLECTION_ORDERING_METADATA,
        },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 400 for a non-UUID browser collection operation key', async () => {
    const { controller } = makeController();

    await expect(
      controller.start(
        {
          operationKey: 'browser-collection:not-a-uuid',
          type: 'browser_collection',
          title: '임의 수집',
          sourceType: 'browser_collection_session',
          sourceId: 'dashboard.wing_sales',
          href: '/dashboard',
          metadata: COLLECTION_ORDERING_METADATA,
        },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    '------------------------------------',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ])('returns 400 for the UUID lookalike %s', async (runId) => {
    const { controller } = makeController();

    await expect(
      controller.start(
        {
          operationKey: `browser-collection:${runId}`,
          type: 'browser_collection',
          title: '임의 수집',
          sourceType: 'browser_collection_session',
          sourceId: 'dashboard.wing_sales',
          href: '/dashboard',
          metadata: COLLECTION_ORDERING_METADATA,
        },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 without restarting another actor personal alert', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(
      alertRow({ actorUserId: OTHER_USER_ID }),
    );

    await expect(
      controller.start(
        {
          operationKey: OPERATION_KEY,
          type: 'browser_collection',
          title: 'Wing 매출 수집',
          sourceType: 'browser_collection_session',
          sourceId: 'dashboard.wing_sales',
          href: '/dashboard',
          metadata: COLLECTION_ORDERING_METADATA,
        },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(service.start).not.toHaveBeenCalled();
  });

  it('returns 404 when another actor wins the operation-key existence race', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(null);
    service.start.mockRejectedValueOnce(
      new OperationAlertOwnershipConflictError(),
    );

    await expect(
      controller.start(
        {
          operationKey: OPERATION_KEY,
          type: 'browser_collection',
          title: 'Wing 매출 수집',
          sourceType: 'browser_collection_session',
          sourceId: 'dashboard.wing_sales',
          href: '/dashboard',
          metadata: COLLECTION_ORDERING_METADATA,
        },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('appends collectionRun with an ampersand when the canonical route has a query', async () => {
    const { controller, service } = makeController();
    service.start.mockResolvedValueOnce(
      alertRow({
        title: '쿠팡 로켓 매출 수집',
        sourceId: 'dashboard.rocket_sales',
        href: `/sales-analysis?tab=rocket-daily&collectionRun=${COLLECTION_RUN_ID}`,
      }),
    );

    await controller.start(
      {
        operationKey: OPERATION_KEY,
        type: 'browser_collection',
        title: 'client title ignored',
        sourceType: 'browser_collection_session',
        sourceId: 'dashboard.rocket_sales',
        href: '/settings',
        metadata: COLLECTION_ORDERING_METADATA,
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: OPERATION_KEY,
        actorUserId: USER_ID,
        type: 'browser_collection',
        title: '쿠팡 로켓 매출 수집',
        sourceType: 'browser_collection_session',
        sourceId: 'dashboard.rocket_sales',
        href: `/sales-analysis?tab=rocket-daily&collectionRun=${COLLECTION_RUN_ID}`,
      }),
    );
  });

  it.each([
    undefined,
    { browserCollection: true, collectionAttempt: 0, collectionUpdatedAt: 100 },
    { browserCollection: true, collectionAttempt: 1.5, collectionUpdatedAt: 100 },
    { browserCollection: true, collectionAttempt: 1, collectionUpdatedAt: -1 },
    { browserCollection: true, attempt: 1, collectionUpdatedAt: 100 },
  ])('rejects invalid browser collection ordering metadata: %j', async (metadata) => {
    const { controller, service } = makeController();

    await expect(
      controller.start(
        {
          operationKey: OPERATION_KEY,
          type: 'browser_collection',
          title: 'Wing 매출 수집',
          sourceType: 'browser_collection_session',
          sourceId: 'dashboard.wing_sales',
          href: '/dashboard',
          metadata,
        },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.start).not.toHaveBeenCalled();
  });
});

describe('OperationAlertLifecycleController.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dispatches pending -> attention without trusting an href patch', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(alertRow());
    service.attention.mockResolvedValueOnce(
      alertRow({ status: 'pending', severity: 'warning' }),
    );

    await controller.update(
      OPERATION_KEY,
      {
        status: 'pending',
        message: 'Wing 로그인이 필요합니다.',
        href: '/settings',
        metadata: {
          ...COLLECTION_ORDERING_METADATA,
          attentionReason: 'marketplace_login',
        },
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.attention).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({
        message: 'Wing 로그인이 필요합니다.',
        metadata: {
          ...COLLECTION_ORDERING_METADATA,
          attentionReason: 'marketplace_login',
        },
      }),
    );
    expect(service.attention.mock.calls[0]?.[2]).not.toHaveProperty('href');
  });

  it('dispatches running -> progress', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(alertRow());
    service.progress.mockResolvedValueOnce(alertRow({ progress: 0.4 }));

    await controller.update(
      OPERATION_KEY,
      {
        status: 'running',
        progress: 0.4,
        metadata: COLLECTION_ORDERING_METADATA,
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.progress).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({ progress: 0.4 }),
    );
    expect(service.succeed).not.toHaveBeenCalled();
  });

  it('dispatches succeeded -> succeed without trusting an href patch', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(alertRow());
    service.succeed.mockResolvedValueOnce(
      alertRow({ status: 'succeeded', progress: 1, href: '/dashboard?ok=1' }),
    );

    await controller.update(
      OPERATION_KEY,
      {
        status: 'succeeded',
        href: '/dashboard?ok=1',
        metadata: COLLECTION_ORDERING_METADATA,
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.succeed).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.not.objectContaining({ href: '/dashboard?ok=1' }),
    );
  });

  it('dispatches failed -> fail and forwards message + metadata', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(alertRow());
    service.fail.mockResolvedValueOnce(alertRow({ status: 'failed' }));

    await controller.update(
      OPERATION_KEY,
      {
        status: 'failed',
        message: 'extension scrape timeout',
        metadata: { ...COLLECTION_ORDERING_METADATA, failed: 3 },
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({
        message: 'extension scrape timeout',
        metadata: { ...COLLECTION_ORDERING_METADATA, failed: 3 },
      }),
    );
  });

  it('dispatches cancelled -> cancel', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(alertRow());
    service.cancel.mockResolvedValueOnce(alertRow({ status: 'cancelled' }));

    await controller.update(
      OPERATION_KEY,
      { status: 'cancelled', metadata: COLLECTION_ORDERING_METADATA },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.cancel).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.any(Object),
    );
  });

  it('returns 404 when no alert matches the (organizationId, operationKey) pair', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(null);

    await expect(
      controller.update(
        OPERATION_KEY,
        { status: 'succeeded', metadata: COLLECTION_ORDERING_METADATA },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when another user tries to update the lifecycle row', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(
      alertRow({ actorUserId: OTHER_USER_ID }),
    );

    await expect(
      controller.update(
        OPERATION_KEY,
        { status: 'succeeded', metadata: COLLECTION_ORDERING_METADATA },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(service.succeed).not.toHaveBeenCalled();
  });

  it('returns 404 when the row is not owned by the browser operation API', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(
      alertRow({ type: 'thumbnail_edit_job', sourceType: 'thumbnail_generation' }),
    );

    await expect(
      controller.update(
        OPERATION_KEY,
        { status: 'succeeded', metadata: COLLECTION_ORDERING_METADATA },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(service.succeed).not.toHaveBeenCalled();
  });

  it('rejects updates without browser collection ordering metadata', async () => {
    const { controller, service } = makeController();

    await expect(
      controller.update(
        OPERATION_KEY,
        { status: 'running' },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.findByOperationKey).not.toHaveBeenCalled();
    expect(service.progress).not.toHaveBeenCalled();
  });
});

describe('OperationAlertLifecycleController.reconcileBrowserStale', () => {
  beforeEach(() => vi.clearAllMocks());

  it('closes stale browser thumbnail batch alerts inside the current organization only', async () => {
    const { controller, service } = makeController();
    const closed = alertRow({
      status: 'cancelled',
      type: 'thumbnail_analysis',
      title: '썸네일 AI 분류',
      sourceType: 'browser_batch',
      operationKey: 'thumbnail-analysis:batch:stale',
      message: '브라우저 작업 세션이 종료되어 진행 상태를 자동 정리했습니다.',
      finishedAt: new Date('2026-05-09T08:00:00Z'),
    });
    service.closeStaleOperations.mockResolvedValueOnce([closed]);

    const result = await controller.reconcileBrowserStale(
      { staleMinutes: 45, limit: 25 },
      ORGANIZATION_ID,
    );

    expect(service.closeStaleOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        type: 'thumbnail_analysis',
        sourceType: 'browser_batch',
        staleBefore: expect.any(Date),
        status: 'cancelled',
        message: '브라우저 작업 세션이 종료되어 진행 상태를 자동 정리했습니다.',
        metadata: expect.objectContaining({ staleReconciled: true }),
        limit: 25,
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      status: 'cancelled',
      sourceType: 'browser_batch',
      operationKey: 'thumbnail-analysis:batch:stale',
    });
  });
});
