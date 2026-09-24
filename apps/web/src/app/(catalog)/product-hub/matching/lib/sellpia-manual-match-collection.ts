import {
  collectSellpiaManualMatch,
  detectOrderCollectionExtensionRuntime,
} from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  beginSellpiaManualMatchSourceAttempt,
  readSellpiaManualMatchSourceAttempt,
  readSellpiaManualMatchSourceCurrent,
  type SellpiaManualMatchSourceAttempt,
} from './channel-sku-matching-api';
import type {
  SellpiaManualMatchCollectionFailureCode,
  SellpiaManualMatchSnapshotStatus,
} from '@kiditem/shared/sellpia-manual-match';
import { attemptFailureText } from '@/lib/operator-error';

const REQUIRED_CAPABILITIES = [
  'browserCollectionSessions',
  'orderCollectionFailureEvidenceV1',
  'sellpiaManualMatchSourceOwnerV1',
];
const CORRELATION_STORAGE_PREFIX = 'kiditem.sellpia.manual-match.correlation.v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SellpiaManualMatchCollectionScope = {
  organizationId: string;
  environmentKey?: string;
};

type AttemptCorrelation = {
  idempotencyKey: string;
  attemptId: string | null;
};

/** The browser origin distinguishes local and office extension environments. */
export function getSellpiaManualMatchEnvironmentKey(): string {
  if (typeof window === 'undefined') return 'server';
  const origin = window.location.origin;
  return origin && origin !== 'null'
    ? origin
    : `${window.location.protocol}//${window.location.host}`;
}

export function sellpiaManualMatchCorrelationStorageKey(
  organizationId: string,
  environmentKey = getSellpiaManualMatchEnvironmentKey(),
): string {
  return [
    CORRELATION_STORAGE_PREFIX,
    encodeURIComponent(organizationId),
    encodeURIComponent(environmentKey),
  ].join(':');
}

export class SellpiaManualMatchCollectionError extends Error {
  constructor(
    message: string,
    readonly failureCode?: SellpiaManualMatchCollectionFailureCode,
  ) {
    super(message);
    this.name = 'SellpiaManualMatchCollectionError';
  }
}

export type CollectedSellpiaManualMatch = {
  attempt: SellpiaManualMatchSourceAttempt;
  status: SellpiaManualMatchSnapshotStatus;
};

const FAILURE_CODES: ReadonlySet<string> = new Set<SellpiaManualMatchCollectionFailureCode>([
  'sellpia_manual_match_login_required',
  'sellpia_manual_match_contract_drift',
  'sellpia_manual_match_invalid_snapshot',
  'sellpia_manual_match_timeout',
  'sellpia_manual_match_network_failed',
]);

function knownFailureCode(value: unknown): SellpiaManualMatchCollectionFailureCode | undefined {
  return typeof value === 'string' && FAILURE_CODES.has(value)
    ? value as SellpiaManualMatchCollectionFailureCode
    : undefined;
}

function attemptFailure(attempt: SellpiaManualMatchSourceAttempt): SellpiaManualMatchCollectionError {
  const code = knownFailureCode(attempt.errorCode);
  return new SellpiaManualMatchCollectionError(
    attemptFailureText(attempt, 'sellpia_manual_match') ?? 'Sellpia 수동상품매칭 근거 수집에 실패했습니다.',
    code,
  );
}

function browserSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCorrelation(scope: SellpiaManualMatchCollectionScope): AttemptCorrelation | null {
  const storage = browserSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(sellpiaManualMatchCorrelationStorageKey(
      scope.organizationId,
      scope.environmentKey,
    ));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AttemptCorrelation>;
    if (
      typeof value.idempotencyKey !== 'string'
      || value.idempotencyKey.trim().length === 0
      || value.idempotencyKey.length > 128
      || (value.attemptId !== null && !UUID_PATTERN.test(value.attemptId || ''))
    ) return null;
    return {
      idempotencyKey: value.idempotencyKey,
      attemptId: value.attemptId ?? null,
    };
  } catch {
    return null;
  }
}

function writeCorrelation(
  scope: SellpiaManualMatchCollectionScope,
  value: AttemptCorrelation,
): void {
  const storage = browserSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(
      sellpiaManualMatchCorrelationStorageKey(scope.organizationId, scope.environmentKey),
      JSON.stringify(value),
    );
  } catch {
    // The owner remains authoritative even if session storage is unavailable.
  }
}

function clearCorrelation(scope: SellpiaManualMatchCollectionScope, attemptId: string): void {
  const current = readCorrelation(scope);
  if (!current || current.attemptId !== attemptId) return;
  const storage = browserSessionStorage();
  try {
    storage?.removeItem(sellpiaManualMatchCorrelationStorageKey(
      scope.organizationId,
      scope.environmentKey,
    ));
  } catch { /* noop */ }
}

async function readCompleteSnapshotStatus(): Promise<SellpiaManualMatchSnapshotStatus> {
  const current = await readSellpiaManualMatchSourceCurrent();
  if (!current.currentSnapshot) {
    throw new SellpiaManualMatchCollectionError(
      'Sellpia 수동상품매칭 완료 결과를 현재 게시 상태와 연결하지 못했습니다.',
      'sellpia_manual_match_invalid_snapshot',
    );
  }
  return current.currentSnapshot;
}

async function reconcileTerminalAttempt(
  scope: SellpiaManualMatchCollectionScope,
  attemptId: string,
): Promise<CollectedSellpiaManualMatch> {
  const attempt = await readSellpiaManualMatchSourceAttempt(attemptId);
  if (attempt.state === 'RUNNING') {
    throw new SellpiaManualMatchCollectionError(
      'Sellpia 수동상품매칭 수집이 아직 완료되지 않았습니다. 잠시 후 상태를 확인해주세요.',
    );
  }
  if (attempt.state === 'FAILED') {
    clearCorrelation(scope, attemptId);
    throw attemptFailure(attempt);
  }
  const status = await readCompleteSnapshotStatus();
  clearCorrelation(scope, attemptId);
  return { attempt, status };
}

async function detectExtensionId(): Promise<string> {
  const status = await detectOrderCollectionExtensionRuntime(1_200, REQUIRED_CAPABILITIES);
  if (status.status === 'ready') return status.extensionId;
  const detail = status.status === 'incompatible'
    ? ` 현재 버전 ${status.version}에 필요한 기능이 없습니다: ${status.missingCapabilities.join(', ')}.`
    : '';
  throw new SellpiaManualMatchCollectionError(
    `최신 주문수집 확장프로그램을 찾지 못했습니다.${detail}`,
  );
}

async function beginOrResumeAttempt(
  scope: SellpiaManualMatchCollectionScope,
  correlation: AttemptCorrelation | null,
): Promise<SellpiaManualMatchSourceAttempt> {
  if (correlation?.attemptId) {
    return readSellpiaManualMatchSourceAttempt(correlation.attemptId);
  }
  const idempotencyKey = correlation?.idempotencyKey ?? createSecureRandomUuid();
  writeCorrelation(scope, { idempotencyKey, attemptId: null });
  const attempt = await beginSellpiaManualMatchSourceAttempt({ idempotencyKey });
  writeCorrelation(scope, { idempotencyKey, attemptId: attempt.attemptId });
  return attempt;
}

/**
 * Starts or resumes one server-owned attempt and asks the extension to collect
 * the server-frozen target set. The snapshot is completed by the extension
 * owner; this page only reconciles the terminal read and published status.
 */
export async function collectSellpiaManualMatchSnapshot(
  scope: SellpiaManualMatchCollectionScope,
): Promise<CollectedSellpiaManualMatch> {
  const correlation = readCorrelation(scope);
  let attempt: SellpiaManualMatchSourceAttempt;
  let extensionId: string | null = null;

  if (correlation?.attemptId) {
    attempt = await beginOrResumeAttempt(scope, correlation);
  } else {
    // Do not create a server attempt when the authoritative extension is not
    // available. The idempotency key is stored before the begin request so a
    // lost begin response can be retried without opening another attempt.
    extensionId = await detectExtensionId();
    attempt = await beginOrResumeAttempt(scope, correlation);
  }

  if (attempt.state !== 'RUNNING') return reconcileTerminalAttempt(scope, attempt.attemptId);
  extensionId ??= await detectExtensionId();

  try {
    await transferExtensionAuthTo(extensionId);
    const response = await collectSellpiaManualMatch(extensionId, attempt.attemptId);
    if (response.attemptId !== attempt.attemptId) {
      throw new SellpiaManualMatchCollectionError(
        'Sellpia 수동상품매칭 수집 시도 응답이 일치하지 않습니다.',
      );
    }
    if (!response.success) {
      throw new SellpiaManualMatchCollectionError(
        response.error || 'Sellpia 수동상품매칭 근거 수집에 실패했습니다.',
        knownFailureCode(response.errorCode),
      );
    }
  } catch (error) {
    // The extension may have committed COMPLETE and lost the page response.
    // A read-only owner reconciliation preserves that terminal result without
    // collecting from Sellpia a second time.
    try {
      return await reconcileTerminalAttempt(scope, attempt.attemptId);
    } catch {
      throw error;
    }
  }

  return reconcileTerminalAttempt(scope, attempt.attemptId);
}
