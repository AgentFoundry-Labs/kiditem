import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  MARKET_SHADOW_SNAPSHOT_SCOPE,
  type MarketShadowSnapshotRepositoryPort,
  type MarketShadowSnapshotRow,
} from '../../../application/port/out/repository/market-shadow-snapshot.repository.port';
import { toAttempt } from './sourcing-browser-source-attempt.repository.adapter';

@Injectable()
export class MarketShadowSnapshotRepositoryAdapter implements MarketShadowSnapshotRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async findAttemptIdByKey(organizationId: string, idempotencyKey: string) {
    const row = await this.prisma.sourcingEvidenceIngestionRun.findFirst({
      where: {
        organizationId,
        sourceKey: MARKET_SHADOW_SNAPSHOT_SCOPE,
        scopeKey: 'day',
        idempotencyKey,
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }
  async findByAttempt(organizationId: string, attemptId: string) {
    const row = await this.prisma.sourcingEvidenceObservation.findFirst({
      where: {
        ...observationWhere(organizationId),
        ingestionRun: { ...completeWhere(organizationId), id: attemptId },
      },
      include: { ingestionRun: true },
    });
    return row ? toRow(row) : null;
  }
  readLatest(organizationId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const [latest, complete] = await Promise.all([
          tx.sourcingEvidenceIngestionRun.findFirst({
            where: { organizationId, sourceKey: MARKET_SHADOW_SNAPSHOT_SCOPE, scopeKey: 'day' },
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          }),
          tx.sourcingEvidenceObservation.findFirst({
            where: {
              ...observationWhere(organizationId),
              ingestionRun: { ...completeWhere(organizationId), isCurrentComplete: true },
            },
            orderBy: [{ ingestionRun: { sourceWindowStartAt: 'desc' } }, { observedAt: 'desc' }],
            include: { ingestionRun: true },
          }),
        ]);
        return {
          latestAttempt: latest ? toAttempt(latest, new Date()) : null,
          latestComplete: complete ? toRow(complete) : null,
          actualCutoffAt: complete?.ingestionRun.sourceWindowEndAt ?? null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async listRecent(input: Parameters<MarketShadowSnapshotRepositoryPort['listRecent']>[0]) {
    const rows = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        ...observationWhere(input.organizationId),
        ingestionRun: {
          ...completeWhere(input.organizationId),
          isCurrentComplete: true,
          sourceWindowStartAt: { gte: input.fromBusinessDate, lte: input.toBusinessDate },
        },
      },
      orderBy: [{ ingestionRun: { sourceWindowStartAt: 'desc' } }],
      take: input.limit,
      include: { ingestionRun: true },
    });
    return rows.map(toRow);
  }
}
const completeWhere = (organizationId: string) => ({
  organizationId,
  sourceKey: MARKET_SHADOW_SNAPSHOT_SCOPE,
  scopeKey: 'day',
  status: 'COMPLETE',
});
const observationWhere = (organizationId: string) => ({
  organizationId,
  sourceKey: MARKET_SHADOW_SNAPSHOT_SCOPE,
  evidenceFamily: 'market_shadow_snapshot',
  schemaVersion: 'market-shadow-signals.v1',
  supportsCandidate: false,
});
function toRow(
  row: Prisma.SourcingEvidenceObservationGetPayload<{ include: { ingestionRun: true } }>,
): MarketShadowSnapshotRow {
  if (!row.ingestionRun.sourceWindowStartAt || !row.ingestionRun.completedAt)
    throw new Error('Shadow COMPLETE snapshot is missing coverage');
  return {
    id: row.id,
    organizationId: row.organizationId,
    businessDate: row.ingestionRun.sourceWindowStartAt,
    payload: row.payload as Record<string, unknown>,
    createdAt: row.ingestionRun.startedAt,
    updatedAt: row.ingestionRun.completedAt,
  };
}
