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
});
