// `traffic` payloads (Wing page-traffic dashboard) land as:
//   1. `ChannelScrapeSnapshot` per row
//   2. `ChannelListingDailySnapshot` traffic-metric upsert per matched row
//   3. `ChannelAccountDailyKpiSnapshot` for dashboard-level KPI cards
//
// Emits `products.classify-grades` after a successful traffic ingest with
// at least one matched listing, so grade classification picks up new
// traffic signals.

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ExtensionSyncDto } from '../../adapter/in/http/dto';
import {
  resolveBusinessDate,
  toBusinessDate,
} from '../../domain/business-date';
import {
  matchListingFromRow,
  matchStatusOf,
  pickStringField,
  type ListingMap,
} from '../../domain/listing-match';
import { toNumber } from '../../domain/scrape-row-normalizers';
import {
  AD_ACCOUNT_KPI_REPOSITORY_PORT,
  type AdAccountKpiRepositoryPort,
} from '../port/out/repository/ad-account-kpi.repository.port';
import {
  CHANNEL_LISTING_DAILY_REPOSITORY_PORT,
  type ChannelListingDailyRepositoryPort,
  type ListingDailyTrafficMetrics,
} from '../port/out/repository/channel-listing-daily.repository.port';
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from '../port/out/repository/channel-scrape.repository.port';

@Injectable()
export class TrafficIngestHandler {
  constructor(
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
    @Inject(CHANNEL_LISTING_DAILY_REPOSITORY_PORT)
    private readonly listingDailyRepo: ChannelListingDailyRepositoryPort,
    @Inject(AD_ACCOUNT_KPI_REPOSITORY_PORT)
    private readonly accountKpiRepo: AdAccountKpiRepositoryPort,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    payload: ExtensionSyncDto,
    organizationId: string,
    map: ListingMap,
  ) {
    const period = Number(payload.period) || 14;
    const today = resolveBusinessDate(
      payload.startDate,
      payload.dateFrom,
      payload.timestamp,
      payload.endDate,
      payload.dateTo,
    );
    const data = payload.data ?? [];

    const scrapeRun = await this.scrapeRepo.createRun({
      organizationId,
      channel: 'coupang',
      source: 'wing',
      pageType: 'traffic',
      businessDate: today,
      periodStart: toBusinessDate(payload.dateFrom ?? payload.startDate),
      periodEnd: toBusinessDate(payload.dateTo ?? payload.endDate),
      targetUrl: payload.url ?? null,
      period: String(period),
      metaJson: {
        kpis: payload.kpis ?? {},
        adSummary: payload.adSummary ?? null,
        summary: payload.summary ?? null,
        rowCount: data.length,
      },
    });
    let scrapeSnapshotCount = 0;
    let scrapeMatched = 0;
    let scrapeUnmatched = 0;

    try {
      let listingDailyCount = 0;
      let skipped = 0;
      let accountKpiCount = 0;

      for (const item of data) {
        const match = matchListingFromRow(item, map);
        const matchStatus = matchStatusOf(match);
        const externalIdRaw = pickStringField(item, [
          'externalId',
          'external_id',
          'productId',
          'coupangProductId',
        ]);
        const externalOptionIdRaw = pickStringField(item, [
          'vendorItemId',
          'vendor_item_id',
          'itemId',
        ]);
        const snapshot = await this.scrapeRepo.appendSnapshot({
          scrapeRunId: scrapeRun.id,
          organizationId,
          channel: 'coupang',
          source: 'wing',
          pageType: 'traffic',
          businessDate: today,
          externalId: externalIdRaw,
          externalOptionId: externalOptionIdRaw,
          listingId: match.listingId,
          listingOptionId: match.listingOptionId,
          optionId: match.optionId,
          matchStatus,
          rawJson: item as Record<string, unknown>,
        });
        scrapeSnapshotCount += 1;
        if (matchStatus === 'unmatched') scrapeUnmatched += 1;
        else scrapeMatched += 1;

        if (!match.listingId) {
          skipped += 1;
          continue;
        }

        const trafficMetrics: ListingDailyTrafficMetrics = {
          trafficVisitors: Math.round(toNumber(item.visitors)),
          trafficViews: Math.round(toNumber(item.views)),
          trafficCartAdds: Math.round(toNumber(item.cartAdds)),
          trafficOrders: Math.round(toNumber(item.orders)),
          trafficSalesQty: Math.round(toNumber(item.salesQty)),
          trafficRevenue: Math.round(toNumber(item.revenue)),
        };
        const providerConversionRate =
          item.visitors > 0
            ? Math.round((item.orders / item.visitors) * 10000) / 100
            : 0;
        await this.listingDailyRepo.upsert({
          organizationId,
          listingId: match.listingId,
          channel: 'coupang',
          externalId: match.externalId ?? externalIdRaw ?? '',
          businessDate: today,
          rawSnapshotId: snapshot.id,
          metaJson: {
            source: 'wing.traffic',
            data: {
              periodDays: period,
              providerConversionRate,
            },
          },
          metrics: { traffic: trafficMetrics },
        });
        listingDailyCount += 1;
      }

      const kpis = payload.kpis || {};
      const adSummary = payload.adSummary || null;
      const summary = payload.summary || null;
      const hasWingSignal =
        Object.keys(kpis).length > 0 || adSummary !== null || summary !== null;

      if (hasWingSignal) {
        const kpiPayload = {
          kpis,
          adSummary,
          summary,
          period,
          startDate: payload.startDate,
          endDate: payload.endDate,
          rowCount: data.length,
          timestamp: payload.timestamp,
        };
        await this.accountKpiRepo.upsertAccountKpi({
          organizationId,
          channel: 'coupang',
          source: 'wing',
          kpiType: 'wing_dashboard',
          businessDate: today,
          periodStart: toBusinessDate(payload.dateFrom ?? payload.startDate),
          periodEnd: toBusinessDate(payload.dateTo ?? payload.endDate),
          normalizedJson: kpiPayload,
          rawJson: kpiPayload,
        });
        accountKpiCount += 1;
      }

      if (listingDailyCount > 0) {
        this.eventEmitter.emit('products.classify-grades');
      }

      await this.scrapeRepo.finalizeRun({
        scrapeRunId: scrapeRun.id,
        organizationId,
        status: 'complete',
        rowCount: scrapeSnapshotCount,
        matchedCount: scrapeMatched,
        unmatchedCount: scrapeUnmatched,
      });

      return {
        success: true,
        type: 'traffic',
        listingDailyCount,
        accountKpiCount,
        skipped,
        scrapeRunId: scrapeRun.id,
        scrapeSnapshotCount,
        scrapeMatchedCount: scrapeMatched,
        scrapeUnmatchedCount: scrapeUnmatched,
      };
    } catch (err) {
      await this.scrapeRepo.finalizeRunOnError({
        scrapeRunId: scrapeRun.id,
        organizationId,
        rowCount: scrapeSnapshotCount,
        matchedCount: scrapeMatched,
        unmatchedCount: scrapeUnmatched,
        err,
      });
      throw err;
    }
  }
}
