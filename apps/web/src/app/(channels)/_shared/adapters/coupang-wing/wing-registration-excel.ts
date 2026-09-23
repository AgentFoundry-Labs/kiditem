import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';

// 쿠팡 WING "상품 일괄등록(엑셀)" V4.6 입력 모델과 서버 export transport.
//
// 쿠팡 Open API 를 쓰지 않고, 웹이 원본 양식과 reviewed 상품 payload를 서버에 보내
// wing.coupang.com 의 일괄등록 화면에 업로드할 엑셀을 받는다. 출고지/반품지/택배사는
// 업로드 폼에서 1회 설정하므로 엑셀 행에는 넣지 않는다.
//
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
  /** 바코드. 없으면 서버 converter가 기존 WING 사유 마커를 넣는다. */
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

/** 카테고리 선택과 분리된 기존 WING 상품 초안 기본값. */
export interface WingProductDraftDefaults {
  /** 상품고시정보 카테고리명 */
  noticeCategory: string;
  /** 그 고시 카테고리의 값1~ 기본값(모두 "상세페이지 참조" 등) */
  defaultNoticeValues: string[];
  /** 카테고리 필수/권장 검색옵션 기본값 */
  defaultSearchOptions?: WingOption[];
  /** 판매자 기본 브랜드 (실제 등록 상품 기준). */
  defaultBrand: string;
  /** 판매자 기본 제조사. */
  defaultMaker: string;
}

/**
 * 기존 상품 초안 기본값은 물총/워터건 등록값에서 시작했다.
 * 카테고리 코드는 이 객체가 소유하지 않으며 고정 카테고리 레지스트리에서 별도로 선택한다.
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
export const WING_PRODUCT_DRAFT_DEFAULTS: WingProductDraftDefaults = {
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
  // 엑셀 양식은 브랜드칸을 비울 수 없어 `노브랜드` 를 쓴다.
  // (단일 등록 경로는 확장이 `브랜드없음(또는 자체제작)` 체크박스를 대신 누른다)
  defaultBrand: '노브랜드',
  defaultMaker: '해피프랜즈',
};

/** 서버가 만든 WING 일괄등록 workbook을 받아 즉시 다운로드할 바이트로 돌려준다. */
export async function requestWingRegistrationWorkbook(
  templateBytes: ArrayBuffer | Uint8Array,
  products: WingProduct[],
  fileName?: string,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  if (products.length === 0) throw new Error('등록할 상품이 없습니다.');

  const formData = new FormData();
  formData.append(
    'template',
    new Blob([templateBytes as BlobPart], {
      type: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    }),
    'coupang-wing-bulk-template-v4.6.xlsm',
  );
  formData.append('products', JSON.stringify(products));
  if (fileName) formData.append('fileName', fileName);

  const response = await apiClient.fetchRaw('/api/channels/coupang-wing/registration-export', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Preserve the HTTP status when the server did not return JSON.
    }
    const record = body as Record<string, unknown> | null;
    const detail = typeof record?.message === 'string'
      ? record.message
      : 'WING 엑셀 생성에 실패했습니다.';
    throw new ApiError(response.status, typeof record?.error === 'string' ? record.error : null, detail);
  }

  const blob = await response.blob();
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    fileName: fileNameFromContentDisposition(response.headers.get('Content-Disposition'))
      ?? fileName
      ?? `쿠팡WING_일괄등록_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`,
  };
}

function fileNameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="([^"]+)"/i.exec(value)?.[1] ?? null;
}
