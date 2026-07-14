import {
  BrowserCollectionSessionViewSchema,
  type BrowserCollectionProducer,
  type BrowserCollectionSessionView,
} from '@kiditem/shared/browser-collection-session';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import { syncBrowserCollectionAlert } from '@/lib/browser-collection-session';
import { sendToExtension } from '@/lib/extension-bridge';

export const READINESS_COLLECTION_PRODUCERS = {
  wing_sales: 'dashboard.wing_sales',
  rocket_sales: 'dashboard.rocket_sales',
  coupang_ads: 'dashboard.coupang_ads',
  coupang_products: 'dashboard.coupang_products',
  wing_kpi: 'dashboard.wing_kpi',
} as const satisfies Record<string, BrowserCollectionProducer>;

const POLL_INTERVAL_MS = 2_000;

type StartResponse = {
  success?: boolean;
  error?: string;
  runId?: string;
};

export type ReadinessExtensionCollectionInput = {
  check: ReadinessCheck;
  producer: BrowserCollectionProducer;
  extensionId: string;
  runId: string;
};

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
}: ReadinessExtensionCollectionInput): Promise<BrowserCollectionSessionView> {
  const urls = check.scrapeUrls ?? [];
  if (urls.length === 0) throw new Error('수집 URL 없음');

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

  const deadline = Date.now() + Math.max(5 * 60_000, urls.length * 240_000);
  while (Date.now() <= deadline) {
    const response = await sendToExtension<unknown>(extensionId, {
      action: 'getCollectionSession',
      runId,
    });
    const parsed = BrowserCollectionSessionViewSchema.safeParse(response);
    if (parsed.success && parsed.data.runId === runId) {
      await syncBrowserCollectionAlert(parsed.data).catch((error) => {
        console.warn('[browser-collection] alert synchronization failed', error);
      });
      if (parsed.data.status !== 'running') return parsed.data;
    }
    await wait(POLL_INTERVAL_MS);
  }

  throw new Error('브라우저 수집 상태 확인 시간이 초과되었습니다.');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
