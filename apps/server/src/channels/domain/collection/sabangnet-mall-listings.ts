import {
  SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
  type SabangnetMallListingRow,
  type SabangnetMallListingsPlan,
  type SabangnetMallListingsScan,
} from '@kiditem/shared/sabangnet-mall-listings';

/**
 * 사방넷 송신 기록 → 몰 리스팅(KID-246).
 *
 * 송신 기록 한 줄이 리스팅 하나다. 몰 상품코드가 리스팅의 외부 ID이고, 사방넷은 옵션을
 * 몰에 따로 알리지 않으므로 옵션도 몰 상품코드 한 줄이다. 사방넷 모델명은 셀피아 재고
 * SKU 코드와 같아서 옵션의 `sellerSku` 에 둔다 — 기존 자동 매칭이 그 칸을 SKU 코드와
 * 맞춘다.
 */

/** 리스팅 · 옵션 상태 앞에 붙는 말. 몰이 준 상태가 아니라 사방넷 기준이라는 표시다. */
export const SABANGNET_STATUS_PREFIX = '사방넷 ';

export type SabangnetListingOption = {
  externalOptionId: string;
  optionName: string | null;
  salePrice: number | null;
  sellerSku: string | null;
  barcode: string | null;
  modelNumber: string | null;
  skuStatus: string | null;
  attributes: Record<string, never>;
  raw: Record<string, unknown>;
};

export type SabangnetListingProduct = {
  externalProductId: string;
  registeredName: string | null;
  displayName: string | null;
  category: null;
  manufacturer: null;
  brand: null;
  productStatus: string;
  raw: Record<string, unknown>;
  options: SabangnetListingOption[];
};

export type SabangnetSubmissionProblem =
  | 'plan_fence_lost'
  | 'incomplete_pages'
  | 'incomplete_records'
  | 'row_count_mismatch'
  | 'unplanned_shop'
  | 'planned_shop_skipped'
  | 'duplicate_send';

/**
 * 제출이 사방넷 송신 기록 전체인지. 아니면 그 이유.
 *
 * 없어진 리스팅을 끄는 것은 완전한 스냅샷만 할 수 있다 — 한 페이지만 빠져도 그 페이지의
 * 상품이 몰에서 내려간 것으로 보인다.
 */
export function sabangnetSubmissionProblem(
  plan: SabangnetMallListingsPlan,
  scan: SabangnetMallListingsScan,
  rows: readonly SabangnetMallListingRow[],
): SabangnetSubmissionProblem | null {
  const { collection, proof } = scan;
  if (
    proof.dateFrom !== plan.dateFrom
    || proof.dateTo !== plan.dateTo
    || proof.pageSize !== plan.pageSize
  ) return 'plan_fence_lost';
  const expectedPages = Math.max(1, Math.ceil(collection.totalRecords / plan.pageSize));
  if (
    collection.truncated
    || collection.totalPages !== expectedPages
    || collection.pagesRead !== collection.totalPages
  ) return 'incomplete_pages';
  if (collection.recordsRead !== collection.totalRecords) return 'incomplete_records';
  const skipped = Object.values(collection.skippedByShop).reduce((sum, count) => sum + count, 0);
  if (rows.length + skipped + collection.missingMallCode !== collection.recordsRead) {
    return 'row_count_mismatch';
  }
  const planned = new Set(plan.malls.flatMap((mall) => mall.sabangnetShopIds));
  if (rows.some((row) => !planned.has(row.sabangnetShopId))) return 'unplanned_shop';
  if (Object.keys(collection.skippedByShop).some((shopId) => planned.has(shopId))) {
    return 'planned_shop_skipped';
  }
  if (new Set(rows.map((row) => row.sendSerial)).size !== rows.length) return 'duplicate_send';
  return null;
}

/** 8~14자리 숫자일 때만 바코드다. 사방넷 자체상품코드에는 바코드 뒤에 글자가 붙기도 한다. */
export function barcodeFromOwnCode(ownProductCode: string | null): string | null {
  return ownProductCode && /^\d{8,14}$/.test(ownProductCode) ? ownProductCode : null;
}

function newer(left: SabangnetMallListingRow, right: SabangnetMallListingRow): boolean {
  const leftSent = left.firstSentAt ?? '';
  const rightSent = right.firstSentAt ?? '';
  if (leftSent !== rightSent) return leftSent > rightSent;
  return BigInt(left.sendSerial) > BigInt(right.sendSerial);
}

function productFromRow(row: SabangnetMallListingRow): SabangnetListingProduct {
  const status = `${SABANGNET_STATUS_PREFIX}${row.supplyStatus}`;
  const provenance = {
    sendSerial: row.sendSerial,
    sabangnetShopId: row.sabangnetShopId,
    sabangnetProductNo: row.sabangnetProductNo,
    modelName: row.modelName,
    ownProductCode: row.ownProductCode,
    firstSentAt: row.firstSentAt,
  };
  return {
    externalProductId: row.mallProductCode,
    registeredName: row.productName,
    displayName: row.productName,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: status,
    raw: { source: SABANGNET_MALL_LISTINGS_SOURCE_TYPE, ...provenance },
    options: [
      {
        externalOptionId: row.mallProductCode,
        optionName: row.productName,
        salePrice: row.salePrice,
        sellerSku: row.modelName,
        barcode: barcodeFromOwnCode(row.ownProductCode),
        modelNumber: null,
        skuStatus: status,
        attributes: {},
        raw: provenance,
      },
    ],
  };
}

/**
 * 몰 계정 행마다 발행할 리스팅. 한 몰에 같은 몰 상품코드가 두 번 오면(11번가 구 · 신처럼
 * 사방넷 쇼핑몰이 둘인 몰) 가장 최근에 보낸 기록을 쓴다. 외부 ID 순서로 정렬한다.
 */
export function sabangnetListingsByAccount(
  plan: SabangnetMallListingsPlan,
  rows: readonly SabangnetMallListingRow[],
): Map<string, SabangnetListingProduct[]> {
  const byAccount = new Map<string, SabangnetListingProduct[]>();
  for (const mall of plan.malls) {
    const shops = new Set(mall.sabangnetShopIds);
    const latest = new Map<string, SabangnetMallListingRow>();
    for (const row of rows) {
      if (!shops.has(row.sabangnetShopId)) continue;
      const current = latest.get(row.mallProductCode);
      if (!current || newer(row, current)) latest.set(row.mallProductCode, row);
    }
    byAccount.set(
      mall.channelAccountId,
      [...latest.values()]
        .sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode))
        .map(productFromRow),
    );
  }
  return byAccount;
}
