import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  CreateReviewBatchCommand,
  CreateReviewBatchResult,
  SaveReviewSelectionCommand,
  SaveReviewSelectionResult,
  SourcingReviewBatchRecord,
  SourcingReviewRepositoryPort,
  SourcingReviewSelectionRecord,
} from '../../../application/port/out/repository/sourcing-review.repository.port';

@Injectable()
export class SourcingReviewRepositoryAdapter implements SourcingReviewRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listSelections(input: {
    organizationId: string;
    workspaceKey: 'entry' | 'final';
    recommendationRunId: string;
  }): Promise<SourcingReviewSelectionRecord[]> {
    const rows = await this.prisma.sourcingReviewSelection.findMany({
      where: input,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toSelection);
  }

  async saveSelection(command: SaveReviewSelectionCommand): Promise<SaveReviewSelectionResult> {
    if (command.expectedVersion === 0) {
      try {
        const selection = await this.prisma.sourcingReviewSelection.create({
          data: {
            id: randomUUID(),
            organizationId: command.organizationId,
            recommendationRunId: command.recommendationRunId,
            workspaceKey: command.workspaceKey,
            itemKey: command.itemKey,
            state: command.state,
            version: 1,
          },
        });
        return { kind: 'saved', selection: toSelection(selection) };
      } catch (error: unknown) {
        if (!isUniqueConstraint(error)) throw error;
        const current = await this.findSelection(command);
        return { kind: 'version_conflict', currentVersion: current?.version ?? 0 };
      }
    }

    const updated = await this.prisma.sourcingReviewSelection.updateMany({
      where: {
        organizationId: command.organizationId,
        recommendationRunId: command.recommendationRunId,
        workspaceKey: command.workspaceKey,
        itemKey: command.itemKey,
        version: command.expectedVersion,
      },
      data: {
        state: command.state,
        version: { increment: 1 },
      },
    });
    const current = await this.findSelection(command);
    if (updated.count === 0 || !current) {
      return { kind: 'version_conflict', currentVersion: current?.version ?? 0 };
    }
    return { kind: 'saved', selection: current };
  }

  async createBatch(command: CreateReviewBatchCommand): Promise<CreateReviewBatchResult> {
    try {
      return await this.prisma.$transaction((tx) => this.createBatchAttempt(tx, command));
    } catch (error: unknown) {
      if (!isUniqueConstraint(error)) throw error;
      // Never query from the failed interactive transaction. PostgreSQL puts
      // it in 25P02 after P2002; read the winner from a fresh client scope.
      const winner = await this.findByIdempotency(command.organizationId, command.idempotencyKey);
      if (!winner) throw error;
      return winner.requestHash === command.requestHash
        ? { kind: 'existing', batch: winner }
        : { kind: 'idempotency_conflict' };
    }
  }

  async findBatch(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingReviewBatchRecord | null> {
    const row = await this.prisma.sourcingReviewBatch.findFirst({
      where: input,
      include: batchInclude,
    });
    return row ? toBatch(row) : null;
  }

  private async createBatchAttempt(
    tx: Prisma.TransactionClient,
    command: CreateReviewBatchCommand,
  ): Promise<CreateReviewBatchResult> {
    const existing = await tx.sourcingReviewBatch.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: command.organizationId,
          idempotencyKey: command.idempotencyKey,
        },
      },
      include: batchInclude,
    });
    if (existing) {
      return existing.requestHash === command.requestHash
        ? { kind: 'existing', batch: toBatch(existing) }
        : { kind: 'idempotency_conflict' };
    }

    const recommendationItems = await tx.sourcingRecommendationItem.findMany({
      where: {
        organizationId: command.organizationId,
        recommendationRunId: command.recommendationRunId,
        itemKey: { in: command.itemKeys },
        sourcePlatform: '1688',
      },
      select: {
        id: true,
        itemKey: true,
        externalOfferId: true,
        variantKeyNormalized: true,
        sourceSnapshot: true,
      },
    });
    const itemByKey = new Map(recommendationItems.map((item) => [item.itemKey, item]));
    const invalidKeys = command.itemKeys.filter((itemKey) => !itemByKey.has(itemKey));
    if (invalidKeys.length > 0) return { kind: 'invalid_items', itemKeys: invalidKeys };

    const observationIdsByItemId = new Map(
      recommendationItems.map((item) => [item.id, sourceObservationIds(item.sourceSnapshot)]),
    );
    const observationIds = compactIds([...observationIdsByItemId.values()].flat());
    if (observationIds.length === 0) {
      return { kind: 'invalid_items', itemKeys: command.itemKeys };
    }
    const observations = await tx.sourcing1688OfferKeywordObservation.findMany({
      where: {
        organizationId: command.organizationId,
        id: { in: observationIds },
      },
      select: {
        id: true,
        externalOfferId: true,
        variantKeyNormalized: true,
      },
    });
    const observationsById = new Map(observations.map((item) => [item.id, item]));
    const offerObservationByItemId = new Map<string, string>();
    for (const item of recommendationItems) {
      const observation = observationIdsByItemId.get(item.id)
        ?.map((id) => observationsById.get(id))
        .find((candidate) => candidate
          && candidate.externalOfferId === item.externalOfferId
          && candidate.variantKeyNormalized === item.variantKeyNormalized);
      if (!observation) {
        invalidKeys.push(item.itemKey);
      } else {
        offerObservationByItemId.set(item.id, observation.id);
      }
    }
    if (invalidKeys.length > 0) {
      return { kind: 'invalid_items', itemKeys: [...new Set(invalidKeys)].sort() };
    }

    const validationEpisodes = await tx.sourcingValidationEpisode.findMany({
      where: {
        organizationId: command.organizationId,
        recommendationRunId: command.recommendationRunId,
        recommendationItemId: { in: recommendationItems.map((item) => item.id) },
      },
      select: { id: true, recommendationItemId: true },
    });
    const validationByItemId = new Map(
      validationEpisodes.map((episode) => [episode.recommendationItemId, episode.id]),
    );

    const created = await tx.sourcingReviewBatch.create({
      data: {
        id: randomUUID(),
        organizationId: command.organizationId,
        recommendationRunId: command.recommendationRunId,
        requestedByUserId: command.requestedByUserId,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        status: 'awaiting_procurement_enablement',
      },
      include: batchInclude,
    });
    await tx.sourcingReviewBatchItem.createMany({
      data: command.itemKeys.map((itemKey, ordinal) => {
        const item = itemByKey.get(itemKey)!;
        return {
          id: randomUUID(),
          organizationId: command.organizationId,
          reviewBatchId: created.id,
          recommendationItemId: item.id,
          validationEpisodeId: validationByItemId.get(item.id) ?? null,
          offerKeywordObservationId: offerObservationByItemId.get(item.id)!,
          ordinal,
        };
      }),
    });
    return {
      kind: 'created',
      batch: {
        ...toBatch(created),
        itemCount: command.itemKeys.length,
      },
    };
  }

  private async findSelection(command: SaveReviewSelectionCommand) {
    const row = await this.prisma.sourcingReviewSelection.findUnique({
      where: {
        organizationId_workspaceKey_recommendationRunId_itemKey: {
          organizationId: command.organizationId,
          workspaceKey: command.workspaceKey,
          recommendationRunId: command.recommendationRunId,
          itemKey: command.itemKey,
        },
      },
    });
    return row ? toSelection(row) : null;
  }

  private async findByIdempotency(organizationId: string, idempotencyKey: string) {
    const row = await this.prisma.sourcingReviewBatch.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
      include: batchInclude,
    });
    return row ? toBatchWithHash(row) : null;
  }
}

const batchInclude = {
  _count: { select: { items: true } },
} satisfies Prisma.SourcingReviewBatchInclude;

function toSelection(row: {
  id: string;
  organizationId: string;
  recommendationRunId: string;
  workspaceKey: string;
  itemKey: string;
  state: string;
  version: number;
  updatedAt: Date;
}): SourcingReviewSelectionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    recommendationRunId: row.recommendationRunId,
    workspaceKey: row.workspaceKey as SourcingReviewSelectionRecord['workspaceKey'],
    itemKey: row.itemKey,
    state: row.state as SourcingReviewSelectionRecord['state'],
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

function toBatch(
  row: Prisma.SourcingReviewBatchGetPayload<{ include: typeof batchInclude }>,
): SourcingReviewBatchRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    recommendationRunId: row.recommendationRunId,
    requestedByUserId: row.requestedByUserId,
    status: row.status as SourcingReviewBatchRecord['status'],
    itemCount: row._count.items,
    createdAt: row.createdAt,
  };
}

function toBatchWithHash(
  row: Prisma.SourcingReviewBatchGetPayload<{ include: typeof batchInclude }>,
): SourcingReviewBatchRecord & { requestHash: string } {
  return { ...toBatch(row), requestHash: row.requestHash };
}

function sourceObservationIds(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const raw = (value as Record<string, unknown>).offerObservationIds;
  return Array.isArray(raw)
    ? raw.flatMap((id) => typeof id === 'string' && id.trim() ? [id.trim()] : [])
    : [];
}

function compactIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
