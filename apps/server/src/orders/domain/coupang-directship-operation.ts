import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { CoupangDirectOrderCollectionRequestSchema, type CoupangDirectCenter, type CoupangDirectPurchaseOrder } from '@kiditem/shared/coupang-direct-order';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import { COUPANG_DIRECTSHIP_CHUNK_KIND, CoupangDirectshipCaptureItemSchema } from '@kiditem/shared/orders-operations';

/** 보관·변환이 다루는 운송유형 무관 캡처(옛 attempt 캡처와 같은 모양). */
export type DirectshipCapture = {
  channelAccountId: string;
  centers: Record<string, CoupangDirectCenter>;
  pos: CoupangDirectPurchaseOrder[];
};

/**
 * `orders_capture` 청크를 캡처 하나로 모은다(KID-359). 항목은 발주서 하나 또는 센터표 하나이고 센터표는 정확히 하나다.
 * 발주서 순서는 청크·항목 순서 그대로다. 다른 청크 종류·형식이 틀린 항목·센터표 없음은 VALIDATION_FAILED.
 */
export function assembleDirectshipCapture(chunks: readonly OperationStagedChunk[], channelAccountId: string): DirectshipCapture {
  const pos: CoupangDirectPurchaseOrder[] = [];
  const centers: Array<Record<string, CoupangDirectCenter>> = [];
  for (const chunk of chunks) {
    if (chunk.chunkKind !== COUPANG_DIRECTSHIP_CHUNK_KIND) throw invalid('unknown_chunk_kind', { chunkKind: chunk.chunkKind });
    for (const raw of chunk.payload) {
      const parsed = CoupangDirectshipCaptureItemSchema.safeParse(raw);
      if (!parsed.success) {
        throw invalid('invalid_chunk_item', {
          chunkKind: chunk.chunkKind,
          errors: parsed.error.issues.slice(0, 20).map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        });
      }
      if ('purchaseOrder' in parsed.data) pos.push(parsed.data.purchaseOrder);
      else centers.push(parsed.data.centers);
    }
  }
  if (centers.length !== 1) throw invalid('coupang_direct_centers_missing', { centers: centers.length });
  return { channelAccountId, centers: centers[0]!, pos };
}

/** 운송유형과 무관한 캡처 모양을 검증한다(같은 (발주, SKU) 줄 두 번 등). 보관·투영은 유형별로 나중에. */
export function parseCapture(value: unknown): DirectshipCapture {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const parsed = CoupangDirectOrderCollectionRequestSchema.safeParse({ ...candidate, transport: 'SHIPMENT' });
  if (!parsed.success) {
    throw invalid('coupang_direct_capture_invalid', {
      errors: parsed.error.issues.slice(0, 20).map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
    });
  }
  const { transport: _transport, ...capture } = parsed.data;
  return capture;
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
