import type { DataMigration } from '../types';

/**
 * 쿠팡 로켓 발주확정은 `ProductOption.barcode` 로 재고를 매칭한다. 그런데 상품에 바코드가
 * 비어 있으면 발주 행이 전부 미매칭 → 확정수량 0(품절)으로 내려간다.
 *
 * 셀피아 재고 스냅샷 아이템(`SellpiaStockSnapshotItem`)은 매칭된 상품(`productOptionId`)과
 * 상품 바코드를 함께 갖고 있다(쿠팡 발주 바코드 == 셀피아 바코드로 확인됨). 그 바코드를
 * "바코드가 비어 있는" 상품에 백필해, 로켓 발주확정이 기존 Inventory 경로 그대로 셀피아
 * 재고를 집을 수 있게 한다.
 *
 * 안전장치:
 *  - 이미 바코드가 있는 상품은 건드리지 않는다(`barcode IS NULL` 만 대상).
 *  - `product_options(organization_id, barcode)` 부분 유니크를 지키기 위해, 한 (조직, 바코드)에
 *    후보 상품이 2개 이상이거나 이미 그 바코드를 쓰는 상품이 있으면 건너뛴다.
 *  - 셀피아 아이템이 없는 환경에서는 후보 0건 → 무해한 no-op.
 */
export const backfillProductBarcodesFromSellpia: DataMigration = {
  id: 'v0.1.8:001_backfill_product_barcodes_from_sellpia',
  releaseVersion: '0.1.8',
  name: 'Backfill product option barcodes from Sellpia snapshots',
  async run(tx) {
    // 후보: 매칭된 셀피아 아이템의 바코드 → 바코드가 비어있는 상품 (상품당 최신 스냅샷 1건).
    const candidates = await tx.$queryRaw<
      Array<{ orgId: string; optionId: string; barcode: string }>
    >`
      SELECT DISTINCT ON (i.product_option_id)
             i.organization_id AS "orgId",
             i.product_option_id AS "optionId",
             i.barcode AS "barcode"
        FROM sellpia_stock_snapshot_items i
        JOIN product_options o
          ON o.id = i.product_option_id AND o.organization_id = i.organization_id
       WHERE i.product_option_id IS NOT NULL
         AND i.barcode IS NOT NULL AND i.barcode <> ''
         AND o.is_deleted = false
         AND o.barcode IS NULL
       ORDER BY i.product_option_id, i.created_at DESC
    `;

    // 이미 바코드를 쓰는 상품 (조직, 바코드) 집합 — 유니크 충돌 방지.
    const existing = await tx.$queryRaw<Array<{ orgId: string; barcode: string }>>`
      SELECT organization_id AS "orgId", barcode
        FROM product_options
       WHERE is_deleted = false AND barcode IS NOT NULL
    `;
    const usedKeys = new Set(existing.map((row) => `${row.orgId}::${row.barcode}`));

    // (조직, 바코드) 별 후보 수 — 2개 이상이면 어느 상품에 붙일지 모호하므로 모두 스킵.
    const keyCount = new Map<string, number>();
    for (const candidate of candidates) {
      const key = `${candidate.orgId}::${candidate.barcode}`;
      keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
    }

    let applied = 0;
    let skippedDuplicateBarcode = 0;
    let skippedAlreadyUsed = 0;
    const organizations = new Set<string>();

    for (const candidate of candidates) {
      const key = `${candidate.orgId}::${candidate.barcode}`;
      if (usedKeys.has(key)) {
        skippedAlreadyUsed += 1;
        continue;
      }
      if ((keyCount.get(key) ?? 0) > 1) {
        skippedDuplicateBarcode += 1;
        continue;
      }

      const updated = await tx.productOption.updateMany({
        where: {
          id: candidate.optionId,
          organizationId: candidate.orgId,
          barcode: null,
          isDeleted: false,
        },
        data: { barcode: candidate.barcode },
      });
      if (updated.count > 0) {
        applied += updated.count;
        usedKeys.add(key); // 같은 트랜잭션 내 같은 바코드 재사용 방지
        organizations.add(candidate.orgId);
      }
    }

    return {
      affectedRows: applied,
      details: {
        totalCandidates: candidates.length,
        applied,
        skippedDuplicateBarcode,
        skippedAlreadyUsed,
        organizationsAffected: organizations.size,
      },
    };
  },
};
