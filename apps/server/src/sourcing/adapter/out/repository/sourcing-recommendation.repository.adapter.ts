import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateRecommendationRunResult,
  CreateSourcingRecommendationRunCommand,
  SourcingRecommendationRepositoryPort,
  SourcingRecommendationRunGraph,
} from '../../../application/port/out/repository/sourcing-recommendation.repository.port';

@Injectable()
export class SourcingRecommendationRepositoryAdapter
  implements SourcingRecommendationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findLatest(input: {
    organizationId: string;
    now: Date;
  }): Promise<SourcingRecommendationRunGraph | null> {
    const row = await this.prisma.sourcingRecommendationRun.findFirst({
      where: {
        organizationId: input.organizationId,
        status: { in: ['complete', 'partial'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      include: graphInclude,
    });
    return row ? toGraph(row) : null;
  }

  async createOrGet(
    command: CreateSourcingRecommendationRunCommand,
  ): Promise<CreateRecommendationRunResult> {
    const runId = randomUUID();
    const preparedItems = command.items.map((item) => ({ id: randomUUID(), item }));
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.sourcingRecommendationRun.create({
          data: {
            id: runId,
            organizationId: command.organizationId,
            policyKey: command.policyKey,
            policyVersion: command.policyVersion,
            modelVersion: command.modelVersion,
            calculationVersion: command.calculationVersion,
            inputManifestHash: command.inputManifestHash,
            inputManifest: command.inputManifest as Prisma.InputJsonValue,
            status: command.status,
            businessDate: command.businessDate,
            generatedAt: command.generatedAt,
            completedAt: command.completedAt,
            expiresAt: command.expiresAt,
            warningCodes: command.warningCodes,
            errorCode: command.errorCode,
            errorMessage: command.errorMessage,
          },
        });
        if (preparedItems.length > 0) {
          await tx.sourcingRecommendationItem.createMany({
            data: preparedItems.map(({ id, item }) => ({
              id,
              organizationId: command.organizationId,
              recommendationRunId: runId,
              itemKey: item.itemKey,
              sourcePlatform: item.sourcePlatform,
              externalOfferId: item.externalOfferId,
              variantKeyNormalized: item.variantKeyNormalized,
              matchedCoupangProductId: item.matchedCoupangProductId,
              displayName: item.displayName,
              rank: item.rank,
              score: item.score,
              grade: item.grade,
              baselineAction: item.baselineAction,
              reasonCodes: item.reasonCodes,
              riskCodes: item.riskCodes,
              scoreComponents: item.scoreComponents as Prisma.InputJsonValue,
              sourceSnapshot: item.sourceSnapshot as Prisma.InputJsonValue,
            })),
          });
          const evidenceRows = preparedItems.flatMap(({ id, item }) =>
            [...new Set(item.evidenceObservationIds)].map((evidenceObservationId, ordinal) => ({
              id: randomUUID(),
              organizationId: command.organizationId,
              recommendationItemId: id,
              evidenceObservationId,
              role: 'source',
              ordinal,
            })),
          );
          if (evidenceRows.length > 0) {
            await tx.sourcingRecommendationItemEvidence.createMany({ data: evidenceRows });
          }
        }
      });
      return { kind: 'created', run: graphFromCommand(runId, command, preparedItems) };
    } catch (error: unknown) {
      if (!isUniqueConstraint(error)) throw error;
      // PostgreSQL aborts an interactive transaction after P2002. Querying the
      // winner must happen outside that failed transaction.
      const existing = await this.findByManifest(command);
      if (existing) return { kind: 'existing', run: existing };
      throw error;
    }
  }

  private async findByManifest(
    command: CreateSourcingRecommendationRunCommand,
  ): Promise<SourcingRecommendationRunGraph | null> {
    const row = await this.prisma.sourcingRecommendationRun.findFirst({
      where: {
        organizationId: command.organizationId,
        policyKey: command.policyKey,
        policyVersion: command.policyVersion,
        modelVersion: command.modelVersion,
        calculationVersion: command.calculationVersion,
        inputManifestHash: command.inputManifestHash,
      },
      include: graphInclude,
    });
    return row ? toGraph(row) : null;
  }
}

const graphInclude = {
  items: {
    orderBy: [{ rank: 'asc' }, { id: 'asc' }],
    include: {
      evidence: {
        orderBy: [{ ordinal: 'asc' }, { id: 'asc' }],
        select: { evidenceObservationId: true },
      },
    },
  },
} satisfies Prisma.SourcingRecommendationRunInclude;

function graphFromCommand(
  id: string,
  command: CreateSourcingRecommendationRunCommand,
  items: Array<{ id: string; item: CreateSourcingRecommendationRunCommand['items'][number] }>,
): SourcingRecommendationRunGraph {
  return {
    id,
    organizationId: command.organizationId,
    inputManifestHash: command.inputManifestHash,
    status: command.status,
    businessDate: command.businessDate,
    generatedAt: command.generatedAt,
    completedAt: command.completedAt,
    expiresAt: command.expiresAt,
    warningCodes: command.warningCodes,
    items: items.map(({ id: itemId, item }) => ({
      id: itemId,
      ...item,
      evidenceObservationIds: [...new Set(item.evidenceObservationIds)],
    })),
  };
}

function toGraph(row: Prisma.SourcingRecommendationRunGetPayload<{ include: typeof graphInclude }>): SourcingRecommendationRunGraph {
  return {
    id: row.id,
    organizationId: row.organizationId,
    inputManifestHash: row.inputManifestHash,
    status: row.status as SourcingRecommendationRunGraph['status'],
    businessDate: row.businessDate,
    generatedAt: row.generatedAt,
    completedAt: row.completedAt,
    expiresAt: row.expiresAt,
    warningCodes: row.warningCodes,
    items: row.items.map((item) => ({
      id: item.id,
      itemKey: item.itemKey,
      sourcePlatform: item.sourcePlatform as '1688' | 'coupang',
      externalOfferId: item.externalOfferId,
      variantKeyNormalized: item.variantKeyNormalized,
      matchedCoupangProductId: item.matchedCoupangProductId,
      displayName: item.displayName,
      rank: item.rank,
      score: item.score,
      grade: item.grade as 'A' | 'B' | 'C' | 'WATCH',
      baselineAction: item.baselineAction as 'order' | 'observe_3d' | 'exclude',
      reasonCodes: item.reasonCodes,
      riskCodes: item.riskCodes,
      scoreComponents: numericRecord(item.scoreComponents),
      sourceSnapshot: jsonRecord(item.sourceSnapshot),
      evidenceObservationIds: item.evidence.map((evidence) => evidence.evidenceObservationId),
    })),
  };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(jsonRecord(value)).flatMap(([key, candidate]) =>
      typeof candidate === 'number' && Number.isFinite(candidate)
        ? [[key, candidate]]
        : [],
    ),
  );
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
