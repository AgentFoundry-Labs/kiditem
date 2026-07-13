// `coupang_ads_daily` is the Coupang ads dashboard daily-aggregate KPI
// feed. There is no listing identity per row, so each row lands in
// `ChannelAccountDailyKpiSnapshot` with `source='coupang_ads'`.
//
// Snapshots are appended for every row even when `date` is missing so the
// raw payload survives reviews; rows without `date` skip the daily KPI
// upsert with an explicit `matchReason`.

import { Inject, Injectable } from '@nestjs/common';
import type { ExtensionSyncDto } from '../../adapter/in/http/dto';
import {
  resolveBusinessDate,
  toBusinessDate,
} from '../../domain/business-date';
import { toNumber } from '../../domain/scrape-row-normalizers';
import {
  AD_ACCOUNT_KPI_REPOSITORY_PORT,
  type AdAccountKpiRepositoryPort,
} from '../port/out/repository/ad-account-kpi.repository.port';
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from '../port/out/repository/channel-scrape.repository.port';
import type { ListingMap } from '../../domain/listing-match';

@Injectable()
export class CoupangAdsDailyIngestHandler {
  constructor(
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
    @Inject(AD_ACCOUNT_KPI_REPOSITORY_PORT)
    private readonly accountKpiRepo: AdAccountKpiRepositoryPort,
  ) {}

  async execute(
    payload: ExtensionSyncDto,
    organizationId: string,
    map: ListingMap,
  ) {
    const rows = payload.data ?? [];

    const scrapeRun = await this.scrapeRepo.createRun({
      organizationId,
      channelAccountId: map.channelAccountId,
      channel: 'coupang',
      source: 'coupang_ads',
      pageType: 'dashboard_daily',
      businessDate: resolveBusinessDate(
        payload.startDate,
        payload.dateFrom,
        payload.timestamp,
        payload.endDate,
        payload.dateTo,
      ),
      periodStart: toBusinessDate(payload.dateFrom ?? payload.startDate),
      periodEnd: toBusinessDate(payload.dateTo ?? payload.endDate),
      targetUrl: payload.url ?? null,
      metaJson: { rowCount: rows.length },
    });
    let scrapeSnapshotCount = 0;

    try {
      let accountKpiCount = 0;
      for (const row of rows) {
        // Snapshot every row before applying the missing-date skip so raw
        // payload data is preserved ("Raw before normalized" principle).
        // Rows without `date` get a null businessDate + a matchReason so
        // reviewers can see why downstream KPI was skipped.
        const rowBusinessDate = row.date
          ? toBusinessDate(String(row.date))
          : null;
        const snapshot = await this.scrapeRepo.appendSnapshot({
          scrapeRunId: scrapeRun.id,
          organizationId,
          channel: 'coupang',
          source: 'coupang_ads',
          pageType: 'dashboard_daily',
          businessDate: rowBusinessDate,
          externalId: null,
          externalOptionId: null,
          listingId: null,
          listingOptionId: null,
          matchStatus: 'unmatched',
          matchReason: row.date
            ? 'kpi-only daily aggregate (no listing identity)'
            : 'missing-date — snapshot only, no daily fact upsert',
          rawJson: row as Record<string, unknown>,
        });
        scrapeSnapshotCount += 1;

        if (!rowBusinessDate) continue;

        const adSpend = Math.round(toNumber(row.adSpend));
        const adRevenue = Math.round(toNumber(row.adRevenue));
        const impressions = Math.round(toNumber(row.impressions));
        const clicks = Math.round(toNumber(row.clicks));
        const conversions = Math.round(toNumber(row.conversions));
        const orders = Math.round(toNumber(row.orders));
        const providerRoas = toNumber(row.roas);
        const providerCtr = toNumber(row.ctr);
        const providerConversionRate = toNumber(row.conversionRate);

        const normalized = {
          adSpend,
          adRevenue,
          impressions,
          clicks,
          conversions,
          orders,
          providerRoas,
          providerCtr,
          providerConversionRate,
        };
        await this.accountKpiRepo.upsertAccountKpi({
          organizationId,
          channelAccountId: map.channelAccountId,
          channel: 'coupang',
          source: 'coupang_ads',
          kpiType: 'coupang_ads_daily',
          businessDate: rowBusinessDate,
          normalizedJson: normalized,
          rawJson: row as Record<string, unknown>,
          rawSnapshotId: snapshot.id,
        });
        accountKpiCount += 1;
      }

      await this.scrapeRepo.finalizeRun({
        scrapeRunId: scrapeRun.id,
        organizationId,
        status: 'complete',
        rowCount: scrapeSnapshotCount,
        matchedCount: 0,
        unmatchedCount: scrapeSnapshotCount,
      });

      return {
        success: true,
        type: 'coupang_ads_daily',
        accountKpiCount,
        scrapeRunId: scrapeRun.id,
        scrapeSnapshotCount,
        scrapeMatchedCount: 0,
        scrapeUnmatchedCount: scrapeSnapshotCount,
      };
    } catch (err) {
      await this.scrapeRepo.finalizeRunOnError({
        scrapeRunId: scrapeRun.id,
        organizationId,
        rowCount: scrapeSnapshotCount,
        matchedCount: 0,
        unmatchedCount: scrapeSnapshotCount,
        err,
      });
      throw err;
    }
  }
}
