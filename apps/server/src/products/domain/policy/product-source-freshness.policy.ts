import {
  SellpiaInventoryCollectionTriggerSchema,
  type SellpiaInventoryCollectionStatus,
  type SellpiaInventoryCollectionStatusView,
  type SellpiaInventoryStoredCollectionTrigger,
  type SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';

export const SELLPIA_SOURCE_ORIGIN = 'https://kiditem.sellpia.com' as const;
export const SELLPIA_SOURCE_ACCOUNT_KEY = 'kiditem' as const;

/**
 * 조직마다 하나인 셀피아 원천 줄: 계정 연결, 마지막 발행(실행 id·완료 시각·세대)과 발주 울타리. 도는 수집·실패는
 * 여기 없다 — 실행 표가 말한다(ADR-0025, KID-355 정책 B). 옛 임대·시도 칸은 지웠다.
 */
export type SellpiaInventoryCollectionState = {
  organizationId: string;
  sourceOrigin: string;
  sourceAccountKey: string | null;
  /** Source completion time. Kept under the migration-era column name. */
  lastVerifiedAt: Date | null;
  lastCompletedOperationId: string | null;
  refreshReason: SellpiaInventoryStoredCollectionTrigger | null;
  requestedSyncScope: SellpiaSyncScope;
  requestedGeneration: bigint;
  verifiedGeneration: bigint;
  freshnessFence: string;
};

export type SellpiaInventoryCollectionStatePatch = Partial<
  Omit<SellpiaInventoryCollectionState, 'organizationId'>
>;

/**
 * 셀피아 세 kind(재고·매출·상품 손익 — 셀피아 로그인 잠금 하나를 나눠 쓴다) 중 가장 최근에 시작한 실행 하나. 운영자가
 * 멈춘 실행은 빼고 고른다. 임대가 끝난 실행은 실행 계약의 만료 규칙대로 비춘 상태다(`readLatestOperation`).
 */
export type SellpiaLatestOperation = {
  id: string;
  kind: string;
  status: 'prepared' | 'executing' | 'reconciling' | 'succeeded' | 'failed';
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  expiresAt: Date;
  /** 재고 실행 plan의 `trigger`(없으면 null). */
  trigger: string | null;
};

export function createInitialCollectionState(input: {
  organizationId: string;
  now: Date;
  freshnessFence: string;
}): SellpiaInventoryCollectionState {
  return {
    organizationId: input.organizationId,
    sourceOrigin: SELLPIA_SOURCE_ORIGIN,
    sourceAccountKey: null,
    lastVerifiedAt: null,
    lastCompletedOperationId: null,
    refreshReason: 'initial_snapshot',
    requestedSyncScope: 'inventory',
    requestedGeneration: 1n,
    verifiedGeneration: 0n,
    freshnessFence: input.freshnessFence,
  };
}

const ERROR_MESSAGE_LIMIT = 300;

function runningOperation(operation: SellpiaLatestOperation | null): SellpiaLatestOperation | null {
  return operation && operation.status !== 'succeeded' && operation.status !== 'failed' ? operation : null;
}

/** 도는 실행이 있으면 running, 최신 실행이 실패면 failed, 아니면 발행 상태로 complete / not_collected. */
export function deriveCollectionStatus(
  state: SellpiaInventoryCollectionState,
  latest: SellpiaLatestOperation | null,
): SellpiaInventoryCollectionStatus {
  if (runningOperation(latest)) return 'running';
  if (latest?.status === 'failed') return 'failed';
  return state.verifiedGeneration > 0n && state.lastVerifiedAt !== null ? 'complete' : 'not_collected';
}

export function toCollectionStatusView(
  state: SellpiaInventoryCollectionState,
  latest: SellpiaLatestOperation | null,
): SellpiaInventoryCollectionStatusView {
  const failed = latest?.status === 'failed';
  const running = runningOperation(latest);
  return {
    status: deriveCollectionStatus(state, latest),
    sourceBinding: isSourceBindingConfirmed(state)
      ? {
        origin: SELLPIA_SOURCE_ORIGIN,
        accountKey: SELLPIA_SOURCE_ACCOUNT_KEY,
        confirmed: true,
      }
      : {
        origin: SELLPIA_SOURCE_ORIGIN,
        accountKey: null,
        confirmed: false,
      },
    requestedGeneration: state.requestedGeneration.toString(),
    verifiedGeneration: state.verifiedGeneration.toString(),
    lastCompletedAttemptId: state.lastCompletedOperationId,
    lastCompletedAt: state.lastVerifiedAt?.toISOString() ?? null,
    lastAttemptId: latest?.id ?? state.lastCompletedOperationId,
    activeSync: running
      ? {
        attemptId: running.id,
        // 재고 실행이면 이 세대로 발행한다(다른 셀피아 kind는 재고 세대를 바꾸지 않는다).
        generation: (state.verifiedGeneration + 1n).toString(),
        scope: 'inventory',
        startedAt: running.startedAt.toISOString(),
        leaseExpiresAt: running.expiresAt.toISOString(),
        // 시작·중단은 실행 계약(`/api/operations`)이 한다. 이 보기로는 조작하지 않는다.
        canControl: false,
      }
      : null,
    lastAttempt: latest
      ? {
        attemptedAt: latest.startedAt.toISOString(),
        trigger: publicTrigger(latest.trigger),
        scope: 'inventory',
        errorCode: failed ? latest.errorCode : null,
        errorMessage: failed ? latest.errorMessage?.slice(0, ERROR_MESSAGE_LIMIT) ?? null : null,
      }
      : null,
  };
}

function publicTrigger(trigger: string | null) {
  const parsed = SellpiaInventoryCollectionTriggerSchema.safeParse(trigger);
  return parsed.success ? parsed.data : null;
}

export function planSourceBindingConfirmation(
  state: SellpiaInventoryCollectionState,
  freshnessFence: string,
): SellpiaInventoryCollectionStatePatch {
  return {
    sourceOrigin: SELLPIA_SOURCE_ORIGIN,
    sourceAccountKey: SELLPIA_SOURCE_ACCOUNT_KEY,
    freshnessFence,
  };
}

export function isSourceBindingConfirmed(
  state: SellpiaInventoryCollectionState,
): boolean {
  return state.sourceOrigin === SELLPIA_SOURCE_ORIGIN
    && state.sourceAccountKey === SELLPIA_SOURCE_ACCOUNT_KEY;
}
