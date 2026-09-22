import { describe, expect, it, vi } from 'vitest';
import { InventorySkuSnapshotSummarySchema } from '@kiditem/shared/inventory';
import { ProductSourceSnapshotController } from './product-source-snapshot.controller';
import type { ProductSourceSnapshotSummary } from '../../../application/port/in/product-source-snapshot.port';

/**
 * 이 API 의 공개 계약은 `InventorySkuSnapshotSummarySchema` 다.
 *
 * Products 는 안에서 마스터를 '상품'이라 부르지만(ADR-0017), 그 이름을 그대로 내보내면 읽는
 * 쪽이 Zod 에서 깨진다. 그것도 조용히 깨져서, 쇼핑몰 현황 맨 위 셀피아 네 칸이 숫자 대신
 * '—' 로 서고 "아직 가져오지 않았습니다" 라고 적는다 — 가져왔는데도(라이브 2026-09-22).
 */
const OWNER_SUMMARY: ProductSourceSnapshotSummary = {
  totalProducts: 3849,
  linkedProducts: 1090,
  unlinkedProducts: 2759,
  inStockProducts: 898,
  outOfStockProducts: 2951,
  totalUnits: 1223860,
  pricedAssetValue: 550627851,
  unpricedProductCount: 0,
};

function controllerWith(summary: ProductSourceSnapshotSummary) {
  const snapshots = {
    listSnapshot: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 1, summary, latestImport: null }),
    listSnapshotForExport: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 1, summary, latestImport: null }),
    getSnapshot: vi.fn(),
    listImportRuns: vi.fn(),
  };
  return {
    snapshots,
    controller: new ProductSourceSnapshotController(
      snapshots as never,
      { export: vi.fn() } as never,
    ),
  };
}

describe('ProductSourceSnapshotController', () => {
  it('⭐ 목록 요약을 공개 계약의 이름으로 내보낸다', async () => {
    const { controller } = controllerWith(OWNER_SUMMARY);
    const result = await controller.listSnapshot('org-1', {} as never);

    // 깨지면 화면이 빈 칸이 된다 — 스키마가 통과해야 숫자가 뜬다.
    expect(() => InventorySkuSnapshotSummarySchema.parse(result.summary)).not.toThrow();
    expect(result.summary).toEqual({
      totalSkus: 3849,
      linkedSkus: 1090,
      unlinkedSkus: 2759,
      inStockSkus: 898,
      outOfStockSkus: 2951,
      totalUnits: 1223860,
      pricedAssetValue: 550627851,
      unpricedSkuCount: 0,
    });
  });

  it('출력용 스냅샷도 같은 이름을 쓴다 — 두 길이 갈라지면 한쪽만 깨진다', async () => {
    const { controller } = controllerWith(OWNER_SUMMARY);
    const result = await controller.exportSnapshotRead('org-1', {} as never);
    expect(() => InventorySkuSnapshotSummarySchema.parse(result.summary)).not.toThrow();
  });

  it('소유자 이름을 그대로 내보내면 계약이 거절한다 — 이 테스트가 지키는 것', () => {
    expect(() => InventorySkuSnapshotSummarySchema.parse(OWNER_SUMMARY)).toThrow();
  });
});
