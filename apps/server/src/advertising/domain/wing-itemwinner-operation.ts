import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { businessDateKey, kstBusinessDate } from '@kiditem/shared/common';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  WING_ITEMWINNER_CHUNK_KIND,
  WING_ITEMWINNER_PAGE_CHUNK_KIND,
  WingItemwinnerPageSchema,
  WingItemwinnerRowSchema,
  type WingItemwinnerKpis,
  type WingItemwinnerRow,
} from '@kiditem/shared/advertising-operations';
import type { z } from 'zod';

/**
 * `advertising.wing_itemwinner` 완결 판정(KID-362). Wing `getProductList`는 한 응답(최대 1,000개)이라 확장이
 * 행 청크와 응답 표식 {totalSize, observedAt} 하나를 올린다. 표식이 정확히 하나이고 행 수가 `totalSize`와 같고
 * vendorItemId가 겹치지 않아야 완결이다. 관측 시각의 KST 업무일이 plan의 업무일과 다르면 거절한다
 * (옛 `BUSINESS_DATE_CHANGED` — 자정을 넘긴 관측을 전날 행에 쓰지 않는다). 표식의 Wing 판매자 식별자가 plan의 것과
 * 다르면 거절한다(옛 `VENDOR_IDENTITY_MISMATCH`). 모두 VALIDATION_FAILED.
 */
export function completeWingItemwinner(
  chunks: readonly OperationStagedChunk[],
  plannedBusinessDate: string,
  plannedVendorId: string,
): { rows: WingItemwinnerRow[]; observedAt: string } {
  const unknown = chunks.find((chunk) => chunk.chunkKind !== WING_ITEMWINNER_CHUNK_KIND && chunk.chunkKind !== WING_ITEMWINNER_PAGE_CHUNK_KIND);
  if (unknown) throw invalid('unknown_chunk_kind', { chunkKind: unknown.chunkKind });
  const rows = chunkItems(chunks, WING_ITEMWINNER_CHUNK_KIND, WingItemwinnerRowSchema);
  const pages = chunkItems(chunks, WING_ITEMWINNER_PAGE_CHUNK_KIND, WingItemwinnerPageSchema);
  if (pages.length !== 1) throw invalid('itemwinner_incomplete', { pages: pages.length });
  const [page] = pages as [z.output<typeof WingItemwinnerPageSchema>];
  // 다른 Wing 계정으로 로그인한 세션이 읽은 목록을 이 계정에 쓰지 않는다(옛 VENDOR_IDENTITY_MISMATCH).
  if (page.vendorId !== plannedVendorId) {
    throw invalid('vendor_identity_mismatch', { plannedVendorId, observedVendorId: page.vendorId });
  }
  if (rows.length !== page.totalSize) throw invalid('itemwinner_incomplete', { totalSize: page.totalSize, rows: rows.length });
  if (new Set(rows.map((row) => row.vendorItemId)).size !== rows.length) throw invalid('itemwinner_duplicate_row', { rows: rows.length });
  const observedDate = businessDateKey(kstBusinessDate(new Date(page.observedAt)));
  if (observedDate !== plannedBusinessDate) {
    throw invalid('business_date_changed', { plannedBusinessDate, observedBusinessDate: observedDate });
  }
  return { rows, observedAt: page.observedAt };
}

/** 옛 확장 `itemwinnerKpis`: 노출제한이 먼저, 그다음 Wing 위너 상태. */
export function wingItemwinnerKpis(rows: readonly WingItemwinnerRow[]): WingItemwinnerKpis {
  const kpis: WingItemwinnerKpis = { winners: 0, suppressed: 0, losers: 0 };
  for (const row of rows) {
    if (row.suppressed) kpis.suppressed += 1;
    else if (row.providerWinnerStatus) kpis.winners += 1;
    else kpis.losers += 1;
  }
  return kpis;
}

function chunkItems<S extends z.ZodTypeAny>(chunks: readonly OperationStagedChunk[], chunkKind: string, schema: S): Array<z.output<S>> {
  const items: Array<z.output<S>> = [];
  for (const chunk of chunks) {
    if (chunk.chunkKind !== chunkKind) continue;
    for (const raw of chunk.payload) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw invalid('invalid_chunk_item', {
          chunkKind,
          errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        });
      }
      items.push(parsed.data);
    }
  }
  return items;
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
