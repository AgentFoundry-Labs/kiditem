// `ChannelScrapeRun` lifecycle writes + advertising-side scrape-run status
// reads. Owns only the run lifecycle (create run → append snapshot → finalize)
// and the buckets-by-source counts surfaced on the ops dashboard.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  WING_ITEMWINNER_KPI_READ_PORT,
  type WingItemwinnerKpiReadPort,
} from '../../../application/port/in/wing-itemwinner-kpi-source.port';
import { adIngestRepositoryClient } from './ad-ingest-transaction-context';
import type {
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WING_ITEMWINNER_KPI_READ_PORT)
    private readonly wingItemwinnerRead: WingItemwinnerKpiReadPort,
  ) {}

  async createRun(input: ScrapeRunInput): Promise<{ id: string }> {
    return adIngestRepositoryClient(this.prisma).channelScrapeRun.create({
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

  async updateRunMeta(input: {
    scrapeRunId: string;
    organizationId: string;
    metaJson: Record<string, unknown>;
  }): Promise<void> {
    const client = adIngestRepositoryClient(this.prisma);
    const result = await client.channelScrapeRun.updateMany({
      where: {
        id: input.scrapeRunId,
        organizationId: input.organizationId,
      },
      data: { metaJson: input.metaJson as Prisma.InputJsonValue },
    });
    if (result.count !== 1) {
      throw new Error('ChannelScrapeRun not found for organization scope');
    }
  }

  async appendSnapshot(input: ScrapeSnapshotInput): Promise<{ id: string }> {
    return adIngestRepositoryClient(this.prisma).channelScrapeSnapshot.create({
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
    const result = await adIngestRepositoryClient(this.prisma).channelScrapeRun.updateMany({
      where: { id: input.scrapeRunId, organizationId: input.organizationId },
      data: {
        status: input.status,
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
    // The itemwinner owner is the authority for which COMPLETE generation is
    // published. Reuse that selection so this read cannot resurrect listing
    // rows from an older generation when the newest capture is confirmed
    // empty.
    const wingPublished = await this.wingItemwinnerRead.readPublished({
      organizationId,
    });
    const channelAccountId =
      wingPublished?.channelAccountId ??
      (await this.findActiveCoupangAccountId(organizationId));
    if (!channelAccountId) {
      return {
        listingCount: 0,
        latestPerListing: [],
        rawSnapshotCount: 0,
        latestRun: null,
        wingKpi: null,
      };
    }

    // Listing observations are captured in the selected COMPLETE owner's
    // immutable normalized snapshot. Do not remap them through the mutable
    // daily table: a later same-day publication can move that table's raw
    // pointer while this read is still using the earlier KPI publication.
    const latestPerListing =
      wingPublished?.listingObservations.map((observation) => ({
        isOfferWinner: observation.isOfferWinner,
        lastObservedAt: new Date(observation.lastObservedAt),
      })) ?? [];
    const rawSnapshotCountPromise = wingPublished
      ? this.prisma.channelScrapeSnapshot.count({
          where: {
            organizationId,
            sourceImportRunId: wingPublished.attemptId,
            sourceImportRun: { status: 'completed' },
          },
        })
      : Promise.resolve(0);
    const latestRunPromise = wingPublished
      ? this.prisma.channelScrapeRun.findFirst({
          where: {
            organizationId,
            channelAccountId,
            sourceImportRunId: wingPublished.attemptId,
            sourceImportRun: { status: 'completed' },
          },
          orderBy: [
            { finishedAt: 'desc' },
            { startedAt: 'desc' },
            { id: 'desc' },
          ],
          select: { finishedAt: true, startedAt: true, pageType: true },
        })
      : Promise.resolve(null);

    const [listingCount, rawSnapshotCount, latestRun] = await Promise.all([
      this.prisma.channelListing.count({
        where: { organizationId, channelAccountId, isActive: true },
      }),
      rawSnapshotCountPromise,
      latestRunPromise,
    ]);
    return {
      listingCount,
      latestPerListing,
      rawSnapshotCount,
      latestRun,
      wingKpi: wingPublished
        ? {
            normalizedJson: wingPublished.normalizedJson,
            lastObservedAt: new Date(wingPublished.observedAt),
          }
        : null,
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
