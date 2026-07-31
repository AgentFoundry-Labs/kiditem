import {
  BrowserCollectionSessionViewSchema,
  type BrowserCollectionProducer,
  type BrowserCollectionSessionView,
} from '@kiditem/shared/browser-collection-session';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import { syncBrowserCollectionAlert } from '@/lib/browser-collection-session';
import { sendToExtension } from '@/lib/extension-bridge';
import { KIDITEM_EXTENSION_MIN_VERSION } from '@/lib/extension-version';

export const READINESS_COLLECTION_PRODUCERS = {
  wing_sales: 'dashboard.wing_sales',
  coupang_ads: 'dashboard.coupang_ads',
  coupang_products: 'channels.coupang_catalog',
  wing_kpi: 'advertising.wing_rank',
} as const satisfies Record<string, BrowserCollectionProducer>;
// 통합 확장(kiditem-os)은 세 확장을 합치며 버전을 1.0.0 으로 리셋했다. 개별
// 기능 판정은 아래 ping capability 가 하고, 버전은 병합 이전 설치만 걸러낸다.
export const COUPANG_COLLECTION_EXTENSION_MIN_VERSION = KIDITEM_EXTENSION_MIN_VERSION;

const POLL_INTERVAL_MS = 2_000;
// The extension content-script watchdog is 30 minutes. Keep the web poller
// longer so a valid late response is not reported as a UI timeout first.
const AD_SYNC_MIN_TIMEOUT_MS = 35 * 60_000;

export function readinessCollectionTimeoutMs(
  producer: BrowserCollectionProducer,
  urlCount: number,
): number {
  const minimumTimeout =
    producer === 'advertising.ad_sync'
      ? AD_SYNC_MIN_TIMEOUT_MS
      : 5 * 60_000;
  return Math.max(minimumTimeout, Math.max(0, urlCount) * 240_000);
}

type StartResponse = {
  success?: boolean;
  error?: string;
  runId?: string;
};

type PingResponse = {
  success?: boolean;
  version?: string;
  capabilities?: { browserCollectionSessions?: boolean };
};

type AuthResponse = {
  success?: boolean;
  error?: string;
};

export type ReadinessExtensionCollectionInput = {
  check: ReadinessCheck;
  producer: BrowserCollectionProducer;
  extensionId: string;
  runId: string;
  accessToken: string | null | undefined;
  onStarted?: () => void;
  onPoll?: () => Promise<unknown> | unknown;
  onSession?: (session: BrowserCollectionSessionView) => void;
};

export async function assertCompatibleCoupangCollectionExtension(
  extensionId: string,
): Promise<void> {
  const ping = await sendToExtension<PingResponse>(extensionId, {
    action: 'ping',
  }).catch(() => null);
  if (
    !ping?.success ||
    !ping.capabilities?.browserCollectionSessions ||
    !isVersionAtLeast(ping.version, COUPANG_COLLECTION_EXTENSION_MIN_VERSION)
  ) {
    const installedVersion = ping?.version
      ? `설치 ${ping.version}, `
      : '';
    throw new Error(
      `KIDITEM 쿠팡 확장프로그램 버전이 오래되었습니다. (${installedVersion}필요 ${COUPANG_COLLECTION_EXTENSION_MIN_VERSION}+) chrome://extensions에서 새로고침해 주세요.`,
    );
  }
}

export function readinessCollectionProducer(
  key: string,
): BrowserCollectionProducer | null {
  return (
    READINESS_COLLECTION_PRODUCERS[
      key as keyof typeof READINESS_COLLECTION_PRODUCERS
    ] ?? null
  );
}

export async function runReadinessExtensionCollection({
  check,
  producer,
  extensionId,
  runId,
  accessToken,
  onStarted,
  onPoll,
  onSession,
}: ReadinessExtensionCollectionInput): Promise<BrowserCollectionSessionView> {
  const urls = check.scrapeUrls ?? [];
  if (urls.length === 0) throw new Error('수집 URL 없음');

  await assertCompatibleCoupangCollectionExtension(extensionId);

  if (accessToken) {
    const auth = await sendToExtension<AuthResponse>(extensionId, {
      action: 'setAuthToken',
      token: accessToken,
    });
    if (auth?.success === false) {
      throw new Error(
        auth.error ?? '확장프로그램에 KidItem 로그인을 연결하지 못했습니다.',
      );
    }
  }

  const started = await sendToExtension<StartResponse>(extensionId, {
    action: 'scrapeTargets',
    producer,
    runId,
    urls: urls.map((url, index) => ({
      id: `${check.key}-${index}`,
      url,
      label: check.label,
    })),
  });
  if (started?.success === false) {
    throw new Error(started.error ?? '익스텐션 수집 시작 실패');
  }
  if (started?.runId && started.runId !== runId) {
    throw new Error('익스텐션 수집 실행 ID가 일치하지 않습니다.');
  }
  onStarted?.();

  const deadline = Date.now() + readinessCollectionTimeoutMs(producer, urls.length);
  while (Date.now() <= deadline) {
    const pollStartedAt = Date.now();
    const [response] = await Promise.all([
      sendToExtension<unknown>(extensionId, {
        action: 'getCollectionSession',
        runId,
      }, POLL_INTERVAL_MS).catch(() => null),
      Promise.resolve()
        .then(() => onPoll?.())
        .catch((error) => {
          console.warn('[readiness] live refresh failed', error);
        }),
    ]);
    const parsed = BrowserCollectionSessionViewSchema.safeParse(response);
    if (parsed.success && parsed.data.runId === runId) {
      onSession?.(parsed.data);
      await syncBrowserCollectionAlert(parsed.data).catch((error) => {
        console.warn('[browser-collection] alert synchronization failed', error);
      });
    }
    if (
      parsed.success &&
      parsed.data.runId === runId &&
      parsed.data.status !== 'running'
    ) return parsed.data;
    await wait(Math.max(0, POLL_INTERVAL_MS - (Date.now() - pollStartedAt)));
  }

  throw new Error('브라우저 수집 상태 확인 시간이 초과되었습니다.');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isVersionAtLeast(
  current: string | undefined,
  minimum: string,
): boolean {
  if (!current) return false;
  const currentParts = current
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const size = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < size; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}
