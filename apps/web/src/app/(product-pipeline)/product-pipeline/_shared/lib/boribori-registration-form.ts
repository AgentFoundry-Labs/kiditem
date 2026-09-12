import { type MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 보리보리(셀러클럽 · TRICYCLE) 상품등록.
 *
 * 실측 2026-09-11. 등록물 **업체상품코드 `435316017`**
 * (`킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리`)을 읽고 신규 등록 화면과 대조했다.
 * 상세는 `docs/superpowers/2026-09-11-boribori-product-register-research.md`.
 *
 * 이 몰만 다른 것 넷:
 *
 *  1. **한 백오피스에 몰이 둘이다** — 하프클럽(`1`)과 보리보리(`2`). 화면은 **하프클럽으로
 *     열린다.** 우리는 보리보리만 쓰므로 `siteCd` 를 먼저 `2` 로 바꾼다.
 *  2. **⭐ 사이트가 분류의 방아쇠다.** 하프클럽이면 1단이 패션 17개(여성의류…), 보리보리면
 *     유아동·완구·문구 39개로 **통째로 바뀐다.** 사이트를 안 바꾸면 우리 분류가 아예 없다.
 *  3. **`<form>` 밖에 칸이 있다.** 다만 `name` 은 전부 있어 선택자로 바로 닿는다.
 *  4. **등록이 네 단계다** — 코드생성 → 상품정보생성 → 상세정보 → 승인요청.
 *     상세설명·고시·원산지는 **상품정보를 저장한 뒤에야** 열린다. 확장은 저장을 누르지
 *     않으므로 1단계까지만 채우고 나머지는 사람에게 넘긴다.
 */

/** 신규 등록 화면. 메뉴 `A101. 상품등록` 이 여는 주소다(직접 열어도 뜬다). */
export const BORIBORI_REGISTER_URL =
  'https://seller-club.co.kr/product/productRegisterDetail';

/**
 * 사이트 코드. `1` 하프클럽 · `2` 보리보리.
 *
 * ⚠️ 화면이 `1` 로 열린다. 이 값을 먼저 바꿔야 분류 목록이 보리보리 것으로 갈린다.
 */
export const BORIBORI_SITE_CODE = '2';

/** 담당 MD. 협력사에 MD 가 없으면 상품을 만들 수 없다고 화면이 못박는다. */
export const BORIBORI_MD_NO = '118003';

/** 마진율. 실측 등록물이 18 이었다. */
export const BORIBORI_MARGIN_RATE = 18;

/** 재고. 우리 표준이고 실측 등록물도 999 였다. */
export const BORIBORI_STOCK = 999;

/** 옵션이 없는 상품의 옵션 이름/값. 실측 등록물이 `단품 / 단품` 이었다. */
export const BORIBORI_SINGLE_OPTION = '단품';

/** 기본 분류. 실측 등록물이 쓰던 자리(`문구/팬시 > 문구 > 팬시용품`). */
export const BORIBORI_DEFAULT_CATEGORY = ['241', '217009', '217009001'] as const;
export const BORIBORI_DEFAULT_CATEGORY_LABEL = '문구/팬시 > 문구 > 팬시용품';

/**
 * 몰 고정 라디오. 전부 **실측 등록물에서 읽은 값**이다.
 *
 * 이름·값 둘 다 화면에서 그대로 읽었다 — 지어낸 값이 아니다.
 */
export const BORIBORI_RADIOS: Readonly<Record<string, string>> = {
  /** 전시여부 */
  dispYn: 'Y',
  /** 품절 시 상품노출 여부 */
  outStockDispYn: 'N',
  /** 환불구분 */
  refundYn: 'Y',
  /** 병행수입 */
  piInfoYn: 'N',
  /** 최대구매수량 제한 */
  pchsLimitYn: 'N',
  /** 도서/공연비 추가소득 공제 */
  bkpfIncmDctYn: 'N',
};

export interface BoriboriRegistrationOptions {
  /** 상품명 뒤에 붙는 수량. 실측 등록물이 `(1p)` 였다. */
  quantity?: number;
  /** 정상가. 없으면 원본 상품명 앞의 숫자를 쓴다. */
  listPrice?: number;
  /** 분류 세 단(`241>217009>217009001`). 비우면 기본 분류를 쓴다. */
  categoryCodes?: readonly string[];
  /** 수식어. 실측 등록물이 `ZZ9` 였다 — 우리 데이터에 없어 사람이 정한다. */
  decoWord?: string;
  /**
   * 업체상품코드. **우리가 정하는 코드**이고 필수다(옆에 중복체크 버튼이 있다).
   *
   * ⚠️ 몰이 주는 번호가 아니다 — 그건 `상품코드` 이고 등록할 때 자동 발급된다.
   * 비우면 초안의 자체관리코드(셀피아 SKU)를 쓰고, 그것도 없으면 넣지 않는다.
   */
  sellerCode?: string;
}

export interface BoriboriRegistrationForm {
  url: string;
  /**
   * 칸 이름 → 넣을 값.
   *
   * 이 몰은 칸이 `<form>` 밖에 있어 폼으로 못 닿는다. 선택자와 기다림은 확장 SPEC 이
   * 갖고, 여기서는 **값만** 준다(11번가와 같은 계약). 실행 순서도 SPEC 이 정한다 —
   * 사이트 → 분류 1·2·3단이 먼저여야 한다.
   */
  selectorFields: Record<string, string>;
  /** 라디오 이름 → 고를 값. */
  radios: Record<string, string>;
  /** 대표 한 장, 추가 여러 장. */
  imageGroups: { representative: string[]; additional: string[] };
  /** 상세설명 이미지. 2단계라 이번 회차에는 못 넣는다 — 안내에 남긴다. */
  detailUploads: { url: string }[];
  manualSteps: string[];
}

/**
 * 보리보리 상품명.
 *
 * 실측 `킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리` — 앞의 소비자가를 떼고 수량이
 * **괄호 붙은 `(1p)`** 로 들어간다. 티처몰과 같은 규칙이다(11번가·ESM 은 괄호가 없다).
 */
export function buildBoriboriProductName(
  name: string,
  keywords: readonly string[],
  quantity: number,
): string {
  const base = name.trim().replace(/^\d+\s*/, '') || name.trim();
  return [base, `(${quantity}p)`, ...keywords.slice(0, 3)]
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 정상가.
 *
 * 우리 원본명(`3500킬러볼스피너키링`)이 앞에 소비자가를 달고 있고, 실측 등록물의
 * 정상가가 정확히 그 숫자(3,500)였다. 표기가 없으면 판매가를 쓴다.
 */
export function boriboriListPrice(displayName: string, salePrice: number): number {
  const matched = /^(\d+)/.exec(displayName.trim());
  const parsed = matched ? Number(matched[1]) : 0;
  return parsed > salePrice ? parsed : salePrice;
}

/** 할인율(%). 화면이 판매가 옆에 함께 보여 준다. 실측 3,500 → 2,410 이 31% 였다. */
export function boriboriDiscountRate(listPrice: number, salePrice: number): number {
  if (listPrice <= 0 || salePrice <= 0 || salePrice >= listPrice) return 0;
  return Math.round(((listPrice - salePrice) / listPrice) * 100);
}

export function boriboriFormFromDraft(
  draft: MallProductDraft,
  options: BoriboriRegistrationOptions = {},
): BoriboriRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const variant = draft.variants[0];
  const salePrice = variant?.salePrice ?? 0;
  const listPrice = options.listPrice && options.listPrice > 0
    ? Math.round(options.listPrice)
    : boriboriListPrice(draft.displayName, salePrice);
  const category = options.categoryCodes && options.categoryCodes.length === 3
    ? options.categoryCodes
    : BORIBORI_DEFAULT_CATEGORY;

  /**
   * ⚠️ 순서가 곧 실행 순서다.
   *
   * `siteCd` 가 분류 목록을 갈아치우고, 분류는 세 단이 계단식이다. 뒤에서부터 넣으면
   * 목록이 비어 있어 아무것도 안 들어간다.
   */
  const selectorFields: Record<string, string> = {
    site: BORIBORI_SITE_CODE,
    category1: category[0]!,
    category2: category[1]!,
    category3: category[2]!,
    md: BORIBORI_MD_NO,
    name: buildBoriboriProductName(draft.displayName, draft.keywords, quantity),
    brand: draft.brand.trim(),
    brandGroup: draft.brand.trim(),
    listPrice: String(listPrice),
    salePrice: String(salePrice),
    marginRate: String(BORIBORI_MARGIN_RATE),
    // 옵션이 없는 상품은 `단품 / 단품` 으로 둔다(실측).
    optionName: BORIBORI_SINGLE_OPTION,
    optionValue: BORIBORI_SINGLE_OPTION,
  };
  /**
   * ⚠️ 회귀(라이브 2026-09-11): 이 칸을 안 채워서 필수 칸이 빈 채로 남았다.
   * 사장님 화면에서 "업체상품코드가 없다" 로 막혔다.
   */
  const sellerCode = (options.sellerCode ?? variant?.sellerSku ?? '').trim();
  if (sellerCode) selectorFields.sellerCode = sellerCode;
  const decoWord = (options.decoWord ?? '').trim();
  if (decoWord) selectorFields.decoWord = decoWord;
  const tags = draft.keywords.slice(0, 5).join(',');
  if (tags) selectorFields.tags = tags;

  return {
    url: BORIBORI_REGISTER_URL,
    selectorFields,
    radios: { ...BORIBORI_RADIOS },
    imageGroups: {
      representative: draft.representativeImageUrl.trim()
        ? [draft.representativeImageUrl.trim()]
        : [],
      additional: draft.additionalImageUrls.map((url) => url.trim()).filter(Boolean),
    },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    manualSteps: [
      `사이트가 **보리보리**(${BORIBORI_SITE_CODE})인지 봅니다. 화면은 하프클럽으로 열립니다.`,
      sellerCode
        ? `업체상품코드 \`${sellerCode}\` 를 넣었습니다. **중복체크**를 눌러 주세요.`
        : '⚠️ 업체상품코드가 비어 있습니다 — 우리 코드를 직접 넣고 중복체크를 누르세요.',
      '⚠️ **담당MD** 는 화면에서 직접 고르셔야 합니다. 신규 등록에서는 그 칸이 잠겨 있습니다.',
      `분류는 ${BORIBORI_DEFAULT_CATEGORY_LABEL} 로 넣었습니다. 다르면 고쳐 주세요.`,
      `재고 ${BORIBORI_STOCK}개는 옵션 표에서 넣어야 합니다 — 칸이 저장 뒤에 생깁니다.`,
      '저장(코드생성 → 상품정보생성)을 누른 뒤 **상세정보**에서 상세설명·고시·원산지를 넣습니다.',
      '마지막에 **승인요청**까지 사람이 눌러야 합니다.',
    ],
  };
}
