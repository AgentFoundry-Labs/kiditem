import {
  SellpiaSalesIngestPayloadSchema,
  type SellpiaSalesIngestPayload,
} from '@kiditem/shared/dashboard';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';

// Sellpia 판매현황(sale_summary) 몰별 매출 수집 브릿지.
// 확장이 셀피아 로그인 세션으로 스크랩 → 웹앱이 payload 를 백엔드로 POST(sellpia-sales-api).
// 확장은 백엔드로 직접 전송하지 않는다(인증/전송은 웹앱 소유).

interface CollectResponse {
  success?: boolean;
  payload?: unknown;
  sellerCount?: number;
  error?: string;
}

interface CacheResponse {
  success?: boolean;
  cache?: {
    organizationId: string;
    payload: unknown;
    capturedAt: number;
  } | null;
  error?: string;
}

interface ActionResponse {
  success?: boolean;
  error?: string;
}

const REQUIRED_CAPABILITY = 'collectSellpiaSaleSummaryAuthoritativeV1';

async function detectExtensionId(): Promise<string> {
  const exact = await detectOrderCollectionExtensionId(1200, REQUIRED_CAPABILITY);
  if (exact) return exact;
  throw new Error(
    '안전한 판매현황 수집 기능이 필요합니다. extensions/order-collector 0.1.78 이상을 Chrome 에서 새로고침하고 kiditem.sellpia.com 에 로그인한 뒤 다시 시도해주세요.',
  );
}

// 확장을 통해 셀피아 판매현황을 즉시 스크랩한다. (수동 새로고침 / 마운트 시 동기화)
export async function collectSellpiaSaleSummaryFromExtension(opts: {
  startDate?: string;
  endDate?: string;
  organizationId: string;
}): Promise<SellpiaSalesIngestPayload> {
  if (!opts.organizationId) {
    throw new Error('판매현황을 저장할 조직 정보가 없습니다. 다시 로그인해주세요.');
  }
  const extensionId = await detectExtensionId();
  const res = await sendToExtension<CollectResponse>(
    extensionId,
    {
      action: 'collectSellpiaSaleSummary',
      startDate: opts.startDate,
      endDate: opts.endDate,
      organizationId: opts.organizationId,
    },
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
  const payload = isRecord(res.payload)
    ? {
        ...res.payload,
        capturedAt: res.payload.capturedAt ?? new Date().toISOString(),
      }
    : res.payload;
  const parsed = SellpiaSalesIngestPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('셀피아 판매현황 응답 형식이 올바르지 않습니다. 확장프로그램을 새로고침해주세요.');
  }
  return parsed.data;
}

// 매일 자동수집 알람이 캐시해둔 payload 를 읽는다(없으면 null).
export async function readSellpiaSalesCacheFromExtension(
  organizationId: string,
): Promise<{
  payload: SellpiaSalesIngestPayload;
  capturedAt: number;
} | null> {
  if (!organizationId) {
    throw new Error('판매현황 캐시를 확인할 조직 정보가 없습니다.');
  }
  const extensionId = await detectExtensionId();
  const res = await sendToExtension<CacheResponse>(
    extensionId,
    { action: 'getSellpiaSalesCache', organizationId },
    8000,
  );
  if (!res?.success) {
    throw new Error(res?.error ?? '셀피아 판매현황 캐시를 읽지 못했습니다.');
  }
  if (!res.cache) return null;
  if (res.cache.organizationId !== organizationId) {
    throw new Error('다른 조직의 판매현황 캐시는 사용할 수 없습니다.');
  }
  const capturedAt = new Date(res.cache.capturedAt);
  if (
    !Number.isFinite(res.cache.capturedAt) ||
    Number.isNaN(capturedAt.getTime())
  ) {
    throw new Error('셀피아 판매현황 캐시 형식이 올바르지 않습니다.');
  }
  const payload = isRecord(res.cache.payload)
    ? { ...res.cache.payload, capturedAt: capturedAt.toISOString() }
    : res.cache.payload;
  const parsed = SellpiaSalesIngestPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('셀피아 판매현황 캐시 형식이 올바르지 않습니다.');
  }
  return {
    payload: parsed.data,
    capturedAt: res.cache.capturedAt,
  };
}

export async function clearSellpiaSalesCacheFromExtension(
  organizationId: string,
): Promise<void> {
  if (!organizationId) {
    throw new Error('판매현황 캐시를 정리할 조직 정보가 없습니다.');
  }
  const extensionId = await detectExtensionId();
  const res = await sendToExtension<ActionResponse>(
    extensionId,
    { action: 'clearSellpiaSalesCache', organizationId },
    8000,
  );
  if (!res?.success) {
    throw new Error(res?.error ?? '셀피아 판매현황 캐시를 정리하지 못했습니다.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
