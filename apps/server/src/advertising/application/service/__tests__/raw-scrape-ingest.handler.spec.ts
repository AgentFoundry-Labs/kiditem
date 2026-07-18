import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionSyncDto } from '../../../adapter/in/http/dto';
import {
  buildMockAdAccountKpiRepo,
  buildMockChannelListingDailyRepo,
  buildMockChannelOptionDailyRepo,
  buildMockChannelScrapeRepo,
  buildMockChannelTargetDailyRepo,
  type MockAdAccountKpiRepo,
  type MockChannelListingDailyRepo,
  type MockChannelOptionDailyRepo,
  type MockChannelScrapeRepo,
  type MockChannelTargetDailyRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';
import type { ListingMap } from '../../../domain/listing-match';
import type { AdAccountKpiRepositoryPort } from '../../port/out/repository/ad-account-kpi.repository.port';
import type { ChannelListingDailyRepositoryPort } from '../../port/out/repository/channel-listing-daily.repository.port';
import type { ChannelOptionDailyRepositoryPort } from '../../port/out/repository/channel-option-daily.repository.port';
import type { ChannelScrapeRepositoryPort } from '../../port/out/repository/channel-scrape.repository.port';
import type { ChannelTargetDailyRepositoryPort } from '../../port/out/repository/channel-target-daily.repository.port';
import { RawScrapeIngestHandler } from '../raw-scrape-ingest.handler';

describe('RawScrapeIngestHandler Wing page validation', () => {
  let handler: RawScrapeIngestHandler;
  let scrapeRepo: MockChannelScrapeRepo;
  let listingDailyRepo: MockChannelListingDailyRepo;
  let optionDailyRepo: MockChannelOptionDailyRepo;
  let targetDailyRepo: MockChannelTargetDailyRepo;
  let accountKpiRepo: MockAdAccountKpiRepo;

  const map: ListingMap = {
    channelAccountId: 'channel-account-1',
    externalIdMap: new Map(),
    externalOptionIdMap: new Map(),
  };

  beforeEach(() => {
    scrapeRepo = buildMockChannelScrapeRepo();
    listingDailyRepo = buildMockChannelListingDailyRepo();
    optionDailyRepo = buildMockChannelOptionDailyRepo();
    targetDailyRepo = buildMockChannelTargetDailyRepo();
    accountKpiRepo = buildMockAdAccountKpiRepo();
    scrapeRepo.createRun.mockResolvedValue({ id: 'scrape-run-1' });
    scrapeRepo.finalizeRun.mockResolvedValue(undefined);
    scrapeRepo.finalizeRunOnError.mockResolvedValue(undefined);
    accountKpiRepo.upsertAccountKpi.mockResolvedValue(undefined);

    handler = new RawScrapeIngestHandler(
      scrapeRepo as unknown as ChannelScrapeRepositoryPort,
      listingDailyRepo as unknown as ChannelListingDailyRepositoryPort,
      optionDailyRepo as unknown as ChannelOptionDailyRepositoryPort,
      targetDailyRepo as unknown as ChannelTargetDailyRepositoryPort,
      accountKpiRepo as unknown as AdAccountKpiRepositoryPort,
    );
  });

  it.each([
    'https://wing.coupang.com/',
    'https://wing.coupang.com/dashboard',
    'https://wing.coupang.com/?returnUrl=/seller-price-management',
  ])(
    'rejects an explicit generic Wing URL before writing item-winner evidence: %s',
    async (url) => {
      const payload: ExtensionSyncDto = {
        type: 'raw_scrape',
        source: 'wing',
        url,
        timestamp: '2026-07-18T12:00:00.000Z',
        kpis: { 'generic dashboard card': '0' },
      };

      await expect(handler.execute(payload, 'organization-1', map)).rejects.toThrow(
        BadRequestException,
      );

      expect(scrapeRepo.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'wing',
          targetUrl: url,
        }),
      );
      expect(scrapeRepo.appendSnapshot).not.toHaveBeenCalled();
      expect(listingDailyRepo.upsert).not.toHaveBeenCalled();
      expect(optionDailyRepo.upsert).not.toHaveBeenCalled();
      expect(accountKpiRepo.upsertAccountKpi).not.toHaveBeenCalled();
      expect(scrapeRepo.finalizeRun).not.toHaveBeenCalled();
      expect(scrapeRepo.finalizeRunOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          scrapeRunId: 'scrape-run-1',
          organizationId: 'organization-1',
          rowCount: 0,
          matchedCount: 0,
          unmatchedCount: 0,
          err: expect.any(BadRequestException),
        }),
      );
    },
  );

  it.each([
    undefined,
    'https://wing.coupang.com/item-winner',
    'https://wing.coupang.com/tenants/seller-web/seller-price-management',
  ])('preserves legacy or explicit item-winner evidence for URL %s', async (url) => {
    const payload: ExtensionSyncDto = {
      type: 'raw_scrape',
      source: 'wing',
      url,
      timestamp: '2026-07-18T12:00:00.000Z',
      kpis: { itemWinnerCount: 3 },
    };

    const result = await handler.execute(payload, 'organization-1', map);

    expect(result).toMatchObject({
      success: true,
      source: 'wing',
      accountKpiCount: 1,
    });
    expect(accountKpiRepo.upsertAccountKpi).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'wing',
        kpiType: 'wing_itemwinner_kpi',
      }),
    );
    expect(scrapeRepo.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        scrapeRunId: 'scrape-run-1',
        organizationId: 'organization-1',
        status: 'complete',
      }),
    );
  });
});
