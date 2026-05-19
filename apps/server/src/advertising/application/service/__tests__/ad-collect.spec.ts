import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdCollectService } from '../ad-collect.service';
import type { ChannelScrapeRepositoryPort } from '../../port/out/repository/channel-scrape.repository.port';
import {
  buildMockChannelScrapeRepo,
  type MockChannelScrapeRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';

/**
 * H3 — `getStatus` reads `ChannelScrapeRun` for last-collected metadata + per-bucket
 * counts via `ChannelScrapeRepositoryPort.findAdCollectStatus`.
 */
describe('AdCollectService (H3 — scrape-run status)', () => {
  let service: AdCollectService;
  let scrapeRepo: MockChannelScrapeRepo;

  beforeEach(() => {
    scrapeRepo = buildMockChannelScrapeRepo();
    service = new AdCollectService(
      scrapeRepo as unknown as ChannelScrapeRepositoryPort,
    );
  });

  it('returns lastCollectedAt + campaign/product counts from the port', async () => {
    scrapeRepo.findAdCollectStatus.mockResolvedValue({
      lastCollectedAt: new Date('2026-04-27T05:00:00Z'),
      campaignScrapeRunCount: 15,
      productScrapeRunCount: 8,
    });

    const result = await service.getStatus('organization-1');

    expect(result.lastCollectedAt).toEqual(new Date('2026-04-27T05:00:00Z'));
    expect(result.campaignSnapshotCount).toBe(15);
    expect(result.productSnapshotCount).toBe(8);
    expect(scrapeRepo.findAdCollectStatus).toHaveBeenCalledWith('organization-1');
  });

  it('passes null lastCollectedAt + zero counts straight through', async () => {
    scrapeRepo.findAdCollectStatus.mockResolvedValue({
      lastCollectedAt: null,
      campaignScrapeRunCount: 0,
      productScrapeRunCount: 0,
    });

    const result = await service.getStatus('organization-xyz');

    expect(result.lastCollectedAt).toBeNull();
    expect(result.campaignSnapshotCount).toBe(0);
    expect(result.productSnapshotCount).toBe(0);
  });

  it('passes organizationId through to the port', async () => {
    scrapeRepo.findAdCollectStatus.mockResolvedValue({
      lastCollectedAt: null,
      campaignScrapeRunCount: 0,
      productScrapeRunCount: 0,
    });

    await service.getStatus('organization-xyz');

    expect(scrapeRepo.findAdCollectStatus).toHaveBeenCalledWith('organization-xyz');
  });
});
