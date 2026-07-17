import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import type { SellpiaSalesIngestPayload } from '@kiditem/shared/dashboard';

// Sellpia 판매현황(sale_summary) 몰별 매출 수집 브릿지.
// 확장이 셀피아 로그인 세션으로 스크랩 → 웹앱이 payload 를 백엔드로 POST(sellpia-sales-api).
// 확장은 백엔드로 직접 전송하지 않는다(인증/전송은 웹앱 소유).

interface CollectResponse {
  success?: boolean;
  payload?: SellpiaSalesIngestPayload;
  sellerCount?: number;
  error?: string;
}

interface CacheResponse {
  success?: boolean;
  cache?: { payload: SellpiaSalesIngestPayload; capturedAt: number } | null;
  error?: string;
}

const REQUIRED_CAPABILITY = 'collectSellpiaSaleSummary';

async function detectExtensionId(): Promise<string> {
  const exact = await detectOrderCollectionExtensionId(1200, REQUIRED_CAPABILITY);
  if (exact) return exact;
  const compatible = await detectOrderCollectionExtensionId();
  if (compatible) return compatible;
  throw new Error(
    '주문수집 확장프로그램을 찾지 못했습니다. extensions/order-collector 를 Chrome 에 로드/새로고침하고 kiditem.sellpia.com 에 로그인한 뒤 다시 시도해주세요.',
  );
}

// 확장을 통해 셀피아 판매현황을 즉시 스크랩한다. (수동 새로고침 / 마운트 시 동기화)
export async function collectSellpiaSaleSummaryFromExtension(opts?: {
  startDate?: string;
  endDate?: string;
}): Promise<SellpiaSalesIngestPayload> {
  const extensionId = await detectExtensionId();
  const res = await sendToExtension<CollectResponse>(
    extensionId,
    { action: 'collectSellpiaSaleSummary', startDate: opts?.startDate, endDate: opts?.endDate },
    90000,
  );
  if (!res) {
    throw new Error(
      '확장이 판매현황 수집에 응답하지 않았습니다. Chrome 확장 관리에서 order-collector 를 새로고침해주세요.',
    );
  }
  if (!res.success || !res.payload) {
    throw new Error(res.error ?? '셀피아 판매현황 수집에 실패했습니다.');
  }
  return res.payload;
}

// 매일 자동수집 알람이 캐시해둔 payload 를 읽는다(없으면 null).
export async function readSellpiaSalesCacheFromExtension(): Promise<{
  payload: SellpiaSalesIngestPayload;
  capturedAt: number;
} | null> {
  const extensionId = await detectExtensionId();
  const res = await sendToExtension<CacheResponse>(
    extensionId,
    { action: 'getSellpiaSalesCache' },
    8000,
  );
  return res?.cache ?? null;
}

export async function clearSellpiaSalesCacheFromExtension(): Promise<void> {
  const extensionId = await detectExtensionId();
  await sendToExtension(extensionId, { action: 'clearSellpiaSalesCache' }, 8000);
}
