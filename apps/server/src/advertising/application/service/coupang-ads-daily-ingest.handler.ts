// `coupang_ads_daily` is the Coupang ads dashboard daily-aggregate KPI
// feed. There is no listing identity per row, so each row lands in
// `ChannelAccountDailyKpiSnapshot` with `source='coupang_ads'`.
//
// Snapshots are appended for every row even when `date` is missing so the
// raw payload survives reviews; rows without `date` skip the daily KPI
// upsert with an explicit `matchReason`.

import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ExtensionSyncDto } from '../../dto';
import {
  resolveBusinessDate,
  toBusinessDate,
} from '../../domain/business-date';
import { toNumber } from '../../domain/scrape-row-normalizers';
import {
  appendScrapeSnapshot,
  createScrapeRun,
  finalizeScrapeRun,
  finalizeScrapeRunOnError,
} from '../../adapter/out/prisma/channel-scrape-run.persistence';
import { upsertChannelAccountKpi } from '../../adapter/out/prisma/channel-account-kpi.persistence';

export interface CoupangAdsDailyIngestDeps {
  prisma: PrismaService;
}

export async function ingestCoupangAdsDaily(
  payload: ExtensionSyncDto,
  companyId: string,
  deps: CoupangAdsDailyIngestDeps,
) {
  const { prisma } = deps;
  const rows = payload.data ?? [];

  const scrapeRun = await createScrapeRun(prisma, {
    companyId,
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
    metaJson: { rowCount: rows.length } as unknown as Prisma.InputJsonValue,
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
      const snapshot = await appendScrapeSnapshot(prisma, {
        scrapeRunId: scrapeRun.id,
        companyId,
        channel: 'coupang',
        source: 'coupang_ads',
        pageType: 'dashboard_daily',
        businessDate: rowBusinessDate,
        externalId: null,
        externalOptionId: null,
        listingId: null,
        listingOptionId: null,
        optionId: null,
        matchStatus: 'unmatched',
        matchReason: row.date
          ? 'kpi-only daily aggregate (no listing identity)'
          : 'missing-date — snapshot only, no daily fact upsert',
        rawJson: row as unknown as Prisma.InputJsonValue,
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
      await upsertChannelAccountKpi(prisma, {
        companyId,
        channel: 'coupang',
        source: 'coupang_ads',
        kpiType: 'coupang_ads_daily',
        businessDate: rowBusinessDate,
        normalizedJson: normalized as unknown as Prisma.InputJsonValue,
        rawJson: row as unknown as Prisma.InputJsonValue,
        rawSnapshotId: snapshot.id,
      });
      accountKpiCount += 1;
    }

    await finalizeScrapeRun(prisma, {
      scrapeRunId: scrapeRun.id,
      companyId,
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
    await finalizeScrapeRunOnError(prisma, {
      scrapeRunId: scrapeRun.id,
      companyId,
      rowCount: scrapeSnapshotCount,
      matchedCount: 0,
      unmatchedCount: scrapeSnapshotCount,
      err,
    });
    throw err;
  }
}
