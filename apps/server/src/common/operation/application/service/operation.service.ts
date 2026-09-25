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
  type OperationFenceLostReason,
  type OperationFinishRequest,
  type OperationFinishResponse,
  type OperationInProgressDetails,
  type OperationListQuery,
  type OperationListResponse,
} from '@kiditem/shared/operation';
import { evaluateChunkWrite } from '../../domain/operation-chunk';
import {
  OPERATION_EXPIRED_ERROR_CODE,
  OPERATION_EXPIRED_ERROR_MESSAGE,
  evaluateOperationFence,
  isLeaseExpired,
  leaseExpiresAt,
} from '../../domain/operation-fence';
import { operationRequestHash } from '../../domain/operation-request-hash';
import type { OperationPort } from '../port/in/operation.port';
import {
  OPERATION_REPOSITORY,
  type OperationClosure,
  type OperationRecord,
  type OperationRepositoryPort,
  type OperationTransaction,
} from '../port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from './operation-owner.registry';
import { toOperationView } from './operation-view';

/** 트랜잭션 안에서 만료를 커밋한 뒤 밖에서 던질 거절. */
type Deferred<T> = { ok: T } | { reject: OperationFenceLostReason; operationId: string } | { notFound: true };

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
    const owner = this.owners.find(request.kind);
    if (!owner) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'unknown_operation_kind' } });
    }
    const requestHash = operationRequestHash({ kind: request.kind, scope: request.scope, fileHash: request.fileHash });
    const planned = OperationPlanResultSchema.parse(await owner.plan(request.scope, { organizationId }));
    const lockKeys = [...new Set(planned.lockKeys)];
    try {
      return await this.admit(organizationId, request, requestHash, planned.plan, planned.window ?? null, lockKeys);
    } catch (error) {
      // 동시에 들어온 begin이 같은 잠금·멱등 키를 먼저 잡았다. 한 번 더 판정하면 그 실행이 보인다.
      if (!isUniqueViolation(error)) throw error;
      return this.admit(organizationId, request, requestHash, planned.plan, planned.window ?? null, lockKeys);
    }
  }

  private admit(
    organizationId: string,
    request: OperationBeginRequest,
    requestHash: string,
    plan: Record<string, unknown>,
    window: OperationBeginResponse['operation']['window'],
    lockKeys: string[],
  ): Promise<OperationBeginResponse> {
    return this.operations.transaction(async (tx) => {
      const now = new Date();
      if (request.idempotencyKey) {
        const existing = await tx.findByIdempotencyKey(organizationId, request.kind, request.idempotencyKey);
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'idempotency_key_reused' } });
          }
          const current = await this.expireIfDue(tx, existing, now);
          return { operation: toOperationView(current), token: current.token, reused: true };
        }
      }
      if (request.fileHash) await this.admitFile(tx, organizationId, request.kind, request.fileHash, now);

      for (const holder of await tx.lockHolders(organizationId, lockKeys)) {
        if (isOperationTerminal(holder.status)) {
          await tx.releaseLocks(organizationId, holder.id);
          continue;
        }
        if (isLeaseExpired(holder.expiresAt, now)) {
          await tx.close(organizationId, holder.id, expiredClosure(now));
          continue;
        }
        throw inProgress(holder);
      }

      const created = await tx.create({
        organizationId,
        kind: request.kind,
        token: randomUUID(),
        expiresAt: leaseExpiresAt(now),
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
    if (current.status === 'executing') throw inProgress(current);
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
      const expiresAt = leaseExpiresAt(now);
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
        const closed = await tx.close(input.organizationId, operation.id, {
          status: 'failed',
          errorCode: request.errorCode ?? null,
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

  async cancel(organizationId: string, operationId: string): Promise<OperationCancelResponse> {
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
    });
  }

  async list(organizationId: string, query: OperationListQuery): Promise<OperationListResponse> {
    const now = new Date();
    await this.operations.expireDue(organizationId, query.kinds, now, expiredClosure(now));
    const records = await this.operations.list(organizationId, {
      kinds: query.kinds,
      status: query.status,
      limit: query.limit,
    });
    return { operations: records.map(toOperationView) };
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
      if (verdict.expire) await tx.close(organizationId, operationId, expiredClosure(now));
      return { reject: verdict.reason, operationId };
    }
    return { ok: operation };
  }

  private async expireIfDue(tx: OperationTransaction, operation: OperationRecord, now: Date): Promise<OperationRecord> {
    if (operation.status !== 'executing' || !isLeaseExpired(operation.expiresAt, now)) return operation;
    return tx.close(operation.organizationId, operation.id, expiredClosure(now));
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
