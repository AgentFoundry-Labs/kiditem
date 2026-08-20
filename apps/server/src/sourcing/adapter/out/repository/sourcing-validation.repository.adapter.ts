import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SourcingValidationEpisodeWrite,
  SourcingValidationItemRecord,
  SourcingValidationItemView,
  SourcingValidationRepositoryPort,
} from '../../../application/port/out/repository/sourcing-validation.repository.port';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class SourcingValidationRepositoryAdapter
  implements SourcingValidationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async replaceForRun(command: {
    organizationId: string;
    recommendationRunId: string;
    episodes: SourcingValidationEpisodeWrite[];
  }): Promise<SourcingValidationItemRecord[]> {
    if (command.episodes.length === 0) return [];
    try {
      await this.createMissingEpisodes(command);
    } catch (error: unknown) {
      // A concurrent validation refresh can race on the immutable
      // run/item key. PostgreSQL aborts that transaction on P2002, so the
      // complete graph is read only after leaving the failed transaction.
      if (!isUniqueConstraint(error)) throw error;
    }
    return (await this.listForRun({
      organizationId: command.organizationId,
      recommendationRunId: command.recommendationRunId,
      limit: MAX_PAGE_SIZE,
    })).items;
  }

  async listForRun(input: {
    organizationId: string;
    recommendationRunId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: SourcingValidationItemRecord[]; nextCursor: string | null }> {
    const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(input.limit)));
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const rows = await this.prisma.sourcingValidationEpisode.findMany({
      where: {
        organizationId: input.organizationId,
        recommendationRunId: input.recommendationRunId,
        ...(cursor && {
          OR: [
            { updatedAt: { lt: cursor.updatedAt } },
            { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: viewInclude,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toView),
      nextCursor: hasMore && last
        ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
        : null,
    };
  }

  private async createMissingEpisodes(command: {
    organizationId: string;
    recommendationRunId: string;
    episodes: SourcingValidationEpisodeWrite[];
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const episodeByItemId = new Map<string, SourcingValidationEpisodeWrite>();
      for (const episode of command.episodes) {
        if (episodeByItemId.has(episode.recommendationItemId)) {
          throw new TypeError('Validation input contains a duplicate recommendation item');
        }
        assertUniqueCheckKeys(episode);
        episodeByItemId.set(episode.recommendationItemId, episode);
      }
      const itemIds = [...episodeByItemId.keys()];
      const items = await tx.sourcingRecommendationItem.findMany({
        where: {
          organizationId: command.organizationId,
          recommendationRunId: command.recommendationRunId,
          id: { in: itemIds },
        },
        select: { id: true },
      });
      if (items.length !== itemIds.length) {
        throw new TypeError('Validation item does not belong to this recommendation run');
      }

      const existing = await tx.sourcingValidationEpisode.findMany({
        where: {
          organizationId: command.organizationId,
          recommendationRunId: command.recommendationRunId,
          recommendationItemId: { in: itemIds },
        },
        select: { recommendationItemId: true },
      });
      const existingItemIds = new Set(existing.map((episode) => episode.recommendationItemId));
      const missing = command.episodes.filter(
        (episode) => !existingItemIds.has(episode.recommendationItemId),
      );
      if (missing.length === 0) return;

      const evidenceObservationIds = compactIds(
        missing.flatMap((episode) =>
          episode.checks.flatMap((check) => check.evidenceObservationIds),
        ),
      );
      if (evidenceObservationIds.length > 0) {
        const evidenceRows = await tx.sourcingEvidenceObservation.findMany({
          where: {
            organizationId: command.organizationId,
            id: { in: evidenceObservationIds },
          },
          select: { id: true },
        });
        if (evidenceRows.length !== evidenceObservationIds.length) {
          throw new TypeError('Validation evidence does not belong to this organization');
        }
      }

      const episodeIds = new Map(
        missing.map((episode) => [episode.recommendationItemId, randomUUID()]),
      );
      await tx.sourcingValidationEpisode.createMany({
        data: missing.map((episode) => ({
          id: episodeIds.get(episode.recommendationItemId)!,
          organizationId: command.organizationId,
          recommendationRunId: command.recommendationRunId,
          recommendationItemId: episode.recommendationItemId,
          status: episode.status,
          policyKey: episode.policyKey,
          policyVersion: episode.policyVersion,
          evidenceCutoffAt: episode.evidenceCutoffAt,
          completedAt: episode.completedAt,
          validUntil: episode.validUntil,
          summary: episode.summary as Prisma.InputJsonValue,
        })),
      });

      const checks = missing.flatMap((episode) =>
        episode.checks.map((check, ordinal) => ({
          id: randomUUID(),
          organizationId: command.organizationId,
          validationEpisodeId: episodeIds.get(episode.recommendationItemId)!,
          checkKey: check.checkKey,
          status: check.status,
          severity: check.severity,
          score: check.score,
          summary: check.summary,
          details: check.details as Prisma.InputJsonValue,
          ordinal,
          evidenceObservationIds: compactIds(check.evidenceObservationIds),
        })),
      );
      await tx.sourcingValidationCheck.createMany({
        data: checks.map(({ ordinal: _ordinal, evidenceObservationIds: _evidenceObservationIds, ...check }) => check),
      });
      const links = checks.flatMap((check) =>
        check.evidenceObservationIds.map((evidenceObservationId, ordinal) => ({
          id: randomUUID(),
          organizationId: command.organizationId,
          validationCheckId: check.id,
          evidenceObservationId,
          role: 'source',
          ordinal,
        })),
      );
      if (links.length > 0) {
        await tx.sourcingValidationCheckEvidence.createMany({ data: links });
      }
    });
  }
}

const viewInclude = {
  recommendationItem: {
    select: {
      itemKey: true,
      displayName: true,
      sourceSnapshot: true,
    },
  },
  checks: {
    orderBy: [{ checkKey: 'asc' }, { id: 'asc' }],
    select: {
      checkKey: true,
      status: true,
      summary: true,
    },
  },
} satisfies Prisma.SourcingValidationEpisodeInclude;

function toView(
  row: Prisma.SourcingValidationEpisodeGetPayload<{ include: typeof viewInclude }>,
): SourcingValidationItemRecord {
  const summary = jsonRecord(row.summary);
  const source = jsonRecord(row.recommendationItem.sourceSnapshot);
  return {
    episodeId: row.id,
    recommendationRunId: row.recommendationRunId,
    itemKey: row.recommendationItem.itemKey,
    displayName: row.recommendationItem.displayName,
    imageUrl: httpUrlOrNull(source.imageUrl),
    status: row.status as SourcingValidationItemView['status'],
    score: integerOrNull(summary.score),
    landedCostKrw: integerOrNull(summary.landedCostKrw),
    expectedMarginBps: integerOrNull(summary.expectedMarginBps),
    validUntil: row.validUntil?.toISOString() ?? null,
    updatedAt: row.updatedAt,
    checks: row.checks.map((check) => ({
      checkKey: check.checkKey,
      status: check.status as SourcingValidationItemView['checks'][number]['status'],
      summary: check.summary,
    })),
  };
}

function assertUniqueCheckKeys(episode: SourcingValidationEpisodeWrite): void {
  const keys = episode.checks.map((check) => check.checkKey);
  if (new Set(keys).size !== keys.length) {
    throw new TypeError('Validation input contains duplicate check keys');
  }
}

function compactIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function integerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function httpUrlOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function encodeCursor(input: { updatedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ updatedAt: input.updatedAt.toISOString(), id: input.id }))
    .toString('base64url');
}

function decodeCursor(value: string): { updatedAt: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      updatedAt?: unknown;
      id?: unknown;
    };
    const updatedAt = typeof parsed.updatedAt === 'string' ? new Date(parsed.updatedAt) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime()) || typeof parsed.id !== 'string' || !parsed.id) {
      throw new TypeError('Invalid validation cursor');
    }
    return { updatedAt, id: parsed.id };
  } catch {
    throw new TypeError('Invalid validation cursor');
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
