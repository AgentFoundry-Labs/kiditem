import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { AiDirectJob } from '../../../../domain/direct-job/ai-direct-job-operation';
import type { AiDirectJobEnvelope, AiDirectJobType } from '../../../../domain/direct-job/ai-direct-job.schema';

export const AI_DIRECT_JOB_OPERATIONS_PORT = Symbol('AI_DIRECT_JOB_OPERATIONS_PORT');

/** 생성 기록이 만들 job: 종류와 입력 봉투. 원천(생성 기록 id)은 만드는 자리에서 붙는다. */
export interface AiDirectJobRequest {
  jobType: AiDirectJobType;
  payload: AiDirectJobEnvelope;
}

/** 화면이 보는 job 상태(image_edit 조회·취소). */
export interface AiDirectJobState {
  id: string;
  status: 'prepared' | 'executing' | 'succeeded' | 'failed' | 'cancelled';
  /** 결과를 받아 두었고 원장 반영만 남았다(옛 `projecting`). */
  resultSaved: boolean;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ClaimedAiDirectJob {
  job: AiDirectJob;
  /** fenced 쓰기(heartbeat·checkpoint·finish)의 비밀. */
  token: string;
  /** 앞선 시도가 결과를 받아 두었다: 모델을 다시 부르지 않고 반영만 한다. */
  resultSaved: boolean;
}

export type AiDirectJobLease = 'alive' | 'cancelled' | 'lost';

/**
 * AI 생성 job의 실행 계약(ADR-0025, KID-358) 쪽 문. job 하나는 `content.<jobType>` 실행 하나이고,
 * 생성 기록 트랜잭션 안에서 prepare되어 워커가 claim한다. 결과 반영(sink)은 finish 트랜잭션의 owner
 * `finalize`가, 최종 실패 기록은 `onFailed`가 한다.
 */
export interface AiDirectJobOperationsPort {
  /** 생성 기록과 같은 트랜잭션(`tx`)에서 job을 만들어 둔다. 커밋되면 워커가 집을 수 있다. */
  prepare(
    tx: OwnerTransaction | undefined,
    input: AiDirectJobRequest & { organizationId: string; sourceResourceId: string },
  ): Promise<{ jobId: string }>;
  /**
   * 이 원천의 살아 있는 job(들)의 실행 행을 잠그고 id를 돌려준다. 생성 기록을 잠그기 **전에** 부른다:
   * finish가 실행 → 생성 기록 순서로 잠그므로 취소도 같은 순서를 지켜야 교착하지 않는다.
   */
  lockLive(
    tx: OwnerTransaction,
    input: { organizationId: string; sourceResourceId: string; jobTypes: readonly AiDirectJobType[] },
  ): Promise<string[]>;
  /** `lockLive`로 잠근 job을 같은 트랜잭션에서 취소한다. */
  cancelJobs(tx: OwnerTransaction, organizationId: string, jobIds: readonly string[]): Promise<void>;
  /** 이 원천의 살아 있는 job(들)을 같은 트랜잭션에서 취소한다(잠금 + 취소). 취소한 수. */
  cancelLive(
    tx: OwnerTransaction | undefined,
    input: { organizationId: string; sourceResourceId: string; jobTypes: readonly AiDirectJobType[] },
  ): Promise<number>;
  find(organizationId: string, jobId: string): Promise<AiDirectJobState | null>;
  cancel(organizationId: string, jobId: string): Promise<AiDirectJobState | null>;

  claim(workerId: string): Promise<ClaimedAiDirectJob | null>;
  /** 임대 연장. 취소됐으면 `cancelled`, 다른 워커에게 넘어갔거나 끝났으면 `lost`. */
  heartbeat(job: AiDirectJob, token: string): Promise<AiDirectJobLease>;
  /** 검증한 결과를 실행 청크로 받아 두고 progress에 `result_saved`를 적는다. 임대를 잃었으면 false. */
  saveResult(job: AiDirectJob, token: string, result: unknown): Promise<boolean>;
  /** 성공으로 끝낸다. owner finalize가 받아 둔 결과를 원장에 반영한다. 임대를 잃었으면 false. */
  succeed(job: AiDirectJob, token: string): Promise<boolean>;
  /** 실패로 끝낸다. `retryAfterMs`가 있고 시도가 남으면 같은 job이 그 뒤 다시 claim된다. */
  fail(
    job: AiDirectJob,
    token: string,
    failure: { errorCode: string; errorMessage: string; retryAfterMs?: number },
  ): Promise<void>;
}
