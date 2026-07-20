import * as XLSX from 'xlsx';

// 쿠팡 WING "상품 일괄등록(엑셀)" V4.6 생성기.
//
// 쿠팡 Open API 를 쓰지 않고, 확장이 wing.coupang.com 의 일괄등록 화면에 업로드할
// 엑셀을 만든다. 출고지/반품지/택배사는 업로드 폼에서 1회 설정하므로 엑셀 행에는 넣지 않는다.
//
// 양식은 "기본" 시트 117컬럼. 행1=컬럼명, 행2=필수/선택, 행3=설명, 행5부터 상품데이터.
// 상품 데이터는 sheet 기준 0-based 인덱스 4(=엑셀 5행)부터 채운다.
// 카탈로그 예제(coupang_sellertool_upload_example_V4.6.xlsm) 의 "기본" 시트를 base 로 받아,
// 헤더 4행을 보존하고 그 아래에 상품 행을 추가한다.

/** "기본" 시트 컬럼 인덱스 (0-based). V4.6 기준. */
export const WING_COL = {
  category: 0,
  name: 1,
  saleStart: 2,
  saleEnd: 3,
  status: 4,
  statusDesc: 5,
  brand: 6,
  maker: 7,
  searchKeyword: 8,
  /** 구매옵션 유형1=9, 값1=10 … 6쌍 (9~20) */
  purchaseOptStart: 9,
  purchaseOptCount: 6,
  /** 검색옵션 유형1=21, 값1=22 … 20쌍 (21~60) */
  searchOptStart: 21,
  searchOptCount: 20,
  price: 61,
  agencyFee: 62,
  origPrice: 63,
  stock: 64,
  leadTime: 65,
  maxPerPerson: 66,
  maxPeriod: 67,
  adult: 68,
  tax: 69,
  parallel: 70,
  overseas: 71,
  vendorCode: 72,
  model: 73,
  barcode: 74,
  orderMsg: 87,
  noticeCat: 88,
  /** 상품고시정보값1=89 … 값14 (89~102) */
  noticeValStart: 89,
  noticeValCount: 14,
  imgRep: 103,
  imgRect: 104,
  imgAddl: 105,
  imgUsed: 106,
  imgDup: 107,
  imgQuality: 108,
  detail: 109,
  /** 구비서류값1=110 … 값7 (110~116) */
  docStart: 110,
  docCount: 7,
  total: 117,
} as const;

const BASE_SHEET = '기본';
/** 데이터 시작 행: 엑셀 5행 = 0-based 인덱스 4. */
const DATA_START_ROW = 4;
/** 바코드가 없는 상품에 쓰는 쿠팡 "바코드 없음" 사유 마커(카테고리별로 다를 수 있어 기본값 제공). */
export const DEFAULT_NO_BARCODE_REASON =
  '[바코드없음]온라인 판매를 위한 소규모 상품(자가제작 등)이며, 향후에도 대량 유통 계획이 없습니다.';

export interface WingOption {
  /** 옵션유형 (예: 색상, 사이즈) */
  type: string;
  /** 옵션값 (예: 빨강, L) */
  value: string;
}

/** 하나의 SKU = 엑셀 한 행. 같은 상품의 옵션 조합마다 1개. */
export interface WingVariant {
  /** 구매옵션(최대 6). 단일옵션 상품은 [] 또는 1개. */
  purchaseOptions: WingOption[];
  /** 판매가격(원, 최소 10원 단위) */
  salePrice: number;
  /** 할인율기준가(원). 없으면 salePrice 사용 */
  origPrice?: number;
  /** 재고수량 */
  stock: number;
  /** 바코드. 없으면 DEFAULT_NO_BARCODE_REASON 마커 사용 */
  barcode?: string;
  /** 대표(옵션)이미지 URL */
  representativeImageUrl: string;
  /** 업체상품코드(자체관리코드) */
  vendorItemCode?: string;
  /** 모델번호 */
  model?: string;
}

export interface WingProduct {
  /** 카테고리 셀 값: "[displayCategoryCode] 대>중>소" 형식 */
  categoryCell: string;
  /** 노출상품명 — 구매자에게 보이는 이름. 쿠팡 기준에 맞게 변경될 수 있다. 최대 100자. */
  productName: string;
  /**
   * 등록상품명(판매자관리용) — 노출상품명과 별개인 판매자 내부 관리용 이름. 최대 100자.
   * 라이브 실측: 노출상품명 `선인장 딸깍 키링 1p 휴대용 열쇠고리...` 에 대해
   * 등록상품명은 셀피아 원본명 `3000선인장딸깍키링` 이 들어간다.
   */
  sellerProductName?: string;
  /** 브랜드명 (없으면 '노브랜드' 등 카테고리 정책에 맞게) */
  brand: string;
  /** 제조사 */
  maker: string;
  /** 검색어 (쉼표 구분 or 공백) */
  searchKeyword?: string;
  /** 검색옵션(카테고리별 필수/선택 속성). 최대 20 */
  searchOptions?: WingOption[];
  /** 추가이미지 URL 목록 */
  additionalImageUrls?: string[];
  /** 상세설명(상세페이지 이미지 URL) */
  /** 상세설명 이미지들(순서 유지, 쿠팡 상한 9장). */
  detailImageUrls?: string[];
  /** 상품고시정보 카테고리명 (예: "기타 재화") */
  noticeCategory: string;
  /** 상품고시정보값1~14 */
  noticeValues?: string[];
  /** SKU 목록(옵션 조합마다 1행). 최소 1개 */
  variants: WingVariant[];
}

/** 카테고리별 프리셋(대표 카테고리 확정용). */
export interface WingCategoryPreset {
  /** "[코드] 경로" */
  categoryCell: string;
  /** 상품고시정보 카테고리명 */
  noticeCategory: string;
  /** 그 고시 카테고리의 값1~ 기본값(모두 "상세페이지 참조" 등) */
  defaultNoticeValues: string[];
  /**
   * 카테고리 필수 구매옵션 유형(각 SKU 가 반드시 채워야 함).
   * 물총 = ['색상','수량']. 단일 상품은 '단품' 한 옵션으로도 등록 가능.
   */
  requiredPurchaseOptionTypes: string[];
  /** 카테고리 필수/권장 검색옵션 기본값 */
  defaultSearchOptions?: WingOption[];
  /** 판매자 기본 브랜드 (실제 등록 상품 기준). */
  defaultBrand: string;
  /** 판매자 기본 제조사. */
  defaultMaker: string;
}

/**
 * 대표 완구 카테고리 = 물총. 사용자 기존 상품(물총/워터건) 기준으로 확정.
 * 쿠팡 "전체 카테고리 입력정보"(V4.6) 에서 확인:
 *  - 코드/경로: [77390] 완구/취미>스포츠/야외완구>물총
 *  - 필수 구매옵션: 색상, 수량(개)
 *  - 검색옵션(구성품·용량·캐릭터·물총발사 방식 등)은 전부 선택
 *  - 상품고시정보 카테고리 = "어린이제품"(실제 등록 상품 기준. 완구는 어린이제품 고시)
 *  - 브랜드=노브랜드, 제조사=해피프랜즈
 *
 * 브랜드/제조사는 라이브 실측(WING vendorInventoryId=16290876620, 판매중)으로 정정했다.
 * 실제 등록 상품은 브랜드칸을 비우고 `브랜드없음(또는 자체제작)` 을 체크한 뒤
 * **제조사에 `해피프랜즈`** 를 넣는다. 이전 값(브랜드=해피프랜즈, 제조사=kiditem)은
 * 두 필드가 뒤바뀐 것이었고, 그 탓에 브랜드명이 카탈로그 검색창까지 흘러간 사고가 있었다.
 */
export const WING_TOY_WATERGUN_PRESET: WingCategoryPreset = {
  categoryCell: '[77390] 완구/취미>스포츠/야외완구>물총',
  noticeCategory: '어린이제품',
  // "어린이제품" 고시 필드(제품명/KC인증/사용연령/제조자/제조국/취급주의/품질보증/AS 등) 기본값.
  defaultNoticeValues: [
    '상세페이지 참조',
    '상세정보 별도표기',
    '전체 연령',
    '상세페이지 참조',
    '중국',
    '상세페이지 참조',
    '상세페이지 참조',
  ],
  requiredPurchaseOptionTypes: ['색상', '수량'],
  // 엑셀 양식은 브랜드칸을 비울 수 없어 `노브랜드` 를 쓴다.
  // (단일 등록 경로는 확장이 `브랜드없음(또는 자체제작)` 체크박스를 대신 누른다)
  defaultBrand: '노브랜드',
  defaultMaker: '해피프랜즈',
};

function emptyRow(): string[] {
  return new Array(WING_COL.total).fill('');
}

/** WingProduct 를 엑셀 행 배열(변형별 1행)로 변환. */
export function buildProductRows(product: WingProduct): string[][] {
  if (product.variants.length === 0) {
    throw new Error(`상품 "${product.productName}" 에 variant(SKU) 가 없습니다.`);
  }
  return product.variants.map((variant) => {
    const row = emptyRow();
    row[WING_COL.category] = product.categoryCell;
    row[WING_COL.name] = product.productName;
    row[WING_COL.brand] = product.brand;
    row[WING_COL.maker] = product.maker || product.brand;
    if (product.searchKeyword) row[WING_COL.searchKeyword] = product.searchKeyword;

    variant.purchaseOptions.slice(0, WING_COL.purchaseOptCount).forEach((opt, i) => {
      row[WING_COL.purchaseOptStart + i * 2] = opt.type;
      row[WING_COL.purchaseOptStart + i * 2 + 1] = opt.value;
    });
    (product.searchOptions ?? []).slice(0, WING_COL.searchOptCount).forEach((opt, i) => {
      row[WING_COL.searchOptStart + i * 2] = opt.type;
      row[WING_COL.searchOptStart + i * 2 + 1] = opt.value;
    });

    row[WING_COL.price] = String(variant.salePrice);
    row[WING_COL.origPrice] = String(variant.origPrice ?? variant.salePrice);
    row[WING_COL.stock] = String(variant.stock);
    row[WING_COL.adult] = 'N';
    row[WING_COL.tax] = 'Y';
    row[WING_COL.parallel] = 'N';
    if (variant.vendorItemCode) row[WING_COL.vendorCode] = variant.vendorItemCode;
    if (variant.model) row[WING_COL.model] = variant.model;
    row[WING_COL.barcode] = variant.barcode || DEFAULT_NO_BARCODE_REASON;

    row[WING_COL.noticeCat] = product.noticeCategory;
    (product.noticeValues ?? []).slice(0, WING_COL.noticeValCount).forEach((val, i) => {
      row[WING_COL.noticeValStart + i] = val;
    });

    row[WING_COL.imgRep] = variant.representativeImageUrl;
    if (product.additionalImageUrls?.length) {
      row[WING_COL.imgAddl] = product.additionalImageUrls.join(',');
    }
    // 엑셀 양식은 상세 이미지 1칸이라 첫 장만 넣는다(확장 직접등록은 전량 업로드).
    if (product.detailImageUrls?.length) row[WING_COL.detail] = product.detailImageUrls[0];

    return row;
  });
}

/** 로드된 "기본" 시트 헤더가 V4.6 레이아웃과 맞는지 검증. */
function assertBaseSheetLayout(headerRow: string[]): void {
  const checks: Array<[number, string]> = [
    [WING_COL.category, '카테고리'],
    [WING_COL.name, '등록상품명'],
    [WING_COL.brand, '브랜드'],
    [WING_COL.price, '판매가격'],
    [WING_COL.stock, '재고수량'],
    [WING_COL.barcode, '바코드'],
    [WING_COL.noticeCat, '상품고시정보 카테고리'],
    [WING_COL.detail, '상세 설명'],
  ];
  for (const [idx, expected] of checks) {
    const actual = String(headerRow[idx] ?? '').trim();
    if (actual !== expected) {
      throw new Error(
        `WING 양식 레이아웃 불일치: 컬럼 ${idx} 는 "${expected}" 여야 하는데 "${actual}" 입니다. 양식 버전이 바뀌었는지 확인하세요.`,
      );
    }
  }
}

/**
 * WING 일괄등록 엑셀 생성.
 * @param templateBytes 예제/양식 파일(V4.6, .xlsm 또는 .xlsx) 바이트
 * @param products 등록할 상품들
 * @returns 업로드용 xlsx 바이트 (Uint8Array)
 */
export function buildWingRegistrationWorkbook(
  templateBytes: ArrayBuffer | Uint8Array,
  products: WingProduct[],
): Uint8Array {
  if (products.length === 0) throw new Error('등록할 상품이 없습니다.');

  const wb = XLSX.read(templateBytes, { type: 'array' });
  const ws = wb.Sheets[BASE_SHEET];
  if (!ws) throw new Error(`양식에 "${BASE_SHEET}" 시트가 없습니다.`);

  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false });
  assertBaseSheetLayout(grid[1] ?? []);

  const dataRows = products.flatMap((product) => buildProductRows(product));
  XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: DATA_START_ROW });

  // 예제 카테고리 시트("1. 패션잡화" 등)는 예시 상품이 들어있어 업로드에 방해되므로 제거.
  const keep = new Set([BASE_SHEET, 'hidden', 'env']);
  const out = XLSX.utils.book_new();
  for (const name of wb.SheetNames) {
    if (keep.has(name)) XLSX.utils.book_append_sheet(out, wb.Sheets[name], name);
  }

  return XLSX.write(out, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
