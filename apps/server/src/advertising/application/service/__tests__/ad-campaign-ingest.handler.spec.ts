import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildMockChannelScrapeRepo,
  buildMockChannelTargetDailyRepo,
  type MockChannelScrapeRepo,
  type MockChannelTargetDailyRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';
import type { ListingMap } from '../../../domain/listing-match';
import type { ChannelScrapeRepositoryPort } from '../../port/out/repository/channel-scrape.repository.port';
import type { ChannelTargetDailyRepositoryPort } from '../../port/out/repository/channel-target-daily.repository.port';
import { AdCampaignIngestHandler } from '../ad-campaign-ingest.handler';

describe('AdCampaignIngestHandler report authority', () => {
  let scrapeRepo: MockChannelScrapeRepo;
  let targetDailyRepo: MockChannelTargetDailyRepo;
  let handler: AdCampaignIngestHandler;

  const map: ListingMap = {
    channelAccountId: 'channel-account-1',
    externalOptionIdMap: new Map(),
    externalIdMap: new Map(),
  };

  beforeEach(() => {
    scrapeRepo = buildMockChannelScrapeRepo();
    targetDailyRepo = buildMockChannelTargetDailyRepo();
    scrapeRepo.createRun.mockResolvedValue({ id: 'scrape-run-1' });
    scrapeRepo.appendSnapshot.mockResolvedValue({ id: 'snapshot-1' });
    scrapeRepo.finalizeRun.mockResolvedValue(undefined);
    scrapeRepo.finalizeRunOnError.mockResolvedValue(undefined);
    targetDailyRepo.upsert.mockResolvedValue({ id: 'target-1' });
    targetDailyRepo.replaceCampaignDay.mockResolvedValue({
      kind: 'replaced',
      upsertedCount: 1,
      deletedCount: 0,
      mergedCount: 0,
    });
    handler = new AdCampaignIngestHandler(
      scrapeRepo as unknown as ChannelScrapeRepositoryPort,
      targetDailyRepo as unknown as ChannelTargetDailyRepositoryPort,
    );
  });

  it('preserves raw OFF evidence without projecting historical daily facts', async () => {
    const result = await handler.execute(
      {
        type: 'ad_campaign',
        campaignName: 'Paused campaign',
        startDate: '2026-07-17',
        endDate: '2026-07-17',
        dashboardOnOff: 'OFF',
        dashboardStatus: '일시정지',
        normalizedRows: [
          {
            pageType: 'campaign',
            campaignId: 'campaign-paused',
            campaignName: 'Paused campaign',
            onOff: 'OFF',
            status: '일시정지',
            _campaignOnly: true,
          },
        ],
      },
      'organization-1',
      map,
    );

    expect(scrapeRepo.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        metaJson: expect.objectContaining({
          requestedCampaignReportScope: null,
          effectiveCampaignReportScope: 'raw_only',
          campaignReportAuthorityReason: 'off_campaign_metadata',
          dailyProjectionSkipped: true,
        }),
      }),
    );
    expect(scrapeRepo.appendSnapshot).toHaveBeenCalledOnce();
    expect(targetDailyRepo.upsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      dailyProjectionSkipped: true,
      targetDailyCount: 0,
      listingDailyCount: 0,
      accountKpiCount: 0,
    });
  });
});
