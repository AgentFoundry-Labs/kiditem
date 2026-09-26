import type { OperationView } from '@kiditem/shared/operation';
import {
  SellpiaInventoryCollectionStatusViewSchema,
  type SellpiaInventoryCollectionStatusView,
} from '@kiditem/shared/sellpia-inventory-freshness';

/** 셀피아 실행 kind(KID-361) 스펙이 쓰는 실행 한 줄. 기본은 도는 재고 실행이다. */
export function sellpiaOperation(overrides: Partial<OperationView> = {}): OperationView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'products.sellpia_inventory',
    status: 'executing',
    lockKeys: ['resource:sellpia:login'],
    plan: { parserVersion: 'sellpia-inventory-v1', sourceOrigin: 'https://kiditem.sellpia.com', sourceAccountKey: 'kiditem', trigger: null },
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-26T01:00:00.000Z',
    finishedAt: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

/** 확장 `ping`이 셀피아 실행 kind를 도는 새 빌드라고 답하는 capability. */
export const SELLPIA_OPERATION_PING = {
  success: true,
  capabilities: { operationRuntime: true, sellpiaOperationKindsV1: true },
} as const;

/** Products 재고 상태 읽기(`GET /api/inventory/sellpia-collection-status`) 한 번의 답. */
export function sellpiaInventoryFreshness(patch: Record<string, unknown> = {}): SellpiaInventoryCollectionStatusView {
  return SellpiaInventoryCollectionStatusViewSchema.parse({
    status: 'complete',
    sourceBinding: { origin: 'https://kiditem.sellpia.com', accountKey: 'kiditem', confirmed: true },
    requestedGeneration: '7',
    verifiedGeneration: '7',
    lastCompletedAttemptId: '99999999-9999-4999-8999-999999999999',
    lastCompletedAt: '2026-09-14T00:30:00.000Z',
    lastAttemptId: '99999999-9999-4999-8999-999999999999',
    activeSync: null,
    lastAttempt: null,
    ...patch,
  });
}
