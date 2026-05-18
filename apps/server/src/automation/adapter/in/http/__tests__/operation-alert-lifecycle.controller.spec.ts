import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { OperationAlertLifecycleController } from '../operation-alert-lifecycle.controller';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OPERATION_KEY = 'dashboard.collect:wing_sales';

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    organizationId: ORGANIZATION_ID,
    kind: 'operation',
    status: 'running',
    type: 'dashboard_data_collect',
    severity: 'info',
    title: 'Wing 매출 수집',
    message: null,
    targetType: null,
    targetId: null,
    operationKey: OPERATION_KEY,
    sourceType: 'readiness_check',
    sourceId: 'wing_sales',
    actorUserId: USER_ID,
    actionTaskId: null,
    href: '/dashboard',
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
        type: 'dashboard_data_collect',
        title: 'client-supplied title is ignored',
        sourceType: 'readiness_check',
        sourceId: 'wing_sales',
        href: '/settings',
        metadata: { lookbackDays: 14 },
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: OPERATION_KEY,
        actorUserId: USER_ID,
        type: 'dashboard_data_collect',
        title: '쿠팡 Wing 데이터 수집',
        sourceType: 'readiness_check',
        sourceId: 'wing_sales',
        href: '/dashboard',
        metadata: { lookbackDays: 14 },
      }),
    );
  });

  it('returns the AlertItem-shaped row with ISO date strings', async () => {
    const { controller, service } = makeController();
    service.start.mockResolvedValueOnce(alertRow());

    const result = await controller.start(
      {
        operationKey: OPERATION_KEY,
        type: 'dashboard_data_collect',
        title: 'Wing 매출 수집',
        sourceType: 'readiness_check',
        sourceId: 'wing_sales',
        href: '/dashboard',
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

  it('rejects unsupported browser operation alert producers', async () => {
    const { controller } = makeController();

    await expect(
      controller.start(
        {
          operationKey: 'anything',
          type: 'thumbnail_edit_job',
          title: '임의 조작',
          sourceType: 'thumbnail_generation',
          href: '/product-pipeline/thumbnail-generation',
        },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toThrow('unsupported operation alert producer');
  });

  it('rejects unknown readiness source ids instead of trusting client title/href', async () => {
    const { controller } = makeController();

    await expect(
      controller.start(
        {
          operationKey: 'dashboard.collect:unknown',
          type: 'dashboard_data_collect',
          title: '임의 수집',
          sourceType: 'readiness_check',
          sourceId: 'unknown',
          href: '/dashboard',
        },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toThrow('unsupported operation alert producer');
  });

  it('accepts thumbnail analysis browser batch producer and canonicalizes title/href', async () => {
    const { controller, service } = makeController();
    service.start.mockResolvedValueOnce(
      alertRow({
        type: 'thumbnail_analysis',
        title: '썸네일 AI 분류',
        sourceType: 'browser_batch',
        sourceId: 'all',
        href: '/product-pipeline/thumbnail-generation',
      }),
    );

    await controller.start(
      {
        operationKey: 'thumbnail-analysis:batch:test',
        type: 'thumbnail_analysis',
        title: 'client title ignored',
        sourceType: 'browser_batch',
        sourceId: 'all',
        href: '/settings',
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: 'thumbnail-analysis:batch:test',
        actorUserId: USER_ID,
        type: 'thumbnail_analysis',
        title: '썸네일 AI 분류',
        sourceType: 'browser_batch',
        sourceId: 'all',
        href: '/product-pipeline/thumbnail-generation',
      }),
    );
  });
});

describe('OperationAlertLifecycleController.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dispatches running -> progress', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(alertRow());
    service.progress.mockResolvedValueOnce(alertRow({ progress: 0.4 }));

    await controller.update(
      OPERATION_KEY,
      { status: 'running', progress: 0.4 },
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

  it('dispatches succeeded -> succeed and forwards href patch', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(alertRow());
    service.succeed.mockResolvedValueOnce(
      alertRow({ status: 'succeeded', progress: 1, href: '/dashboard?ok=1' }),
    );

    await controller.update(
      OPERATION_KEY,
      { status: 'succeeded', href: '/dashboard?ok=1' },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.succeed).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({ href: '/dashboard?ok=1' }),
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
        metadata: { failed: 3 },
      },
      ORGANIZATION_ID,
      { id: USER_ID } as any,
    );

    expect(service.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OPERATION_KEY,
      expect.objectContaining({
        message: 'extension scrape timeout',
        metadata: { failed: 3 },
      }),
    );
  });

  it('dispatches cancelled -> cancel', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(alertRow());
    service.cancel.mockResolvedValueOnce(alertRow({ status: 'cancelled' }));

    await controller.update(
      OPERATION_KEY,
      { status: 'cancelled' },
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
        { status: 'succeeded' },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when another user tries to update the lifecycle row', async () => {
    const { controller, service } = makeController();
    service.findByOperationKey.mockResolvedValueOnce(alertRow({ actorUserId: 'other-user' }));

    await expect(
      controller.update(
        OPERATION_KEY,
        { status: 'succeeded' },
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
        { status: 'succeeded' },
        ORGANIZATION_ID,
        { id: USER_ID } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(service.succeed).not.toHaveBeenCalled();
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
