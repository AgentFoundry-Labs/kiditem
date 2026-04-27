// apps/server/src/advertising/services/channel-scrape-persistence.service.ts
//
// Wave C2 — advertising-local helper that writes raw extension scrape data
// into the channel-generic `ChannelScrapeRun` / `ChannelScrapeSnapshot` tables
// added by Wave C0. Lives inside the advertising domain on purpose:
// per `apps/server/AGENTS.md`, services from one business domain must not
// inject services from another. We therefore reach into the channels-namespace
// Prisma models directly through `PrismaService` rather than calling
// `ChannelSyncService`.
//
// Existing ingestion paths (`AdSnapshot` / `TrafficStats` / `ItemWinner` /
// `Ad`) keep writing as before. C2 adds raw run/snapshot rows alongside,
// preparing C3 (daily upsert) and C4 (strategy reads).

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ScrapeMatchStatus = 'matched' | 'matched_listing_only' | 'unmatched';

export interface ScrapeRunInput {
  companyId: string;
  channel: string;
  source: string;
  pageType: string;
  businessDate?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  targetUrl?: string | null;
  period?: string | null;
  parserVersion?: string | null;
  metaJson?: Prisma.InputJsonValue | null;
}

export interface ScrapeSnapshotInput {
  scrapeRunId: string;
  companyId: string;
  channel: string;
  source: string;
  pageType: string;
  businessDate?: Date | null;
  externalId?: string | null;
  externalOptionId?: string | null;
  listingId?: string | null;
  listingOptionId?: string | null;
  optionId?: string | null;
  matchStatus: ScrapeMatchStatus;
  matchReason?: string | null;
  rowHash?: string | null;
  rawJson: Prisma.InputJsonValue;
  normalizedJson?: Prisma.InputJsonValue | null;
}

export interface ScrapeRunFinalize {
  scrapeRunId: string;
  companyId: string;
  status: 'complete' | 'error' | 'partial';
  rowCount?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  errorCount?: number;
  errorJson?: Prisma.InputJsonValue | null;
}

@Injectable()
export class ChannelScrapePersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: ScrapeRunInput): Promise<{ id: string }> {
    return this.prisma.channelScrapeRun.create({
      data: {
        companyId: input.companyId,
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
            : input.metaJson,
      },
      select: { id: true },
    });
  }

  async appendSnapshot(input: ScrapeSnapshotInput): Promise<{ id: string }> {
    return this.prisma.channelScrapeSnapshot.create({
      data: {
        scrapeRunId: input.scrapeRunId,
        companyId: input.companyId,
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
        rawJson: input.rawJson,
        normalizedJson:
          input.normalizedJson === undefined || input.normalizedJson === null
            ? Prisma.DbNull
            : input.normalizedJson,
      },
      select: { id: true },
    });
  }

  async finalizeRun(input: ScrapeRunFinalize): Promise<void> {
    const result = await this.prisma.channelScrapeRun.updateMany({
      where: { id: input.scrapeRunId, companyId: input.companyId },
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
            : input.errorJson,
      },
    });
    if (result.count !== 1) {
      throw new Error(
        `ChannelScrapeRun not found for company scope: ${input.scrapeRunId}`,
      );
    }
  }

}
