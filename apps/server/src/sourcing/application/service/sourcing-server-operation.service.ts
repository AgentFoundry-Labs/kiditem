import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  KiditemConflictError,
  KiditemInvalidValueError,
  KiditemPreconditionError,
} from '@kiditem/shared/errors';
import { resourceLockKey, type OperationPlanResult, type OperationStagedChunk } from '@kiditem/shared/operation';
import {
  SOURCING_SERVER_SCOPE_SCHEMAS,
  SourcingSourceFailureAlertSchema,
  type SourcingServerKind,
  type SourcingServerOperationResult,
} from '@kiditem/shared/sourcing-operation';
import type {
  SourcingOperationFinalizeContext,
  SourcingOperationPlanContext,
} from '../port/in/sourcing-extension-operation.port';
import type { SourcingServerFailedContext, SourcingServerOperationPort } from '../port/in/sourcing-server-operation.port';
import type { SourcingCollectionPermit } from '../port/out/repository/sourcing-collection.repository.port';
import {
  SOURCING_OPERATION_LEDGER_REPOSITORY_PORT,
  type SourcingOperationLedgerRepositoryPort,
} from '../port/out/repository/sourcing-operation-ledger.repository.port';
import { lockId } from './sourcing-extension-operation.service';
import { decodeSourceOutput } from './sourcing-server-output.codec';

/** 서버 구동 kind의 plan JSON에 남는 값. 원천 plan(`attemptPlan`)의 칸은 이 위에 펼쳐진다. */
const ServerPlanSchema = z.object({
  sourceKey: z.string().min(1),
  scopeKey: z.string().min(1),
  targetKey: z.string().min(1),
  planChecksum: z.string().min(1),
  collectorKey: z.string().min(1),
  collectorVersion: z.string().min(1),
  failureAlert: SourcingSourceFailureAlertSchema,
}).passthrough();
type ServerPlan = z.infer<typeof ServerPlanSchema>;

/**
 * 서버 구동 소싱 kind 8개의 owner 일(KID-389). 서버가 요청 안에서 begin → `source_output` 청크 → finish 하고,
 * finalize가 옛 attempt 종료 트랜잭션이 하던 일(원장 사실 · URL 수집의 원본 기록과 초안 · 발행 1행 · 실패 알림 닫기)을
 * 계약의 finish 트랜잭션에서 한다. 범위를 다 채우지 못한 출력(rejected>0)은 서비스가 먼저 failed로 닫으므로 여기 오면
 * 던진다(방어 — 원장 0). 실행 행의 상태는 계약이 쓰고 원천 run 표는 쓰지 않는다.
 */
@Injectable()
export class SourcingServerOperationService implements SourcingServerOperationPort {
  constructor(
    @Inject(SOURCING_OPERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: SourcingOperationLedgerRepositoryPort,
  ) {}

  async plan(kind: SourcingServerKind, scope: Record<string, unknown>, context: SourcingOperationPlanContext): Promise<OperationPlanResult> {
    const parsed = SOURCING_SERVER_SCOPE_SCHEMAS[kind].safeParse(scope);
    if (!parsed.success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'invalid_scope', kind, issues: parsed.error.issues.map((issue) => issue.path.join('.')) },
      });
    }
    const { attemptPlan, ...base } = parsed.data;
    await this.assertSourceEnabled(context.organizationId, base.sourceKey);
    return {
      plan: { ...attemptPlan, ...base, startedBy: context.userId },
      // 옛 attempt의 원천·대상 잠금(SOURCE_ATTEMPT_IN_PROGRESS) 자리: 같은 대상의 두 번째 begin은 계약이 겹침으로 거절한다.
      lockKeys: [resourceLockKey('sourcing', lockId(`${base.sourceKey}:${base.scopeKey}:${base.targetKey}`))],
    };
  }

  async finalize(
    kind: SourcingServerKind,
    chunks: OperationStagedChunk[],
    context: SourcingOperationFinalizeContext,
  ): Promise<SourcingServerOperationResult> {
    const plan = parsePlan(context.plan);
    await this.assertSourceEnabled(context.organizationId, plan.sourceKey, context);
    const { output, head } = decodeSourceOutput(chunks);
    if (output.rejectedCount > 0) {
      throw new KiditemConflictError('SOURCING_COLLECTION_INCOMPLETE', { details: { reason: 'rejected_output', kind } });
    }
    if (kind === 'sourcing.scrape_url' && (!head.sourceRecord || head.sourceRecord.organizationId !== context.organizationId
      || head.sourceRecord.sourceUrl !== context.plan.sourceUrl)) {
      throw new KiditemInvalidValueError('SOURCING_COLLECTION_INVALID', { details: { reason: 'scrape_candidate_mismatch' } });
    }
    const now = new Date();
    const permit: SourcingCollectionPermit = {
      runId: context.operationId,
      organizationId: context.organizationId,
      sourceKey: plan.sourceKey,
      scopeKey: plan.scopeKey,
      targetKey: plan.targetKey,
      leaseToken: '',
      generation: 1,
      leaseExpiresAt: now,
    };
    // 원본 기록 입장이 같은 원본을 거절하면(`SourceRecordDuplicateError`) 이 트랜잭션 전체가 되돌아간다(KID-313).
    const persisted = await this.ledger.persistFacts(context.tx, permit, output, now);
    const scrapeUrlResult = kind === 'sourcing.scrape_url' && head.sourceRecord
      ? await this.ledger.admitScrapeUrlRecord(context.tx, head.sourceRecord)
      : undefined;
    const acceptedCount = Math.max(0, output.discoveredCount - output.rejectedCount);
    await this.ledger.publish(context.tx, context.organizationId, context.operationId, {
      sourceKey: plan.sourceKey,
      scopeKey: plan.scopeKey,
      targetKey: plan.targetKey,
      collectorKey: plan.collectorKey,
      collectorVersion: plan.collectorVersion,
      plan: context.plan,
      windowStartAt: head.windowStartAt,
      windowEndAt: head.windowEndAt ?? now,
      discoveredCount: output.discoveredCount,
      acceptedCount,
      duplicateCount: persisted.duplicateCount,
      contentChecksum: head.contentChecksum,
      qualityReport: {
        ...output.qualityReport,
        ...(scrapeUrlResult ? { scrapeUrlResult } : {}),
        ...(head.warnings ? { warnings: head.warnings } : {}),
        source: plan.sourceKey,
        planChecksum: plan.planChecksum,
        completeSnapshot: true,
      },
      completedAt: now,
    });
    await this.ledger.resolveSourceFailure(context.tx, {
      organizationId: context.organizationId,
      dedupeKey: plan.failureAlert.dedupeKey,
      operationId: context.operationId,
    });
    const unitResult = output.qualityReport.unitResult;
    return {
      sourceKey: plan.sourceKey,
      scopeKey: plan.scopeKey,
      targetKey: plan.targetKey,
      discoveredCount: output.discoveredCount,
      acceptedCount,
      duplicateCount: persisted.duplicateCount,
      rejectedCount: 0,
      contentChecksum: head.contentChecksum,
      completedAt: now.toISOString(),
      ...(head.warnings ? { warnings: head.warnings } : {}),
      ...(isRecord(unitResult) ? { unitResult } : {}),
      ...(scrapeUrlResult ? { scrapeUrlResult } : {}),
    };
  }

  async onFailed(_kind: SourcingServerKind, context: SourcingServerFailedContext): Promise<void> {
    const plan = parsePlan(context.plan);
    await this.ledger.recordSourceFailure(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      code: context.errorCode,
      message: context.errorMessage ?? context.errorCode,
      alert: plan.failureAlert,
    });
  }

  private async assertSourceEnabled(organizationId: string, sourceKey: string, context?: SourcingOperationFinalizeContext) {
    const failure = await this.ledger.sourceAccessFailure(organizationId, sourceKey, context?.tx);
    if (failure) {
      throw new KiditemPreconditionError('SOURCING_SOURCE_DISABLED', { details: { sourceKey, reason: failure } });
    }
  }
}

function parsePlan(plan: Record<string, unknown>): ServerPlan {
  const parsed = ServerPlanSchema.safeParse(plan);
  if (!parsed.success) throw new KiditemInvalidValueError('SOURCING_COLLECTION_INVALID', { details: { reason: 'plan_malformed' } });
  return parsed.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
