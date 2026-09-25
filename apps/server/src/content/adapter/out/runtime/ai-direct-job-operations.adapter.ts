import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { isKiditemError } from '@kiditem/shared/errors';
import type { OperationView } from '@kiditem/shared/operation';
import { OPERATION_PORT, type OperationPort } from '../../../../common/operation/application/port/in/operation.port';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import {
  AI_DIRECT_JOB_KINDS,
  AI_DIRECT_JOB_MAX_ATTEMPTS,
  AI_DIRECT_JOB_RESULT_CHUNK,
  AI_DIRECT_JOB_RESULT_SAVED,
  aiDirectJobKind,
  aiDirectJobLockKey,
  aiDirectJobPlan,
  aiDirectJobTypeOfKind,
  type AiDirectJob,
} from '../../../domain/direct-job/ai-direct-job-operation';
import type { AiDirectJobType } from '../../../domain/direct-job/ai-direct-job.schema';
import type {
  AiDirectJobLease,
  AiDirectJobOperationsPort,
  AiDirectJobRequest,
  AiDirectJobState,
  ClaimedAiDirectJob,
} from '../../../application/port/out/runtime/ai-direct-job-operations.port';

/** 임대만 연장하는 빈 청크 칸. */
const HEARTBEAT_CHUNK = 'heartbeat';

/** 실행 표의 오류 코드 칸(64자)·계약의 문장 상한(2,000자). */
const ERROR_CODE_MAX = 64;
const ERROR_MESSAGE_MAX = 2_000;

function checksum(payload: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function resultSaved(view: Pick<OperationView, 'progress'>): boolean {
  return view.progress?.checkpoint === AI_DIRECT_JOB_RESULT_SAVED;
}

function toJob(view: OperationView, organizationId: string): AiDirectJob {
  const plan = aiDirectJobPlan(view.kind, view.plan);
  return {
    id: view.id,
    organizationId,
    jobType: aiDirectJobTypeOfKind(view.kind),
    sourceResourceId: plan.sourceResourceId,
    payload: plan.payload,
    attempts: view.attempts,
    maxAttempts: view.maxAttempts,
  };
}

function toState(view: OperationView): AiDirectJobState {
  return {
    id: view.id,
    status: view.status,
    resultSaved: resultSaved(view),
    result: view.result,
    errorCode: view.errorCode,
    errorMessage: view.errorMessage,
  };
}

function isChunkTooLarge(error: unknown): boolean {
  return isKiditemError(error)
    && error.code === 'VALIDATION_FAILED'
    && (error.details as { reason?: unknown } | undefined)?.reason === 'chunk_too_large';
}

/** 임대를 잃었다는 거절(다른 워커가 집었거나 끝났다). 그 밖의 오류는 그대로 던진다. */
function leaseRefusal(error: unknown): 'terminal' | 'lost' | null {
  if (!isKiditemError(error)) return null;
  if (error.code === 'OPERATION_NOT_FOUND') return 'lost';
  if (error.code !== 'OPERATION_FENCE_LOST') return null;
  const reason = (error.details as { reason?: unknown } | undefined)?.reason;
  return reason === 'terminal' ? 'terminal' : 'lost';
}

@Injectable()
export class AiDirectJobOperationsAdapter implements AiDirectJobOperationsPort {
  constructor(
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
  ) {}

  async prepare(
    tx: OwnerTransaction | undefined,
    input: AiDirectJobRequest & { organizationId: string; sourceResourceId: string },
  ) {
    if (input.payload.jobType !== input.jobType) throw new Error('AI direct job payload type mismatch');
    const { operation } = await this.operations.prepare(
      input.organizationId,
      {
        kind: aiDirectJobKind(input.jobType),
        scope: { sourceResourceId: input.sourceResourceId, payload: input.payload },
        maxAttempts: AI_DIRECT_JOB_MAX_ATTEMPTS,
      },
      tx,
    );
    return { jobId: operation.id };
  }

  async lockLive(
    tx: OwnerTransaction | undefined,
    input: { organizationId: string; sourceResourceId: string; jobTypes: readonly AiDirectJobType[] },
  ) {
    const ids: string[] = [];
    for (const jobType of input.jobTypes) {
      const live = await this.operations.findLive(input.organizationId, aiDirectJobLockKey(jobType, input.sourceResourceId), tx);
      if (live) ids.push(live.id);
    }
    return ids;
  }

  async cancelJobs(tx: OwnerTransaction | undefined, organizationId: string, jobIds: readonly string[]) {
    for (const id of jobIds) await this.operations.cancel(organizationId, id, tx);
  }

  async cancelLive(
    tx: OwnerTransaction | undefined,
    input: { organizationId: string; sourceResourceId: string; jobTypes: readonly AiDirectJobType[] },
  ) {
    const ids = await this.lockLive(tx, input);
    await this.cancelJobs(tx, input.organizationId, ids);
    return ids.length;
  }

  async find(organizationId: string, jobId: string) {
    const view = await this.operations.get(organizationId, jobId);
    return view && (AI_DIRECT_JOB_KINDS as readonly string[]).includes(view.kind) ? toState(view) : null;
  }

  async cancel(organizationId: string, jobId: string) {
    if (!(await this.find(organizationId, jobId))) return null;
    return toState((await this.operations.cancel(organizationId, jobId)).operation);
  }

  async claim(workerId: string): Promise<ClaimedAiDirectJob | null> {
    const claimed = await this.operations.claim({ kinds: [...AI_DIRECT_JOB_KINDS], workerId });
    if (!claimed) return null;
    return { job: toJob(claimed.operation, claimed.organizationId), token: claimed.token, resultSaved: resultSaved(claimed.operation) };
  }

  async heartbeat(job: AiDirectJob, token: string): Promise<AiDirectJobLease> {
    try {
      await this.put(job, token, HEARTBEAT_CHUNK, []);
      return 'alive';
    } catch (error) {
      const refusal = leaseRefusal(error);
      if (refusal === null) throw error;
      if (refusal === 'lost') return 'lost';
      return (await this.operations.get(job.organizationId, job.id))?.status === 'cancelled' ? 'cancelled' : 'lost';
    }
  }

  async saveResult(job: AiDirectJob, token: string, result: unknown) {
    try {
      await this.put(job, token, AI_DIRECT_JOB_RESULT_CHUNK, [result], { checkpoint: AI_DIRECT_JOB_RESULT_SAVED });
      return true;
    } catch (error) {
      if (isChunkTooLarge(error)) {
        // 청크 상한(1MB)을 넘는 결과는 다시 불러도 같다: 재시도 없는 출력 오류로 끝낸다.
        throw Object.assign(new Error('AI result exceeds the 1MB operation chunk limit.'), { code: 'direct_ai_output_invalid' });
      }
      if (leaseRefusal(error) === null) throw error;
      return false;
    }
  }

  async recordFinishError(job: AiDirectJob, token: string, error: { code: string; message: string }) {
    try {
      await this.put(job, token, HEARTBEAT_CHUNK, [], {
        checkpoint: AI_DIRECT_JOB_RESULT_SAVED,
        finishError: { code: error.code.slice(0, ERROR_CODE_MAX), message: error.message.slice(0, ERROR_MESSAGE_MAX) },
      });
    } catch (refused) {
      if (leaseRefusal(refused) === null) throw refused;
    }
  }

  async succeed(job: AiDirectJob, token: string) {
    try {
      await this.operations.finish({ organizationId: job.organizationId, operationId: job.id, token, request: { outcome: 'succeeded' } });
      return true;
    } catch (error) {
      if (leaseRefusal(error) === null) throw error;
      return false;
    }
  }

  async fail(job: AiDirectJob, token: string, failure: { errorCode: string; errorMessage: string; retryAfterMs?: number }) {
    try {
      await this.operations.finish({
        organizationId: job.organizationId,
        operationId: job.id,
        token,
        request: {
          outcome: 'failed',
          errorCode: failure.errorCode.slice(0, ERROR_CODE_MAX),
          errorMessage: failure.errorMessage.slice(0, ERROR_MESSAGE_MAX),
          ...(failure.retryAfterMs !== undefined ? { retryAfterMs: failure.retryAfterMs } : {}),
        },
      });
    } catch (error) {
      if (leaseRefusal(error) === null) throw error;
    }
  }

  private put(job: AiDirectJob, token: string, chunkKind: string, payload: unknown[], progress?: Record<string, unknown>) {
    return this.operations.putChunk({
      organizationId: job.organizationId,
      operationId: job.id,
      token,
      chunkKind,
      sequence: 1,
      request: { checksum: checksum(payload), payload, ...(progress ? { progress } : {}) },
    });
  }
}
