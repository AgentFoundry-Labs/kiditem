import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  MARKET_SHADOW_SNAPSHOT_SCOPE,
  type MarketShadowSnapshotRepositoryPort,
  type MarketShadowSnapshotRow,
} from '../../../application/port/out/repository/market-shadow-snapshot.repository.port';
import { toAttempt } from './sourcing-browser-source-attempt.repository.adapter';
import {
  readLatestCurrentMarketShadowFact,
  readMarketShadowFactForAttempt,
  readRecentCurrentMarketShadowFacts,
} from '../../../read/source-evidence.reader';
import {
  readLatestSourcingAttempt,
  readSourcingRunByIdempotencyKey,
} from '../../../read/source-evidence.reader';
import { MarketShadowSnapshotDocumentSchema } from '../../../domain/market-shadow-snapshot-document';

@Injectable()
export class MarketShadowSnapshotRepositoryAdapter implements MarketShadowSnapshotRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async findAttemptIdByKey(organizationId: string, idempotencyKey: string) {
    const row = await readSourcingRunByIdempotencyKey(this.prisma, {
      organizationId,
      sourceKey: MARKET_SHADOW_SNAPSHOT_SCOPE,
      scopeKey: 'day',
      idempotencyKey,
    });
    return row?.id ?? null;
  }
  async findByAttempt(organizationId: string, attemptId: string) {
    const fact = await readMarketShadowFactForAttempt(this.prisma, {
      organizationId,
      ingestionRunId: attemptId,
    });
    return fact ? toRow(fact) : null;
  }
  readLatest(organizationId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const latest = await readLatestSourcingAttempt(tx, {
          organizationId,
          sourceKey: MARKET_SHADOW_SNAPSHOT_SCOPE,
          scopeKey: 'day',
        });
        const complete = await readLatestCurrentMarketShadowFact(tx, organizationId);
        const latestComplete = complete ? toRow(complete) : null;
        return {
          latestAttempt: latest ? toAttempt(latest, new Date()) : null,
          latestComplete,
          actualCutoffAt: latestComplete ? complete!.ingestionRun.sourceWindowEndAt : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async listRecent(input: Parameters<MarketShadowSnapshotRepositoryPort['listRecent']>[0]) {
    const rows = await readRecentCurrentMarketShadowFacts(this.prisma, {
      organizationId: input.organizationId,
      fromBusinessDate: input.fromBusinessDate,
      toBusinessDate: input.toBusinessDate,
      limit: input.limit,
    });
    return rows
      .map(toRow)
      .filter((row): row is MarketShadowSnapshotRow => row !== null);
  }
}
function toRow(
  row: Awaited<ReturnType<typeof readMarketShadowFactForAttempt>>,
): MarketShadowSnapshotRow | null {
  if (!row || !row.ingestionRun.sourceWindowStartAt || !row.ingestionRun.completedAt) return null;
  const document = MarketShadowSnapshotDocumentSchema.safeParse(row.document);
  if (!document.success) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    businessDate: row.businessDate,
    payload: document.data,
    createdAt: row.ingestionRun.startedAt,
    updatedAt: row.ingestionRun.completedAt,
  };
}
