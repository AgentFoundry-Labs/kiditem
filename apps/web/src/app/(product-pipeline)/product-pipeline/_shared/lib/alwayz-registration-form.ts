import type { MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 올웨이즈 판매자센터 상품등록.
 *
 * 값과 규칙은 **실제 등록된 상품에서 읽어온 것**이다(라이브 실측 2026-09-10,
 * `[키드아이템] 2500 우탄이 말랑 주물럭 1P`).
 *
 * 지금까지의 몰과 근본적으로 다르다.
 *  1. **폼이 없다.** React 화면이고 이름 있는 칸은 `keyword` 하나뿐이라 전부
 *     선택자로 잡는다. 값도 프로토타입 setter 로 넣어야 React 가 알아챈다.
 *  2. **가격이 둘이다.** 개별구매가와 팀구매가가 따로다(실측 2,500 / 1,800).
 *     팀구매가가 이 몰의 대표 가격인데 우리 데이터에 없어 사람이 정한다.
 *  3. **위지윅 에디터가 없다.** 상세설명도 이미지 파일이다 — 숨은 파일 칸 셋에
 *     대표·추가·상세를 각각 넣는다.
 *  4. **분류를 검색해서 고른다.** 목록이 미리 실려 있어 요청이 나가지 않는다.
 */

export const ALWAYZ_REGISTER_URL = 'https://alwayzseller.ilevit.com/items/registrations';

/** 상품명 접두어. 실측 그대로. */
export const ALWAYZ_NAME_PREFIX = '[키드아이템]';

/** 옵션이 없는 상품의 표기. 실측 상품이 옵션명·세부옵션 모두 `단품` 이었다. */
export const ALWAYZ_SINGLE_OPTION = '단품';

/** 택배사. **이름이 곧 값**이다 — 수정 화면의 숫자 코드와 다르다. */
export const ALWAYZ_SHIPPING_COMPANY = 'CJ대한통운';

export interface AlwayzRegistrationOptions {
  /** 상품명 뒤에 붙는 수량. 실측 `1P`. */
  quantity?: number;
  /** 팀구매가. 이 몰의 대표 가격이고 우리 데이터에 없다. */
  teamPrice?: number;
  /**
   * 분류 경로. `대분류 > 중분류 > 소분류` 를 `>` 로 잇는다.
   * 코드가 아니라 이름이고, 마지막 단 이름으로 검색해서 고른다.
   */
  categoryPath?: string;
}

export interface AlwayzRegistrationForm {
  url: string;
  /** 이 화면에는 폼 요소가 없다. 확장이 `body` 를 기준점으로 쓴다. */
  formId: 'body';
  /** 이름 없는 칸들. 확장이 선택자로 찾아 넣는다. */
  selectorFields: {
    productName: string;
    optionName: string;
    optionDetail: string;
    individualPrice: string;
    teamPrice: string;
    keyword: string;
    shippingCompany: string;
  };
  /** 분류 경로. 단계 이름 배열이다. */
  categoryPaths: string[][];
  /** 파일 칸 키 → 넣을 이미지 주소들. */
  imageGroups: { representative: string[]; additional: string[]; detail: string[] };
  manualSteps: string[];
}

/**
 * 올웨이즈 상품명.
 *
 * 실측: `[키드아이템] 2500 우탄이 말랑 주물럭 1P`
 * 접두어 + 원본명 + 수량이다.
 *
 * ⭐ 도매꾹·아트공구와 달리 **소비자가 접두어를 떼지 않는다.** 실측 상품명이 그
 * 숫자를 그대로 달고 있다. 몰마다 상품명 규칙이 다르다는 증거가 또 하나다.
 */
export function buildAlwayzProductName(name: string, quantity: number): string {
  return [ALWAYZ_NAME_PREFIX, name.trim(), `${quantity}P`]
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `대분류 > 중분류 > 소분류` → 단계 이름 배열. 빈 단계는 버린다. */
export function parseAlwayzCategory(raw: string): string[] {
  return raw.split('>').map((part) => part.trim()).filter(Boolean);
}

export function alwayzFormFromDraft(
  draft: MallProductDraft,
  options: AlwayzRegistrationOptions = {},
): AlwayzRegistrationForm {
  const variant = draft.variants[0];
  if (!variant) {
    throw new Error(`"${draft.displayName}" 에 옵션(SKU)이 없어 올웨이즈 폼을 만들 수 없습니다.`);
  }
  const quantity = options.quantity ?? 1;
  const individualPrice = Math.max(0, Math.round(variant.salePrice));
  const categoryPath = parseAlwayzCategory(options.categoryPath ?? '');

  const manualSteps: string[] = [];
  if (options.teamPrice === undefined || options.teamPrice <= 0) {
    manualSteps.push('팀구매가가 비어 있습니다. 이 몰의 대표 가격이라 반드시 넣어야 합니다.');
  }
  if (categoryPath.length === 0) {
    manualSteps.push('분류를 고르지 않았습니다. `대분류 > 중분류 > 소분류` 이름으로 넣으세요.');
  }
  if (!draft.representativeImageUrl) manualSteps.push('대표이미지가 없습니다.');
  if (draft.detailImageUrls.length === 0) {
    manualSteps.push('상세설명 이미지가 없습니다. 상품 생성에서 상세페이지를 먼저 확정하세요.');
  }
  manualSteps.push('재고·배송비·반품 안내는 화면 기본값입니다. 상품마다 다르면 바꾸세요.');
  manualSteps.push('값이 맞는지 확인한 뒤 화면에서 직접 등록하세요. 자동 제출하지 않습니다.');

  return {
    url: ALWAYZ_REGISTER_URL,
    formId: 'body',
    selectorFields: {
      productName: buildAlwayzProductName(draft.displayName, quantity),
      optionName: ALWAYZ_SINGLE_OPTION,
      optionDetail: ALWAYZ_SINGLE_OPTION,
      individualPrice: String(individualPrice),
      teamPrice: options.teamPrice && options.teamPrice > 0 ? String(Math.round(options.teamPrice)) : '',
      // 이 몰은 키워드 칸이 하나다. 콤마로 잇는다.
      keyword: draft.keywords.join(','),
      shippingCompany: ALWAYZ_SHIPPING_COMPANY,
    },
    categoryPaths: categoryPath.length > 0 ? [categoryPath] : [],
    imageGroups: {
      representative: draft.representativeImageUrl ? [draft.representativeImageUrl] : [],
      additional: draft.additionalImageUrls.filter(Boolean),
      detail: draft.detailImageUrls.filter(Boolean),
    },
    manualSteps,
  };
}
