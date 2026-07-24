import {
  detectSourcingExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';

const EXTENSION_REQUEST_TIMEOUT_MS = 8_000;
/**
 * 수집 시작 요청만 별도 예산을 쓴다. 확장은 run 을 만들기 전에 KidItem 인증
 * 토큰을 확보하는데, 토큰이 없거나 만료됐으면 로그인된 웹 탭이 새 토큰을
 * 내려줄 때까지 최대 10초(확장 `AUTH_REFRESH_TIMEOUT_MS`)를 기다린다.
 * 웹이 8초에 먼저 끊으면 그 10초째에 도착하는 "KidItem 웹 앱에서 로그인 후
 * 다시 시도해주세요" 라는 **실제 사유가 영영 화면에 못 온다**. 운영자에게는
 * 원인을 알 수 없는 "익스텐션 응답 시간이 초과되었습니다" 로만 보이고,
 * run 은 애초에 생성되지 않아 직전 실행 결과가 그대로 남는다.
 * 따라서 시작 요청은 확장의 인증 대기보다 넉넉히 길게 잡는다.
 */
const EXTENSION_START_TIMEOUT_MS = 15_000;
/**
 * 확장은 키워드를 **순차로** 처리하고, 하나당 최악 70초(네비게이션 30초 +
 * 추출 20초, content-script 재주입 시 추출 20초 재시도)까지 걸린다.
 * 키워드가 20개면 정상 수집도 15분을 넘길 수 있으므로
 * 전체 고정 데드라인은 "느린 성공"을 실패로 만든다(그리고 cancel 로 수집분을
 * 버린다). 그래서 **진행이 멈춘 시간**으로 판단한다: 확장이 키워드 인덱스나
 * 수집 건수를 올리는 동안에는 계속 기다리고, 아무 진전이 없을 때만 끊는다.
 */
const COLLECTION_STALL_TIMEOUT_MS = 90_000;
const COLLECTION_NAVIGATION_BUDGET_MS = 30_000;
const COLLECTION_EXTRACTION_BUDGET_MS = 20_000;
const COLLECTION_EXTRACTION_MAX_ATTEMPTS = 2;
const COLLECTION_HARD_TIMEOUT_BUFFER_MS = 2 * 60_000;
const STATUS_POLL_INTERVAL_MS = 1_000;

/** 확장의 실제 순차 실행 예산에 결과 저장/메시지 왕복 여유를 더한 절대 상한. */
function collectionHardTimeoutMs(keywordCount: number): number {
  const perKeywordBudget =
    COLLECTION_NAVIGATION_BUDGET_MS
    + COLLECTION_EXTRACTION_BUDGET_MS * COLLECTION_EXTRACTION_MAX_ATTEMPTS;
  return perKeywordBudget * keywordCount + COLLECTION_HARD_TIMEOUT_BUFFER_MS;
}

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
  /** 확장이 처리 중인 키워드 위치. 진행 여부 판단에 쓴다. */
  currentKeywordIndex?: number;
  totalKeywords?: number;
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
    EXTENSION_START_TIMEOUT_MS,
  );
  if (!started?.success || !started.runId) {
    throw new TrendExtensionError(
      started?.status === 'verification_required' ? 'verification_required' : 'collection_failed',
      started?.error ?? '1688 Chrome 수집을 시작하지 못했습니다.',
      started?.runId ?? null,
    );
  }
  onRunStarted?.(started.runId);

  const hardDeadline = Date.now() + collectionHardTimeoutMs(normalizedKeywords.length);
  let stallDeadline = Date.now() + COLLECTION_STALL_TIMEOUT_MS;
  let lastProgressKey = '';
  let lastKeywordIndex = 0;
  let lastKeywordTotal = normalizedKeywords.length;

  while (Date.now() < hardDeadline && Date.now() < stallDeadline) {
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

    // 진행 신호(상태·키워드 인덱스·수집 건수)가 바뀌면 정체 타이머를 되돌린다.
    // 느리지만 전진 중인 수집을 실패로 만들지 않는다.
    const progressKey = [
      status.status ?? '',
      Number.isFinite(status.currentKeywordIndex) ? status.currentKeywordIndex : -1,
      Number.isFinite(status.collected) ? status.collected : -1,
    ].join(':');
    if (progressKey !== lastProgressKey) {
      lastProgressKey = progressKey;
      stallDeadline = Date.now() + COLLECTION_STALL_TIMEOUT_MS;
      if (Number.isFinite(status.currentKeywordIndex)) {
        lastKeywordIndex = status.currentKeywordIndex as number;
      }
      if (Number.isFinite(status.totalKeywords) && (status.totalKeywords as number) > 0) {
        lastKeywordTotal = status.totalKeywords as number;
      }
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
    `1688 수집이 더 진행되지 않아 중단했습니다 (${Math.min(lastKeywordIndex + 1, lastKeywordTotal)}/${lastKeywordTotal} 키워드에서 멈춤). `
    + '열린 1688 탭의 검증(슬라이더) 상태를 확인한 뒤 다시 실행해주세요.',
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
