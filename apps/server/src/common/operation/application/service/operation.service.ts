import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  KiditemConflictError,
  KiditemExternalError,
  KiditemInvalidValueError,
  KiditemNotFoundError,
} from '@kiditem/shared/errors';
import {
  OPERATION_CANCEL_CODE,
  OperationPlanResultSchema,
  isOperationTerminal,
  type OperationBeginRequest,
  type OperationBeginResponse,
  type OperationCancelResponse,
  type OperationChunkKind,
  type OperationChunkPutRequest,
  type OperationChunkPutResponse,
  type OperationClaimRequest,
  type OperationFenceLostReason,
  type OperationFinishRequest,
  type OperationFinishResponse,
  type OperationInProgressDetails,
  type OperationListQuery,
  type OperationListResponse,
  type OperationPrepareRequest,
  type OperationView,
  type OperationWindow,
} from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../owner-transaction';
import { decideFailure } from '../../domain/operation-attempt';
import { evaluateChunkWrite } from '../../domain/operation-chunk';
import {
  OPERATION_EXPIRED_ERROR_CODE,
  OPERATION_EXPIRED_ERROR_MESSAGE,
  evaluateOperationFence,
  isLeaseExpired,
  leaseExpiresAt,
} from '../../domain/operation-fence';
import { canonicalOwnerInputHash } from '../../../owner-idempotency-key';
import type { OperationClaimed, OperationPort, OperationPrepareResult } from '../port/in/operation.port';
import {
  OPERATION_REPOSITORY,
  type OperationClosure,
  type OperationRecord,
  type OperationRepositoryPort,
  type OperationTransaction,
} from '../port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from './operation-owner.registry';
import { toOperationView } from './operation-view';

interface PlannedOperation {
  requestHash: string;
  plan: Record<string, unknown>;
  window: OperationWindow | null;
  lockKeys: string[];
}

/** 트랜잭션 안에서 만료를 커밋한 뒤 밖에서 던질 거절. */
type Deferred<T> = { ok: T } | { reject: OperationFenceLostReason; operationId: string } | { notFound: true };

/** 한 번에 정리하는 만료 실행 수 상한(reader·claim). 남은 것은 다음 호출이 이어서 닫는다. */
const EXPIRY_BATCH = 50;

function expiredClosure(now: Date): OperationClosure {
  return {
    status: 'failed',
    errorCode: OPERATION_EXPIRED_ERROR_CODE,
    errorMessage: OPERATION_EXPIRED_ERROR_MESSAGE,
    finishedAt: now,
  };
}

function fenceLost(operationId: string, reason: OperationFenceLostReason): KiditemConflictError {
  return new KiditemConflictError('OPERATION_FENCE_LOST', { details: { operationId, reason } });
}

function unwrap<T>(outcome: Deferred<T>): T {
  if ('ok' in outcome) return outcome.ok;
  if ('notFound' in outcome) throw new KiditemNotFoundError('OPERATION_NOT_FOUND');
  throw fenceLost(outcome.operationId, outcome.reject);
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

/**
 * 실행 계약(ADR-0025)의 유일한 쓰기 권한. 신원·토큰·임대·청크 보관·겹침·거절을 kind와 무관하게 다루고,
 * kind별 일은 owner 포트(`plan`·`finalize`)에 맡긴다. 만료는 다음 읽기·쓰기에서 그 자리에서 판정한다.
 */
@Injectable()
export class OperationService implements OperationPort {
  constructor(
    @Inject(OPERATION_REPOSITORY) private readonly operations: OperationRepositoryPort,
    private readonly owners: OperationOwnerRegistry,
  ) {}

  async begin(organizationId: string, request: OperationBeginRequest): Promise<OperationBeginResponse> {
    const planned = await this.planFor(organizationId, request.kind, request.scope, request.fileHash ?? null);
    try {
      return await this.admit(organizationId, request, planned);
    } catch (error) {
      // 동시에 들어온 begin이 같은 잠금·멱등 키를 먼저 잡았다. 한 번 더 판정하면 그 실행이 보인다.
      if (!isUniqueViolation(error)) throw error;
      return this.admit(organizationId, request, planned);
    }
  }

  /**
   * begin·prepare 공통: kind의 owner를 찾아 `plan(scope)`을 받고, 요청 지문(kind·scope·fileHash의 canonical
   * SHA-256)과 정렬한 lockKey를 만든다. 모든 시작이 같은 순서로 잠금 행을 써야 교착(40P01)하지 않는다.
   */
  private async planFor(organizationId: string, kind: string, scope: Record<string, unknown>, fileHash: string | null): Promise<PlannedOperation> {
    const owner = this.owners.find(kind);
    if (!owner) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'unknown_operation_kind' } });
    }
    const planned = OperationPlanResultSchema.parse(await owner.plan(scope, { organizationId }));
    return {
      requestHash: canonicalOwnerInputHash({ kind, scope, fileHash }),
      plan: planned.plan,
      window: planned.window ?? null,
      lockKeys: [...new Set(planned.lockKeys)].sort(),
    };
  }

  /** 같은 멱등 키의 실행이 있으면 (요청이 같을 때만) 그것을 돌려준다. 다른 요청이면 거절, 없으면 null. */
  private async reuseByIdempotencyKey(
    tx: OperationTransaction,
    organizationId: string,
    kind: string,
    idempotencyKey: string | undefined,
    requestHash: string,
    now: Date,
  ): Promise<OperationRecord | null> {
    if (!idempotencyKey) return null;
    const existing = await tx.findByIdempotencyKey(organizationId, kind, idempotencyKey);
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'idempotency_key_reused' } });
    }
    return this.expireIfDue(tx, existing, now);
  }

  private admit(organizationId: string, request: OperationBeginRequest, planned: PlannedOperation): Promise<OperationBeginResponse> {
    const { requestHash, plan, window, lockKeys } = planned;
    return this.operations.transaction(async (tx) => {
      const now = new Date();
      const reused = await this.reuseByIdempotencyKey(tx, organizationId, request.kind, request.idempotencyKey, requestHash, now);
      if (reused) return { operation: toOperationView(reused), token: reused.token, reused: true };
      if (request.fileHash) await this.admitFile(tx, organizationId, request.kind, request.fileHash, now);

      await this.refuseHeldKeys(tx, organizationId, lockKeys, now);

      const created = await tx.create({
        organizationId,
        kind: request.kind,
        status: 'executing',
        attempts: 1,
        maxAttempts: 1,
        scheduledFor: null,
        token: randomUUID(),
        expiresAt: leaseExpiresAt(now, this.owners.leaseMs(request.kind)),
        idempotencyKey: request.idempotencyKey ?? null,
        requestHash,
        fileHash: request.fileHash ?? null,
        plan,
        window,
        lockKeys,
        startedAt: now,
      });
      return { operation: toOperationView(created), token: created.token, reused: false };
    });
  }

  /**
   * 끝난 실행은 close가 잠금을 함께 지우므로 보유자는 executing 또는 prepared다. 임대가 끝난 executing은
   * 그 자리에서 만료 처분하고(재시도가 남으면 prepared로 돌아가 키를 계속 쥔다), 아직 쥐고 있으면 거절한다.
   */
  private async refuseHeldKeys(tx: OperationTransaction, organizationId: string, lockKeys: string[], now: Date) {
    for (const holder of await tx.lockHolders(organizationId, lockKeys)) {
      const current = await this.expireIfDue(tx, holder, now);
      if (!isOperationTerminal(current.status)) throw inProgress(current);
    }
  }

  async prepare(organizationId: string, request: OperationPrepareRequest, ownerTx?: OwnerTransaction): Promise<OperationPrepareResult> {
    const { requestHash, plan, window, lockKeys } = await this.planFor(organizationId, request.kind, request.scope, null);
    return this.operations.transaction(async (tx) => {
      const now = new Date();
      const reused = await this.reuseByIdempotencyKey(tx, organizationId, request.kind, request.idempotencyKey, requestHash, now);
      if (reused) return { operation: toOperationView(reused), reused: true };
      await this.refuseHeldKeys(tx, organizationId, lockKeys, now);
      const scheduledFor = request.scheduledFor ? new Date(request.scheduledFor) : null;
      const created = await tx.createHeld({
        organizationId,
        kind: request.kind,
        status: 'prepared',
        attempts: 0,
        maxAttempts: request.maxAttempts,
        scheduledFor,
        // 토큰은 claim이 새로 낸다. prepared의 토큰은 누구에게도 주지 않는 자리값이다.
        token: randomUUID(),
        // 임대는 claim 때 정해진다. prepared의 expiresAt은 예정 시각(없으면 만든 시각)이다.
        expiresAt: scheduledFor ?? now,
        idempotencyKey: request.idempotencyKey ?? null,
        requestHash,
        fileHash: null,
        plan,
        window,
        lockKeys,
        startedAt: now,
      });
      if (!created) {
        // 동시에 들어온 prepare·begin이 같은 키를 먼저 잡고 커밋했다. 그 보유자를 이름으로 알려 준다.
        const [holder] = await tx.lockHolders(organizationId, lockKeys);
        throw holder ? inProgress(holder) : new KiditemConflictError('OPERATION_IN_PROGRESS');
      }
      return { operation: toOperationView(created), reused: false };
    }, ownerTx);
  }

  async claim(request: OperationClaimRequest): Promise<OperationClaimed | null> {
    return this.operations.transaction(async (tx) => {
      const now = new Date();
      // 시도가 남지 않은 채 임대가 끝난 실행은 claim 후보가 아니다. 여기서 terminal로 닫아 onFailed를 부른다.
      for (const exhausted of await tx.lockExpired({ kinds: request.kinds, now, exhaustedOnly: true, limit: EXPIRY_BATCH })) {
        await this.expireIfDue(tx, exhausted, now);
      }
      const candidate = await tx.lockNextClaimable(request.kinds, now);
      if (!candidate) return null;
      const claimed = await tx.markClaimed(candidate.organizationId, candidate.id, {
        token: randomUUID(),
        expiresAt: leaseExpiresAt(now, this.owners.leaseMs(candidate.kind)),
      });
      return { operation: toOperationView(claimed), token: claimed.token, organizationId: claimed.organizationId };
    });
  }

  /**
   * 같은 kind에 같은 fileHash는 한 번만 반영한다. 성공한 실행이 있으면 거절, 진행 중이면 겹침,
   * 실패·취소된 실행이면 그 지문을 비워 같은 파일을 다시 시작할 수 있게 한다.
   */
  private async admitFile(tx: OperationTransaction, organizationId: string, kind: string, fileHash: string, now: Date) {
    const previous = await tx.findByFileHash(organizationId, kind, fileHash);
    if (!previous) return;
    const current = await this.expireIfDue(tx, previous, now);
    if (current.status === 'succeeded') {
      throw new KiditemConflictError('DB_CONFLICT', {
        details: { reason: 'file_already_applied', existing: { operationId: current.id } },
      });
    }
    if (!isOperationTerminal(current.status)) throw inProgress(current);
    await tx.clearFileHash(organizationId, current.id);
  }

  async putChunk(input: {
    organizationId: string;
    operationId: string;
    token: string | undefined;
    chunkKind: OperationChunkKind;
    sequence: number;
    request: OperationChunkPutRequest;
  }): Promise<OperationChunkPutResponse> {
    const outcome = await this.operations.transaction(async (tx): Promise<Deferred<OperationChunkPutResponse>> => {
      const now = new Date();
      const fenced = await this.fence(tx, input.organizationId, input.operationId, input.token, now);
      if (!('ok' in fenced)) return fenced;
      const verdict = evaluateChunkWrite({
        existingChecksum: await tx.findChunkChecksum(input.operationId, input.chunkKind, input.sequence),
        checksum: input.request.checksum,
        payload: input.request.payload,
        storedChunks: await tx.countChunks(input.operationId),
      });
      if (verdict.verdict === 'conflict') return { reject: 'chunk_conflict', operationId: input.operationId };
      if (verdict.verdict === 'too_large' || verdict.verdict === 'too_many_chunks') {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', {
          details: { reason: verdict.verdict === 'too_large' ? 'chunk_too_large' : 'too_many_chunks' },
        });
      }
      if (verdict.verdict === 'store') {
        await tx.insertChunk({
          operationId: input.operationId,
          organizationId: input.organizationId,
          chunkKind: input.chunkKind,
          sequence: input.sequence,
          checksum: input.request.checksum,
          itemCount: verdict.itemCount,
          payload: input.request.payload,
        });
      }
      const expiresAt = leaseExpiresAt(now, this.owners.leaseMs(fenced.ok.kind));
      await tx.extendLease(input.organizationId, input.operationId, expiresAt, input.request.progress);
      return {
        ok: {
          operationId: input.operationId,
          chunkKind: input.chunkKind,
          sequence: input.sequence,
          itemCount: verdict.itemCount,
          expiresAt: expiresAt.toISOString(),
        },
      };
    });
    return unwrap(outcome);
  }

  async finish(input: {
    organizationId: string;
    operationId: string;
    token: string | undefined;
    request: OperationFinishRequest;
  }): Promise<OperationFinishResponse> {
    const outcome = await this.operations.transaction(async (tx): Promise<Deferred<OperationFinishResponse>> => {
      const now = new Date();
      const fenced = await this.fence(tx, input.organizationId, input.operationId, input.token, now);
      if (!('ok' in fenced)) return fenced;
      const operation = fenced.ok;
      const { request } = input;
      if (request.outcome === 'failed') {
        const errorCode = request.errorCode ?? 'UNKNOWN';
        const disposition = decideFailure(operation, request.retryAfterMs, now);
        if (disposition.retry) {
          const rescheduled = await tx.reschedule(input.organizationId, operation.id, {
            scheduledFor: disposition.scheduledFor,
            token: randomUUID(),
            errorCode,
            errorMessage: request.errorMessage ?? null,
            clearStaging: true,
          });
          return { ok: { operation: toOperationView(rescheduled) } };
        }
        const closed = await this.closeFailed(tx, operation, {
          status: 'failed',
          errorCode,
          errorMessage: request.errorMessage ?? null,
          result: request.result ?? null,
          window: request.window ?? operation.window,
          finishedAt: now,
        });
        return { ok: { operation: toOperationView(closed) } };
      }
      const owner = this.owners.find(operation.kind);
      if (!owner) throw new KiditemExternalError('INTERNAL_ERROR', { cause: `operation kind ${operation.kind} has no owner` });
      const window = request.window ?? operation.window;
      const finalized = await owner.finalize(await tx.stagedChunks(operation.id), window, {
        tx: tx.ownerTransaction,
        organizationId: input.organizationId,
        operationId: operation.id,
        plan: operation.plan ?? {},
      });
      const closed = await tx.close(input.organizationId, operation.id, {
        status: 'succeeded',
        errorCode: null,
        errorMessage: null,
        result: finalized.result ?? request.result ?? null,
        window,
        finishedAt: now,
      });
      return { ok: { operation: toOperationView(closed) } };
    });
    return unwrap(outcome);
  }

  async cancel(organizationId: string, operationId: string, ownerTx?: OwnerTransaction): Promise<OperationCancelResponse> {
    return this.operations.transaction(async (tx) => {
      const now = new Date();
      const operation = await tx.lockOperation(organizationId, operationId);
      if (!operation) throw new KiditemNotFoundError('OPERATION_NOT_FOUND');
      const current = await this.expireIfDue(tx, operation, now);
      if (isOperationTerminal(current.status)) return { operation: toOperationView(current) };
      const closed = await tx.close(organizationId, operationId, {
        status: 'cancelled',
        errorCode: OPERATION_CANCEL_CODE,
        errorMessage: null,
        finishedAt: now,
      });
      return { operation: toOperationView(closed) };
    }, ownerTx);
  }

  async list(organizationId: string, query: OperationListQuery): Promise<OperationListResponse> {
    await this.operations.transaction(async (tx) => {
      const now = new Date();
      for (const expired of await tx.lockExpired({ kinds: query.kinds, now, organizationId, limit: EXPIRY_BATCH })) {
        await this.expireIfDue(tx, expired, now);
      }
    });
    const records = await this.operations.list(organizationId, {
      kinds: query.kinds,
      status: query.status,
      limit: query.limit,
    });
    return { operations: records.map(toOperationView) };
  }

  async get(organizationId: string, operationId: string): Promise<OperationView | null> {
    return this.operations.transaction(async (tx) => {
      const operation = await tx.lockOperation(organizationId, operationId);
      return operation ? toOperationView(await this.expireIfDue(tx, operation, new Date())) : null;
    });
  }

  async findLive(organizationId: string, lockKey: string, ownerTx?: OwnerTransaction): Promise<OperationView | null> {
    return this.operations.transaction(async (tx) => {
      const now = new Date();
      for (const holder of await tx.lockHolders(organizationId, [lockKey])) {
        const current = await this.expireIfDue(tx, holder, now);
        if (!isOperationTerminal(current.status)) return toOperationView(current);
      }
      return null;
    }, ownerTx);
  }

  /** 토큰 fence. 만료면 그 자리에서 닫아 커밋하고(트랜잭션은 계속) 거절을 돌려준다. */
  private async fence(
    tx: OperationTransaction,
    organizationId: string,
    operationId: string,
    token: string | undefined,
    now: Date,
  ): Promise<Deferred<OperationRecord>> {
    const operation = await tx.lockOperation(organizationId, operationId);
    if (!operation) return { notFound: true };
    const verdict = evaluateOperationFence(operation, token, now);
    if (verdict.verdict === 'not_found') return { notFound: true };
    if (verdict.verdict === 'reject') {
      if (verdict.expire) await this.expireIfDue(tx, operation, now);
      return { reject: verdict.reason, operationId };
    }
    return { ok: operation };
  }

  /**
   * 임대가 끝난 executing의 처분(KID-358). 시도가 남아 있으면 같은 행을 바로(`scheduledFor = now`) 다시 claim될
   * `prepared`로 돌리고 잠금·청크·progress를 그대로 둔다(워커가 죽었을 뿐 받아 둔 결과는 유효하다).
   * 남지 않았으면 terminal `failed`(만료)로 닫고 owner `onFailed`를 부른다.
   */
  private async expireIfDue(tx: OperationTransaction, operation: OperationRecord, now: Date): Promise<OperationRecord> {
    if (operation.status !== 'executing' || !isLeaseExpired(operation.expiresAt, now)) return operation;
    const disposition = decideFailure(operation, 0, now);
    if (disposition.retry) {
      return tx.reschedule(operation.organizationId, operation.id, {
        scheduledFor: disposition.scheduledFor,
        token: randomUUID(),
        errorCode: OPERATION_EXPIRED_ERROR_CODE,
        errorMessage: OPERATION_EXPIRED_ERROR_MESSAGE,
        clearStaging: false,
      });
    }
    return this.closeFailed(tx, operation, expiredClosure(now));
  }

  /** terminal 실패: 청크·잠금을 지우고 같은 트랜잭션에서 owner `onFailed`를 부른다(구현한 kind만). */
  private async closeFailed(tx: OperationTransaction, operation: OperationRecord, closure: OperationClosure): Promise<OperationRecord> {
    const closed = await tx.close(operation.organizationId, operation.id, closure);
    const owner = this.owners.find(operation.kind);
    if (owner?.onFailed) {
      await owner.onFailed({
        tx: tx.ownerTransaction,
        organizationId: operation.organizationId,
        operationId: operation.id,
        plan: operation.plan ?? {},
        errorCode: closure.errorCode ?? OPERATION_EXPIRED_ERROR_CODE,
        errorMessage: closure.errorMessage,
        attempts: operation.attempts,
      });
    }
    return closed;
  }
}

function inProgress(holder: OperationRecord): KiditemConflictError {
  const details: OperationInProgressDetails = {
    operationId: holder.id,
    kind: holder.kind,
    lockKeys: [...holder.lockKeys].sort(),
    startedAt: holder.startedAt.toISOString(),
    expiresAt: holder.expiresAt.toISOString(),
  };
  return new KiditemConflictError('OPERATION_IN_PROGRESS', { details: { ...details } });
}
