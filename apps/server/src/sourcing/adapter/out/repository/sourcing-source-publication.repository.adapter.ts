import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SourcingSourcePublicationPort,
  SourcingSourcePublicationView,
} from '../../../application/port/in/sourcing-source-publication.port';
import type {
  SourcingCurrentSourcePublication,
  SourcingSourceTarget,
} from '../../../application/port/out/repository/sourcing-server-operation.repository.port';

export interface PublishSourceSnapshotInput {
  organizationId: string;
  operationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  collectorKey: string;
  collectorVersion: string;
  plan: Record<string, unknown>;
  windowStartAt: Date | null;
  windowEndAt: Date | null;
  discoveredCount: number;
  acceptedCount: number;
  duplicateCount: number;
  coverage: { numerator: number; denominator: number } | null;
  contentChecksum: string | null;
  qualityReport: Record<string, unknown>;
  completedAt: Date;
}

/**
 * 발행 이력의 유일한 쓰기(KID-360). 성공한 수집 하나를 발행 1행으로 남기고, 같은 (source, scope, target)의
 * 이전 현재 발행을 내린다. 호출자의 종료 트랜잭션(`tx`) 안에서 원장 쓰기와 함께 커밋된다 — 이전 발행의
 * 원장 행은 그대로 남아 이력으로 읽힌다.
 */
export async function publishSourceSnapshot(
  tx: Prisma.TransactionClient,
  input: PublishSourceSnapshotInput,
) {
  await tx.sourcingSourcePublication.updateMany({
    where: {
      organizationId: input.organizationId,
      sourceKey: input.sourceKey,
      scopeKey: input.scopeKey,
      targetKey: input.targetKey,
      isCurrent: true,
    },
    data: { isCurrent: false },
  });
  return tx.sourcingSourcePublication.create({
    data: {
      organizationId: input.organizationId,
      operationId: input.operationId,
      sourceKey: input.sourceKey,
      scopeKey: input.scopeKey,
      targetKey: input.targetKey,
      isCurrent: true,
      collectorKey: input.collectorKey,
      collectorVersion: input.collectorVersion,
      plan: input.plan as Prisma.InputJsonObject,
      windowStartAt: input.windowStartAt,
      windowEndAt: input.windowEndAt,
      discoveredCount: input.discoveredCount,
      acceptedCount: input.acceptedCount,
      duplicateCount: input.duplicateCount,
      coverageNumerator: input.coverage?.numerator ?? null,
      coverageDenominator: input.coverage?.denominator ?? null,
      contentChecksum: input.contentChecksum,
      qualityReport: input.qualityReport as Prisma.InputJsonObject,
      completedAt: input.completedAt,
    },
  });
}

@Injectable()
export class SourcingSourcePublicationRepositoryAdapter implements SourcingSourcePublicationPort {
  constructor(private readonly prisma: PrismaService) {}

  async currentSourcePublication(
    input: { organizationId: string; sourceKey: string; scopeKey: string; targetKey: string },
    transaction?: OwnerTransaction,
  ): Promise<SourcingSourcePublicationView | null> {
    const client = transaction ? ownerTransactionClient(transaction) : this.prisma;
    const row = await client.sourcingSourcePublication.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceKey: input.sourceKey,
        scopeKey: input.scopeKey,
        targetKey: input.targetKey,
        isCurrent: true,
      },
    });
    if (!row) return null;
    return {
      operationId: row.operationId,
      sourceKey: row.sourceKey,
      scopeKey: row.scopeKey,
      targetKey: row.targetKey,
      windowStartAt: row.windowStartAt,
      windowEndAt: row.windowEndAt,
      completedAt: row.completedAt,
      coverage: row.coverageNumerator !== null && row.coverageDenominator !== null
        ? { numerator: row.coverageNumerator, denominator: row.coverageDenominator }
        : null,
    };
  }

  /**
   * 서버 구동 원천 상태(KID-389)가 읽는 현재 발행: 원천 plan·품질 보고·건수·지문까지. 상태 리더가 최신 실행과 같은
   * 스냅숏에서 읽도록 호출자의 트랜잭션(`tx`, repeatable read)으로만 읽는다.
   */
  async currentPublicationForStatus(
    tx: Prisma.TransactionClient,
    target: SourcingSourceTarget,
  ): Promise<SourcingCurrentSourcePublication | null> {
    const row = await tx.sourcingSourcePublication.findFirst({
      where: {
        organizationId: target.organizationId,
        sourceKey: target.sourceKey,
        scopeKey: target.scopeKey,
        targetKey: target.targetKey,
        isCurrent: true,
      },
    });
    if (!row) return null;
    return {
      operationId: row.operationId,
      sourceKey: row.sourceKey,
      scopeKey: row.scopeKey,
      targetKey: row.targetKey,
      plan: jsonObject(row.plan),
      windowStartAt: row.windowStartAt,
      windowEndAt: row.windowEndAt,
      acceptedCount: row.acceptedCount,
      contentChecksum: row.contentChecksum,
      qualityReport: jsonObject(row.qualityReport),
      completedAt: row.completedAt,
    };
  }
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
