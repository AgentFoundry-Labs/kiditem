import { describe, expect, it, vi } from 'vitest';
import { DetailPageReconcileRepositoryAdapter } from '../detail-page-reconcile.repository.adapter';

describe('DetailPageReconcileRepositoryAdapter', () => {
  it('scans terminal detail-page agent requests by organization, source, and time window', async () => {
    const since = new Date('2026-05-18T00:00:00.000Z');
    const prisma = {
      agentRunRequest: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      contentGeneration: {
        findFirst: vi.fn(),
      },
    };
    const repository = new DetailPageReconcileRepositoryAdapter(prisma as never);

    await repository.listTerminalRequests({
      organizationId: 'org-1',
      since,
      limit: 25,
    });

    expect(prisma.agentRunRequest.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        sourceResourceType: 'content_generation',
        source: 'ai.detail_page_generate',
        status: { in: ['succeeded', 'failed'] },
        finishedAt: { gte: since },
      },
      orderBy: { finishedAt: 'desc' },
      take: 25,
    });
  });
});
