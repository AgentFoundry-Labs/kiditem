import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { PanelService } from '../panel.service';
import { PrismaService } from '../../../../../prisma/prisma.service';

describe('PanelService', () => {
  let service: PanelService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workflowRun: { findMany: vi.fn().mockResolvedValue([]) },
      operationRun: { findMany: vi.fn().mockResolvedValue([]) },
      thumbnailGeneration: { findMany: vi.fn().mockResolvedValue([]) },
      alert: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PanelService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(PanelService);
  });

  it('snapshot filters by organizationId and visibility', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([
      {
        id: 'r1', status: 'running', templateId: 't1',
        template: { name: 'Run A' },
        steps: [],
        triggeredByUserId: 'user-a',
        createdAt: new Date(),
      },
      {
        id: 'r2', status: 'succeeded', templateId: 't2',
        template: { name: 'Run B' },
        steps: [],
        triggeredByUserId: null,
        createdAt: new Date(),
      },
    ]);

    const items = await service.snapshot('co-1', 'user-a');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'workflow:r1', visibility: 'user', actorUserId: 'user-a' });
    expect(items[1]).toMatchObject({ id: 'workflow:r2', visibility: 'organization' });
  });

  it('snapshot filters out other users user-scoped items', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([
      { id: 'r1', status: 'running', template: { name: 'Mine' }, steps: [], triggeredByUserId: 'user-a', createdAt: new Date() },
      { id: 'r2', status: 'running', template: { name: 'Others' }, steps: [], triggeredByUserId: 'user-b', createdAt: new Date() },
    ]);
    const items = await service.snapshot('co-1', 'user-a');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('workflow:r1');
  });

  it('queries with organizationId + pending/running OR updatedAt window', async () => {
    await service.snapshot('co-1', 'user-a');
    expect(prisma.workflowRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'co-1',
          OR: expect.arrayContaining([
            { status: { in: ['pending', 'running'] } },
            expect.objectContaining({
              updatedAt: expect.objectContaining({ gte: expect.any(Date) }),
            }),
          ]),
        }),
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: { template: { select: { name: true } } },
      }),
    );
    expect(prisma.operationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'co-1',
          OR: expect.arrayContaining([
            { status: { in: ['queued', 'waiting_runtime', 'running', 'attention_required'] } },
            expect.objectContaining({
              updatedAt: expect.objectContaining({ gte: expect.any(Date) }),
            }),
          ]),
        }),
        take: 100,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('projects the canonical OperationRun ledger into the panel snapshot', async () => {
    const now = new Date();
    prisma.operationRun.findMany.mockResolvedValue([{
      id: '11111111-1111-1111-1111-111111111111',
      organizationId: 'co-1',
      operationKey: 'inventory.refresh_sellpia_snapshot',
      definitionVersion: 1,
      title: '셀피아 재고 스냅샷 갱신',
      ownerDomain: 'inventory',
      engineType: 'browser',
      status: 'waiting_runtime',
      triggerSource: 'dashboard',
      requestedByUserId: null,
      parentRunId: null,
      scheduleId: null,
      idempotencyKey: null,
      input: {},
      result: null,
      progress: null,
      nativeRunType: null,
      nativeRunId: null,
      attempts: 0,
      maxAttempts: 3,
      claimedBy: null,
      attemptToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
      scheduledFor: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
      requestedBy: null,
    }]);

    await expect(service.snapshot('co-1', 'user-a')).resolves.toContainEqual(
      expect.objectContaining({
        id: 'operation:11111111-1111-1111-1111-111111111111',
        source: 'operation',
        phase: 'waiting_runtime',
        subtitle: '실행 중',
      }),
    );
  });

  it('alert findMany scopes by organizationId and includes long-running operation alerts beyond 24h', async () => {
    await service.snapshot('co-1', 'user-a');
    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'co-1',
          OR: expect.arrayContaining([
            expect.objectContaining({
              createdAt: expect.objectContaining({ gte: expect.any(Date) }),
            }),
            expect.objectContaining({
              updatedAt: expect.objectContaining({ gte: expect.any(Date) }),
            }),
            {
              kind: 'operation',
              status: { in: ['pending', 'running'] },
            },
          ]),
        }),
      }),
    );
  });

  it('computes progress subtitle from succeeded step count', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([
      {
        id: 'r1',
        status: 'running',
        template: { name: 'Progress' },
        steps: [
          { status: 'succeeded' },
          { status: 'succeeded' },
          { status: 'pending' },
        ],
        triggeredByUserId: null,
        createdAt: new Date(),
      },
    ]);
    const items = await service.snapshot('co-1', 'user-a');
    expect(items[0]).toMatchObject({ subtitle: '2/3 단계', progress: 2 / 3 });
  });

  it('suppresses thumbnail run projection when a matching operation alert is visible', async () => {
    const now = new Date();
    prisma.thumbnailGeneration.findMany.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        status: 'running',
        phase: null,
        triggeredByUserId: 'user-a',
        createdAt: now,
        contentWorkspace: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', displayName: 'Alert-backed product' },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        status: 'running',
        phase: null,
        triggeredByUserId: 'user-a',
        createdAt: now,
        contentWorkspace: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', displayName: 'Workspace image product' },
      },
    ]);
    prisma.alert.findMany.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        kind: 'operation',
        status: 'running',
        type: 'thumbnail_edit_job',
        severity: 'info',
        title: '썸네일 편집',
        message: null,
        targetType: 'master',
        targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        operationKey: 'thumbnail-edit:11111111-1111-4111-8111-111111111111',
        sourceType: 'thumbnail_generation',
        sourceId: '11111111-1111-4111-8111-111111111111',
        actorUserId: 'aaaaaaaa-1111-4111-8111-aaaaaaaa1111',
        href: '/product-pipeline/thumbnail-generation?generationId=11111111-1111-4111-8111-111111111111',
        progress: 0,
        metadata: {},
        isRead: false,
        readAt: null,
        actionTaskId: null,
        startedAt: now,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const items = await service.snapshot('co-1', 'user-a');

    expect(items.map((item) => item.id)).not.toContain('image:11111111-1111-4111-8111-111111111111');
    expect(items.map((item) => item.id)).toContain('image:22222222-2222-4222-8222-222222222222');
    expect(items.map((item) => item.id)).toContain('33333333-3333-4333-8333-333333333333');
  });

  it('projects product_generation parent operation alerts with collected product href', async () => {
    const now = new Date();
    prisma.alert.findMany.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        organizationId: 'co-1',
        kind: 'operation',
        status: 'running',
        type: 'product_generation',
        severity: 'info',
        title: '상품 생성 중: 자석 다트게임',
        message: null,
        operationKey: 'product-generation:batch-1',
        sourceType: 'sourcing_candidate',
        sourceId: '00000000-0000-4000-8000-000000000003',
        targetType: 'sourcing_candidate',
        targetId: '00000000-0000-4000-8000-000000000003',
        actorUserId: '11111111-1111-4111-8111-111111111111',
        href: '/product-pipeline/collected-products/00000000-0000-4000-8000-000000000003',
        progress: 0.15,
        metadata: {
          children: { detail_page: 'queued', thumbnail: 'queued' },
        },
        isRead: false,
        readAt: null,
        actionTaskId: null,
        startedAt: now,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const items = await service.snapshot('co-1', 'user-a');
    const item = items.find((entry) => entry.id === '44444444-4444-4444-8444-444444444444');

    expect(item).toMatchObject({
      kind: 'alert',
      alertKind: 'operation',
      title: '상품 생성 중: 자석 다트게임',
      href: '/product-pipeline/collected-products/00000000-0000-4000-8000-000000000003',
      operationKey: 'product-generation:batch-1',
      sourceType: 'sourcing_candidate',
      sourceId: '00000000-0000-4000-8000-000000000003',
    });
  });
});
