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
  // 판매자가 멈춘 것(떠리몰 판매설정 판매중지). 품절 · 미노출과 달리 판매자가 판매 재개로 푼다. 쿠팡 원문 `판매중지` 는
  // 단종으로 접히므로 글자를 따로 둔다 — 칸은 이 글자를 "판매중지"로 적는다.
  stopped: '일시중지',
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
  /*
    온채널: 한 칸에 판매상태(판매중 · 판매중지)와 재고상태(품절 · 일시품절 · 단종)가 함께 온다
    (라이브 2026-09-17: `판매중 / 일시품절`). 끝난 것(단종)이 먼저고, 그다음이 멈춘 것,
    마지막이 팔리는 것이다 — 두 글자가 같이 오면 더 나쁜 쪽이 그 상품의 상태다.
  */
  // 꼬망세: 노출/판매 칸 한 개 — 판매중 · 판매종료(라이브 2026-09-18).
  kkomangse: [
    ['판매종료', MALL_ADMIN_LISTING_STATUS.ended],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  onch: [
    ['단종', MALL_ADMIN_LISTING_STATUS.ended],
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['일시품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['판매중지', MALL_ADMIN_LISTING_STATUS.hidden],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  // 올웨이즈: 목록 API 의 soldOut 한 칸 — 품절 · 판매중(라이브 2026-09-19).
  always: [
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  /*
    아트공구(카페24): 상품목록 줄의 판매상태(판매함 · 판매안함)와 진열상태(진열함 · 진열안함)가 따로 온다
    (라이브 2026-09-19: 판매함 455 · 판매안함 95 · 진열함 294 · 진열안함 256). 카페24 판매안함은 진열된 채
    품절로 보이고, 우리 품절 송신도 판매안함이다. 진열안함은 몰에서 안 보인다.
  */
  art09: [
    ['판매안함', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['진열안함', MALL_ADMIN_LISTING_STATUS.hidden],
    ['판매함', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  /*
    떠리몰(샵바이): 승인상태 · 판매설정 · 판매상태 · 품절 여부가 따로 온다(라이브 2026-09-19, 479개: 판매가능 판매중 44 ·
    판매중지 356 · 재고 품절 50 · 판매금지 23 · 승인거부 6). 몰이 막은 것(승인거부 · 판매금지)이 먼저고, 끝난 것,
    판매자가 멈춘 것, 재고 품절, 판매 전 순이다.
  */
  thirtymall: [
    ['승인거부', MALL_ADMIN_LISTING_STATUS.rejected],
    ['판매금지', MALL_ADMIN_LISTING_STATUS.held],
    ['승인대기', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['판매종료', MALL_ADMIN_LISTING_STATUS.ended],
    ['판매중지', MALL_ADMIN_LISTING_STATUS.stopped],
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['판매대기', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  /*
    도매꾹: 진행상태(진행중 · 기간종료 · 승인대기)와 진열(진열함 · 진열안함)이 따로 온다(라이브 2026-09-19, 493개: 진행중 435 ·
    기간종료 57 · 승인대기 1, 진열안함 139). 우리 품절 송신이 진열안함이라 진열안함은 품절이다.
  */
  domeggook: [
    ['승인대기', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['기간종료', MALL_ADMIN_LISTING_STATUS.ended],
    ['진열안함', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['진행중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  // 키즈노트: 상태 칸 하나 — 정상 · 품절 · 숨김(라이브 2026-09-19, 1,107개: 497 · 325 · 285). 숨김은 사장님이 숨긴 것이다.
  kidsnote: [
    ['숨김', MALL_ADMIN_LISTING_STATUS.hidden],
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['정상', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  /*
    11번가: 판매상태 코드 표 그대로(목록 화면 select, 라이브 2026-09-19: 판매중 363 · 품절 4 · 판매중지 514 · 판매금지 19).
    우리 품절 송신이 판매중지다.
  */
  '11st': [
    ['승인거부', MALL_ADMIN_LISTING_STATUS.rejected],
    ['판매금지', MALL_ADMIN_LISTING_STATUS.held],
    ['승인대기', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['판매종료', MALL_ADMIN_LISTING_STATUS.ended],
    ['판매중지', MALL_ADMIN_LISTING_STATUS.stopped],
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['전시전', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  /*
    지마켓 · 옥션(ESM): 판매상태 코드 01 등록대기 · 11 판매가능 · 21 판매중지 · 22 판매불가 · 31 SKU품절(목록 화면의 칸 수로
    맞춤, 라이브 2026-09-19). 판매불가는 몰이 막은 것이고, 우리 품절 송신이 판매중지다.
  */
  gmarket: [
    ['판매불가', MALL_ADMIN_LISTING_STATUS.held],
    ['등록대기', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['판매중지', MALL_ADMIN_LISTING_STATUS.stopped],
    ['SKU품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  auction: [
    ['판매불가', MALL_ADMIN_LISTING_STATUS.held],
    ['등록대기', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['판매중지', MALL_ADMIN_LISTING_STATUS.stopped],
    ['SKU품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  // 카카오 톡스토어: 판매상태(판매중 · 판매중지 · 품절 · 판매금지)와 전시(전시함 · 전시안함)(라이브 2026-09-19, 386개).
  kakao: [
    ['판매금지', MALL_ADMIN_LISTING_STATUS.held],
    ['판매종료', MALL_ADMIN_LISTING_STATUS.ended],
    ['판매중지', MALL_ADMIN_LISTING_STATUS.stopped],
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['전시안함', MALL_ADMIN_LISTING_STATUS.hidden],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  // 롯데ON: 판매상태 코드 SALE 판매중 · SOUT 품절 · STP 판매중지 · END 판매종료(상품 조회 칸 그대로).
  'lotte-on': [
    ['판매종료', MALL_ADMIN_LISTING_STATUS.ended],
    ['판매중지', MALL_ADMIN_LISTING_STATUS.stopped],
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  // 스마트스토어: 원상품 판매상태(productStatusType). 우리 품절 송신이 판매중지다.
  smartstore: [
    ['승인거부', MALL_ADMIN_LISTING_STATUS.rejected],
    ['판매금지', MALL_ADMIN_LISTING_STATUS.held],
    ['승인대기', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['판매종료', MALL_ADMIN_LISTING_STATUS.ended],
    ['삭제', MALL_ADMIN_LISTING_STATUS.ended],
    ['판매중지', MALL_ADMIN_LISTING_STATUS.stopped],
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['판매대기', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['판매중', MALL_ADMIN_LISTING_STATUS.selling],
  ],
  // 티쳐몰(퍼스트몰): 승인(승인 · 미승인)과 상태(정상 · 품절 · 재고확보중 · 판매중지). 우리 품절 송신은 재고 0 이다.
  'teacher-mall': [
    ['미승인', MALL_ADMIN_LISTING_STATUS.awaitingApproval],
    ['판매중지', MALL_ADMIN_LISTING_STATUS.stopped],
    ['품절', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['재고확보중', MALL_ADMIN_LISTING_STATUS.soldOut],
    ['정상', MALL_ADMIN_LISTING_STATUS.selling],
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
  /** 몰 목록에 사진이 있으면 그 주소. 없는 몰은 null. */
  imageUrl: string | null;
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
    imageUrl: row.imageUrl ?? null,
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
/**
 * 다른 번호로 이미 이어진 리스팅이 있으면 그 번호를 쓴다 — 사방넷이 ESM 사이트번호만, 스마트스토어 원상품번호로 준 상품은
 * 그 번호의 리스팅에 레시피가 붙어 있다. `existing` 은 이 몰 계정에 이미 있는 리스팅의 외부 ID 다. 자기 번호가 이미 있으면
 * 그대로 두고, 다른 줄의 번호나 이미 고른 번호는 고르지 않는다.
 */
export function resolveMallAdminRowCodes(
  rows: readonly MallAdminListingRow[],
  existing: ReadonlySet<string>,
): MallAdminListingRow[] {
  const primary = new Set(rows.map((row) => row.mallProductCode));
  const taken = new Set<string>();
  return rows.map(({ alternateCodes, ...row }) => {
    const alternate = existing.has(row.mallProductCode)
      ? undefined
      : (alternateCodes ?? []).find((code) => existing.has(code) && !primary.has(code) && !taken.has(code));
    const mallProductCode = alternate ?? row.mallProductCode;
    taken.add(mallProductCode);
    return { ...row, mallProductCode };
  });
}

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
