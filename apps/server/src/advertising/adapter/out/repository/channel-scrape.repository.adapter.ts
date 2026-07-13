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
} from '../../../application/port/out/repository/channel-scrape.repository.port';

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
        channelAccountId: input.channelAccountId,
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
    const channelAccountId = await this.findActiveCoupangAccountId(
      organizationId,
    );
    if (!channelAccountId) {
      return {
        listingCount: 0,
        latestPerListing: [],
        rawSnapshotCount: 0,
        latestRun: null,
        wingKpi: null,
      };
    }

    const [
      listingCount,
      latestPerListing,
      rawSnapshotCount,
      latestRun,
      wingKpiRow,
    ] = await Promise.all([
      this.prisma.channelListing.count({
        where: { organizationId, channelAccountId, isActive: true },
      }),
      this.prisma.$queryRaw<
        { isOfferWinner: boolean | null; lastObservedAt: Date }[]
      >(Prisma.sql`
        SELECT DISTINCT ON (snapshot.listing_id)
          snapshot.is_offer_winner   AS "isOfferWinner",
          snapshot.last_observed_at  AS "lastObservedAt"
        FROM channel_listing_daily_snapshots snapshot
        JOIN channel_listings listing
          ON listing.id = snapshot.listing_id
         AND listing.organization_id = snapshot.organization_id
        WHERE snapshot.organization_id = ${organizationId}::uuid
          AND listing.channel_account_id = ${channelAccountId}::uuid
          AND listing.is_active = true
        ORDER BY
          snapshot.listing_id,
          snapshot.business_date DESC,
          snapshot.last_observed_at DESC,
          snapshot.updated_at DESC,
          snapshot.id DESC
      `),
      this.prisma.channelScrapeSnapshot.count({
        where: { organizationId, scrapeRun: { channelAccountId } },
      }),
      this.prisma.channelScrapeRun.findFirst({
        where: { organizationId, channelAccountId },
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
          channelAccountId,
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
    const channelAccountId = await this.findActiveCoupangAccountId(
      organizationId,
    );
    if (!channelAccountId) {
      return {
        lastCollectedAt: null,
        campaignScrapeRunCount: 0,
        productScrapeRunCount: 0,
      };
    }

    const [latestRun, campaignCount, productCount] = await Promise.all([
      this.prisma.channelScrapeRun.findFirst({
        where: { organizationId, channelAccountId },
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
          channelAccountId,
          source: 'advertising',
          pageType: { in: ['campaign', 'keyword', 'product', 'advertising'] },
        },
      }),
      this.prisma.channelScrapeRun.count({
        where: {
          organizationId,
          channelAccountId,
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

  private async findActiveCoupangAccountId(
    organizationId: string,
  ): Promise<string | null> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { organizationId, channel: 'coupang', status: 'active' },
      orderBy: [
        { isPrimary: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });
    return account?.id ?? null;
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
