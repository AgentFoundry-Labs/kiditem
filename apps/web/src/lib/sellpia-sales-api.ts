import { apiClient } from '@/lib/api-client';
import {
  SellpiaSalesSummarySchema,
  SellpiaSalesIngestResultSchema,
  type SellpiaSalesSummary,
  type SellpiaSalesIngestPayload,
  type SellpiaSalesIngestResult,
} from '@kiditem/shared/dashboard';

// Sellpia 판매현황(몰별 매출) 백엔드 read/ingest 래퍼.

// 느린/지연 백엔드에서 무한 대기하지 않도록 타임아웃을 건다. 초과 시 throw →
// React Query 가 재시도(백오프)한다. 기간 전환 시 한 요청이 지연돼도 카드가 멈추지 않는다.
const FETCH_TIMEOUT_MS = 12_000;

export async function fetchSellpiaSalesSummary(params?: {
  from?: string;
  to?: string;
}): Promise<SellpiaSalesSummary> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const qs = query.toString();
  const path = `/api/sellpia-sales${qs ? `?${qs}` : ''}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await apiClient.fetchRaw(path, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`판매현황 조회 실패 (HTTP ${res.status})`);
    }
    return SellpiaSalesSummarySchema.parse(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}

export async function ingestSellpiaSales(
  payload: SellpiaSalesIngestPayload,
): Promise<SellpiaSalesIngestResult> {
  const raw = await apiClient.post<unknown>('/api/sellpia-sales/ingest', payload);
  return SellpiaSalesIngestResultSchema.parse(raw);
}
