import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildMockChannelScrapeRepo,
  buildMockChannelTargetDailyRepo,
  type MockChannelScrapeRepo,
  type MockChannelTargetDailyRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';
import { AdKeywordIngestHandler } from '../ad-keyword-ingest.handler';
import type { ExtensionSyncDto } from '../../../adapter/in/http/dto';
import type { ListingMap } from '../../../domain/listing-match';
import type { ChannelScrapeRepositoryPort } from '../../port/out/repository/channel-scrape.repository.port';
import type { ChannelTargetDailyRepositoryPort } from '../../port/out/repository/channel-target-daily.repository.port';

describe('AdKeywordIngestHandler', () => {
  let scrapeRepo: MockChannelScrapeRepo;
  let targetDailyRepo: MockChannelTargetDailyRepo;
  let handler: AdKeywordIngestHandler;

  const map: ListingMap = {
    channelAccountId: 'channel-account-1',
    externalOptionIdMap: new Map([
      [
        '95514044205',
        {
          listingId: 'listing-1',
          listingOptionId: 'listing-option-1',
          externalId: 'seller-product-1',
        },
      ],
    ]),
    externalIdMap: new Map(),
  };

  function keywordRow(overrides: Record<string, unknown> = {}) {
    return {
      campaignId: '104640375',
      campaignName: '쿠팡윙 집중광고',
      adGroup: 'MBTI젤리',
      adId: '541920849',
      externalOptionId: '95514044205',
      productName: '캐릭터 문어발 비눗방울 1p',
      keyword: '버블문어',
      origin: 'smart_targeting',
      impressions: 3,
      clicks: 0,
      spend: 0,
      revenue: 0,
      conversions: 0,
      orders: 0,
      ...overrides,
    };
  }

  function payload(overrides: Partial<ExtensionSyncDto> = {}): ExtensionSyncDto {
    return {
      type: 'ad_keyword',
      source: 'advertising',
      campaignName: '쿠팡윙 집중광고',
      period: '7d',
      startDate: '2026-07-24',
      endDate: '2026-07-30',
      timestamp: '2026-07-31T02:29:15.000Z',
      data: [keywordRow()],
      ...overrides,
    } as ExtensionSyncDto;
  }

  beforeEach(() => {
    scrapeRepo = buildMockChannelScrapeRepo();
    targetDailyRepo = buildMockChannelTargetDailyRepo();
    scrapeRepo.createRun.mockResolvedValue({ id: 'scrape-run-1' });
    scrapeRepo.appendSnapshot.mockResolvedValue({ id: 'snapshot-1' });
    scrapeRepo.finalizeRun.mockResolvedValue(undefined);
    scrapeRepo.finalizeRunOnError.mockResolvedValue(undefined);
    scrapeRepo.updateRunMeta?.mockResolvedValue(undefined);
    targetDailyRepo.replaceCampaignDay.mockImplementation(async (input) => ({
      kind: 'replaced' as const,
      upsertedCount: input.targets.length,
      deletedCount: 0,
    }));
    handler = new AdKeywordIngestHandler(
      scrapeRepo as unknown as ChannelScrapeRepositoryPort,
      targetDailyRepo as unknown as ChannelTargetDailyRepositoryPort,
    );
  });

  it('projects keyword-grain daily facts scoped to the keyword grain only', async () => {
    const result = await handler.execute(payload(), 'org-1', map);

    expect(result.success).toBe(true);
    expect(result.keywordCount).toBe(1);

    const call = targetDailyRepo.replaceCampaignDay.mock.calls[0][0];
    // The campaign sweep owns campaign/product rows for this same campaign and
    // day; keyword ingest must not mark them stale.
    expect(call.replaceScope).toEqual(['keyword']);
    expect(call.campaignIdentity).toBe('campaign:104640375');
    // The business date is the window END, not its start.
    expect(call.businessDate.toISOString().slice(0, 10)).toBe('2026-07-30');

    const target = call.targets[0];
    expect(target.targetType).toBe('keyword');
    expect(target.keyword).toBe('버블문어');
    expect(target.targetKey).toBe(
      'account:channel-account-1:keyword:104640375:MBTI젤리:버블문어',
    );
    expect(target.impressions).toBe(3);
    expect(target.listingOptionId).toBe('listing-option-1');
    expect(target.metaJson).toMatchObject({
      data: { origin: 'smart_targeting', adId: '541920849' },
    });
  });

  it('records the ad centre keyword-column button label as raw evidence only', async () => {
    const result = await handler.execute(
      payload({ data: [keywordRow({ keyword: '키워드 보기' })] }),
      'org-1',
      map,
    );

    // Raw payload survives for audit, but no fact is written from a UI label.
    expect(scrapeRepo.appendSnapshot).toHaveBeenCalledTimes(1);
    expect(targetDailyRepo.replaceCampaignDay).not.toHaveBeenCalled();
    expect(result.keywordCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('refuses a single-day window, which the provider answers with an empty table', async () => {
    // Verified live: `tableMetric` with start === end returns no keywords even
    // for an ad with impressions that day. A one-day payload is therefore not
    // a real observation and must not become a fact.
    const result = await handler.execute(
      payload({ startDate: '2026-07-30', endDate: '2026-07-30' }),
      'org-1',
      map,
    );

    expect(targetDailyRepo.replaceCampaignDay).not.toHaveBeenCalled();
    expect(result.keywordCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(scrapeRepo.appendSnapshot).toHaveBeenCalledTimes(1);
  });

  it('refuses a window wider than a month', async () => {
    const result = await handler.execute(
      payload({ startDate: '2026-05-01', endDate: '2026-07-30' }),
      'org-1',
      map,
    );

    expect(targetDailyRepo.replaceCampaignDay).not.toHaveBeenCalled();
    expect(result.keywordCount).toBe(0);
  });

  it('stamps the observation window width so the read never sums two collections', async () => {
    await handler.execute(payload(), 'org-1', map);

    const target =
      targetDailyRepo.replaceCampaignDay.mock.calls[0][0].targets[0];
    expect(target.metaJson).toMatchObject({ data: { windowDays: 7 } });
  });

  it('sums a keyword served by several ads and drops the ambiguous option link', async () => {
    const result = await handler.execute(
      payload({
        data: [
          keywordRow({ impressions: 3, clicks: 1, spend: 100 }),
          keywordRow({
            adId: '541920848',
            externalOptionId: '95514078596',
            impressions: 5,
            clicks: 2,
            spend: 250,
          }),
        ],
      }),
      'org-1',
      map,
    );

    expect(result.keywordCount).toBe(1);
    const target =
      targetDailyRepo.replaceCampaignDay.mock.calls[0][0].targets[0];
    expect(target.impressions).toBe(8);
    expect(target.clicks).toBe(3);
    expect(target.spend).toBe(350);
    expect(target.adSpend).toBe(350);
    // One keyword row can no longer be attributed to a single advertised option.
    expect(target.externalOptionId).toBeNull();
    expect(target.listingOptionId).toBeNull();
  });

  it('keeps raw evidence when the campaign identity is not stable', async () => {
    const result = await handler.execute(
      payload({ data: [keywordRow({ campaignId: undefined })] }),
      'org-1',
      map,
    );

    expect(scrapeRepo.appendSnapshot).toHaveBeenCalledTimes(1);
    expect(targetDailyRepo.replaceCampaignDay).not.toHaveBeenCalled();
    expect(result.keywordCount).toBe(0);
  });
});
