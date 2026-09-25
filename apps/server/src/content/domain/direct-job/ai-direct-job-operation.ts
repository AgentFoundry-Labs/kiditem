import { z } from 'zod';
import { resourceLockKey, type OperationKind, type OperationLockKey } from '@kiditem/shared/operation';
import {
  AiDirectJobCheckpointSchema,
  AiDirectJobEnvelopeSchema,
  type AiDirectJobEnvelope,
  type AiDirectJobType,
} from './ai-direct-job.schema';

/**
 * AI 생성 job은 실행 계약(ADR-0025)의 서버 구동 kind다(KID-358). job 종류마다 kind 하나이고, 생성 기록이
 * 트랜잭션 안에서 `prepared`로 만들어 두면 워커가 claim한다. 실행의 `plan`이 job의 원천(생성 기록 id)과
 * 입력 봉투를 들고 있다.
 */
export const AI_DIRECT_JOB_KINDS = [
  'content.thumbnail_generate',
  'content.thumbnail_reedit',
  'content.detail_page_generate',
  'content.image_edit',
] as const satisfies readonly OperationKind[];
export type AiDirectJobKind = (typeof AI_DIRECT_JOB_KINDS)[number];

/** 워커 임대: 지금까지의 `AI_DIRECT_JOB_LEASE_MS` 기본값과 같다. */
export const AI_DIRECT_JOB_DEFAULT_LEASE_MS = 60_000;
/** claim 횟수 상한(재시도 포함). 옛 `ai_direct_jobs.max_attempts` 기본값과 같다. */
export const AI_DIRECT_JOB_MAX_ATTEMPTS = 3;

export function aiDirectJobKind(jobType: AiDirectJobType): AiDirectJobKind {
  return `content.${jobType}`;
}

export function aiDirectJobTypeOfKind(kind: string): AiDirectJobType {
  const index = (AI_DIRECT_JOB_KINDS as readonly string[]).indexOf(kind);
  if (index === -1) throw new Error(`${kind} is not an AI direct job kind`);
  return kind.slice('content.'.length) as AiDirectJobType;
}

/** 옛 unique `(organizationId, jobType, sourceResourceId)`와 같은 범위: 같은 원천의 같은 종류 job은 하나만 살아 있다. */
export function aiDirectJobLockKey(jobType: AiDirectJobType, sourceResourceId: string): OperationLockKey {
  return resourceLockKey(jobType.replace(/_/g, '-'), sourceResourceId);
}

export const AiDirectJobPlanSchema = z
  .object({
    sourceResourceId: z.string().uuid(),
    payload: AiDirectJobEnvelopeSchema,
  })
  .strict();
export type AiDirectJobPlan = z.infer<typeof AiDirectJobPlanSchema>;

/** 실행의 plan을 job으로 읽는다. plan의 job 종류가 kind와 다르면 거절한다. */
export function aiDirectJobPlan(kind: string, plan: unknown): AiDirectJobPlan {
  const parsed = AiDirectJobPlanSchema.parse(plan);
  if (parsed.payload.jobType !== aiDirectJobTypeOfKind(kind)) {
    throw new Error(`plan job type ${parsed.payload.jobType} does not match kind ${kind}`);
  }
  return parsed;
}

/** 워커가 다루는 job 하나: 실행 신원 + plan. */
export interface AiDirectJob {
  id: string;
  organizationId: string;
  jobType: AiDirectJobType;
  sourceResourceId: string;
  payload: AiDirectJobEnvelope;
  attempts: number;
  maxAttempts: number;
}

/** 재시도할 수 있는 실패의 대기: 시도 순서대로 5초 · 30초 · 120초(마지막 값 반복). 재시도 불가면 없음. */
export function aiDirectJobRetryAfterMs(
  failure: { retryable: boolean; attempts: number },
  retryDelaysMs: readonly number[],
): number | undefined {
  if (!failure.retryable) return undefined;
  return retryDelaysMs[Math.min(Math.max(failure.attempts - 1, 0), retryDelaysMs.length - 1)];
}

/**
 * 받아 둔 결과를 job 종류의 출력 모양으로 검증한다. 틀리면 `direct_ai_output_invalid`(재시도 없음)로 던진다.
 * 워커가 결과를 받아 두기 전과, finish의 owner finalize가 반영하기 전에 같은 판정을 쓴다.
 */
export function validateAiDirectJobResult(jobType: AiDirectJobType, result: unknown): unknown {
  const parsed = AiDirectJobCheckpointSchema.safeParse({ jobType, result });
  if (parsed.success) return parsed.data.result;
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'result'}: ${issue.message}`)
    .join('; ');
  throw Object.assign(new Error(message), { code: 'direct_ai_output_invalid' });
}
