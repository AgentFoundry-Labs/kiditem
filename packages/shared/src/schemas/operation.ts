import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * 실행(operation) 계약 (ADR-0025, KID-315 · KID-353).
 *
 * 수집 시도·AI 생성 job·광고 액션 실행·등록 실행은 모두 "실행" 하나다. 서버가 신원과 토큰을 내주고,
 * 한 번 돌고, 성공·실패·취소 중 하나로 정확히 한 번 끝난다. 신원·토큰·임대·청크 보관·겹침 규칙·
 * 거절 코드는 kind와 무관하게 같고, owner는 kind를 등록하고 `plan`·`finalize` 포트 둘만 꽂는다.
 *
 * 이 파일은 와이어 계약이다: 상태 어휘, kind·lockKey 규칙, 엔드포인트 4개(begin·chunk·finish·cancel)와
 * reader 하나의 요청·응답, 거절 코드의 `details` 모양. owner 전용 값(`scope`·`plan`·`progress`·`result`)은
 * kind별 Zod가 owner 쪽에 있고 여기서는 JSON 객체로만 본다.
 *
 * `prepared`(서버가 만들어 두고 나중에 실행, KID-358)와 `reconciling`(등록, KID-364)은 그 kind가 옮겨질 때
 * 더한다. 등록 실행이 지금 쓰는 6-상태 어휘는 `operation-lifecycle.ts`에 있고 KID-364에서 이 파일로 합쳐진다.
 */

// ── 상태 ────────────────────────────────────────────────────────────────────────

/**
 * `prepared`(KID-358): owner가 자기 트랜잭션 안에서 만들어 두고 나중에 워커나 확장이 claim하는 실행.
 * 잠금은 prepare 때 잡혀 terminal까지 유지된다. 재시도는 `executing → prepared`.
 */
export const OPERATION_STATUSES = ['prepared', 'executing', 'succeeded', 'failed', 'cancelled'] as const;
export const OperationStatusSchema = z.enum(OPERATION_STATUSES);
export type OperationStatus = z.infer<typeof OperationStatusSchema>;

export const OPERATION_TERMINAL_STATUSES = ['succeeded', 'failed', 'cancelled'] as const satisfies readonly OperationStatus[];

export function isOperationTerminal(status: OperationStatus): boolean {
  return (OPERATION_TERMINAL_STATUSES as readonly OperationStatus[]).includes(status);
}

/** finish가 받는 결과. 취소는 finish가 아니라 cancel 엔드포인트다. */
export const OPERATION_OUTCOMES = ['succeeded', 'failed'] as const;
export const OperationOutcomeSchema = z.enum(OPERATION_OUTCOMES);
export type OperationOutcome = z.infer<typeof OperationOutcomeSchema>;

/** 운영자 중단이 실행에 남기는 오류 코드. 알림(source failure)을 만들지 않는다. */
export const OPERATION_CANCEL_CODE = 'USER_CANCELLED' as const;

// ── 상수 ────────────────────────────────────────────────────────────────────────

/** 임대: 마지막 fenced 쓰기부터 30분. 모든 fenced 쓰기가 연장하고, 만료는 다음 읽기·쓰기에서 판정한다(청소 job 없음). */
export const OPERATION_LEASE_MS = 30 * 60 * 1000;
/** 청크 하나의 payload 상한(직렬화 바이트). */
export const OPERATION_CHUNK_MAX_BYTES = 1024 * 1024;
/** 실행 하나가 보관하는 청크 수 상한. finish 트랜잭션이 성공·실패 모두 지운다. */
export const OPERATION_CHUNKS_MAX = 1_000;

// ── kind ────────────────────────────────────────────────────────────────────────

/**
 * kind 이름은 `owner.work`. 서버와 확장이 같은 문자열을 쓴다.
 * 예: `channels.wing_catalog`, `orders.coupang_reviews`, `content.thumbnail_generate`, `advertising.ad_report`.
 * 단계(basics·details)나 등록 executionKind 같은 세부는 `plan` 안 필드이지 kind가 아니다.
 */
export const OPERATION_KIND_PATTERN = /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/;
export const OperationKindSchema = z.string().regex(OPERATION_KIND_PATTERN, 'kind는 owner.work 형식이어야 합니다');
export type OperationKind = z.infer<typeof OperationKindSchema>;

export function operationOwner(kind: OperationKind): string {
  return kind.slice(0, kind.indexOf('.'));
}

// ── lockKey ─────────────────────────────────────────────────────────────────────

/**
 * 겹치면 안 되는 실행은 같은 lockKey를 잡는다. unique는 `(organizationId, lockKey)`이고 kind가 없어서
 * 한 키가 kind를 가로질러 막는다(ADR-0025).
 * - `org`: 조직에 하나.
 * - `account:<channelAccountId>`: 그 계정의 Wing 로그인을 쓰는 kind만(카탈로그 동기화 등).
 * - `resource:<site>:<id>`: 그 밖의 공유 세션·슬롯. 예 `resource:ad-center:<channelAccountId>`,
 *   `resource:keyword:<keyword>`(순위 두 kind가 같은 슬롯).
 */
export const OPERATION_LOCK_KEY_PATTERN = /^(org|account:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|resource:[a-z][a-z0-9-]*:[^\s]+)$/;
export const OperationLockKeySchema = z.string().max(256).regex(OPERATION_LOCK_KEY_PATTERN, 'lockKey는 org · account:<id> · resource:<site>:<id> 중 하나여야 합니다');
export type OperationLockKey = z.infer<typeof OperationLockKeySchema>;

export const ORG_LOCK_KEY = 'org' as const;
export function accountLockKey(channelAccountId: string): OperationLockKey {
  return `account:${channelAccountId}`;
}
export function resourceLockKey(site: string, id: string): OperationLockKey {
  return `resource:${site}:${id}`;
}

// ── 거절 ────────────────────────────────────────────────────────────────────────

/** 계약이 내는 거절은 둘 + 404. 코드는 `@kiditem/shared/errors` 레지스트리(owner=common)에 있다. */
export const OPERATION_REJECTION_CODES = [
  'OPERATION_IN_PROGRESS',
  'OPERATION_FENCE_LOST',
  'OPERATION_NOT_FOUND',
] as const;
export type OperationRejectionCode = (typeof OPERATION_REJECTION_CODES)[number];

export const OPERATION_FENCE_LOST_REASONS = ['expired', 'terminal', 'chunk_conflict'] as const;
export const OperationFenceLostReasonSchema = z.enum(OPERATION_FENCE_LOST_REASONS);
export type OperationFenceLostReason = z.infer<typeof OperationFenceLostReasonSchema>;

/** `OPERATION_IN_PROGRESS` 봉투의 `details`: 무엇이 돌고 있는지 이름을 알려 준다. */
export const OperationInProgressDetailsSchema = z.object({
  operationId: z.string().uuid(),
  kind: OperationKindSchema,
  lockKeys: z.array(OperationLockKeySchema).min(1),
  startedAt: zIsoDate,
  expiresAt: zIsoDate,
}).strict();
export type OperationInProgressDetails = z.infer<typeof OperationInProgressDetailsSchema>;

/** `OPERATION_FENCE_LOST` 봉투의 `details`. 받은 쪽은 멈추고 잡은 브라우저 자원을 푼다. */
export const OperationFenceLostDetailsSchema = z.object({
  operationId: z.string().uuid(),
  reason: OperationFenceLostReasonSchema,
}).strict();
export type OperationFenceLostDetails = z.infer<typeof OperationFenceLostDetailsSchema>;

// ── 와이어 ──────────────────────────────────────────────────────────────────────

const JsonObjectSchema = z.record(z.unknown());

/** fenced 쓰기(chunk·finish)가 토큰을 싣는 헤더. 운영자 cancel과 reader는 토큰이 없다. */
export const OPERATION_TOKEN_HEADER = 'x-operation-token' as const;

/** 실행이 다룬 기간(업무 날짜, KST 달력). owner `plan`이 정하거나 finish가 확정한다. */
export const OperationWindowSchema = z.object({
  start: z.string().date(),
  end: z.string().date(),
}).strict();
export type OperationWindow = z.infer<typeof OperationWindowSchema>;

/** 청크 종류는 kind 안에서 owner가 정한다(예 카탈로그의 `list`·`detail`·`deletion_confirmation`). */
export const OperationChunkKindSchema = z.string().regex(/^[a-z][a-z0-9_]*$/);
export type OperationChunkKind = z.infer<typeof OperationChunkKindSchema>;
export const OperationChunkSequenceSchema = z.coerce.number().int().min(1).max(OPERATION_CHUNKS_MAX);

/**
 * 화면·확장이 보는 실행 하나. 토큰은 begin 응답에만 있고 여기 없다.
 * owner 전용 값은 `plan`·`progress`·`result` JSON에 있다(kind별 Zod는 owner 쪽).
 */
export const OperationViewSchema = z.object({
  id: z.string().uuid(),
  kind: OperationKindSchema,
  status: OperationStatusSchema,
  lockKeys: z.array(OperationLockKeySchema),
  plan: JsonObjectSchema.nullable(),
  progress: JsonObjectSchema.nullable(),
  result: JsonObjectSchema.nullable(),
  window: OperationWindowSchema.nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: zIsoDate,
  finishedAt: zIsoDate.nullable(),
  expiresAt: zIsoDate,
  /** claim이 지금까지 몇 번 있었나. begin으로 시작한 실행은 1. */
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().min(1),
  /** `prepared`가 claim될 수 있는 시각. begin으로 시작한 실행은 null. */
  scheduledFor: zIsoDate.nullable(),
}).strict();
export type OperationView = z.infer<typeof OperationViewSchema>;

/**
 * begin `POST /api/operations`. `scope`는 owner `plan(scope)`의 입력이고 kind별 Zod가 owner에 있다.
 * 같은 `idempotencyKey`로 다시 부르면 살아 있는 같은 실행을 돌려준다(`reused: true`); 요청 내용이 다르면 거절.
 * `fileHash`는 파일 가져오기 kind가 같은 파일을 두 번 반영하지 않으려고 쓴다(unique).
 */
export const OperationBeginRequestSchema = z.object({
  kind: OperationKindSchema,
  scope: JsonObjectSchema.default({}),
  idempotencyKey: z.string().min(1).max(128).optional(),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict();
export type OperationBeginRequest = z.infer<typeof OperationBeginRequestSchema>;

export const OperationBeginResponseSchema = z.object({
  operation: OperationViewSchema,
  /** fenced 쓰기의 비밀. 확장의 operation client만 들고 있고 화면에 내지 않는다. */
  token: z.string().uuid(),
  reused: z.boolean(),
}).strict();
export type OperationBeginResponse = z.infer<typeof OperationBeginResponseSchema>;

/**
 * chunk `PUT /api/operations/:id/chunks/:chunkKind/:sequence` (헤더 `x-operation-token`).
 * 같은 (chunkKind, sequence)에 같은 checksum이면 멱등, 다른 checksum이면 `OPERATION_FENCE_LOST{chunk_conflict}`.
 * 청크가 없는 kind는 `payload: []`로 progress만 보내 임대를 연장한다.
 */
export const OperationChunkPutRequestSchema = z.object({
  /** payload 직렬화의 SHA-256 hex. */
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  payload: z.array(z.unknown()),
  progress: JsonObjectSchema.optional(),
}).strict();
export type OperationChunkPutRequest = z.infer<typeof OperationChunkPutRequestSchema>;

export const OperationChunkPutResponseSchema = z.object({
  operationId: z.string().uuid(),
  chunkKind: OperationChunkKindSchema,
  sequence: z.number().int().min(1),
  itemCount: z.number().int().nonnegative(),
  expiresAt: zIsoDate,
}).strict();
export type OperationChunkPutResponse = z.infer<typeof OperationChunkPutResponseSchema>;

/**
 * finish `POST /api/operations/:id/finish` (헤더 `x-operation-token`).
 * 성공이면 owner `finalize(chunks, window)`가 같은 트랜잭션에서 원장을 쓰고, 실패면 아무것도 쓰지 않는다.
 * 어느 쪽이든 청크는 지워지고 잠금은 풀린다. `failed`에는 errorCode가 있어야 한다.
 */
export const OperationFinishRequestSchema = z.object({
  outcome: OperationOutcomeSchema,
  errorCode: z.string().min(1).max(64).optional(),
  errorMessage: z.string().max(2_000).optional(),
  window: OperationWindowSchema.optional(),
  result: JsonObjectSchema.optional(),
  /**
   * failed일 때만. 재시도가 남아 있으면(`attempts < maxAttempts`) 같은 실행이 `prepared`로 돌아가
   * `scheduledFor = now + retryAfterMs`가 된다(잠금 유지, 청크 삭제). 없거나 재시도가 없으면 terminal `failed`.
   */
  retryAfterMs: z.number().int().nonnegative().max(7 * 24 * 60 * 60 * 1000).optional(),
}).strict().refine(
  (value) => value.outcome !== 'failed' || value.errorCode !== undefined,
  { message: 'failed에는 errorCode가 필요합니다', path: ['errorCode'] },
).refine(
  (value) => value.outcome === 'failed' || value.retryAfterMs === undefined,
  { message: 'retryAfterMs는 failed에만 쓴다', path: ['retryAfterMs'] },
);
export type OperationFinishRequest = z.infer<typeof OperationFinishRequestSchema>;

export const OperationFinishResponseSchema = z.object({
  operation: OperationViewSchema,
}).strict();
export type OperationFinishResponse = z.infer<typeof OperationFinishResponseSchema>;

/** cancel `POST /api/operations/:id/cancel`. 운영자 요청, 토큰 없음, 어느 브라우저에서든. 이미 끝났으면 그대로 돌려준다. */
export const OperationCancelResponseSchema = OperationFinishResponseSchema;
export type OperationCancelResponse = z.infer<typeof OperationCancelResponseSchema>;

/** reader `GET /api/operations?kinds=a,b&status=&limit=`. 화면 하나가 조회 하나로 여러 kind를 본다. */
export const OperationListQuerySchema = z.object({
  kinds: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((kind) => kind.trim()).filter(Boolean))
    .pipe(z.array(OperationKindSchema).min(1).max(50)),
  status: OperationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();
export type OperationListQuery = z.infer<typeof OperationListQuerySchema>;

/**
 * 연쇄(KID-354): finish의 `result.next`에 이 모양이 있으면 확장 runner가 같은 환경으로 그 kind를 이어서 begin한다.
 * kind 특수 처리가 아니라 일반 규칙이다 — 카탈로그 목록 → 상세처럼 앞 실행의 결과가 뒤 실행의 scope인 경우.
 */
export const OperationNextSchema = z.object({
  kind: OperationKindSchema,
  scope: JsonObjectSchema,
}).strict();
export type OperationNext = z.infer<typeof OperationNextSchema>;

export const OperationListResponseSchema = z.object({
  operations: z.array(OperationViewSchema),
}).strict();
export type OperationListResponse = z.infer<typeof OperationListResponseSchema>;

// ── prepare · claim (서버 내부 포트, HTTP 없음 — KID-358) ─────────────────────────────

/**
 * owner가 자기 트랜잭션 안에서 만들어 두는 실행. begin과 달리 토큰·임대는 claim 때 생긴다.
 * 잠금은 여기서 잡히고 terminal까지 유지된다(재시도 사이에도). 같은 키가 잡혀 있으면 `OPERATION_IN_PROGRESS`.
 */
export const OperationPrepareRequestSchema = z.object({
  kind: OperationKindSchema,
  scope: JsonObjectSchema.default({}),
  idempotencyKey: z.string().min(1).max(128).optional(),
  /** 이 시각 전에는 claim되지 않는다. 없으면 바로. */
  scheduledFor: zIsoDate.optional(),
  /** claim 횟수 상한(재시도 포함). 기본 1 = 재시도 없음. */
  maxAttempts: z.number().int().min(1).max(20).default(1),
  /** 실행을 시작한 사용자(있으면). owner `plan`이 `context.userId`로 받아 plan JSON에 보관한다(KID-354). */
  userId: z.string().uuid().optional(),
}).strict();
export type OperationPrepareRequest = z.infer<typeof OperationPrepareRequestSchema>;

/**
 * 워커(또는 KID-372부터 확장)가 `prepared`이면서 `scheduledFor <= now`인 가장 오래된 실행, 또는
 * `executing`인데 임대가 만료된 실행을 `attempts < maxAttempts`인 것만 `FOR UPDATE SKIP LOCKED`로 집는다.
 * 집으면 `executing`·`attempts + 1`·새 token·`expiresAt = now + leaseMs`.
 */
export const OperationClaimRequestSchema = z.object({
  kinds: z.array(OperationKindSchema).min(1).max(50),
  /** 로그·진단용. 잠금 판정에는 쓰지 않는다. */
  workerId: z.string().min(1).max(128),
}).strict();
export type OperationClaimRequest = z.infer<typeof OperationClaimRequestSchema>;

export const OperationClaimResultSchema = z.object({
  operation: OperationViewSchema,
  token: z.string().uuid(),
}).strict();
export type OperationClaimResult = z.infer<typeof OperationClaimResultSchema>;

// ── owner 포트 결과 ───────────────────────────────────────────────────────────────

/** owner `plan(scope)`가 돌려주는 것. lockKeys는 하나 이상. window는 미리 알 때만. */
export const OperationPlanResultSchema = z.object({
  plan: JsonObjectSchema,
  lockKeys: z.array(OperationLockKeySchema).min(1),
  window: OperationWindowSchema.optional(),
}).strict();
export type OperationPlanResult = z.infer<typeof OperationPlanResultSchema>;

/** finalize가 받는 청크 한 장. payload의 kind별 모양은 owner가 검증한다. */
export const OperationStagedChunkSchema = z.object({
  chunkKind: OperationChunkKindSchema,
  sequence: z.number().int().min(1),
  itemCount: z.number().int().nonnegative(),
  payload: z.array(z.unknown()),
}).strict();
export type OperationStagedChunk = z.infer<typeof OperationStagedChunkSchema>;
