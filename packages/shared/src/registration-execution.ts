/**
 * 등록 대상 실행 kind — 운영자가 어느 몰 계정을 고르든 같은 집합이다(KID-321). 몰마다 다른 것
 * (폼 채우기 · API · 엑셀 · 확인 증거)은 채널 registry 의 `delivery` 와 채널 어댑터가 맡는다.
 * `delete` 는 실제로 지울 수 있는 어댑터가 생길 때 더한다(지금은 없다 — KID-317 결정).
 * `product_registration_executions.execution_kind` 에는 이 집합에 대표이미지 반영(`thumbnail_update`)이 더해진다.
 */
export const TARGET_EXECUTION_KINDS = ['register', 'update', 'sold_out', 'resume', 'composition_change'] as const;

export {
  OPERATION_STATUSES,
  PROVIDER_OUTCOMES,
  OperationStatusSchema,
  ProviderOutcomeSchema,
  canRetryProviderSideEffect,
  isOperationTerminal,
} from './operation-lifecycle.js';
export type { OperationStatus, ProviderOutcome } from './operation-lifecycle.js';
