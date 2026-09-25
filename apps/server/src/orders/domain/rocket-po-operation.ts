import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  COUPANG_ROCKET_PO_CHUNK_KIND,
  COUPANG_ROCKET_PO_SCAN_CHUNK_KIND,
  CoupangRocketPoChunkItemSchema,
  CoupangRocketPoScanSchema,
  type CoupangRocketPoPlan,
  type CoupangRocketPoScan,
} from '@kiditem/shared/orders-operations';
import type { RocketPoCatalogRow, RocketPoCollectionEvidence } from '@kiditem/shared/rocket-purchase-preview';
import type { z } from 'zod';

/**
 * 실행 청크를 발주 행과 목록 증거로 읽는다(KID-359). 이 kind의 청크는 `po_rows`·`po_scan` 둘뿐이고 증거는 정확히
 * 하나다. 발주서 항목의 행은 그 발주서 번호여야 하고, 같은 발주서가 두 번 오면 완결이 아니다.
 */
export function readRocketPoChunks(chunks: readonly OperationStagedChunk[]): { rows: RocketPoCatalogRow[]; scan: CoupangRocketPoScan } {
  const unknown = chunks.find((chunk) => chunk.chunkKind !== COUPANG_ROCKET_PO_CHUNK_KIND && chunk.chunkKind !== COUPANG_ROCKET_PO_SCAN_CHUNK_KIND);
  if (unknown) throw invalid('unknown_chunk_kind', { chunkKind: unknown.chunkKind });
  const scans = chunkItems(chunks, COUPANG_ROCKET_PO_SCAN_CHUNK_KIND, CoupangRocketPoScanSchema);
  if (scans.length !== 1) throw incomplete();
  const seen = new Set<string>();
  const rows: RocketPoCatalogRow[] = [];
  for (const item of chunkItems(chunks, COUPANG_ROCKET_PO_CHUNK_KIND, CoupangRocketPoChunkItemSchema)) {
    if (seen.has(item.poNumber) || item.rows.some((row) => row.poNumber !== item.poNumber)) throw incomplete();
    seen.add(item.poNumber);
    rows.push(...item.rows);
  }
  return { rows, scan: scans[0]! };
}

/**
 * 옛 완료 검증을 그대로 옮긴 완결 판정: 증거가 plan의 기간·상태·날짜 기준과 같고, 목록을 끝까지 읽었고(읽은 쪽 = 전체 쪽,
 * 1쪽 이상), 상세를 읽은 발주서 수가 행의 발주서 수와 같고, 행 ID가 겹치지 않고, 행이 있으면 모두 증거의 공급자이며,
 * 확정이 필요한 수집은 모든 행에 확정 정보·바코드가 있어야 한다. 통과하면 수집 증거(실행 ID = 수집 ID)와 행 ID 순 행.
 */
export function completeRocketPoCollection(input: {
  plan: CoupangRocketPoPlan;
  rows: readonly RocketPoCatalogRow[];
  scan: CoupangRocketPoScan;
  operationId: string;
}): { collection: RocketPoCollectionEvidence; rows: RocketPoCatalogRow[] } {
  const { plan, scan } = input;
  const rows = [...input.rows].sort((a, b) => a.poLineId.localeCompare(b.poLineId));
  if (
    scan.proof.from !== plan.from ||
    scan.proof.to !== plan.to ||
    scan.proof.status !== plan.status ||
    scan.proof.dateType !== plan.dateType
  ) {
    throw invalid('rocket_po_plan_mismatch', {});
  }
  if (
    scan.listPagesRead < 1 ||
    scan.listPagesRead !== scan.totalListPages ||
    scan.detailPoCount !== new Set(rows.map((row) => row.poNumber)).size ||
    new Set(rows.map((row) => row.poLineId)).size !== rows.length ||
    (rows.length > 0 && (!scan.vendorId || rows.some((row) => row.vendorId !== scan.vendorId))) ||
    (plan.requireConfirmation && rows.some((row) => !row.confirmation || !row.barcode))
  ) {
    throw incomplete();
  }
  return {
    collection: {
      collectionRunId: input.operationId,
      vendorId: scan.vendorId,
      listPagesRead: scan.listPagesRead,
      totalListPages: scan.totalListPages,
      truncated: false,
      detailPoCount: scan.detailPoCount,
      failedPoNumbers: [],
    },
    rows,
  };
}

/**
 * begin 때 고정한 공급자 기대값이 지금 계정과 같고, 행이 있으면 수집한 공급자가 모든 기대값과 같아야 한다(옛 규칙).
 * 아니면 VALIDATION_FAILED(`rocket_po_vendor_mismatch`).
 */
export function assertRocketPoVendor(input: {
  expectations: CoupangRocketPoPlan['vendorExpectations'];
  account: { vendorId: string | null; sharedVendorId: string | null | undefined };
  collectedVendorId: string;
  rowCount: number;
}): void {
  const { expectations, account } = input;
  const expected = [expectations.rocketVendorId, expectations.sharedCoupangVendorId, account.vendorId, account.sharedVendorId].filter(Boolean);
  if (
    (expectations.rocketVendorId && expectations.rocketVendorId !== account.vendorId) ||
    (expectations.sharedCoupangVendorId && expectations.sharedCoupangVendorId !== account.sharedVendorId) ||
    (input.rowCount > 0 && expected.some((vendor) => vendor !== input.collectedVendorId))
  ) {
    throw invalid('rocket_po_vendor_mismatch', {});
  }
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
          errors: parsed.error.issues.slice(0, 20).map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        });
      }
      items.push(parsed.data);
    }
  }
  return items;
}

function incomplete(): KiditemInvalidValueError {
  return invalid('rocket_po_collection_incomplete', {});
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
