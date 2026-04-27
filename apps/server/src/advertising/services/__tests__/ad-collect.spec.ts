import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdCollectService } from '../ad-collect.service';

/**
 * H3 — `getStatus` reads `ChannelScrapeRun` for last-collected metadata + per-bucket
 * counts. Legacy `AdSnapshot` reads are gone.
 */
describe('AdCollectService (H3 — scrape-run status)', () => {
  let service: AdCollectService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      channelScrapeRun: {
        findFirst: vi.fn(),
        count: vi.fn(),
      },
    };
    service = new AdCollectService(prisma);
  });

  it('returns latest run finishedAt as lastCollectedAt and per-bucket counts', async () => {
    prisma.channelScrapeRun.findFirst.mockResolvedValue({
      finishedAt: new Date('2026-04-27T05:00:00Z'),
      startedAt: new Date('2026-04-27T04:00:00Z'),
    });
    // count() is called twice — once for advertising bucket, once for wing
    prisma.channelScrapeRun.count
      .mockResolvedValueOnce(15) // campaign
      .mockResolvedValueOnce(8); // product (wing)

    const result = await service.getStatus('company-1');

    expect(result.lastCollectedAt).toEqual(new Date('2026-04-27T05:00:00Z'));
    expect(result.campaignSnapshotCount).toBe(15);
    expect(result.productSnapshotCount).toBe(8);

    // Verify the bucket filters
    const counts = prisma.channelScrapeRun.count.mock.calls;
    expect(counts[0][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          source: 'advertising',
          pageType: { in: ['campaign', 'keyword', 'product', 'advertising'] },
        }),
      }),
    );
    expect(counts[1][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          source: 'wing',
          pageType: { in: ['itemwinner', 'traffic'] },
        }),
      }),
    );
  });

  it('falls back to startedAt when finishedAt is null', async () => {
    prisma.channelScrapeRun.findFirst.mockResolvedValue({
      finishedAt: null,
      startedAt: new Date('2026-04-27T01:00:00Z'),
    });
    prisma.channelScrapeRun.count.mockResolvedValue(0);

    const result = await service.getStatus('company-1');

    expect(result.lastCollectedAt).toEqual(new Date('2026-04-27T01:00:00Z'));
  });

  it('empty-state — no run rows returns null lastCollectedAt and zero counts', async () => {
    prisma.channelScrapeRun.findFirst.mockResolvedValue(null);
    prisma.channelScrapeRun.count.mockResolvedValue(0);

    const result = await service.getStatus('company-1');

    expect(result.lastCollectedAt).toBeNull();
    expect(result.campaignSnapshotCount).toBe(0);
    expect(result.productSnapshotCount).toBe(0);
  });

  it('passes companyId through all reads', async () => {
    prisma.channelScrapeRun.findFirst.mockResolvedValue(null);
    prisma.channelScrapeRun.count.mockResolvedValue(0);

    await service.getStatus('company-xyz');

    expect(prisma.channelScrapeRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company-xyz' } }),
    );
    for (const call of prisma.channelScrapeRun.count.mock.calls) {
      expect(call[0].where.companyId).toBe('company-xyz');
    }
  });
});
