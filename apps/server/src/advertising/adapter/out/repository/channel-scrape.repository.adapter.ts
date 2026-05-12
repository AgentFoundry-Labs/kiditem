// `ChannelScrapeRun` lifecycle writes + advertising-side scrape-run status
// reads. Owns only the run lifecycle (create run → append snapshot → finalize)
// and the buckets-by-source counts surfaced on the ops dashboard.

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AdCollectStatusSummary,
  ChannelScrapeRepositoryPort,
  ExtensionStatusSnapshot,
  ScrapeRunErrorFinalize,
  ScrapeRunFinalize,
  ScrapeRunInput,
  ScrapeSnapshotInput,
} from '../../../application/port/out/channel-scrape.repository.port';

const logger = new Logger('ChannelScrapeRepositoryAdapter');

@Injectable()
export class ChannelScrapeRepositoryAdapter
  implements ChannelScrapeRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: ScrapeRunInput): Promise<{ id: string }> {
    return this.prisma.channelScrapeRun.create({
      data: {
        organizationId: input.organizationId,
        channel: input.channel,
        source: input.source,
        pageType: input.pageType,
        businessDate: input.businessDate ?? null,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        targetUrl: input.targetUrl ?? null,
        period: input.period ?? null,
        parserVersion: input.parserVersion ?? null,
        status: 'running',
        metaJson:
          input.metaJson === undefined || input.metaJson === null
            ? Prisma.DbNull
            : (input.metaJson as Prisma.InputJsonValue),
      },
      select: { id: true },
    });
  }

  async appendSnapshot(input: ScrapeSnapshotInput): Promise<{ id: string }> {
    return this.prisma.channelScrapeSnapshot.create({
      data: {
        scrapeRunId: input.scrapeRunId,
        organizationId: input.organizationId,
        channel: input.channel,
        source: input.source,
        pageType: input.pageType,
        businessDate: input.businessDate ?? null,
        externalId: input.externalId ?? null,
        externalOptionId: input.externalOptionId ?? null,
        listingId: input.listingId ?? null,
        listingOptionId: input.listingOptionId ?? null,
        optionId: input.optionId ?? null,
        matchStatus: input.matchStatus,
        matchReason: input.matchReason ?? null,
        rowHash: input.rowHash ?? null,
        rawJson: input.rawJson as Prisma.InputJsonValue,
        normalizedJson:
          input.normalizedJson === undefined || input.normalizedJson === null
            ? Prisma.DbNull
            : (input.normalizedJson as Prisma.InputJsonValue),
      },
      select: { id: true },
    });
  }

  async finalizeRun(input: ScrapeRunFinalize): Promise<void> {
    const result = await this.prisma.channelScrapeRun.updateMany({
      where: { id: input.scrapeRunId, organizationId: input.organizationId },
      data: {
        status: input.status,
        rowCount: input.rowCount ?? 0,
        matchedCount: input.matchedCount ?? 0,
        unmatchedCount: input.unmatchedCount ?? 0,
        errorCount: input.errorCount ?? 0,
        finishedAt: new Date(),
        errorJson:
          input.errorJson === undefined || input.errorJson === null
            ? Prisma.DbNull
            : (input.errorJson as Prisma.InputJsonValue),
      },
    });
    if (result.count !== 1) {
      throw new Error(
        `ChannelScrapeRun not found for organization scope: ${input.scrapeRunId}`,
      );
    }
  }

  async finalizeRunOnError(input: ScrapeRunErrorFinalize): Promise<void> {
    try {
      await this.finalizeRun({
        scrapeRunId: input.scrapeRunId,
        organizationId: input.organizationId,
        status: 'error',
        rowCount: input.rowCount,
        matchedCount: input.matchedCount,
        unmatchedCount: input.unmatchedCount,
        errorCount: 1,
        errorJson: serializeScrapeRunError(input.err),
      });
    } catch (finalizeError) {
      // PG 연결 자체가 죽은 케이스: 다시 throw 하면 원본 에러를 가린다.
      logger.error(
        `Failed to record error status on scrape run ${input.scrapeRunId}: ${
          finalizeError instanceof Error
            ? finalizeError.message
            : String(finalizeError)
        }`,
      );
    }
  }

  async findExtensionStatusSnapshot(
    organizationId: string,
  ): Promise<ExtensionStatusSnapshot> {
    const [
      listingCount,
      latestPerListing,
      rawSnapshotCount,
      latestRun,
      wingKpiRow,
    ] = await Promise.all([
      this.prisma.channelListing.count({
        where: { organizationId, isDeleted: false },
      }),
      this.prisma.$queryRaw<
        { isOfferWinner: boolean | null; lastObservedAt: Date }[]
      >(Prisma.sql`
        SELECT DISTINCT ON (listing_id)
          is_offer_winner   AS "isOfferWinner",
          last_observed_at  AS "lastObservedAt"
        FROM channel_listing_daily_snapshots
        WHERE organization_id = ${organizationId}::uuid
        ORDER BY
          listing_id,
          business_date DESC,
          last_observed_at DESC,
          updated_at DESC,
          id DESC
      `),
      this.prisma.channelScrapeSnapshot.count({ where: { organizationId } }),
      this.prisma.channelScrapeRun.findFirst({
        where: { organizationId },
        orderBy: [
          { finishedAt: 'desc' },
          { startedAt: 'desc' },
          { id: 'desc' },
        ],
        select: { finishedAt: true, startedAt: true, pageType: true },
      }),
      this.prisma.channelAccountDailyKpiSnapshot.findFirst({
        where: {
          organizationId,
          source: 'wing',
          kpiType: 'wing_itemwinner_kpi',
        },
        orderBy: [
          { businessDate: 'desc' },
          { lastObservedAt: 'desc' },
          { id: 'desc' },
        ],
        select: { normalizedJson: true, lastObservedAt: true },
      }),
    ]);
    return {
      listingCount,
      latestPerListing,
      rawSnapshotCount,
      latestRun,
      wingKpi: wingKpiRow
        ? {
            normalizedJson:
              (wingKpiRow.normalizedJson as Record<string, unknown> | null) ??
              null,
            lastObservedAt: wingKpiRow.lastObservedAt ?? null,
          }
        : null,
    };
  }

  async findAdCollectStatus(
    organizationId: string,
  ): Promise<AdCollectStatusSummary> {
    const [latestRun, campaignCount, productCount] = await Promise.all([
      this.prisma.channelScrapeRun.findFirst({
        where: { organizationId },
        orderBy: [
          { finishedAt: 'desc' },
          { startedAt: 'desc' },
          { id: 'desc' },
        ],
        select: { finishedAt: true, startedAt: true },
      }),
      this.prisma.channelScrapeRun.count({
        where: {
          organizationId,
          source: 'advertising',
          pageType: { in: ['campaign', 'keyword', 'product', 'advertising'] },
        },
      }),
      this.prisma.channelScrapeRun.count({
        where: {
          organizationId,
          source: 'wing',
          pageType: { in: ['itemwinner', 'traffic'] },
        },
      }),
    ]);

    return {
      lastCollectedAt:
        latestRun?.finishedAt ?? latestRun?.startedAt ?? null,
      campaignScrapeRunCount: campaignCount,
      productScrapeRunCount: productCount,
    };
  }
}

function serializeScrapeRunError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack ?? null,
    };
  }
  return { message: String(err) };
}
