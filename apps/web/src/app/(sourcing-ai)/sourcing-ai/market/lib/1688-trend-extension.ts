import {
  detectSourcingExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';

const EXTENSION_REQUEST_TIMEOUT_MS = 8_000;
const COLLECTION_TIMEOUT_MS = 120_000;
const STATUS_POLL_INTERVAL_MS = 1_000;

type CollectionStatus =
  | 'queued'
  | 'running'
  | 'posting'
  | 'completed'
  | 'attention_required'
  | 'verification_required'
  | 'failed'
  | 'cancelled';

interface ExtensionResponse {
  success?: boolean;
  error?: string;
  runId?: string;
  status?: CollectionStatus;
  collected?: number;
  businessDate?: string;
  verificationUrl?: string;
  errors?: Array<{ keyword?: string; message?: string }>;
  capabilities?: {
    sourcing1688TrendCollector?: boolean;
    browserCollectionSessions?: boolean;
  };
}

export type TrendExtensionErrorCode =
  | 'chrome_required'
  | 'extension_missing'
  | 'extension_reload_required'
  | 'verification_required'
  | 'collection_failed'
  | 'collection_timeout';

export class TrendExtensionError extends Error {
  constructor(
    public readonly code: TrendExtensionErrorCode,
    message: string,
    public readonly runId: string | null = null,
  ) {
    super(message);
    this.name = 'TrendExtensionError';
  }
}

export interface Chrome1688TrendCollectionResult {
  runId: string;
  collected: number;
  businessDate: string | null;
  errors: Array<{ keyword: string; message: string }>;
}

export async function collect1688TrendsFromChrome(
  keywords: readonly string[],
  onRunStarted?: (runId: string) => void,
): Promise<Chrome1688TrendCollectionResult> {
  const normalizedKeywords = Array.from(
    new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)),
  ).slice(0, 20);
  if (normalizedKeywords.length === 0) {
    throw new TrendExtensionError('collection_failed', '1688 수집 키워드가 없습니다.');
  }
  if (!isChromeExtensionRuntimeAvailable()) {
    throw new TrendExtensionError(
      'chrome_required',
      '로그인된 1688 세션 수집은 Chrome 확장프로그램으로 실행됩니다. 같은 Chrome에서 KidItem 시장분석 페이지를 열어주세요.',
    );
  }

  const extensionId = await detectSourcingExtensionId();
  if (!extensionId) {
    throw new TrendExtensionError(
      'extension_missing',
      'Auto-Seller Product Scraper 확장프로그램을 설치하거나 새로고침한 뒤 다시 실행하세요.',
    );
  }

  const ping = await sendToExtension<ExtensionResponse>(
    extensionId,
    { action: 'ping' },
    EXTENSION_REQUEST_TIMEOUT_MS,
  );
  if (
    !ping?.capabilities?.sourcing1688TrendCollector ||
    !ping.capabilities.browserCollectionSessions
  ) {
    throw new TrendExtensionError(
      'extension_reload_required',
      '1688 트렌드 수집 기능이 없는 이전 확장 버전입니다. chrome://extensions 에서 Auto-Seller Product Scraper를 새로고침하세요.',
    );
  }

  const started = await sendToExtension<ExtensionResponse>(
    extensionId,
    {
      action: 'start1688TrendCollection',
      keywords: normalizedKeywords,
      maxResultsPerKeyword: 20,
    },
    EXTENSION_REQUEST_TIMEOUT_MS,
  );
  if (!started?.success || !started.runId) {
    throw new TrendExtensionError(
      started?.status === 'verification_required' ? 'verification_required' : 'collection_failed',
      started?.error ?? '1688 Chrome 수집을 시작하지 못했습니다.',
      started?.runId ?? null,
    );
  }
  onRunStarted?.(started.runId);

  const deadline = Date.now() + COLLECTION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await sendToExtension<ExtensionResponse>(
      extensionId,
      { action: 'get1688TrendCollectionStatus', runId: started.runId },
      EXTENSION_REQUEST_TIMEOUT_MS,
    );

    if (status.status === 'completed') {
      return {
        runId: started.runId,
        collected: normalizeCount(status.collected),
        businessDate: typeof status.businessDate === 'string' ? status.businessDate : null,
        errors: normalizeCollectionErrors(status.errors),
      };
    }
    if (
      status.status === 'verification_required' ||
      status.status === 'attention_required'
    ) {
      throw new TrendExtensionError(
        'verification_required',
        status.error ?? '열린 1688 탭에서 슬라이더 검증을 완료한 뒤 수집 버튼을 다시 눌러주세요.',
        started.runId,
      );
    }
    if (status.status === 'failed' || status.status === 'cancelled' || status.success === false) {
      throw new TrendExtensionError(
        'collection_failed',
        status.error ?? '1688 Chrome 수집에 실패했습니다.',
        started.runId,
      );
    }

    await wait(STATUS_POLL_INTERVAL_MS);
  }

  await sendToExtension<ExtensionResponse>(
    extensionId,
    { action: 'cancel1688TrendCollection', runId: started.runId },
    EXTENSION_REQUEST_TIMEOUT_MS,
  ).catch(() => undefined);
  throw new TrendExtensionError(
    'collection_timeout',
    '1688 수집이 2분 안에 끝나지 않았습니다. 열린 1688 탭의 검증 상태를 확인해주세요.',
    started.runId,
  );
}

export function canFallBackToServer1688(error: unknown): boolean {
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
  value: ExtensionResponse['errors'],
): Array<{ keyword: string; message: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      keyword: typeof item?.keyword === 'string' ? item.keyword.trim() : '',
      message: typeof item?.message === 'string' ? item.message.trim() : '',
    }))
    .filter((item) => item.keyword.length > 0 && item.message.length > 0);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
