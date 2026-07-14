import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { OperationAlertService } from '../operation-alert.service';
import { OperationAlertRepositoryAdapter } from '../../../adapter/out/repository/operation-alert.repository.adapter';
import { PANEL_EVENTS } from '../../../adapter/out/panel-event/panel-events';

const ORGANIZATION_ID = '11111111-1111-1111-1111-111111111111';
const ALERT_ID = '22222222-2222-2222-2222-222222222222';
const ACTOR_USER_ID = '33333333-3333-3333-3333-333333333333';
const OPERATION_KEY = 'detail-page:abc-123';

function existingAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: ALERT_ID,
    organizationId: ORGANIZATION_ID,
    kind: 'operation',
    status: 'running',
    type: 'detail_page_generation',
    severity: 'info',
    title: '상세페이지 생성 중',
    message: null,
    targetType: null,
    targetId: null,
    operationKey: OPERATION_KEY,
    sourceType: 'content_generation',
    sourceId: 'content-gen-1',
    actorUserId: ACTOR_USER_ID,
    actionTaskId: null,
    href: '/product-hub/p1',
    progress: 0,
    metadata: { templateId: 'kids-playful' },
    isRead: false,
    readAt: null,
    startedAt: new Date('2026-05-07T00:00:00Z'),
    finishedAt: null,
    createdAt: new Date('2026-05-07T00:00:00Z'),
    updatedAt: new Date('2026-05-07T00:00:00Z'),
    ...overrides,
  };
}

function makePrisma() {
  return {
    alert: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };
}

function makeEventEmitter() {
  return { emit: vi.fn() };
}

function makeService() {
  const prisma = makePrisma();
  const eventEmitter = makeEventEmitter();
  const repository = new OperationAlertRepositoryAdapter(prisma as any);
  const service = new OperationAlertService(repository, eventEmitter as any);
  return { service, prisma, eventEmitter };
}

describe('OperationAlertService.start', () => {
  it('creates a new operation alert when no row matches the key + emits panel UPSERT', async () => {
    const { service, prisma, eventEmitter } = makeService();
    prisma.alert.findFirst.mockResolvedValueOnce(null);
    const created = existingAlert();
    prisma.alert.create.mockResolvedValueOnce(created);

    const alert = await service.start({
      organizationId: ORGANIZATION_ID,
      operationKey: OPERATION_KEY,
      type: 'detail_page_generation',
      title: '상세페이지 생성 중',
      sourceType: 'content_generation',
      sourceId: 'content-gen-1',
      actorUserId: ACTOR_USER_ID,
      href: '/product-hub/p1',
      metadata: { templateId: 'kids-playful' },
    });

    expect(prisma.alert.findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, operationKey: OPERATION_KEY },
    });
    expect(prisma.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: OPERATION_KEY,
        kind: 'operation',
        status: 'running',
        type: 'detail_page_generation',
        title: '상세페이지 생성 중',
        sourceType: 'content_generation',
        sourceId: 'content-gen-1',
        actorUserId: ACTOR_USER_ID,
        href: '/product-hub/p1',
        progress: 0,
        startedAt: expect.any(Date),
        finishedAt: null,
        isRead: false,
        readAt: null,
      }),
    });
    expect(alert).toEqual(created);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      PANEL_EVENTS.UPSERT,
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );
  });

  it('upserts onto an existing row keyed by (organizationId, operationKey)', async () => {
    const { service, prisma, eventEmitter } = makeService();
    const existing = existingAlert({ status: 'failed', isRead: true });
    prisma.alert.findFirst
      .mockResolvedValueOnce(existing) // initial lookup in upsertByOperationKey
      .mockResolvedValueOnce({ ...existing, status: 'running', isRead: true }); // refreshed read

    await service.start({
      organizationId: ORGANIZATION_ID,
      operationKey: OPERATION_KEY,
      type: 'detail_page_generation',
      title: 'retry',
    });

    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(prisma.alert.updateMany).toHaveBeenCalledWith({
      where: {
        id: ALERT_ID,
        organizationId: ORGANIZATION_ID,
      },
      data: expect.objectContaining({
        status: 'running',
        // Honours existing read-state — do not flip back to unread on retry.
        isRead: true,
      }),
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      PANEL_EVENTS.UPSERT,
      expect.any(Object),
    );
  });

  it('translates P2002 race on create into a re-fetch of the winning row', async () => {
    const { service, prisma } = makeService();
    prisma.alert.findFirst
      .mockResolvedValueOnce(null) // first lookup — looked empty
      .mockResolvedValueOnce(existingAlert()); // race winner appeared

    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    prisma.alert.create.mockRejectedValueOnce(p2002);

    const alert = await service.start({
      organizationId: ORGANIZATION_ID,
      operationKey: OPERATION_KEY,
      type: 'detail_page_generation',
      title: 'race',
    });

    expect(alert.id).toBe(ALERT_ID);
  });

  it('does not throw when panel emit fails', async () => {
    const { service, prisma, eventEmitter } = makeService();
    prisma.alert.findFirst.mockResolvedValueOnce(null);
    prisma.alert.create.mockResolvedValueOnce(existingAlert());
    eventEmitter.emit.mockImplementation(() => {
      throw new Error('SSE bus down');
    });

    await expect(
      service.start({
        organizationId: ORGANIZATION_ID,
        operationKey: OPERATION_KEY,
        type: 'detail_page_generation',
        title: 'emit-failure',
      }),
    ).resolves.toBeDefined();
  });
});

describe('OperationAlertService.succeed / fail / progress / cancel', () => {
  it('succeed sets status=succeeded, progress=1, finishedAt + emits', async () => {
    const { service, prisma, eventEmitter } = makeService();
    const running = existingAlert();
    prisma.alert.findFirst
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce({ ...running, status: 'succeeded', progress: 1 });
    prisma.alert.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.succeed(ORGANIZATION_ID, OPERATION_KEY, {
      metadata: { candidateCount: 4 },
    });

    expect(prisma.alert.updateMany).toHaveBeenCalledWith({
      where: {
        id: ALERT_ID,
        organizationId: ORGANIZATION_ID,
        status: { in: ['pending', 'running'] },
      },
      data: expect.objectContaining({
        status: 'succeeded',
        progress: 1,
        finishedAt: expect.any(Date),
        // metadata merged onto existing { templateId: 'kids-playful' }
        metadata: { templateId: 'kids-playful', candidateCount: 4 },
      }),
    });
    expect(result?.status).toBe('succeeded');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      PANEL_EVENTS.UPSERT,
      expect.any(Object),
    );
  });

  it('fail sets status=failed, severity defaults to error, finishedAt + emits', async () => {
    const { service, prisma, eventEmitter } = makeService();
    const running = existingAlert();
    prisma.alert.findFirst
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce({ ...running, status: 'failed', severity: 'error' });
    prisma.alert.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.fail(ORGANIZATION_ID, OPERATION_KEY, {
      message: 'Gemini timeout',
      metadata: { error: 'gemini_timeout' },
    });

    expect(prisma.alert.updateMany).toHaveBeenCalledWith({
      where: {
        id: ALERT_ID,
        organizationId: ORGANIZATION_ID,
        status: { in: ['pending', 'running'] },
      },
      data: expect.objectContaining({
        status: 'failed',
        severity: 'error',
        message: 'Gemini timeout',
        finishedAt: expect.any(Date),
        metadata: { templateId: 'kids-playful', error: 'gemini_timeout' },
      }),
    });
    expect(result?.status).toBe('failed');
    expect(eventEmitter.emit).toHaveBeenCalled();
  });

  it('progress keeps status=running and does not set finishedAt', async () => {
    const { service, prisma } = makeService();
    const running = existingAlert();
    prisma.alert.findFirst
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce({ ...running, progress: 0.5 });
    prisma.alert.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.progress(ORGANIZATION_ID, OPERATION_KEY, { progress: 0.5 });

    expect(prisma.alert.updateMany).toHaveBeenCalledWith({
      where: {
        id: ALERT_ID,
        organizationId: ORGANIZATION_ID,
        status: { in: ['pending', 'running'] },
      },
      data: expect.objectContaining({
        status: 'running',
        progress: 0.5,
        finishedAt: null,
      }),
    });
  });

  it('cancel sets status=cancelled and finishedAt', async () => {
    const { service, prisma } = makeService();
    const running = existingAlert();
    prisma.alert.findFirst
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce({ ...running, status: 'cancelled' });
    prisma.alert.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.cancel(ORGANIZATION_ID, OPERATION_KEY);

    expect(prisma.alert.updateMany).toHaveBeenCalledWith({
      where: {
        id: ALERT_ID,
        organizationId: ORGANIZATION_ID,
        status: { in: ['pending', 'running'] },
      },
      data: expect.objectContaining({
        status: 'cancelled',
        finishedAt: expect.any(Date),
      }),
    });
  });

  it('returns null without throwing when no alert exists for the operationKey', async () => {
    const { service, prisma, eventEmitter } = makeService();
    prisma.alert.findFirst.mockResolvedValueOnce(null);

    const result = await service.succeed(ORGANIZATION_ID, OPERATION_KEY);

    expect(result).toBeNull();
    expect(prisma.alert.updateMany).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('does not reopen a cancelled operation when a late success arrives', async () => {
    const { service, prisma, eventEmitter } = makeService();
    const cancelled = existingAlert({
      status: 'cancelled',
      progress: 0.5,
      finishedAt: new Date('2026-05-07T01:00:00Z'),
      metadata: { cancel: { reason: 'user_cancelled' } },
    });
    prisma.alert.findFirst.mockResolvedValueOnce(cancelled);

    const result = await service.succeed(ORGANIZATION_ID, OPERATION_KEY, {
      metadata: { agentRunId: 'late-run' },
    });

    expect(result?.status).toBe('cancelled');
    expect(prisma.alert.updateMany).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('does not reopen a succeeded operation when a late progress arrives', async () => {
    const { service, prisma, eventEmitter } = makeService();
    const succeeded = existingAlert({ status: 'succeeded', progress: 1 });
    prisma.alert.findFirst.mockResolvedValueOnce(succeeded);

    const result = await service.progress(ORGANIZATION_ID, OPERATION_KEY, {
      progress: 0.8,
    });

    expect(result?.status).toBe('succeeded');
    expect(prisma.alert.updateMany).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('all transitions enforce organizationId scope on updateMany', async () => {
    const { service, prisma } = makeService();
    const running = existingAlert();
    prisma.alert.findFirst.mockResolvedValue(running);
    prisma.alert.updateMany.mockResolvedValue({ count: 1 });

    await service.succeed(ORGANIZATION_ID, OPERATION_KEY);
    await service.fail(ORGANIZATION_ID, OPERATION_KEY);
    await service.cancel(ORGANIZATION_ID, OPERATION_KEY);
    await service.progress(ORGANIZATION_ID, OPERATION_KEY, { progress: 0.3 });

    for (const call of prisma.alert.updateMany.mock.calls) {
      expect(call[0].where).toMatchObject({ organizationId: ORGANIZATION_ID });
    }
  });
});

describe('OperationAlertService.closeStaleOperations', () => {
  it('fails stale matching operation alerts and emits panel updates', async () => {
    const { service, prisma, eventEmitter } = makeService();
    const staleBefore = new Date('2026-05-10T10:00:00Z');
    const stale = existingAlert({
      id: '44444444-4444-4444-4444-444444444444',
      operationKey: 'coupang-sync:products',
      sourceType: 'coupang_sync',
      sourceId: 'job-1',
      updatedAt: new Date('2026-05-10T07:00:00Z'),
      metadata: { jobId: 'job-1', phase: 'scraping' },
    });
    const closed = {
      ...stale,
      status: 'failed',
      severity: 'error',
      message: '쿠팡 상품 동기화가 서버 재시작/배포 중 중단되어 자동 종료되었습니다.',
      finishedAt: new Date('2026-05-10T10:01:00Z'),
      metadata: { jobId: 'job-1', phase: 'finished', staleReconciled: true },
    };
    prisma.alert.findMany.mockResolvedValueOnce([stale]);
    prisma.alert.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.alert.findFirst.mockResolvedValueOnce(closed);

    const result = await service.closeStaleOperations({
      sourceType: 'coupang_sync',
      operationKeyPrefix: 'coupang-sync:',
      staleBefore,
      status: 'failed',
      message: '쿠팡 상품 동기화가 서버 재시작/배포 중 중단되어 자동 종료되었습니다.',
      metadata: { phase: 'finished', staleReconciled: true },
    });

    expect(prisma.alert.findMany).toHaveBeenCalledWith({
      where: {
        kind: 'operation',
        status: { in: ['pending', 'running'] },
        sourceType: 'coupang_sync',
        operationKey: { startsWith: 'coupang-sync:' },
        updatedAt: { lt: staleBefore },
      },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });
    expect(prisma.alert.updateMany).toHaveBeenCalledWith({
      where: {
        id: stale.id,
        organizationId: ORGANIZATION_ID,
        status: { in: ['pending', 'running'] },
      },
      data: expect.objectContaining({
        status: 'failed',
        severity: 'error',
        message: '쿠팡 상품 동기화가 서버 재시작/배포 중 중단되어 자동 종료되었습니다.',
        finishedAt: expect.any(Date),
        metadata: { jobId: 'job-1', phase: 'finished', staleReconciled: true },
      }),
    });
    expect(result).toEqual([closed]);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      PANEL_EVENTS.UPSERT,
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );
  });
});
