import { describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceSnapshotRepositoryAdapter } from '../sourcing-workspace-snapshot.repository.adapter';

describe('SourcingWorkspaceSnapshotRepositoryAdapter 1688 append', () => {
  it('serializes the daily merge and keeps the incoming stable offer version', async () => {
    const businessDate = new Date('2026-08-09T00:00:00.000Z');
    const upsert = vi.fn(async (input: { create: Record<string, unknown> }) => ({
      id: 'snapshot-1',
      organizationId: 'org-1',
      scope: '1688_new_products',
      businessDate,
      projectionVersion: 'legacy',
      inputHash: '',
      payload: input.create.payload,
      createdAt: businessDate,
      updatedAt: businessDate,
    }));
    const tx = {
      $queryRaw: vi.fn(async () => []),
      sourcingWorkspaceSnapshot: {
        findUnique: vi.fn(async () => ({
          payload: {
            result: {
              items: [{
                offerId: 'offer-1',
                title: 'old title',
                sourceUrl: 'https://detail.1688.com/offer/1.html',
              }],
            },
          },
        })),
        upsert,
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new SourcingWorkspaceSnapshotRepositoryAdapter(prisma as never);

    await repository.append1688Items({
      organizationId: 'org-1',
      businessDate,
      source: '1688_keyword',
      items: [
        {
          offerId: 'offer-1',
          title: 'fresh title',
          sourceUrl: 'https://detail.1688.com/offer/1.html',
        },
        {
          offerId: 'offer-2',
          title: 'new title',
          sourceUrl: 'https://detail.1688.com/offer/2.html',
        },
      ],
      limit: 240,
      generatedAt: new Date('2026-08-09T02:00:00.000Z'),
    });

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        payload: expect.objectContaining({
          result: expect.objectContaining({
            items: [
              expect.objectContaining({ offerId: 'offer-1', title: 'fresh title' }),
              expect.objectContaining({ offerId: 'offer-2', title: 'new title' }),
            ],
          }),
        }),
      }),
    }));
  });
});
