import {
  MALL_ADMIN_LISTING_READERS,
  MALL_ADMIN_LISTINGS_SOURCE_TYPE,
  type MallAdminListingMallKey,
  type MallAdminListingRow,
  type MallAdminListingsPlan,
  type MallAdminListingsSubmission,
} from '@kiditem/shared/mall-admin-listings';

/**
 * 몰 관리자 화면에서 읽은 상품 목록 → 몰 리스팅(KID-246 2단계).
 *
 * 상품 한 줄이 리스팅 하나이고, 이 몰들은 옵션을 목록에 따로 적지 않으므로 옵션도 몰
 * 상품코드 한 줄이다. 몰에 적어 둔 셀피아 상품 이름은 옵션 이름에 둔다 — 기존 이름 매칭이
 * 옵션 이름만으로도 셀피아 SKU 이름과 맞춰 본다. 수량은 몰 상품명의 `1p` · `[12개]` 가 정한다.
 *
 * 몰의 자체코드 칸에 셀피아 코드를 심어 둔 상품은 그 값을 옵션 `sellerSku` 에 둔다. 사방넷이
 * `모델명`으로 하던 것과 같은 자리라, 이름을 거치지 않고 코드로 정확히 이어진다.
 */

/**
 * 몰이 직접 준 상태를 우리 글자로 접은 것. `mall-listing-state` 가 이 글자를 매트릭스
 * 상태로 한 번 더 접는다.
 */
export const MALL_ADMIN_LISTING_STATUS = {
  selling: '판매중',
  soldOut: '품절',
  hidden: '미노출',
  held: '보류',
  awaitingApproval: '승인대기',
  ended: '판매종료',
  rejected: '반려',
} as const;
export type MallAdminListingStatus =
  (typeof MALL_ADMIN_LISTING_STATUS)[keyof typeof MALL_ADMIN_LISTING_STATUS];

/**
 * 몰마다 화면 글자 → 우리 글자. 위에서부터 처음 맞는 규칙이 이긴다 — 심사 · 보류처럼 사람이
 * 먼저 봐야 하는 상태가 앞선다. 어느 규칙에도 맞지 않으면 몰 글자를 그대로 두고, 매트릭스는
 * 그 값을 '확인필요'로 둔다.
 */
const STATUS_RULES: Record<
  MallAdminListingMallKey,
  ReadonlyArray<readonly [word: string, status: MallAdminListingStatus]>
> = {
  // 키드키즈: 상품리스트 다운로드의 품절여부 한 칸이 상태를 다 담는다 —
  // 정상 · 일시품절 · 영구품절 · 보류(라이브 실측 2026-09-17: 555 · 927 · 1,318 · 678).
  kidkids: [
    ['보류', MALL_ADMIN_LISTING_STATUS.held],
    ['영구품절', MALL_ADMIN_LISTING_STATUS.ended],
    ['일시품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['정상', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  // 아이스크림몰: 판매상태(판매중 · 품절 · 판매종료 · 승인대기 · 반려)와 전시여부(전시 · 전시안함).
  'icecream-mall': [
    ['판매종료', MALL_ADMIN_LISTING_STATUS.ended],
    ['반려', MALL_ADMIN_LISTING_STATUS.rejected],
    ['승인대기', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['전시안함', MALL_ADMIN_LISTING_STATUS.hidden],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
};

/**
 * 몰 화면 글자를 우리 글자로. 맞는 규칙이 없으면 몰 글자를 ` · ` 로 이어 그대로 둔다
 * (발행 결과의 상태 칸이 20자다).
 */
export function mallAdminListingStatus(
  mallKey: MallAdminListingMallKey,
  words: readonly string[],
): string {
  const present = new Set(words);
  const rule = STATUS_RULES[mallKey].find(([word]) => present.has(word));
  return rule ? rule[1] : words.join(' · ').slice(0, 20);
}

export type MallAdminListingOption = {
  externalOptionId: string;
  optionName: string | null;
  salePrice: number | null;
  /** 몰에 심어 둔 셀피아 코드. 기존 자동 매칭이 이 칸을 셀피아 SKU 코드와 맞춘다. */
  sellerSku: string | null;
  barcode: null;
  modelNumber: null;
  skuStatus: string;
  attributes: Record<string, never>;
  raw: Record<string, unknown>;
};

export type MallAdminListingProduct = {
  externalProductId: string;
  registeredName: string;
  displayName: string;
  category: null;
  manufacturer: null;
  brand: null;
  productStatus: string;
  raw: Record<string, unknown>;
  options: MallAdminListingOption[];
};

export type MallAdminSubmissionProblem =
  | 'plan_fence_lost'
  | 'incomplete_pages'
  | 'incomplete_records'
  | 'row_count_mismatch'
  | 'detail_count_mismatch'
  | 'duplicate_code';

/**
 * 제출이 그 몰의 상품 목록 전체인지. 아니면 그 이유.
 *
 * 없어진 리스팅을 끄는 것은 완전한 스냅샷만 할 수 있다 — 한 쪽만 빠져도 그 쪽의 상품이
 * 몰에서 내려간 것으로 보인다.
 */
export function mallAdminSubmissionProblem(
  plan: MallAdminListingsPlan,
  runId: string,
  submission: MallAdminListingsSubmission,
): MallAdminSubmissionProblem | null {
  const { collection, proof, rows } = submission;
  if (
    collection.collectionRunId !== runId
    || proof.mallKey !== plan.mallKey
    || proof.pageSize !== plan.pageSize
  ) return 'plan_fence_lost';
  const expectedPages = Math.max(1, Math.ceil(collection.totalRecords / plan.pageSize));
  if (collection.totalPages !== expectedPages || collection.pagesRead !== collection.totalPages) {
    return 'incomplete_pages';
  }
  if (collection.recordsRead !== collection.totalRecords) return 'incomplete_records';
  if (rows.length !== collection.recordsRead) return 'row_count_mismatch';
  const detailed = collection.detailsRead + collection.detailsMissing;
  if (detailed !== (MALL_ADMIN_LISTING_READERS[plan.mallKey].detailNames ? rows.length : 0)) {
    return 'detail_count_mismatch';
  }
  if (new Set(rows.map((row) => row.mallProductCode)).size !== rows.length) return 'duplicate_code';
  return null;
}

function productFromRow(
  mallKey: MallAdminListingMallKey,
  row: MallAdminListingRow,
): MallAdminListingProduct {
  const status = mallAdminListingStatus(mallKey, row.statusWords);
  const provenance = {
    mallKey,
    statusWords: row.statusWords,
    sellpiaName: row.sellpiaName,
    sellerCode: row.sellerCode,
    registeredOn: row.registeredOn,
  };
  return {
    externalProductId: row.mallProductCode,
    registeredName: row.productName,
    displayName: row.productName,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: status,
    raw: { source: MALL_ADMIN_LISTINGS_SOURCE_TYPE, ...provenance },
    options: [
      {
        externalOptionId: row.mallProductCode,
        optionName: row.sellpiaName,
        salePrice: row.salePrice,
        sellerSku: row.sellerCode,
        barcode: null,
        modelNumber: null,
        skuStatus: status,
        attributes: {},
        raw: provenance,
      },
    ],
  };
}

/** 발행할 리스팅. 몰 상품코드 순서로 정렬한다. */
export function mallAdminListingProducts(
  plan: MallAdminListingsPlan,
  rows: readonly MallAdminListingRow[],
): MallAdminListingProduct[] {
  return [...rows]
    .sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode))
    .map((row) => productFromRow(plan.mallKey, row));
}

/** 우리 상태 글자별 상품 수. */
export function mallAdminStatusCounts(
  products: readonly MallAdminListingProduct[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const product of products) {
    counts[product.productStatus] = (counts[product.productStatus] ?? 0) + 1;
  }
  return counts;
}
