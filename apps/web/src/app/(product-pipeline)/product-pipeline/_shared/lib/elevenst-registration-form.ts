import type { MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 11번가 셀러오피스 **신규 상품등록**.
 *
 * ⚠️ 11번가는 화면이 둘이다. 사이드바의 `상품등록` 은 옛 화면(`ProductReg.tmall`,
 * 테이블 폼)이고 `신규상품 등록` 은 새 Vue 화면이다. **필드가 전혀 다르다.**
 * 우리는 새 화면을 채운다(라이브 실측 2026-09-10).
 *
 * 여섯 몰을 붙이고 나서 이 몰만 다른 것 셋:
 *
 *  1. **폼이 iframe 안에 있다.** 겉은 셀러오피스 껍데기고 실제 화면은
 *     `/pages/product-reg/index.html` 이다.
 *  2. **분류가 방아쇠다.** 고르기 전에는 상품정보 제공고시 블록이 숨어 있다.
 *  3. **분류 경로 구분자가 공백 없는 `>`** 다 — `문구/사무용품>디자인/팬시용품>기능성 팬시`.
 *     올웨이즈(` > `)와 다르니 그대로 옮기면 못 찾는다.
 */

/** 신규 상품등록 메뉴. 셀러오피스는 메뉴를 번호로 연다. */
export const ELEVENST_REGISTER_URL = 'https://soffice.11st.co.kr/view/123124025';

/** 분류 경로 구분자. 검색 결과 버튼의 글자가 이 모양이다. */
export const ELEVENST_CATEGORY_JOINER = '>';

/** 상품명 상한. 옛 화면은 200byte 였지만 새 화면은 100자다. */
export const ELEVENST_NAME_MAX = 100;

/** 상품정보 제공고시 유형. 실측 등록물이 `기타 재화` 였고 티처몰과 같은 선택이다. */
export const ELEVENST_NOTICE_TYPE = '891045';

/** 판매기간. 목록에서 **보이는 글자**로 고른다. 실측 등록물이 3년이었다. */
export const ELEVENST_SALE_PERIOD = '3년';

/** 재고수량. 다른 몰과 같은 값을 쓴다. */
export const ELEVENST_STOCK = 999;

export interface ElevenstRegistrationOptions {
  /** 상품명 뒤에 붙는 수량. 실측 `1p`. */
  quantity?: number;
  /** 권장 소비자가. 없으면 원본 상품명 앞의 숫자에서 읽는다. */
  consumerPrice?: number;
  /** 분류 경로. `대>중>소` 를 `>` 로 잇는다. 코드가 아니라 이름이다. */
  categoryPath?: string;
  /** 배송정보 템플릿 이름. 화면 목록에 있는 글자 그대로. */
  deliveryTemplate?: string;
}

export interface ElevenstRegistrationForm {
  url: string;
  /** iframe 안 Vue 앱의 뿌리. 확장이 이걸로 프레임을 가려낸다. */
  formId: '#app.l-content--product';
  /** 블록 id + 행 제목으로 찾는 칸들. */
  rowFields: {
    productName: string;
    promoText: string;
    salePrice: string;
    consumerPrice: string;
    stock: string;
    sellerPrdCd: string;
  };
  /** 목록에서 보이는 글자로 고르는 것들. */
  rowOptions: { salePeriod: string; deliveryTemplate: string };
  /** 진짜 id 를 가진 칸. 분류를 고른 뒤라야 보인다. */
  selectorFields: { noticeType: string };
  /** 브랜드가 필수라 '없음'으로 통과시킨다. */
  selectorChecks: { noBrand: boolean };
  /** 분류 경로. 단계 이름 배열이다. */
  categoryPaths: string[][];
  /** 대표 한 장, 추가 최대 세 장. */
  imageGroups: { representative: string[]; additional: string[] };
  /** 상세설명 이미지. 확장이 주소를 만들어 HTML 로 넣는다. */
  detailUploads: { url: string }[];
  manualSteps: string[];
}

/**
 * 11번가 상품명.
 *
 * 실측 등록물이 `할로윈 LED 거미줄 1p 불빛 장식` 인데, **티처몰 상품명과 글자까지
 * 같다.** 접두어가 없고 소비자가를 떼고 수량이 중간에 들어간다. 그래서 티처몰과
 * 같은 규칙을 쓰되 상한만 100자로 자른다.
 */
export function buildElevenstProductName(
  name: string,
  keywords: readonly string[],
  quantity: number,
): string {
  const base = name.trim().replace(/^\d+\s*/, '') || name.trim();
  const full = [base, `${quantity}p`, ...keywords.slice(0, 3)]
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return full.length > ELEVENST_NAME_MAX ? full.slice(0, ELEVENST_NAME_MAX).trim() : full;
}

/**
 * 권장 소비자가.
 *
 * 우리 원본명(`3500킬러볼스피너키링`)이 앞에 소비자가를 달고 있다. 그 숫자가
 * 판매가보다 작거나 없으면 화면에 이상한 할인율이 찍히므로 판매가를 쓴다.
 */
export function elevenstConsumerPrice(displayName: string, salePrice: number): number {
  const matched = /^(\d+)/.exec(displayName.trim());
  const parsed = matched ? Number.parseInt(matched[1]!, 10) : 0;
  return parsed >= salePrice && parsed > 0 ? parsed : salePrice;
}

/** `대>중>소` → 단계 이름 배열. 빈 단계는 버린다. 공백을 넣어 써도 받는다. */
export function parseElevenstCategory(raw: string): string[] {
  return raw.split('>').map((part) => part.trim()).filter(Boolean);
}

export function elevenstFormFromDraft(
  draft: MallProductDraft,
  options: ElevenstRegistrationOptions = {},
): ElevenstRegistrationForm {
  const variant = draft.variants[0];
  if (!variant) {
    throw new Error(`"${draft.displayName}" 에 옵션(SKU)이 없어 11번가 폼을 만들 수 없습니다.`);
  }
  const quantity = options.quantity ?? 1;
  const salePrice = Math.max(0, Math.round(variant.salePrice));
  const consumerPrice = options.consumerPrice && options.consumerPrice > 0
    ? Math.round(options.consumerPrice)
    : elevenstConsumerPrice(draft.displayName, salePrice);
  const categoryPath = parseElevenstCategory(options.categoryPath ?? '');
  const promoText = draft.promoText?.trim() || draft.keywords[0] || '';
  // 추가 이미지는 세 칸뿐이다. 넘치면 넣지 않고 몇 장이 남았는지 알린다.
  const additional = draft.additionalImageUrls.filter(Boolean);

  const manualSteps: string[] = [];
  if (categoryPath.length === 0) {
    manualSteps.push('분류를 고르지 않았습니다. `대>중>소` 이름으로 넣으세요. 등록 후에는 바꾸기 어렵습니다.');
  }
  if (!draft.representativeImageUrl) manualSteps.push('대표 이미지가 없습니다.');
  if (additional.length > 3) {
    manualSteps.push(`추가 이미지가 ${additional.length}장인데 칸이 셋뿐이라 앞의 셋만 넣습니다.`);
  }
  if (draft.detailImageUrls.length === 0) {
    manualSteps.push('상세설명 이미지가 없습니다. 상품 생성에서 상세페이지를 먼저 확정하세요.');
  }
  manualSteps.push('상품명 클린체크를 눌러 통과시켜야 등록됩니다. 이건 사람이 눌러야 합니다.');
  manualSteps.push('광고(포커스클릭·리스팅광고)는 건드리지 않습니다. 켜면 셀러캐시에서 돈이 나갑니다.');
  manualSteps.push('값이 맞는지 확인하세요. 폼만 채웠고 [등록]은 누르지 않았습니다.');

  return {
    url: ELEVENST_REGISTER_URL,
    formId: '#app.l-content--product',
    rowFields: {
      productName: buildElevenstProductName(draft.displayName, draft.keywords, quantity),
      // 홍보문구는 28자다. 저장된 몰별 override를 우선하고 넘치면 비운다.
      promoText: promoText.length <= 28 ? promoText : '',
      salePrice: String(salePrice),
      consumerPrice: String(consumerPrice),
      stock: String(ELEVENST_STOCK),
      sellerPrdCd: variant.sellerSku ?? '',
    },
    rowOptions: {
      salePeriod: ELEVENST_SALE_PERIOD,
      deliveryTemplate: options.deliveryTemplate?.trim() ?? '',
    },
    selectorFields: { noticeType: ELEVENST_NOTICE_TYPE },
    selectorChecks: { noBrand: true },
    categoryPaths: categoryPath.length > 0 ? [categoryPath] : [],
    imageGroups: {
      representative: draft.representativeImageUrl ? [draft.representativeImageUrl] : [],
      additional: additional.slice(0, 3),
    },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    manualSteps,
  };
}
