import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readLatestOperationForPlan, type PlannedOperationRow } from '../../../../common/operation/transaction/latest-operation-for-plan';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SourcingCurrentSourcePublication,
  SourcingServerOperationRecord,
  SourcingServerOperationRepositoryPort,
  SourcingSourceTarget,
} from '../../../application/port/out/repository/sourcing-server-operation.repository.port';

/**
 * 서버 구동 소싱 kind(KID-389)의 읽기. 실행은 계약 모듈의 리더(`readLatestOperationForPlan`)로만 읽고 — 실행 표를 직접
 * 질의하지 않는다(`check:operation-owner-boundary`) — 현재 완결은 이 owner의 발행 표에서 읽는다.
 */
@Injectable()
export class SourcingServerOperationRepositoryAdapter implements SourcingServerOperationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async latestForTarget(input: Omit<SourcingSourceTarget, 'targetKey'> & { targetKey?: string; kinds: readonly string[] }) {
    const row = await readLatestOperationForPlan(this.prisma, {
      organizationId: input.organizationId,
      kinds: input.kinds,
      planEquals: {
        sourceKey: input.sourceKey,
        scopeKey: input.scopeKey,
        ...(input.targetKey === undefined ? {} : { targetKey: input.targetKey }),
      },
    });
    return row ? toRecord(row) : null;
  }

  async findByRequestKey(input: { organizationId: string; kind: string; sourceKey: string; requestIdempotencyKey: string }) {
    const row = await readLatestOperationForPlan(this.prisma, {
      organizationId: input.organizationId,
      kinds: [input.kind],
      planEquals: { sourceKey: input.sourceKey, requestIdempotencyKey: input.requestIdempotencyKey },
    });
    return row ? toRecord(row) : null;
  }

  readTarget(input: SourcingSourceTarget & { kinds: readonly string[] }) {
    return this.prisma.$transaction(async (tx) => {
      const latest = await readLatestOperationForPlan(tx, {
        organizationId: input.organizationId,
        kinds: input.kinds,
        planEquals: { sourceKey: input.sourceKey, scopeKey: input.scopeKey, targetKey: input.targetKey },
      });
      const row = await tx.sourcingSourcePublication.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          isCurrent: true,
        },
      });
      return { latest: latest ? toRecord(latest) : null, publication: row ? toPublication(row) : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

function toPublication(row: Prisma.SourcingSourcePublicationGetPayload<object>): SourcingCurrentSourcePublication {
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

function toRecord(row: PlannedOperationRow): SourcingServerOperationRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    plan: jsonObject(row.plan),
    result: row.result === null ? null : jsonObject(row.result),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    expiresAt: row.expiresAt,
  };
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
