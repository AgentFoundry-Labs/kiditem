// `ad_campaign` retains raw evidence for every request. Only a server-verified
// authoritative one-campaign/one-day report replaces target-day facts.
// Per-campaign payloads never own listing-day or account-day aggregates.

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExtensionSyncDto } from '../../adapter/in/http/dto';
import { resolveBusinessDate, toBusinessDate } from '../../domain/business-date';
import { resolveCampaignReportAuthority } from '../../domain/campaign-report-authority';
import {
  matchListingFromRow,
  matchStatusOf,
  pickStringField,
  type ListingMap,
} from '../../domain/listing-match';
import {
  cleanString,
  deriveAdTargetType,
  pairScrapeRows,
  toNumber,
  toNumberOrNull,
} from '../../domain/scrape-row-normalizers';
import { buildAdTargetKey } from '../../domain/util/ad-target-key';
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from '../port/out/repository/channel-scrape.repository.port';
import {
  CHANNEL_TARGET_DAILY_REPOSITORY_PORT,
  type ChannelTargetDailyRepositoryPort,
  type UpsertAdTargetDailyInput,
} from '../port/out/repository/channel-target-daily.repository.port';

@Injectable()
export class AdCampaignIngestHandler {
  private readonly logger = new Logger(AdCampaignIngestHandler.name);

  constructor(
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
    @Inject(CHANNEL_TARGET_DAILY_REPOSITORY_PORT)
    private readonly targetDailyRepo: ChannelTargetDailyRepositoryPort,
  ) {}

  async execute(payload: ExtensionSyncDto, organizationId: string, map: ListingMap) {
    const campaignName = cleanString(payload.campaignName) || '_전체';
    const period = String(payload.period || '7d');
    const periodStart = toBusinessDate(payload.startDate) ?? toBusinessDate(payload.dateFrom);
    const periodEnd = toBusinessDate(payload.endDate) ?? toBusinessDate(payload.dateTo);
    const hasSingleDayRange = Boolean(
      periodStart && periodEnd && periodStart.getTime() === periodEnd.getTime(),
    );
    const businessDate = resolveBusinessDate(
      payload.startDate,
      payload.dateFrom,
      payload.endDate,
      payload.dateTo,
      payload.timestamp,
    );
    const normalizedRows = payload.normalizedRows ?? [];
    const scrapeRows = pairScrapeRows(payload.data, normalizedRows);
    const authority = resolveCampaignReportAuthority({
      campaignReportScope: payload.campaignReportScope,
      dashboardOnOff: payload.dashboardOnOff,
      normalizedRows,
      hasSingleDayRange,
    });
    const projectsSingleDayFacts =
      hasSingleDayRange && authority.effectiveScope === 'single_campaign_authoritative';
    const rawBusinessDate = hasSingleDayRange ? businessDate : null;
    const baseMeta = {
      campaignName,
      kpis: payload.kpis ?? {},
      rowCount: scrapeRows.length,
      normalizedRowCount: normalizedRows.length,
      requestedCampaignReportScope: authority.requestedScope,
      effectiveCampaignReportScope: authority.effectiveScope,
      campaignReportAuthorityReason: authority.reason,
      projectionRejectionCode: authority.projectionRejectionCode,
      dailyProjectionSkipped: !projectsSingleDayFacts,
    };

    const scrapeRun = await this.scrapeRepo.createRun({
      organizationId,
      channelAccountId: map.channelAccountId,
      channel: 'coupang',
      source: 'advertising',
      pageType: 'campaign',
      businessDate: rawBusinessDate,
      periodStart,
      periodEnd,
      targetUrl: payload.url ?? null,
      period,
      metaJson: baseMeta,
    });

    let scrapeSnapshotCount = 0;
    let scrapeMatched = 0;
    let scrapeUnmatched = 0;
    const targetInputs = new Map<string, UpsertAdTargetDailyInput>();
    const campaignIds = new Set<string>();
    const campaignIdentities = new Set<string>();

    try {
      for (const pair of scrapeRows) {
        const row = pair.normalizedRow;
        const match = matchListingFromRow(row, map);
        const matchStatus = matchStatusOf(match);
        const externalIdRaw = pickStringField(row, [
          'externalId', 'external_id', 'productId', 'coupangProductId',
        ]);
        const externalOptionIdRaw = pickStringField(row, [
          'vendorItemId', 'vendor_item_id', 'itemId',
        ]);
        const snapshot = await this.scrapeRepo.appendSnapshot({
          scrapeRunId: scrapeRun.id,
          organizationId,
          channel: 'coupang',
          source: 'advertising',
          pageType: cleanString(row.pageType) || 'campaign',
          businessDate: rawBusinessDate,
          externalId: externalIdRaw,
          externalOptionId: externalOptionIdRaw,
          listingId: match.listingId,
          listingOptionId: match.listingOptionId,
          matchStatus,
          matchReason: !pair.hasNormalizedRow
            ? 'missing normalized row (snapshot only)'
            : row._kpiOnly
              ? 'kpi-only row (snapshot only)'
              : null,
          rawJson: pair.rawRow as Record<string, unknown>,
          normalizedJson: pair.hasNormalizedRow ? row : null,
        });
        scrapeSnapshotCount += 1;
        if (matchStatus === 'unmatched') scrapeUnmatched += 1;
        else scrapeMatched += 1;

        if (!projectsSingleDayFacts || !pair.hasNormalizedRow || row._kpiOnly) continue;
        const rowCampaignId = cleanString(row.campaignId);
        const rowCampaignIdentity = cleanString(row.campaignIdentity);
        if (rowCampaignId) campaignIds.add(rowCampaignId);
        if (rowCampaignIdentity) campaignIdentities.add(rowCampaignIdentity);
        const rowCampaignName = cleanString(row.campaignName) || campaignName;
        const targetType = row._campaignOnly === true
          ? 'campaign'
          : deriveAdTargetType(cleanString(row.pageType) || 'campaign', cleanString(row.keyword));
        try {
          const targetKey = buildAdTargetKey({
            channelAccountId: map.channelAccountId,
            targetType,
            campaignId: rowCampaignId,
            campaignIdentity: rowCampaignIdentity,
            campaignName: rowCampaignName,
            adGroup: cleanString(row.adGroup),
            keyword: cleanString(row.keyword),
            externalOptionId: externalOptionIdRaw ?? match.externalOptionId,
            externalId: externalIdRaw ?? match.externalId,
            listingId: match.listingId,
          });
          const input: UpsertAdTargetDailyInput = {
            organizationId,
            channel: 'coupang',
            businessDate,
            targetType,
            targetKey,
            listingId: match.listingId ?? null,
            listingOptionId: match.listingOptionId ?? null,
            externalId: externalIdRaw ?? match.externalId ?? null,
            externalOptionId: externalOptionIdRaw ?? match.externalOptionId ?? null,
            campaignId: rowCampaignId,
            campaignName: rowCampaignName,
            adGroup: cleanString(row.adGroup),
            keyword: cleanString(row.keyword),
            placement: cleanString(row.placement),
            status: cleanString(row.status),
            onOff: cleanString(row.onOff) ?? cleanString(payload.dashboardOnOff),
            currentBid: toNumberOrNull(row.currentBid),
            dailyBudget: toNumberOrNull(row.dailyBudget),
            rawSnapshotId: snapshot.id,
            metaJson: {
              source: 'advertising.campaign.target',
              data: {
                campaignIdentity: rowCampaignIdentity,
                providerRoas: toNumber(row.roas || row.adEfficiencyTarget),
                providerCtr: toNumber(row.ctr),
                providerConversionRate: toNumber(row.conversionRate),
              },
            },
            spend: Math.round(toNumber(row.runningAdSpend ?? row.spend)),
            revenue: Math.round(toNumber(row.revenue)),
            impressions: Math.round(toNumber(row.impressions)),
            clicks: Math.round(toNumber(row.clicks)),
            conversions: Math.round(toNumber(row.conversions)),
            orders: Math.round(toNumber(row.orders)),
            adSpend: Math.round(toNumber(row.runningAdSpend ?? row.spend)),
            adRevenue: Math.round(toNumber(row.revenue)),
          };
          const previous = targetInputs.get(targetKey);
          targetInputs.set(targetKey, previous ? mergeTargets(previous, input) : input);
        } catch (error) {
          this.logger.debug(
            `ad_campaign target identity rejected: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      let projectionRejectionCode = authority.projectionRejectionCode;
      let targetDailyCount = 0;
      let deletedTargetDailyCount = 0;
      let mergedTargetDailyCount = 0;
      if (projectsSingleDayFacts) {
        const replacement = await this.targetDailyRepo.replaceCampaignDay({
          organizationId,
          channelAccountId: map.channelAccountId,
          channel: 'coupang',
          businessDate,
          campaignId: campaignIds.size === 1 ? [...campaignIds][0] : null,
          campaignIdentity: campaignIdentities.size === 1 ? [...campaignIdentities][0] : null,
          campaignName,
          targets: [...targetInputs.values()],
        });
        if (replacement.kind === 'rejected') {
          projectionRejectionCode = replacement.code;
          await this.scrapeRepo.updateRunMeta({
            scrapeRunId: scrapeRun.id,
            organizationId,
            metaJson: {
              ...baseMeta,
              projectionRejectionCode,
              dailyProjectionSkipped: true,
            },
          });
        } else {
          targetDailyCount = replacement.upsertedCount;
          deletedTargetDailyCount = replacement.deletedCount;
          mergedTargetDailyCount = replacement.mergedCount;
        }
      }

      await this.scrapeRepo.finalizeRun({
        scrapeRunId: scrapeRun.id,
        organizationId,
        status: projectionRejectionCode ? 'partial' : 'complete',
        rowCount: scrapeSnapshotCount,
        matchedCount: scrapeMatched,
        unmatchedCount: scrapeUnmatched,
        errorCount: projectionRejectionCode ? 1 : 0,
        errorJson: projectionRejectionCode ? { projectionRejectionCode } : null,
      });

      const result = {
        success: projectionRejectionCode === null,
        type: 'ad_campaign',
        campaignName,
        period,
        kpiCount: Object.keys(payload.kpis ?? {}).length,
        listingDailyCount: 0,
        targetDailyCount,
        deletedTargetDailyCount,
        mergedTargetDailyCount,
        accountKpiCount: 0,
        dailyProjectionSkipped: !projectsSingleDayFacts || projectionRejectionCode !== null,
        projectionRejectionCode,
        scrapeRunId: scrapeRun.id,
        scrapeSnapshotCount,
        scrapeMatchedCount: scrapeMatched,
        scrapeUnmatchedCount: scrapeUnmatched,
      };
      return result;
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

const ADDITIVE_KEYS = [
  'spend', 'revenue', 'impressions', 'clicks', 'conversions', 'orders', 'adSpend', 'adRevenue',
] as const satisfies ReadonlyArray<keyof UpsertAdTargetDailyInput>;

function mergeTargets(
  previous: UpsertAdTargetDailyInput,
  next: UpsertAdTargetDailyInput,
): UpsertAdTargetDailyInput {
  const result = { ...previous };
  for (const key of ADDITIVE_KEYS) {
    result[key] = Number(previous[key] ?? 0) + Number(next[key] ?? 0);
  }
  return result;
}
