import { type MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 꼬망세몰(EduPre 임대몰, `nstore.edupre.co.kr`) 상품등록.
 *
 * 실측 2026-09-11. 등록물 `_code=H7984-C3488-G2602`
 * (`전동 오토 버블건 1p 비눗방울 비누방울`)을 읽고 신규 등록 화면(`_mode=add`)과 대조했다.
 * 상세는 `docs/superpowers/2026-09-11-kkomangse-product-register-research.md`.
 *
 * 평범한 PHP 폼(`form[name=frm]` → `_product.pro.php`)이라 칸 이름이 전부 있다.
 * 다른 몰과 다른 것 넷:
 *
 *  1. **저장되는 가격은 판매가(`_price`) 하나다.** 화면에 납품가 칸이 있지만 "저장하지
 *     않는 계산용 항목"이다 — 판매가를 넣으면 화면이 `판매가 − round(판매가 × 수수료율)`
 *     로 납품가를 채운다. 실측 5,060 → 4,301(수수료 15%).
 *  2. **분류는 고르는 것만으로 끝나지 않는다.** 1·2·3단을 고른 뒤 `선택 카테고리 추가`
 *     를 눌러야 목록에 들어간다(그 버튼이 이 상품 코드로 분류를 서버에 붙인다).
 *     고르기만 하고 저장하면 분류 없는 상품이 된다.
 *  3. **이미지는 칸이 셋이다** — 목록 기본(필수) · 오버 · 상세(스와이프). 상세 이미지 1 이
 *     상품 페이지의 큰 사진이다. 실측 등록물은 기본과 오버에 같은 사진을, 상세 1 에 다른
 *     사진을 썼다.
 *  4. **상세설명은 네이버 SmartEditor 2 다.** 아이스크림몰과 같은 에디터라 HTML 탭으로
 *     넣는다. 실측 등록물은 diskn 주소였지만, 이 몰은 에디터 사진 업로더가 있어 몰에
 *     직접 올린다(남의 몰 로그인에 기대지 않는다 — ESM 에서 배운 것).
 */

/** 신규 등록 화면. 들어갈 때마다 상품코드(`_code`)가 새로 발급된다. */
export const KKOMANGSE_REGISTER_URL =
  'https://nstore.edupre.co.kr/subAdmin/_product.form.php?_mode=add';

/**
 * 기본 수수료율. 업체 설정값이고 분류에 따라 화면이 바꿀 수 있다
 * (`applyCategoryCommission`). 우리는 판매가만 저장하므로 미리보기에만 쓴다.
 */
export const KKOMANGSE_COMMISSION_RATE = 0.15;

/**
 * 기본 분류. 실측 등록물은 `선물/행사용품 > 선물용품 > 비누방울/물총`(289) 이었는데
 * 그건 그 상품 전용 자리다. 우리 완구 일반은 같은 가지의 `장난감/완구`(288) 다.
 */
export const KKOMANGSE_DEFAULT_CATEGORY = ['278', '279', '288'] as const;
export const KKOMANGSE_DEFAULT_CATEGORY_LABEL = '선물/행사용품 > 선물용품 > 장난감/완구';

/** 해시태그 칸 상한. 화면이 `44 / 200자` 로 센다. */
export const KKOMANGSE_HASHTAG_MAX = 200;

/**
 * 상세 이미지는 다섯 칸이다(1번 + `추가` 넷). 1번은 대표라 추가 썸네일은 넷까지다.
 * 다섯 칸을 넘기려 하면 화면이 alert 를 띄운다.
 */
export const KKOMANGSE_EXTRA_DETAIL_IMAGES = 4;

/**
 * 몰 고정 라디오. 전부 실측 등록물의 값이다.
 *
 * 신규 화면의 기본값과 같지만 일부러 적어 둔다 — 누가 기본값을 바꿔도 우리 상품은
 * 같은 모양으로 들어가야 한다.
 */
export const KKOMANGSE_RADIOS: Readonly<Record<string, string>> = {
  /** 상품 노출: 판매중 */
  _view: 'Y',
  /** 옵션 미사용 */
  _option_type_chk: 'nooption',
  /** 재고관리 수동(재고 1개 이상이면 무제한 판매) */
  _stock_control: 'N',
  /** 과세 */
  p_vat: 'Y',
  /** 배송비: 업체별 정책 */
  _shoppingPay_use: 'N',
};

export interface KkomangseRegistrationOptions {
  /** 상품명 뒤에 붙는 수량. 실측 등록물이 `1p` 였다. */
  quantity?: number;
  /** 정상가. 없으면 원본 상품명 앞의 숫자를 쓴다. */
  listPrice?: number;
  /** 분류 세 단(`278>279>288`). 비우면 기본 분류를 쓴다. */
  categoryCodes?: readonly string[];
  /** 안전인증번호. 있으면 KC인증 `인증` + 번호. */
  certNumber?: string;
}

export interface KkomangseRegistrationForm {
  url: string;
  /** 폼 칸 이름 → 값. 이 몰은 칸 이름이 전부 있다. */
  fields: Record<string, string>;
  /** 라디오 이름 → 고를 값. */
  radios: Record<string, string>;
  /**
   * 분류 세 단. 계단식이라 확장이 순서대로 넣고 단마다 기다린 뒤
   * `선택 카테고리 추가` 를 누른다.
   */
  selectorFields: Record<string, string>;
  /**
   * 이미지 칸: 목록 기본 · 오버 · 상세 1 · 상세 2~5.
   * 상세 1 이 상품 페이지의 큰 사진이라 대표를 넣고, 추가 썸네일은 `추가` 로 늘린
   * 상세 2~5 칸(`gallery`)에 넣는다.
   */
  imageGroups: { square: string[]; over: string[]; swipe: string[]; gallery: string[] };
  /** 상세설명 이미지. 확장이 에디터 사진 업로더로 몰에 올린다. */
  detailUploads: { url: string }[];
  manualSteps: string[];
}

/**
 * 꼬망세몰 상품명.
 *
 * 실측 `전동 오토 버블건 1p 비눗방울 비누방울` — 앞의 소비자가를 떼고 수량이 괄호 없이
 * `1p` 로 들어간다. 11번가·ESM·아이스크림몰과 같은 규칙이다(티처몰·보리보리는 `(1p)`).
 */
export function buildKkomangseProductName(
  name: string,
  keywords: readonly string[],
  quantity: number,
): string {
  const base = name.trim().replace(/^\d+\s*/, '') || name.trim();
  return [base, `${quantity}p`, ...keywords.slice(0, 3)]
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 해시태그. 쉼표로 잇고 200자를 넘기지 않는다.
 *
 * 실측 등록물은 아홉 개(44자)였다. 화면은 앞의 다섯 개만 상세에 보여 준다. 낱말 안의
 * 쉼표는 구분자와 섞이므로 빈칸으로 바꾼다. 넘치면 뒤에서 자른다 — 중간을 자르면 반쪽
 * 낱말이 태그로 남는다.
 */
export function buildKkomangseHashtags(keywords: readonly string[]): string {
  const out: string[] = [];
  let length = 0;
  for (const raw of keywords) {
    const tag = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (!tag || out.includes(tag)) continue;
    const next = length + (out.length > 0 ? 1 : 0) + tag.length;
    if (next > KKOMANGSE_HASHTAG_MAX) break;
    out.push(tag);
    length = next;
  }
  return out.join(',');
}

/**
 * 정상가. 원본명(`8000전동오토버블건`)이 앞에 소비자가를 달고 있고, 실측 등록물의
 * 정상가가 그 숫자(8,000)였다. 표기가 없거나 판매가보다 낮으면 판매가를 쓴다.
 */
export function kkomangseListPrice(displayName: string, salePrice: number): number {
  const matched = /^(\d+)/.exec(displayName.trim());
  const parsed = matched ? Number(matched[1]) : 0;
  return parsed > salePrice ? parsed : salePrice;
}

/**
 * 납품가(미리보기용). 화면의 `calcSupplyFromPrice` 와 같은 식이다:
 * `판매가 − round(판매가 × 수수료율)`. 실측 5,060 → 4,301.
 *
 * 저장되는 값이 아니다 — 사람에게 "이만큼 정산된다" 를 보여 주려고 계산한다.
 */
export function kkomangseSupplyPrice(
  salePrice: number,
  rate: number = KKOMANGSE_COMMISSION_RATE,
): number {
  if (salePrice <= 0) return 0;
  return salePrice - Math.round(salePrice * rate);
}

export function kkomangseFormFromDraft(
  draft: MallProductDraft,
  options: KkomangseRegistrationOptions = {},
): KkomangseRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const salePrice = draft.variants[0]?.salePrice ?? 0;
  const listPrice = options.listPrice && options.listPrice > 0
    ? Math.round(options.listPrice)
    : kkomangseListPrice(draft.displayName, salePrice);
  const category = options.categoryCodes && options.categoryCodes.length === 3
    ? options.categoryCodes
    : KKOMANGSE_DEFAULT_CATEGORY;
  const certNumber = (options.certNumber ?? draft.notice.fields.안전인증번호 ?? '').trim();

  const fields: Record<string, string> = {
    _name: buildKkomangseProductName(draft.displayName, draft.keywords, quantity),
    _screenPrice: String(listPrice),
    // ⚠️ 저장되는 가격은 이 칸뿐이다. 납품가 칸은 화면이 이 값으로 계산해 채운다.
    _price: String(salePrice),
  };
  const hashtags = buildKkomangseHashtags(draft.keywords);
  if (hashtags) fields._hashtag = hashtags;
  const maker = draft.maker.trim();
  if (maker) fields._maker = maker;
  // 칸 이름이 `_orgin` 이다(몰의 오타 그대로). 고치면 칸을 못 찾는다.
  const origin = (draft.notice.fields.제조국 ?? '').trim();
  if (origin) fields._orgin = origin;
  // KC 번호 칸은 `인증` 을 고르기 전까지 잠겨 있다. 확장이 라디오를 먼저 누른다.
  if (certNumber) fields._kc_num = certNumber;

  const rep = draft.representativeImageUrl.trim();
  const extras = draft.additionalImageUrls.map((url) => url.trim()).filter(Boolean);

  return {
    url: KKOMANGSE_REGISTER_URL,
    fields,
    radios: { ...KKOMANGSE_RADIOS, _kc_yn: certNumber ? 'Y' : 'N' },
    selectorFields: {
      category1: category[0]!,
      category2: category[1]!,
      category3: category[2]!,
    },
    imageGroups: {
      square: rep ? [rep] : [],
      // 목록에서 마우스를 올리면 바뀌는 사진(선택 칸). 추가 썸네일이 없으면 비운다.
      over: extras[0] ? [extras[0]] : [],
      // ⭐ 상세 이미지 1 = 상품 페이지의 큰 사진(매장 화면 실측). 대표가 나와야 한다.
      swipe: rep ? [rep] : [],
      // 상세 2~5. 확장이 `추가` 를 눌러 칸을 늘린 뒤 넣는다.
      gallery: extras.slice(0, KKOMANGSE_EXTRA_DETAIL_IMAGES),
    },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    manualSteps: [
      `분류는 ${KKOMANGSE_DEFAULT_CATEGORY_LABEL} 로 고르고 [선택 카테고리 추가] 까지 눌렀습니다. 목록에 들어갔는지 봅니다.`,
      `판매가 ${salePrice.toLocaleString('ko-KR')}원을 넣었습니다. 납품가는 화면이 수수료율로 계산합니다(저장되지 않는 칸).`,
      '정보제공고시는 기존 등록물처럼 "상품상세정보에 포함" 으로 둡니다.',
      '내용을 확인한 뒤 사람이 직접 저장합니다.',
    ],
  };
}
