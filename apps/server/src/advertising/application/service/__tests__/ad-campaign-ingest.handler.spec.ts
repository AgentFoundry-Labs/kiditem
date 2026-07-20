import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildMockChannelScrapeRepo,
  buildMockChannelTargetDailyRepo,
  type MockChannelScrapeRepo,
  type MockChannelTargetDailyRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';
import { AdCampaignIngestHandler } from '../ad-campaign-ingest.handler';
import type { ExtensionSyncDto } from '../../../adapter/in/http/dto';
import type { ListingMap } from '../../../domain/listing-match';
import type { ChannelScrapeRepositoryPort } from '../../port/out/repository/channel-scrape.repository.port';
import type { ChannelTargetDailyRepositoryPort } from '../../port/out/repository/channel-target-daily.repository.port';

describe('AdCampaignIngestHandler business dates', () => {
  let scrapeRepo: MockChannelScrapeRepo;
  let targetDailyRepo: MockChannelTargetDailyRepo;
  let handler: AdCampaignIngestHandler;

  const map: ListingMap = {
    channelAccountId: 'channel-account-1',
    externalOptionIdMap: new Map([
      [
        'vendor-item-1',
        {
          listingId: 'listing-1',
          listingOptionId: 'listing-option-1',
          externalId: 'seller-product-1',
        },
      ],
    ]),
    externalIdMap: new Map(),
  };
  const observedMetrics = {
    adSpend: true,
    adRevenue: true,
    impressions: true,
    clicks: true,
    conversions: true,
    orders: true,
  };

  beforeEach(() => {
    scrapeRepo = buildMockChannelScrapeRepo();
    targetDailyRepo = buildMockChannelTargetDailyRepo();
    scrapeRepo.createRun.mockResolvedValue({ id: 'scrape-run-1' });
    scrapeRepo.appendSnapshot.mockResolvedValue({ id: 'snapshot-1' });
    scrapeRepo.finalizeRun.mockResolvedValue(undefined);
    scrapeRepo.finalizeRunOnError.mockResolvedValue(undefined);
    targetDailyRepo.replaceCampaignDay.mockImplementation(async (input) => ({
      kind: 'replaced' as const,
      upsertedCount: input.targets.length,
      deletedCount: 0,
      mergedCount: 0,
    }));
    handler = new AdCampaignIngestHandler(
      scrapeRepo as unknown as ChannelScrapeRepositoryPort,
      targetDailyRepo as unknown as ChannelTargetDailyRepositoryPort,
    );
  });

  it('uses the requested date range instead of collection timestamp for every campaign projection', async () => {
    const result = await handler.execute(
      {
        type: 'ad_campaign',
        campaignReportScope: 'single_campaign_authoritative',
        dashboardOnOff: 'ON',
        campaignName: 'Historical campaign',
        dateFrom: '2026-07-03',
        dateTo: '2026-07-03',
        timestamp: '2026-07-18T12:00:00.000Z',
        kpis: { '광고 전환 매출': '10000' },
        normalizedRows: [
          {
            pageType: 'product',
            campaignName: 'Historical campaign',
            campaignId: 'campaign-1',
            vendorItemId: 'vendor-item-1',
            spend: '1000',
            revenue: '10000',
            _observedMetrics: observedMetrics,
          },
        ],
      },
      'organization-1',
      map,
    );

    const requestedDate = new Date('2026-07-03T00:00:00.000Z');
    expect(scrapeRepo.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        businessDate: requestedDate,
        periodStart: requestedDate,
        periodEnd: requestedDate,
      }),
    );
    expect(scrapeRepo.appendSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ businessDate: requestedDate }),
    );
    expect(targetDailyRepo.replaceCampaignDay).toHaveBeenCalledWith(
      expect.objectContaining({
        businessDate: requestedDate,
        campaignId: 'campaign-1',
        targets: [
          expect.objectContaining({
            businessDate: requestedDate,
            targetKey: 'account:channel-account-1:product:campaign-1:vendor-item-1',
          }),
        ],
      }),
    );
    expect(result.accountKpiCount).toBe(0);
    expect(result.listingDailyCount).toBe(0);
  });

  it('keeps one product in two campaigns as two target facts without a lossy listing-day projection', async () => {
    const executeCampaign = (campaignId: string, campaignName: string) =>
      handler.execute(
        {
          type: 'ad_campaign',
          campaignReportScope: 'single_campaign_authoritative',
          dashboardOnOff: 'ON',
          campaignName,
          startDate: '2026-07-17',
          endDate: '2026-07-17',
          normalizedRows: [
            {
              pageType: 'product',
              campaignId,
              campaignName,
              vendorItemId: 'vendor-item-1',
              spend: '1000',
              revenue: '3000',
              _observedMetrics: observedMetrics,
            },
          ],
        },
        'organization-1',
        map,
      );

    const first = await executeCampaign('campaign-a', 'Campaign A');
    const second = await executeCampaign('campaign-b', 'Campaign B');

    expect(
      targetDailyRepo.replaceCampaignDay.mock.calls.flatMap(([input]) =>
        input.targets.map((target: { targetKey: string }) => target.targetKey),
      ),
    ).toEqual([
      'account:channel-account-1:product:campaign-a:vendor-item-1',
      'account:channel-account-1:product:campaign-b:vendor-item-1',
    ]);
    expect(first).toMatchObject({
      listingDailyCount: 0,
      targetDailyCount: 1,
    });
    expect(second).toMatchObject({
      listingDailyCount: 0,
      targetDailyCount: 1,
    });
  });

  it('preserves raw OFF evidence without projecting historical daily facts', async () => {
    const result = await handler.execute(
      {
        type: 'ad_campaign',
        campaignReportScope: 'single_campaign_authoritative',
        campaignName: 'Paused campaign',
        startDate: '2026-07-17',
        endDate: '2026-07-17',
        dashboardOnOff: 'OFF',
        dashboardStatus: '일시정지',
        data: [{ campaignName: 'Paused campaign', _campaignOnly: true }],
        normalizedRows: [
          {
            pageType: 'campaign',
            campaignName: 'Paused campaign',
            campaignIdentity: 'href:https://advertising.coupang.com/campaign/paused',
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
          campaignName: 'Paused campaign',
          dashboardOnOff: 'OFF',
          dashboardStatus: '일시정지',
        }),
      }),
    );
    expect(scrapeRepo.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        metaJson: expect.objectContaining({
          effectiveCampaignReportScope: 'raw_only',
          campaignReportAuthorityReason: 'off_campaign_metadata',
          dailyProjectionSkipped: true,
        }),
      }),
    );
    expect(targetDailyRepo.replaceCampaignDay).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      dailyProjectionSkipped: true,
      projectionRejectionCode: null,
    });
  });

  it('fail-closes an unproven empty report instead of wiping prior campaign targets', async () => {
    const result = await handler.execute(
        {
          type: 'ad_campaign',
          campaignReportScope: 'single_campaign_authoritative',
          campaignName: 'Empty campaign',
          startDate: '2026-07-17',
          endDate: '2026-07-17',
          data: [],
          normalizedRows: [],
        },
        'organization-1',
        map,
      );

    expect(targetDailyRepo.replaceCampaignDay).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      projectionRejectionCode: 'invalid_authoritative_shape',
      dailyProjectionSkipped: true,
    });
    expect(scrapeRepo.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'partial',
        errorJson: {
          projectionRejectionCode: 'invalid_authoritative_shape',
        },
      }),
    );
  });

  it('accepts an explicit-empty campaign descriptor and replaces stale products with that descriptor', async () => {
    const result = await handler.execute(
      {
        type: 'ad_campaign',
        campaignReportScope: 'single_campaign_authoritative',
        dashboardOnOff: 'ON',
        campaignName: 'Explicit empty campaign',
        startDate: '2026-07-17',
        endDate: '2026-07-17',
        normalizedRows: [
          {
            pageType: 'campaign',
            campaignName: 'Explicit empty campaign',
            campaignId: 'campaign-empty',
            status: '집행중',
            _campaignOnly: true,
          },
        ],
      },
      'organization-1',
      map,
    );

    expect(targetDailyRepo.replaceCampaignDay).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'campaign-empty',
        campaignName: 'Explicit empty campaign',
        targets: [
          expect.objectContaining({
            targetKey: 'account:channel-account-1:campaign:campaign-empty',
            status: '집행중',
          }),
        ],
      }),
    );
    expect(result.targetDailyCount).toBe(1);
  });

  it('keeps the appended raw snapshot and marks the run errored when atomic fact replacement fails', async () => {
    const insertionError = new Error('target insert failed');
    targetDailyRepo.replaceCampaignDay.mockRejectedValueOnce(insertionError);

    await expect(
      handler.execute(
        {
          type: 'ad_campaign',
          campaignReportScope: 'single_campaign_authoritative',
          dashboardOnOff: 'ON',
          campaignName: 'Atomic campaign',
          startDate: '2026-07-17',
          endDate: '2026-07-17',
          data: [{ campaignName: 'Atomic campaign' }],
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'Atomic campaign',
              campaignId: 'campaign-atomic',
              vendorItemId: 'vendor-item-1',
              spend: 0,
              revenue: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              orders: 0,
              _observedMetrics: observedMetrics,
            },
          ],
        },
        'organization-1',
        map,
      ),
    ).rejects.toBe(insertionError);

    expect(scrapeRepo.appendSnapshot).toHaveBeenCalledTimes(1);
    expect(scrapeRepo.finalizeRunOnError).toHaveBeenCalledWith(
      expect.objectContaining({
        scrapeRunId: 'scrape-run-1',
        organizationId: 'organization-1',
        rowCount: 1,
        err: insertionError,
      }),
    );
    expect(scrapeRepo.finalizeRun).not.toHaveBeenCalled();
  });

  it('keeps a target-date multi-campaign dashboard payload raw-only so daily KPI ingest can continue', async () => {
    const result = await handler.execute(
      {
        type: 'ad_campaign',
        campaignReportScope: 'multi_campaign_raw',
        campaignName: '모든 캠페인',
        startDate: '2026-07-17',
        endDate: '2026-07-17',
        data: [{ campaignName: 'A' }, { campaignName: 'B' }],
        normalizedRows: [
          { campaignId: 'A', campaignName: 'A', pageType: 'campaign' },
          { campaignId: 'B', campaignName: 'B', pageType: 'campaign' },
        ],
      },
      'organization-1',
      map,
    );

    expect(scrapeRepo.appendSnapshot).toHaveBeenCalledTimes(2);
    expect(scrapeRepo.appendSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        businessDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
    );
    expect(targetDailyRepo.replaceCampaignDay).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      dailyProjectionSkipped: true,
      targetDailyCount: 0,
    });
  });

  it('fails closed when an authoritative row did not observe every additive metric column', async () => {
    const result = await handler.execute(
        {
          type: 'ad_campaign',
          campaignReportScope: 'single_campaign_authoritative',
          dashboardOnOff: 'ON',
          campaignName: 'Column drift',
          startDate: '2026-07-17',
          endDate: '2026-07-17',
          normalizedRows: [
            {
              campaignId: 'campaign-drift',
              campaignName: 'Column drift',
              pageType: 'product',
              vendorItemId: 'vendor-item-1',
              spend: 100,
              revenue: 200,
              impressions: 300,
              clicks: 4,
              conversions: 2,
              orders: 1,
              _observedMetrics: {
                ...observedMetrics,
                conversions: false,
              },
            },
          ],
        },
        'organization-1',
        map,
      );

    expect(targetDailyRepo.replaceCampaignDay).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      projectionRejectionCode: 'invalid_authoritative_shape',
    });
    expect(scrapeRepo.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'partial' }),
    );
  });

  it('sums duplicate product-grain rows instead of silently keeping the last one', async () => {
    await handler.execute(
      {
        type: 'ad_campaign',
        campaignReportScope: 'single_campaign_authoritative',
        dashboardOnOff: 'ON',
        campaignName: 'Duplicate product',
        startDate: '2026-07-17',
        endDate: '2026-07-17',
        normalizedRows: [
          {
            campaignId: 'campaign-duplicate',
            campaignName: 'Duplicate product',
            pageType: 'product',
            vendorItemId: 'vendor-item-1',
            adGroup: 'A',
            spend: 100,
            revenue: 200,
            impressions: 300,
            clicks: 4,
            conversions: 2,
            orders: 1,
            _observedMetrics: observedMetrics,
          },
          {
            campaignId: 'campaign-duplicate',
            campaignName: 'Duplicate product',
            pageType: 'product',
            vendorItemId: 'vendor-item-1',
            adGroup: 'B',
            spend: 250,
            revenue: 500,
            impressions: 600,
            clicks: 8,
            conversions: 3,
            orders: 2,
            _observedMetrics: observedMetrics,
          },
        ],
      },
      'organization-1',
      map,
    );

    const replacement = targetDailyRepo.replaceCampaignDay.mock.calls[0][0];
    expect(replacement.targets).toHaveLength(1);
    expect(replacement.targets[0]).toMatchObject({
      targetKey: 'account:channel-account-1:product:campaign-duplicate:vendor-item-1',
      adGroup: null,
      spend: 350,
      revenue: 700,
      impressions: 900,
      clicks: 12,
      conversions: 5,
      orders: 3,
      adSpend: 350,
      adRevenue: 700,
      metaJson: expect.objectContaining({
        data: expect.objectContaining({ collapsedRowCount: 2 }),
      }),
    });
  });

  it('uses canonical campaign identity when same-name campaigns have no provider id', async () => {
    const executeIdentity = (campaignIdentity: string) =>
      handler.execute(
        {
          type: 'ad_campaign',
          campaignReportScope: 'single_campaign_authoritative',
          dashboardOnOff: 'ON',
          campaignName: '같은 이름',
          startDate: '2026-07-17',
          endDate: '2026-07-17',
          normalizedRows: [
            {
              campaignIdentity,
              campaignName: '같은 이름',
              pageType: 'product',
              vendorItemId: 'vendor-item-1',
              spend: 1,
              revenue: 2,
              impressions: 3,
              clicks: 4,
              conversions: 5,
              orders: 6,
              _observedMetrics: observedMetrics,
            },
          ],
        },
        'organization-1',
        map,
      );

    await executeIdentity('href:https://advertising.coupang.com/campaign/a');
    await executeIdentity('href:https://advertising.coupang.com/campaign/b');

    const replacements = targetDailyRepo.replaceCampaignDay.mock.calls.map(
      ([input]) => input,
    );
    expect(replacements.map((input) => input.campaignIdentity)).toEqual([
      'href:https://advertising.coupang.com/campaign/a',
      'href:https://advertising.coupang.com/campaign/b',
    ]);
    expect(
      replacements.map((input) => input.targets[0].targetKey),
    ).toEqual([
      'account:channel-account-1:product:href:https://advertising.coupang.com/campaign/a:vendor-item-1',
      'account:channel-account-1:product:href:https://advertising.coupang.com/campaign/b:vendor-item-1',
    ]);
  });

  it.each([
    {
      label: 'startDate/endDate over dateFrom/dateTo',
      payload: {
        startDate: '2026-07-04',
        dateFrom: '2026-07-03',
        endDate: '2026-07-06',
        dateTo: '2026-07-07',
        timestamp: '2026-07-18T12:00:00.000Z',
      },
      businessDate: null,
      periodStart: '2026-07-04',
      periodEnd: '2026-07-06',
    },
    {
      label: 'endDate when the start range is absent',
      payload: {
        endDate: '2026-07-06',
        dateTo: '2026-07-07',
        timestamp: '2026-07-18T12:00:00.000Z',
      },
      businessDate: null,
      periodStart: null,
      periodEnd: '2026-07-06',
    },
    {
      label: 'dateTo before timestamp when it is the only range date',
      payload: {
        dateTo: '2026-07-07',
        timestamp: '2026-07-18T12:00:00.000Z',
      },
      businessDate: null,
      periodStart: null,
      periodEnd: '2026-07-07',
    },
  ])(
    'resolves $label',
    async ({ payload, businessDate, periodStart, periodEnd }) => {
      await handler.execute(
        {
          type: 'ad_campaign',
          ...payload,
          normalizedRows: [],
        } satisfies ExtensionSyncDto,
        'organization-1',
        map,
      );

      expect(scrapeRepo.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          businessDate: businessDate
            ? new Date(`${businessDate}T00:00:00.000Z`)
            : null,
          periodStart: periodStart
            ? new Date(`${periodStart}T00:00:00.000Z`)
            : null,
          periodEnd: periodEnd
            ? new Date(`${periodEnd}T00:00:00.000Z`)
            : null,
        }),
      );
    },
  );

  it('preserves multi-day campaign raw rows without projecting them into one daily fact', async () => {
    const result = await handler.execute(
      {
        type: 'ad_campaign',
        campaignName: 'Seven-day report',
        period: '7d',
        startDate: '2026-07-11',
        endDate: '2026-07-17',
        kpis: { '광고 전환 매출': '70000' },
        data: [{ campaignName: 'Seven-day report' }],
        normalizedRows: [
          {
            pageType: 'product',
            campaignName: 'Seven-day report',
            vendorItemId: 'vendor-item-1',
            spend: '7000',
            revenue: '70000',
          },
        ],
      },
      'organization-1',
      map,
    );

    expect(scrapeRepo.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        businessDate: null,
        periodStart: new Date('2026-07-11T00:00:00.000Z'),
        periodEnd: new Date('2026-07-17T00:00:00.000Z'),
        metaJson: expect.objectContaining({ dailyProjectionSkipped: true }),
      }),
    );
    expect(scrapeRepo.appendSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ businessDate: null }),
    );
    expect(targetDailyRepo.replaceCampaignDay).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      scrapeSnapshotCount: 1,
      listingDailyCount: 0,
      targetDailyCount: 0,
      accountKpiCount: 0,
      dailyProjectionSkipped: true,
    });
  });
});
