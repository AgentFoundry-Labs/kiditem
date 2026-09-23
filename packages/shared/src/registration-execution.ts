import { z } from 'zod';
import {
  canRetryProviderSideEffect,
  OperationStatusSchema,
  ProviderOutcomeSchema,
} from './operation-lifecycle.js';
import { zIsoDate } from './schemas/common.js';

/**
 * 등록 대상 실행 kind — 운영자가 어느 몰 계정을 고르든 같은 집합이다(KID-321). 몰마다 다른 것
 * (폼 채우기 · API · 엑셀 · 확인 증거)은 채널 registry 의 `delivery` 와 채널 어댑터가 맡는다.
 * `delete` 는 실제로 지울 수 있는 어댑터가 생길 때 더한다(지금은 없다 — KID-317 결정).
 */
export const TARGET_EXECUTION_KINDS = ['register', 'update', 'sold_out', 'resume', 'composition_change'] as const;
export type TargetExecutionKind = (typeof TARGET_EXECUTION_KINDS)[number];
/** 대표이미지 반영(`thumbnail_update`)까지 포함한, `product_registration_executions.execution_kind` 의 전체 집합. */
export const REGISTRATION_EXECUTION_KINDS = [...TARGET_EXECUTION_KINDS, 'thumbnail_update'] as const;
export type RegistrationExecutionKind = (typeof REGISTRATION_EXECUTION_KINDS)[number];

export {
  OPERATION_STATUSES,
  PROVIDER_OUTCOMES,
  OperationStatusSchema,
  ProviderOutcomeSchema,
  canRetryProviderSideEffect,
  isOperationTerminal,
} from './operation-lifecycle.js';
export type { OperationStatus, ProviderOutcome } from './operation-lifecycle.js';

/**
 * 등록 실행 울타리의 한 줄. 채널 계정 하나에 초안 하나를 최대 한 번만 보낸 기록이다.
 *
 * Channels 소유라 `sourcing` 하위 경로가 아니라 여기에 있다(ADR-0014).
 */
export const ProductRegistrationExecutionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  registrationTargetId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  channelListingId: z.string().uuid().nullable(),
  /** 몰 중립 실행 kind 하나의 집합(KID-321). 옛 `create`·`external_wing` 은 없다 — Wing 등록은 `register` + `delivery: form`. */
  executionKind: z.enum(REGISTRATION_EXECUTION_KINDS),
  expectedProviderAccountId: z.string().trim().min(1).max(80).nullable(),
  idempotencyKey: z.string().trim().min(1),
  requestHash: z.string().trim().min(1),
  submissionPayloadJson: z.unknown().nullable(),
  submissionPayloadHash: z.string().trim().min(1).nullable(),
  status: OperationStatusSchema,
  providerOutcome: ProviderOutcomeSchema,
  providerSubmissionId: z.string().trim().min(1).nullable(),
  externalListingId: z.string().trim().min(1).nullable(),
  resultJson: z.unknown().nullable(),
  lastErrorCode: z.string().trim().min(1).nullable(),
  lastErrorMessage: z.string().trim().min(1).nullable(),
  leaseToken: z.string().uuid().nullable(),
  leaseClaimedAt: zIsoDate.nullable(),
  requestedByUserId: z.string().uuid().nullable(),
  startedAt: zIsoDate.nullable(),
  completedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
}).strict();

export type ProductRegistrationExecution = z.infer<typeof ProductRegistrationExecutionSchema>;

export function canRetryProductRegistrationExecutionProviderSideEffect(
  status: z.infer<typeof OperationStatusSchema>,
  providerOutcome: z.infer<typeof ProviderOutcomeSchema>,
): boolean {
  return canRetryProviderSideEffect(status, providerOutcome);
}
