import {
  detectSourcingExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import { TrendExtensionError } from './1688-trend-extension';

// 틱톡 크리에이티브 센터 수집은 봇/리전 차단이라 로그인된 Chrome 확장으로만 실행한다.
// 확장이 백엔드에서 타깃(해시태그·상품 랭킹 + tiktok-cc 시드 키워드)을 직접 불러와
// 순차 스크랩하므로, 웹은 시작만 요청하고 진행 상태를 관찰한다.

const EXTENSION_REQUEST_TIMEOUT_MS = 8_000;
const EXTENSION_START_TIMEOUT_MS = 15_000;
// 타깃 하나(네비게이션 + 스크롤 + 추출)당 최악 예산. 진전이 있으면 계속 기다린다.
const PER_TARGET_BUDGET_MS = 60_000;
// 해시태그·상품 랭킹 2개 + tiktok-cc 시드 키워드(최대 20) → 여유 상한.
const MAX_EXPECTED_TARGETS = 24;
const COLLECTION_STALL_TIMEOUT_MS = 90_000;
const COLLECTION_HARD_TIMEOUT_BUFFER_MS = 2 * 60_000;
const STATUS_POLL_INTERVAL_MS = 1_000;

type TiktokCcCollectionStatus =
  | 'queued'
  | 'running'
  | 'posting'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface TiktokCcExtensionResponse {
  success?: boolean;
  error?: string;
  runId?: string;
  status?: TiktokCcCollectionStatus;
  collected?: number;
  region?: string | null;
  currentTargetIndex?: number;
  totalTargets?: number;
  businessDate?: string | null;
  errors?: Array<{ target?: string; message?: string }>;
  capabilities?: {
    sourcingTiktokCcCollector?: boolean;
    browserCollectionSessions?: boolean;
  };
}

export interface ChromeTiktokCcCollectionResult {
  runId: string;
  collected: number;
  region: string | null;
  businessDate: string | null;
  errors: Array<{ target: string; message: string }>;
}

export async function collectTiktokCcFromChrome(
  onRunStarted?: (runId: string) => void,
  signal?: AbortSignal,
  region?: string,
): Promise<ChromeTiktokCcCollectionResult> {
  throwIfAborted(signal);

  if (!isChromeExtensionRuntimeAvailable()) {
    throw new TrendExtensionError(
      'chrome_required',
      '틱톡 크리에이티브 센터 수집은 Chrome 확장프로그램으로 실행됩니다. 같은 Chrome에서 KidItem 시장분석 페이지를 열어주세요.',
    );
  }

  const extensionId = await detectSourcingExtensionId();
  if (!extensionId) {
    throw new TrendExtensionError(
      'extension_missing',
      'Auto-Seller Product Scraper 확장프로그램을 설치하거나 새로고침한 뒤 다시 실행하세요.',
    );
  }

  const ping = await sendToExtension<TiktokCcExtensionResponse>(
    extensionId,
    { action: 'ping' },
    EXTENSION_REQUEST_TIMEOUT_MS,
  );
  if (
    !ping?.capabilities?.sourcingTiktokCcCollector ||
    !ping.capabilities.browserCollectionSessions
  ) {
    throw new TrendExtensionError(
      'extension_reload_required',
      '틱톡 수집 기능이 없는 이전 확장 버전입니다. chrome://extensions 에서 Auto-Seller Product Scraper를 새로고침하세요.',
    );
  }

  const started = await sendToExtension<TiktokCcExtensionResponse>(
    extensionId,
    {
      action: 'startTiktokCcCollection',
      ...(region ? { region } : {}),
    },
    EXTENSION_START_TIMEOUT_MS,
  );
  if (!started?.success || !started.runId) {
    throw new TrendExtensionError(
      'collection_failed',
      started?.error ?? '틱톡 Chrome 수집을 시작하지 못했습니다.',
      started?.runId ?? null,
    );
  }
  onRunStarted?.(started.runId);

  const hardDeadline =
    Date.now() + PER_TARGET_BUDGET_MS * MAX_EXPECTED_TARGETS + COLLECTION_HARD_TIMEOUT_BUFFER_MS;
  let stallDeadline = Date.now() + COLLECTION_STALL_TIMEOUT_MS;
  let lastProgressKey = '';
  let lastTargetIndex = 0;
  let lastTargetTotal = MAX_EXPECTED_TARGETS;

  while (Date.now() < hardDeadline && Date.now() < stallDeadline) {
    throwIfAborted(signal, started.runId);
    const status = await sendToExtension<TiktokCcExtensionResponse>(
      extensionId,
      { action: 'getTiktokCcCollectionStatus', runId: started.runId },
      EXTENSION_REQUEST_TIMEOUT_MS,
    );
    throwIfAborted(signal, started.runId);

    if (status.status === 'completed') {
      return {
        runId: started.runId,
        collected: normalizeCount(status.collected),
        region: typeof status.region === 'string' ? status.region : null,
        businessDate: typeof status.businessDate === 'string' ? status.businessDate : null,
        errors: normalizeCollectionErrors(status.errors),
      };
    }
    if (status.status === 'failed' || status.status === 'cancelled' || status.success === false) {
      throw new TrendExtensionError(
        'collection_failed',
        status.error ?? '틱톡 Chrome 수집에 실패했습니다.',
        started.runId,
      );
    }

    const progressKey = [
      status.status ?? '',
      Number.isFinite(status.currentTargetIndex) ? status.currentTargetIndex : -1,
      Number.isFinite(status.collected) ? status.collected : -1,
    ].join(':');
    if (progressKey !== lastProgressKey) {
      lastProgressKey = progressKey;
      stallDeadline = Date.now() + COLLECTION_STALL_TIMEOUT_MS;
      if (Number.isFinite(status.currentTargetIndex)) {
        lastTargetIndex = status.currentTargetIndex as number;
      }
      if (Number.isFinite(status.totalTargets) && (status.totalTargets as number) > 0) {
        lastTargetTotal = status.totalTargets as number;
      }
    }

    await wait(STATUS_POLL_INTERVAL_MS, signal, started.runId);
  }

  await sendToExtension<TiktokCcExtensionResponse>(
    extensionId,
    { action: 'cancelTiktokCcCollection', runId: started.runId },
    EXTENSION_REQUEST_TIMEOUT_MS,
  ).catch(() => undefined);
  throw new TrendExtensionError(
    'collection_timeout',
    `틱톡 수집이 더 진행되지 않아 중단했습니다 (${Math.min(lastTargetIndex + 1, lastTargetTotal)}/${lastTargetTotal} 타깃에서 멈춤). `
    + '열린 틱톡 탭의 로그인·지역 상태를 확인한 뒤 다시 실행해주세요.',
    started.runId,
  );
}

export function isTiktokExtensionUnavailable(error: unknown): boolean {
  return error instanceof TrendExtensionError && (
    error.code === 'chrome_required' ||
    error.code === 'extension_missing' ||
    error.code === 'extension_reload_required'
  );
}

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function normalizeCollectionErrors(
  value: TiktokCcExtensionResponse['errors'],
): Array<{ target: string; message: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      target: typeof item?.target === 'string' ? item.target.trim() : '',
      message: typeof item?.message === 'string' ? item.message.trim() : '',
    }))
    .filter((item) => item.target.length > 0 && item.message.length > 0);
}

function throwIfAborted(signal?: AbortSignal, runId: string | null = null): void {
  if (!signal?.aborted) return;
  throw new TrendExtensionError(
    'collection_aborted',
    '웹의 상태 관찰을 종료했습니다. Chrome 확장의 수집은 계속 진행됩니다.',
    runId,
  );
}

function wait(ms: number, signal?: AbortSignal, runId: string | null = null): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(new TrendExtensionError(
        'collection_aborted',
        '웹의 상태 관찰을 종료했습니다. Chrome 확장의 수집은 계속 진행됩니다.',
        runId,
      ));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
