import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { readLatestOperationForPlan } from '../../../../common/operation/transaction/latest-operation-for-plan';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type MarketShadowSnapshotRepositoryPort,
  type MarketShadowSnapshotRow,
} from '../../../application/port/out/repository/market-shadow-snapshot.repository.port';
import {
  readLatestCurrentMarketShadowFact,
  readMarketShadowFactForAttempt,
  readRecentCurrentMarketShadowFacts,
} from './source-evidence.reader';
import { MarketShadowSnapshotDocumentSchema } from '../../../domain/market-shadow-snapshot-document';

@Injectable()
export class MarketShadowSnapshotRepositoryAdapter implements MarketShadowSnapshotRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async findByAttempt(organizationId: string, attemptId: string) {
    const fact = await readMarketShadowFactForAttempt(this.prisma, {
      organizationId,
      operationId: attemptId,
    });
    return fact ? toRow(fact) : null;
  }
  readLatest(organizationId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const latest = await readLatestOperationForPlan(tx, {
          organizationId,
          kinds: [SOURCING_OPERATION_KINDS.marketShadow],
          planEquals: { sourceKey: 'market_shadow_signals', scopeKey: 'day' },
        });
        const complete = await readLatestCurrentMarketShadowFact(tx, organizationId);
        const latestComplete = complete ? toRow(complete) : null;
        return {
          latestAttempt: latest ? {
            ...latest,
            plan: jsonObject(latest.plan),
            result: latest.result && typeof latest.result === 'object' && !Array.isArray(latest.result)
              ? latest.result as Record<string, unknown> : null,
          } : null,
          latestComplete,
          actualCutoffAt: latestComplete ? complete!.publication.windowEndAt : null,
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
  if (!row || !row.publication.windowStartAt) return null;
  const document = MarketShadowSnapshotDocumentSchema.safeParse(row.document);
  if (!document.success) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    businessDate: row.businessDate,
    payload: document.data,
    // 발행 표는 시작 시각을 두지 않는다(KID-360): 발행 행이 생긴 때가 곧 완료다.
    createdAt: row.publication.createdAt,
    updatedAt: row.publication.completedAt,
  };
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
