import type {
  RocketPurchasePreviewFreshnessPendingResponse,
  RocketPurchasePreviewReadyResponse,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import type {
  SellpiaInventoryFreshnessView,
} from '@kiditem/shared/sellpia-inventory-freshness';

export const ROCKET_FRESHNESS_POLL_MS = 2_000;
export const ROCKET_FRESHNESS_MAX_POLLS = 450;

type RocketPreviewFreshnessState = Pick<
  SellpiaInventoryFreshnessView,
  | 'status'
  | 'verifiedGeneration'
  | 'requestedGeneration'
  | 'sourceBinding'
  | 'lastAttempt'
>;

export type RocketPreviewFreshnessRecoveryCode =
  | 'attention_required'
  | 'refresh_failed'
  | 'aborted'
  | 'timeout';

export class RocketPreviewFreshnessRecoveryError extends Error {
  readonly name = 'RocketPreviewFreshnessRecoveryError';

  constructor(
    readonly code: RocketPreviewFreshnessRecoveryCode,
    message: string,
    readonly checkpoint: RocketPurchasePreviewFreshnessPendingResponse,
  ) {
    super(message);
  }
}

export type RocketPreviewFreshnessRecoveryDependencies = {
  retryPreview: () => Promise<RocketPurchasePreviewResponse>;
  getFreshnessState: () => Promise<RocketPreviewFreshnessState>;
  requestRetry: () => Promise<RocketPreviewFreshnessState>;
  publishPending: (
    checkpoint: RocketPurchasePreviewFreshnessPendingResponse,
  ) => void | Promise<void>;
  publishFreshnessState: (
    state?: RocketPreviewFreshnessState,
  ) => void | Promise<void>;
  sleep?: (signal?: AbortSignal) => Promise<void>;
  maxPolls?: number;
};

export async function recoverRocketPreviewFreshness(
  initial: RocketPurchasePreviewResponse,
  dependencies: RocketPreviewFreshnessRecoveryDependencies,
  signal?: AbortSignal,
): Promise<RocketPurchasePreviewReadyResponse> {
  if (initial.status === 'ready') return initial;

  const checkpoint = initial;
  await dependencies.publishPending(checkpoint);
  throwIfAborted(signal, checkpoint);
  await dependencies.publishFreshnessState();

  let targetGeneration = BigInt(checkpoint.requestedGeneration);
  let retryRequested = false;
  const maxPolls = dependencies.maxPolls ?? ROCKET_FRESHNESS_MAX_POLLS;
  const sleep = dependencies.sleep ?? defaultSleep;

  for (let poll = 0; poll < maxPolls; poll += 1) {
    throwIfAborted(signal, checkpoint);
    const state = await dependencies.getFreshnessState();
    throwIfAborted(signal, checkpoint);
    assertSourceBinding(state, checkpoint);

    if (
      state.status === 'fresh'
      && BigInt(state.verifiedGeneration) >= targetGeneration
    ) {
      const retried = await dependencies.retryPreview();
      throwIfAborted(signal, checkpoint);
      if (retried.status === 'ready') return retried;
      throw new RocketPreviewFreshnessRecoveryError(
        'refresh_failed',
        '재고 갱신 뒤에도 새 갱신 요청이 생겼습니다. 저장된 수집본으로 다시 시도해 주세요.',
        checkpoint,
      );
    }

    if (state.status === 'failed') {
      if (retryRequested) {
        throw new RocketPreviewFreshnessRecoveryError(
          'refresh_failed',
          freshnessFailureMessage(state),
          checkpoint,
        );
      }
      retryRequested = true;
      const retriedState = await dependencies.requestRetry();
      throwIfAborted(signal, checkpoint);
      assertSourceBinding(retriedState, checkpoint);
      targetGeneration = maxGeneration(
        targetGeneration,
        BigInt(retriedState.requestedGeneration),
      );
      await dependencies.publishFreshnessState(retriedState);
    }

    if (poll + 1 < maxPolls) await sleep(signal);
  }

  throw new RocketPreviewFreshnessRecoveryError(
    'timeout',
    '수집본은 저장됐지만 셀피아 재고 갱신이 15분 안에 끝나지 않았습니다. 저장된 수집본으로 다시 시도해 주세요.',
    checkpoint,
  );
}

function assertSourceBinding(
  state: RocketPreviewFreshnessState,
  checkpoint: RocketPurchasePreviewFreshnessPendingResponse,
): void {
  if (state.sourceBinding.confirmed) return;
  throw new RocketPreviewFreshnessRecoveryError(
    'attention_required',
    '수집본은 저장됐습니다. 셀피아 계정 연결을 확인한 뒤 재고 갱신을 다시 시도해 주세요.',
    checkpoint,
  );
}

function freshnessFailureMessage(state: RocketPreviewFreshnessState): string {
  return state.lastAttempt?.errorMessage
    ?? state.lastAttempt?.errorCode
    ?? '수집본은 저장됐지만 셀피아 재고 갱신에 실패했습니다. 다시 시도해 주세요.';
}

function throwIfAborted(
  signal: AbortSignal | undefined,
  checkpoint: RocketPurchasePreviewFreshnessPendingResponse,
): void {
  if (!signal?.aborted) return;
  throw new RocketPreviewFreshnessRecoveryError(
    'aborted',
    '화면의 대기는 중단됐지만 수집본과 서버 재고 갱신 요청은 유지됩니다.',
    checkpoint,
  );
}

function maxGeneration(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function defaultSleep(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timeout = globalThis.setTimeout(resolve, ROCKET_FRESHNESS_POLL_MS);
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
