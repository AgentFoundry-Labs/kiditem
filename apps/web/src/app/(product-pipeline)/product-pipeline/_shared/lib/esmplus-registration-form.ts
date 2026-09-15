import { KIDITEM_AS_PHONE, type MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → ESM Plus(G마켓 · 옥션) 상품등록.
 *
 * 실측 2026-09-11. 등록물 `goodsNo=6548340498`(`할로윈 LED 거미줄 1p 불빛 장식`)을 읽고
 * 빈 폼 `item.esmplus.com/goods/new` 에서 채우는 법을 하나씩 실증했다. 상세는
 * `docs/superpowers/2026-09-11-esmplus-product-register-research.md`.
 *
 * 다른 몰과 다른 것 넷:
 *
 *  1. **몰 하나가 아니라 둘이다.** 맨 위 `판매사이트` 에 G마켓·옥션이 둘 다 켜진 채로
 *     열린다. 한 번 채우면 두 몰에 올라간다 — 그래서 어댑터도 하나다.
 *  2. **`<form>` 도 `name` 도 `id` 도 없다.** Next.js + React 라 `id` 는 `:r0:` 같은
 *     렌더마다 바뀌는 값이다. 유일한 손잡이가 **섹션 제목**이라 이 빌더는 칸 이름 대신
 *     화면에 찍힌 제목을 키로 쓴다.
 *  3. **고시가 일반 칸과 똑같다.** `상품군` 을 고르면 고시 15줄이 같은
 *     `div.box__filter-item` 으로 그려진다 — 아이스크림몰처럼 몰 함수를 부를 필요가 없다.
 *     대신 **순서**가 있다: 상품군을 먼저 고른다.
 *  4. **배송은 손댈 게 없다.** 빈 폼이 이미 우리 계정 템플릿(CJ택배·순차발송·조건부무료
 *     9,900원·(주)거영아이앤디)으로 차 있다. 반품배송비만 `0` 으로 열려서 그 칸만 채운다.
 */

/** 등록 화면. 껍데기(`www.esmplus.com/Home/v2/goods-register`)가 아니라 폼 자체다. */
export const ESMPLUS_REGISTER_URL = 'https://item.esmplus.com/goods/new';

/** 재고수량. 우리 표준이고 실측 등록물도 999 였다. */
export const ESMPLUS_STOCK = 999;

/** A/S 전화번호. 실측 등록물의 고시 `35-5` 가 이 번호였다. */
export const ESMPLUS_AS_PHONE = KIDITEM_AS_PHONE;

/**
 * 반품/교환 배송비(편도).
 *
 * ⚠️ 빈 폼은 이 칸만 `0` 으로 열린다. 실측 등록물은 3,000 이라 반드시 덮어쓴다.
 */
export const ESMPLUS_RETURN_FEE = 3000;

/** 고시 상품군. 드롭다운 41개 중 우리 것. */
export const ESMPLUS_NOTICE_GROUP = '어린이제품';

/**
 * 인증 라디오가 고를 수 있는 말.
 *
 * ⭐⭐ **분류가 인증 칸의 방아쇠다**(라이브 실측 2026-09-11). 분류를 고르기 전의
 * `인증정보` 패널은 어린이제품 · 생활용품 · 전기용품 셋인데, 분류를 고르고 나면
 * **어린이제품 인증 · G마켓 인증정보 · G마켓 영업허가증** 으로 **다시 그려지고
 * 기본값이 `인증대상`/`허가 대상` 으로 되돌아간다.**
 *
 * 그래서 분류보다 인증을 먼저 누르면 **눌러 둔 값이 지워진다.** 확장은 분류를 먼저 한다.
 *
 * 그대로 두면 `인증 유형`(드롭다운 + 번호칸)과 `업종` 이 필수로 따라 열려 등록이 막힌다.
 */
export const ESMPLUS_CERT_CHOICES = {
  /** 인증번호가 있을 때. 뒤따르는 `인증 유형` 드롭다운과 번호 칸까지 채워야 한다. */
  certified: '인증대상',
  /** 번호가 없을 때 쓰는 정직한 가운데 값. 고시의 '상세페이지 참조' 와 같은 뜻이다. */
  inDetail: '상세설명에 별도표기',
  notApplicable: '인증대상이 아님',
  licenseNotApplicable: '허가 대상이 아님',
} as const;

/**
 * 분류에 따라 **있을 수도 없을 수도 있는** 칸들.
 *
 * 어느 인증 블록이 그려지는지는 고른 분류가 정한다. 없는 칸을 못 찾았다고 경고를
 * 남기면 매번 거짓 경보가 뜬다 — 여기 적힌 칸은 없어도 조용히 넘어간다.
 */
export const ESMPLUS_OPTIONAL_SECTIONS: readonly string[] = [
  '어린이제품 인증',
  'G마켓 인증정보',
  'G마켓 영업허가증',
  '생활용품 인증',
  '전기용품 인증',
  '인증 유형',
];

/** 인증 유형 드롭다운(안전인증·안전확인·공급자적합성확인). 어린이 완구는 보통 공급자적합성확인이다. */
export const ESMPLUS_CERT_TYPE = '공급자적합성확인';

/** 이미지 칸 상한. 화면 안내가 `0/15` 였다(실측). */
export const ESMPLUS_MAX_IMAGES = 15;

/**
 * 고시 열다섯 줄 중 우리가 채우는 줄.
 *
 * 왼쪽이 **화면에 찍힌 제목 그대로**(칸에 이름이 없어 이 글자로 찾는다), 오른쪽이 우리
 * 고시 어휘다. `null` 이면 몰 고정값을 쓴다.
 */
const NOTICE_ROWS: readonly (readonly [string, string | null])[] = [
  ['품명 및 모델명', '품명및모델명'],
  ['KC 인증정보', 'KC인증'],
  ['크기/중량', '크기'],
  ['색상', '색상'],
  ['재질', '재질'],
  ['사용연령 또는 권장사용연령', '사용연령'],
  ['동일모델의 출시년월', '동일모델출시년월'],
  ['제조자/수입자', '제조자'],
  ['제조국', '제조국'],
  ['취급방법 및 취급시 주의사항,안전표시', '취급방법및주의사항'],
  ['품질보증기준', '품질보증기준'],
  ['A/S 책임자와 전화번호', 'AS책임자'],
];

/** 초안에 없어서 몰 고정으로 채우는 줄. */
const NOTICE_FIXED: Readonly<Record<string, string>> = {
  품질보증기준: '공정거래위원회 고시 소비자 분쟁해결 기준에 따름',
  'A/S 책임자와 전화번호': ESMPLUS_AS_PHONE,
  '주문후 예상 배송기간': '결제 후 2일 이내 발송',
  '크기ㆍ체중의 한계': '상세설명 참조',
};

export interface EsmplusRegistrationOptions {
  /** 상품명 뒤에 붙는 수량. 실측 등록물이 `1p` 였다. */
  quantity?: number;
  /** 카테고리 검색어. 몰 카테고리 트리를 들고 다니지 않고 이름으로 찾는다. */
  categoryQuery?: string;
  /** 고를 카테고리 전체 경로(`이벤트/파티용품>기타이벤트/파티용품`). */
  categoryPath?: string;
  /** 판매자 관리코드. 비우면 넣지 않는다. */
  sellerCode?: string;
  /** 안전인증번호. 있으면 인증 라디오가 `인증대상` 으로 간다. */
  certNumber?: string;
}

export interface EsmplusRegistrationForm {
  url: string;
  /**
   * 섹션 제목 → 넣을 값.
   *
   * 이 몰은 칸에 `name` 이 없다. 제목이 유일한 손잡이라 그걸 키로 쓴다. 같은 섹션에
   * 칸이 여럿이면 `제목#순번` 으로 적는다(`재고수량#0`).
   */
  sectionFields: Record<string, string>;
  /** 섹션 제목 → 누를 라디오의 **라벨 글자**. */
  sectionRadios: Record<string, string>;
  /** 없어도 경고하지 않을 섹션. 분류에 따라 그려지는 칸이 달라진다. */
  optionalSections: readonly string[];
  /** 섹션 제목 → 고를 드롭다운 항목의 **보이는 글자**. */
  sectionDropdowns: Record<string, string>;
  /**
   * 카테고리. 검색칸에 `query` 를 치고 결과에서 `path` 와 글자가 같은 것을 누른다.
   *
   * 고시(`상품군`)를 열려면 이것보다 상품군이 먼저다 — 카테고리는 고시를 안 건드린다
   * (11번가와 다른 점이다. 실측 2026-09-11).
   */
  category: { query: string; path: string } | null;
  /**
   * 고시.
   *
   * 값은 `sectionFields` 에 이미 섞여 있다 — 고시 줄이 일반 칸과 같은 그릇이라 따로
   * 담을 이유가 없다. 여기 있는 것은 **순서를 지키기 위한 열쇠**뿐이다.
   */
  noticeGroup: string;
  /** 대표 + 추가. 칸 하나(`multiple`)에 한 번에 넣는다. */
  images: string[];
  /** 상세설명 이미지. 확장이 주소를 만들어 HTML 로 넣는다. */
  detailUploads: { url: string }[];
  manualSteps: string[];
}

/**
 * ESM Plus 상품명.
 *
 * 실측 `할로윈 LED 거미줄 1p 불빛 장식` — 접두어가 없고 앞의 소비자가를 떼며 수량이
 * 중간에 `1p` 로 들어간다. 11번가·아이스크림몰과 같은 규칙이다.
 */
export function buildEsmplusProductName(
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
 * 카테고리 검색어.
 *
 * 검색은 낱말 하나가 잘 걸린다 — 11번가에서 띄어쓴 이름으로 치면 0건이었다. 전체 경로의
 * **마지막 마디에서 첫 낱말**을 쓴다.
 */
export function esmplusCategoryQuery(path: string): string {
  const leaf = path.split('>').pop()?.trim() ?? '';
  return leaf.split(/[\s/]+/)[0] ?? '';
}

/**
 * 고시 열두 줄.
 *
 * 초안에 없는 줄은 넣지 않는다 — 빈 값을 밀어 넣으면 몰이 채운 것으로 세고 우리는
 * 무엇이 빠졌는지 못 본다.
 */
export function buildEsmplusNotice(draft: MallProductDraft): Record<string, string> {
  const rows: Record<string, string> = {};
  for (const [title, field] of NOTICE_ROWS) {
    const value = field
      ? (draft.notice.fields as Record<string, string | undefined>)[field]
      : undefined;
    const resolved = (value ?? '').trim() || NOTICE_FIXED[title] || '';
    if (resolved) rows[title] = resolved;
  }
  for (const [title, value] of Object.entries(NOTICE_FIXED)) {
    if (!rows[title]) rows[title] = value;
  }
  // 품명이 비면 상품명을 쓴다. 고시에서 제일 먼저 보는 줄이라 비워 두지 않는다.
  if (!rows['품명 및 모델명']) rows['품명 및 모델명'] = draft.displayName.trim();
  return rows;
}

/**
 * 인증 칸.
 *
 * 분류를 고른 뒤 열리는 블록 셋을 모두 적어 둔다 — 어느 것이 실제로 그려질지는
 * 분류가 정하고, 안 그려진 것은 확장이 조용히 넘어간다(`ESMPLUS_OPTIONAL_SECTIONS`).
 *
 * 번호가 있으면 `인증대상` → `인증 유형` 이 열리고 그 안에 드롭다운과 번호 칸이 있다.
 * 번호가 없으면 `상세설명에 별도표기` 로 두고 `인증 유형` 은 열리지 않는다.
 * 영업허가증은 완구가 허가 업종이 아니라 늘 `허가 대상이 아님` 이다.
 */
export function esmplusCertChoices(certNumber: string): {
  radios: Record<string, string>;
  fields: Record<string, string>;
  dropdowns: Record<string, string>;
} {
  const number = certNumber.trim();
  const stance = number ? ESMPLUS_CERT_CHOICES.certified : ESMPLUS_CERT_CHOICES.inDetail;
  const radios: Record<string, string> = {
    '어린이제품 인증': stance,
    'G마켓 인증정보': stance,
    'G마켓 영업허가증': ESMPLUS_CERT_CHOICES.licenseNotApplicable,
  };
  if (!number) return { radios, fields: {}, dropdowns: {} };
  return {
    radios,
    // `인증 유형` 한 블록 안에 드롭다운(유형)과 입력칸(번호)이 함께 있다.
    fields: { '인증 유형': number },
    dropdowns: { '인증 유형': ESMPLUS_CERT_TYPE },
  };
}

export function esmplusFormFromDraft(
  draft: MallProductDraft,
  options: EsmplusRegistrationOptions = {},
): EsmplusRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const variant = draft.variants[0];
  const salePrice = variant?.salePrice ?? 0;
  const certNumber = (options.certNumber ?? draft.notice.fields.안전인증번호 ?? '').trim();
  const cert = esmplusCertChoices(certNumber);

  const sectionFields: Record<string, string> = {
    상품명: buildEsmplusProductName(draft.displayName, draft.keywords, quantity),
    판매가: String(salePrice),
    재고수량: String(ESMPLUS_STOCK),
    '반품/교환 배송비(편도)': String(ESMPLUS_RETURN_FEE),
    ...buildEsmplusNotice(draft),
    ...cert.fields,
  };
  const sellerCode = (options.sellerCode ?? '').trim();
  if (sellerCode) sectionFields['판매자 관리코드'] = sellerCode;
  const brand = draft.brand.trim();
  if (brand) sectionFields['브랜드 및 제조사'] = brand;

  const categoryPath = (options.categoryPath ?? '').trim();
  const images = [draft.representativeImageUrl, ...draft.additionalImageUrls]
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .slice(0, ESMPLUS_MAX_IMAGES);

  return {
    url: ESMPLUS_REGISTER_URL,
    sectionFields,
    sectionRadios: cert.radios,
    optionalSections: ESMPLUS_OPTIONAL_SECTIONS,
    sectionDropdowns: { 상품군: ESMPLUS_NOTICE_GROUP, ...cert.dropdowns },
    category: categoryPath
      ? { query: (options.categoryQuery ?? '').trim() || esmplusCategoryQuery(categoryPath), path: categoryPath }
      : null,
    noticeGroup: ESMPLUS_NOTICE_GROUP,
    images,
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    manualSteps: [
      '판매사이트에 G마켓·옥션이 둘 다 켜져 있는지 봅니다. 한 번 등록하면 두 몰입니다.',
      '배송(택배사·발송정책·출고지·배송비·반품지)은 계정 템플릿 그대로 둡니다.',
      '내용을 확인한 뒤 사람이 직접 등록 버튼을 누릅니다.',
    ],
  };
}
