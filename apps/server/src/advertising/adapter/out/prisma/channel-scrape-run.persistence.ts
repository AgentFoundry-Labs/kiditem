// `channel_scrape_runs` / `channel_scrape_snapshots` lifecycle persistence.
//
// Pure functions over `PrismaService`. Owns only the run lifecycle (create
// run → append snapshot per row → finalize run / finalize-on-error). Daily
// fact upserts live in sibling files so each persistence concern can evolve
// independently. Tenant predicate (`organizationId`) is required on every write
// path; `finalizeRun` rejects when `(scrapeRunId, organizationId)` does not match
// to keep cross-tenant errors loud.

import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ScrapeMatchStatus } from '../../../domain/listing-match';

const logger = new Logger('ChannelScrapeRunPersistence');

export interface ScrapeRunInput {
  organizationId: string;
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
  organizationId: string;
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
  organizationId: string;
  status: 'complete' | 'error' | 'partial';
  rowCount?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  errorCount?: number;
  errorJson?: Prisma.InputJsonValue | null;
}

export async function createScrapeRun(
  prisma: PrismaService,
  input: ScrapeRunInput,
): Promise<{ id: string }> {
  return prisma.channelScrapeRun.create({
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
          : input.metaJson,
    },
    select: { id: true },
  });
}

export async function appendScrapeSnapshot(
  prisma: PrismaService,
  input: ScrapeSnapshotInput,
): Promise<{ id: string }> {
  return prisma.channelScrapeSnapshot.create({
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
      rawJson: input.rawJson,
      normalizedJson:
        input.normalizedJson === undefined || input.normalizedJson === null
          ? Prisma.DbNull
          : input.normalizedJson,
    },
    select: { id: true },
  });
}

export async function finalizeScrapeRun(
  prisma: PrismaService,
  input: ScrapeRunFinalize,
): Promise<void> {
  const result = await prisma.channelScrapeRun.updateMany({
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
          : input.errorJson,
    },
  });
  if (result.count !== 1) {
    throw new Error(
      `ChannelScrapeRun not found for organization scope: ${input.scrapeRunId}`,
    );
  }
}

export function serializeScrapeRunError(err: unknown): Prisma.InputJsonValue {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack ?? null,
    } as unknown as Prisma.InputJsonValue;
  }
  return { message: String(err) } as unknown as Prisma.InputJsonValue;
}

/**
 * Finalize a scrape run with `status='error'` after a thrown exception.
 * Keeps the run row from being stuck on `status='running'` forever. Counts
 * at the time of failure are recorded so observability can see partial
 * progress. Logs and swallows secondary finalize errors so the original
 * handler error is the one that propagates to the caller.
 */
export async function finalizeScrapeRunOnError(
  prisma: PrismaService,
  input: {
    scrapeRunId: string;
    organizationId: string;
    rowCount: number;
    matchedCount: number;
    unmatchedCount: number;
    err: unknown;
  },
): Promise<void> {
  try {
    await finalizeScrapeRun(prisma, {
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
    // 운영 모니터링은 최종적으로 channel_scrape_runs 의 stuck 'running' row
    // 로 잡힘. finalize 자체가 실패하는 상황은 PG 연결 자체가 죽은 케이스라
    // 이 시점에 다시 throw 해봐야 원본 에러를 가린다.
    logger.error(
      `Failed to record error status on scrape run ${input.scrapeRunId}: ${
        finalizeError instanceof Error
          ? finalizeError.message
          : String(finalizeError)
      }`,
    );
  }
}
