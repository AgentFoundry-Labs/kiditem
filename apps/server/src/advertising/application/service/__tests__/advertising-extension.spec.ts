import { describe, expect, it, vi } from 'vitest';
import { AdvertisingExtensionService } from '../advertising-extension.service';
import type { ChannelScrapeRepositoryPort } from '../../port/out/repository/channel-scrape.repository.port';

function buildService() {
  const scrapeRepo = {
    findExtensionStatusSnapshot: vi.fn(),
  } as unknown as ChannelScrapeRepositoryPort;
  return {
    service: new AdvertisingExtensionService(scrapeRepo),
    scrapeRepo,
  };
}

describe('AdvertisingExtensionService', () => {
  it('aggregates only the repository-provided published status evidence', async () => {
    const { service, scrapeRepo } = buildService();
    vi.mocked(scrapeRepo.findExtensionStatusSnapshot).mockResolvedValue({
      listingCount: 7,
      latestPerListing: [
        { isOfferWinner: true, lastObservedAt: new Date('2026-04-26T00:00:00Z') },
        { isOfferWinner: false, lastObservedAt: new Date('2026-04-27T00:00:00Z') },
        { isOfferWinner: null, lastObservedAt: new Date('2026-04-28T00:00:00Z') },
      ],
      rawSnapshotCount: 4,
      latestRun: {
        finishedAt: new Date('2026-04-28T03:00:00Z'),
        startedAt: new Date('2026-04-28T02:00:00Z'),
        pageType: 'itemwinner',
      },
      wingKpi: {
        normalizedJson: { kpis: { winner: 2, nested: { value: '3' } } },
        lastObservedAt: new Date('2026-04-28T03:00:00Z'),
      },
    });

    await expect(service.getExtensionStatus('organization-1')).resolves.toMatchObject({
      connected: true,
      listingCount: 7,
      currentWinnerCount: 1,
      currentNonWinnerCount: 1,
      currentUnknownWinnerCount: 1,
      currentWinnerObservedListings: 3,
      rawSnapshotCount: 4,
      latestScrapePageType: 'itemwinner',
      wing: { kpis: { winner: '2', nested: '3' } },
    });
    expect(scrapeRepo.findExtensionStatusSnapshot).toHaveBeenCalledWith('organization-1');
  });
});
