import type { MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 키즈노트(WISA 스마트윙) 입점사 상품등록 폼.
 *
 * 값과 규칙은 **실제 등록된 상품에서 읽어온 것**이다(라이브 실측 2026-09-03,
 * pno 184315·183366·183368·183371·183373·182562·186036·66518).
 * 폼에 무엇을 넣을 수 있는가가 아니라, 이 판매자가 실제로 무엇을 넣어 왔는가가 기준이다.
 *
 * 쿠팡 WING 과 다른 점:
 *  1. 이미지가 URL 이 아니라 `input[type=file]` 이다.
 *  2. 상세설명은 `up_fdisk` 호스팅(filetype=3)에 먼저 올려 `kiditem.diskn.com` URL 을
 *     받은 뒤 그 URL 로 `content2` 를 만든다.
 *  3. 상품정보제공고시는 `fieldset` 을 고르면 `field{N}` 이 동적으로 생긴다.
 *
 * 라이브 검증 2026-09-10: 로그인된 관리자 폼에 이 맵 그대로 값을 넣어 확인했다.
 *  - `fieldset='1100'` 이 `field636`~`field938` 26칸을 정확히 생성한다.
 *  - `big=2128 → mid=2129 → small=2504` 계단식이 옵션 로드 대기와 함께 통과한다.
 *  - 가격칸은 콤마를 넣어도 폼이 `3000` 으로 정규화한다. 콤마는 무해하지만 필수도 아니다.
 *  - `delivery_set`(배송정책) 은 기본 배송비에서 선택지가 없다.
 */

export const KIDSNOTE_REGISTER_URL =
  'https://shop.kidsnote.com/_manage/?body=product@product_register';

/** 노출상품명 접두어. 실측 상품 대부분이 이 접두어를 달고 있다. */
export const KIDSNOTE_NAME_PREFIX = '[키드아이템]';

/**
 * 상품정보제공고시 카테고리(`fieldset`).
 *
 * ⚠️ 완구·키링도 **'기타'(1100)** 로 등록해 왔다. 실측 10건 중 9건이 1100 이고,
 * 영유아용품(1083)은 오래된 상품 1건뿐이다. 칸 번호가 카테고리마다 완전히 다르므로
 * 여기를 바꾸면 아래 필드 맵도 함께 바뀌어야 한다.
 */
export const KIDSNOTE_NOTICE_CATEGORY_ETC = '1100';

/** '기타'(1100) 고시 칸. 라벨은 실제 화면 표기 그대로. */
export const KIDSNOTE_ETC_NOTICE_FIELD = {
  품명및모델명: 'field636',
  법인증허가확인: 'field637',
  제조국: 'field638',
  제조사: 'field639',
  AS책임자: 'field640',
  품질보증기준: 'field918',
  수입여부: 'field919',
  안전인증여부: 'field920',
  표시단위: 'field921',
  총용량: 'field922',
  단위용량: 'field923',
  판매개수: 'field924',
  색상: 'field925',
  사이즈: 'field926',
  제품구성: 'field927',
  재질: 'field928',
  배송설치비용: 'field929',
  안전인증번호: 'field930',
  상품무게: 'field931',
  포장단위: 'field932',
  자가검사번호: 'field933',
  취소환불조건: 'field934',
  이용조건: 'field935',
  소비자상담전화: 'field936',
  서비스제공사업자: 'field937',
  제조연월일: 'field938',
} as const;

/** 판매자 고정 항목(고시 바깥, 기본정보 '추가항목'). 실측 전 상품 동일. */
export const KIDSNOTE_SELLER_FIELD = {
  판매자: 'field665',
  판매자연락처: 'field666',
} as const;

export const KIDSNOTE_SELLER_VALUE = {
  판매자: '거영I&D',
  판매자연락처: '031-908-5401',
} as const;

/**
 * 고시 기본값. 실측에서 가장 흔한 값을 그대로 쓴다.
 *
 * 상품마다 달라지는 것(품명·제조사·색상·구성·재질)은 초안에서 덮어쓴다.
 */
export const KIDSNOTE_ETC_NOTICE_DEFAULTS: Record<string, string> = {
  법인증허가확인: '해당없음',
  제조국: '중국',
  AS책임자: '031-908-5401',
  품질보증기준: '관련 법 및 소비자 분쟁 해결 기준을 따름',
  수입여부: 'Y',
  안전인증여부: '해당없음',
  표시단위: '해당없음',
  총용량: '해당없음',
  단위용량: '해당없음',
  판매개수: '1EA',
  색상: '랜덤',
  사이즈: '상세설명참조',
  제품구성: '1P',
  재질: '플라스틱외',
  배송설치비용: '해당없음',
  안전인증번호: '해당없음',
  상품무게: '상세설명참조',
  포장단위: '상세설명참조',
  자가검사번호: '해당없음',
  취소환불조건: '해당없음',
  이용조건: '해당없음',
  소비자상담전화: '해당없음',
  서비스제공사업자: '해당없음',
  제조연월일: '해당없음',
};

/**
 * 분류 프리셋.
 *
 * 등록 상품 1,024건의 실제 분포에서 상위 12개를 가져왔다(라이브 집계 2026-09-03).
 * 이 12개가 전체의 82% 다. 코드는 각 분류의 실제 상품에서 읽었다.
 *
 * ⚠️ 대>중>소는 화면에서 **계단식으로 로딩**된다(big 을 고르면 mid 가 AJAX 로 채워짐).
 * 확장은 한 단계씩 채워지길 기다리며 순서대로 선택해야 한다.
 */
export const KIDSNOTE_CATEGORY_PRESET = {
  '선물/행사/체험 > 선물용품 > 장난감/완구': { big: '2128', mid: '2129', small: '2504', depth4: '', count: 343 },
  '선물/행사/체험 > 선물용품 > 학용품/문구': { big: '2128', mid: '2129', small: '2503', depth4: '', count: 117 },
  '선물/행사/체험 > 행사용품 > 할로윈데이': { big: '2128', mid: '2130', small: '2593', depth4: '', count: 94 },
  '선물/행사/체험 > 선물용품 > 비눗방울/물총': { big: '2128', mid: '2129', small: '2529', depth4: '', count: 91 },
  '선물/행사/체험 > 선물용품 > 생활/잡화': { big: '2128', mid: '2129', small: '2537', depth4: '', count: 67 },
  '선물/행사/체험 > 선물용품 > 퍼즐/보드게임': { big: '2128', mid: '2129', small: '2528', depth4: '', count: 34 },
  '교재/교구 > 미술놀이 > 미술도구': { big: '2107', mid: '2114', small: '2464', depth4: '', count: 20 },
  '교재/교구 > 과학놀이 > 식물키우기': { big: '2107', mid: '2112', small: '2437', depth4: '', count: 19 },
  '선물/행사/체험 > 선물용품 > 블럭/레고': { big: '2128', mid: '2129', small: '2505', depth4: '', count: 19 },
  '교재/교구 > 신체놀이 > 공놀이/촉감놀이': { big: '2107', mid: '2111', small: '2433', depth4: '', count: 18 },
  '문구/시설비품 > 문구용품 > 필기구류 > 지우개/연필깎이': { big: '2136', mid: '2139', small: '2494', depth4: '2743', count: 17 },
  '만들기 > 만들기재료 > 클레이/점토': { big: '2100', mid: '2104', small: '2679', depth4: '', count: 8 },
} as const;

export type KidsnoteCategoryKey = keyof typeof KIDSNOTE_CATEGORY_PRESET;

/** 가장 많이 쓰는 분류. 1,024건 중 343건(33%)이 여기다. */
export const KIDSNOTE_DEFAULT_CATEGORY: KidsnoteCategoryKey =
  '선물/행사/체험 > 선물용품 > 장난감/완구';

/** 판매 정책. 실측 전 상품 동일. */
export const KIDSNOTE_SALES_POLICY = {
  partnerRate: '15.00',
  minOrder: '1',
  maxOrder: '999',
} as const;

export interface KidsnoteRegistrationOptions {
  category?: KidsnoteCategoryKey;
  /** 노출상품명에 붙는 수량 표기. `1p` 형태로 들어간다. */
  quantity?: number;
  requestComment?: string;
}

export interface KidsnoteRegistrationForm {
  url: string;
  formId: 'prdFrm';
  fields: Record<string, string>;
  checks: string[];
  radios: Record<string, string>;
  fileUploads: { name: string; url: string }[];
  detailUploads: { url: string }[];
  detailHtmlTarget: string;
  manualSteps: string[];
}

const IMAGE_SLOTS = ['upfile1', 'upfile2', 'upfile3'] as const;

/** 키즈노트 가격칸은 콤마가 들어간 문자열이다(`2,280`). */
function priceText(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

/**
 * 노출상품명.
 *
 * 실측 형태: `[키드아이템] 킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리`
 * 접두어 + 상품명 + 수량 + 검색 키워드 순이다.
 */
export function buildKidsnoteDisplayName(
  name: string,
  keywords: readonly string[],
  quantity: number,
): string {
  const parts = [KIDSNOTE_NAME_PREFIX, name.trim(), `${quantity}p`, ...keywords];
  return parts.filter((part) => part.length > 0).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * 초안을 키즈노트 폼 지시로 옮긴다.
 *
 * 분류는 프리셋에서 고른다 — 실측 상품이 쓰는 조합만 두고, 그 밖은 사람이 화면에서
 * 바꾸도록 남긴다. 몰 분류를 지어내면 승인에서 반려되고 사유가 우리에게 안 돌아온다.
 */
export function kidsnoteFormFromDraft(
  draft: MallProductDraft,
  options: KidsnoteRegistrationOptions = {},
): KidsnoteRegistrationForm {
  const variant = draft.variants[0];
  if (!variant) {
    throw new Error(`"${draft.displayName}" 에 옵션(SKU)이 없어 키즈노트 폼을 만들 수 없습니다.`);
  }
  const quantity = options.quantity ?? 1;
  const category = KIDSNOTE_CATEGORY_PRESET[options.category ?? KIDSNOTE_DEFAULT_CATEGORY];

  const fields: Record<string, string> = {
    name: buildKidsnoteDisplayName(draft.displayName, draft.keywords, quantity),
    // 참고 상품명(name_referer)과 요약 설명(content1)은 실측 상품에서 전부 비어 있다.
    big: category.big,
    mid: category.mid,
    small: category.small,
    ...(category.depth4 ? { depth4: category.depth4 } : {}),
    keyword: draft.keywords.join(','),
    fieldset: KIDSNOTE_NOTICE_CATEGORY_ETC,
    normal_prc: priceText(variant.listPrice),
    sell_prc: priceText(variant.salePrice),
    partner_rate: KIDSNOTE_SALES_POLICY.partnerRate,
    min_ord: KIDSNOTE_SALES_POLICY.minOrder,
    max_ord: KIDSNOTE_SALES_POLICY.maxOrder,
    [KIDSNOTE_SELLER_FIELD.판매자]: KIDSNOTE_SELLER_VALUE.판매자,
    [KIDSNOTE_SELLER_FIELD.판매자연락처]: KIDSNOTE_SELLER_VALUE.판매자연락처,
    partner_cmt: options.requestComment
      ?? `KidItem 상품 생성 파이프라인 등록 신청 — ${draft.sellerProductName}`,
  };

  // 고시: 기본값 위에 상품별 값을 덮는다.
  //
  // ⚠️ 품명및모델명은 노출상품명이 아니라 **셀피아 원본명**이다(실측: `3500킬러볼스피너키링`).
  //    가격 접두 코드까지 그대로 들어간다 — 쿠팡과 반대라 일부러 남긴다.
  const noticeValues: Record<string, string> = {
    ...KIDSNOTE_ETC_NOTICE_DEFAULTS,
    품명및모델명: draft.sellerProductName,
    제조사: draft.maker,
    제품구성: `${quantity}P`,
  };
  const optionColor = variant.options.find((option) => option.type === '색상')?.value;
  if (optionColor && optionColor !== '단일') noticeValues.색상 = optionColor;
  for (const [key, value] of Object.entries(noticeValues)) {
    const target = KIDSNOTE_ETC_NOTICE_FIELD[key as keyof typeof KIDSNOTE_ETC_NOTICE_FIELD];
    if (target && value) fields[target] = value;
  }

  const imageUrls = [draft.representativeImageUrl, ...draft.additionalImageUrls]
    .filter((url) => url.length > 0)
    .slice(0, IMAGE_SLOTS.length);

  const manualSteps: string[] = [];
  if (!options.category) {
    manualSteps.push(`분류를 '${KIDSNOTE_DEFAULT_CATEGORY}' 로 넣었습니다. 다르면 화면에서 바꾸세요.`);
  }
  // 배송정책(`delivery_set`)은 안내하지 않는다. `delivery_type=basic` 을 쓰면 그
  // 드롭다운은 비활성이고 선택지도 플레이스홀더 하나뿐이다(라이브 확인 2026-09-10).
  // 고를 것이 없는데 고르라고 하면 사람이 폼을 뒤지다 시간을 버린다.
  if (draft.detailImageUrls.length === 0) {
    manualSteps.push('상세설명 이미지가 없습니다. 상품 생성에서 상세페이지를 먼저 확정하세요.');
  }
  manualSteps.push('값이 맞는지 확인한 뒤 화면에서 직접 제출하세요. 자동 제출하지 않습니다.');

  return {
    url: KIDSNOTE_REGISTER_URL,
    formId: 'prdFrm',
    fields,
    // 상품코드는 몰이 만든다(실측 전 상품 auto_code 켜짐). 회원혜택도 전 상품 공통.
    checks: ['auto_code', 'member_sale'],
    radios: {
      ea_type: '1',
      delivery_type: 'basic',
      req_stat: '1',
    },
    fileUploads: imageUrls.map((url, index) => ({ name: IMAGE_SLOTS[index] as string, url })),
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    detailHtmlTarget: draft.detailImageUrls.length > 0 ? 'content2' : '',
    manualSteps,
  };
}
