import { KIDITEM_AS_PHONE, type MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 신세계 파트너오피스(`po.ssgadm.com`) 상품등록.
 *
 * 실측 2026-09-14. 최근 3개월 등록물 45개(전부 API 로 올라간 것)의 수정 화면을 읽고 새 등록
 * 화면에 채워 화면 자체 검증이 통과하는 것까지 확인했다. 여기 적은 값은 전부 그 등록물에서 왔다.
 *
 *  - 상품명 `{이름} 1p {키워드…}`(접두어 없음) · 고객 노출명은 화면이 `브랜드 + 상품명` 으로 만든다
 *  - 브랜드 키드아이템 · 위수탁 · 신세계몰 · 과세 · 재고 999 · 옵션 없음
 *  - 전시카테고리 `기타시즌잡화` · 표준분류 `핸디온 > 패션.잡화` — 45개 전부 같았다
 *  - 판매가 + 마진 15% → 공급가는 화면이 계산(`판매가 × 0.85 ÷ 1.1`, 2,600 → 2,009)
 *  - 고시 `기타`: 품명 = 셀피아 원본명 · 인증 = 상세설명 참조 · 수입 Y · 수입자 해피프랜즈 · A/S 우리 번호
 *  - 배송 협력업체 택배 3일 · 출고배송비 3,000원(3만원 이상 무료) · 반품배송비 3,000원
 *  - 출고지·반송지 = 일산 법곳길 창고
 */

/** 새 상품등록 화면. 쿼리를 붙이면 기존 상품 수정 화면이 되므로 붙이지 않는다. */
export const SSG_REGISTER_URL = 'https://po.ssgadm.com/cp/item/item/itemNew.ssg';

/** 판매사이트 신세계몰. SSG.COM몰 전시카테고리를 고르면 화면이 매핑으로 채운다. */
export const SSG_SITE_NO = '6004';

/** 등록물 브랜드. 서제스트에서 이 이름으로 고른다(`3000047083`). */
export const SSG_BRAND_NAME = '키드아이템';

/** 마진(%). 등록물 45개 전부 15. */
export const SSG_MARGIN_RATE = 15;

/**
 * 상품명 상한(byte). 화면은 한글 2 · 영숫자 1 로 센다(`ItemUtils.getByteLength`).
 * 표준분류마다 상한이 달라 기본 100 인데, 등록물 분류(핸디온)는 90 이었다 — 작은 쪽을 쓴다.
 */
export const SSG_NAME_MAX_BYTES = 90;

/** 검색어 개수. 등록물이 쉼표로 이은 10개다. */
export const SSG_KEYWORD_MAX = 10;

/** 상품이미지 칸(`uitemImgVod10_1~10`). 1번이 대표이미지다. */
export const SSG_MAX_IMAGES = 10;

/** 검색해서 고르는 카테고리. 검색어로 목록을 띄우고 번호로 줄을 고른다. */
export interface SsgCategoryRef {
  id: string;
  keyword: string;
  label: string;
}

export const SSG_DEFAULT_DISPLAY_CATEGORY: SsgCategoryRef = {
  id: '6000162263',
  keyword: '기타시즌잡화',
  label: '유아동신발/잡화 > 모자/머플러/시즌잡화 > 기타시즌잡화',
};

export const SSG_DEFAULT_STANDARD_CATEGORY: SsgCategoryRef = {
  id: '1000022578',
  keyword: '패션.잡화',
  label: '유아동 > 유아/완구/용품 > 완구/놀이/교육 > 핸디온 > 패션.잡화',
};

/** 상품고시 분류(`itemMngPropClsId`). */
export const SSG_NOTICE_CLASS = { 기타: '0000000029', 어린이제품: '0000000025' } as const;

/** 상품고시 속성 번호. 화면의 입력칸 id 가 이 번호다. */
export const SSG_NOTICE_PROP = {
  품명및모델명: '0000000022',
  인증허가: '0000000122',
  어린이제품인증대상: '0000000417',
  크기무게: '0000000037',
  색상: '0000000002',
  재질: '0000000066',
  사용연령: '0000000114',
  크기체중한계: '0000000443',
  출시년월: '0000000032',
  수입여부: '0000000008',
  수입자: '0000000009',
  취급주의: '0000000115',
  품질보증기준: '0000000006',
  AS책임자: '0000000012',
} as const;

/** 출고지·반송지·배송비 정책 번호. 업체 계정에 등록된 값이다(등록물과 같은 것). */
export const SSG_SHIPPING = {
  leadDays: 3,
  outboundAddrId: '0006820704',
  returnAddrId: '0006820707',
  fees: [
    // 출고배송비: 업체택배배송 · 선불 · 주문금액합산 · 3,000원(30,000원 이상 무료)
    { divCd: '10', typeCd: '22', prepayCd: '10', unitCd: '10', feeId: '0000621476' },
    // 반품배송비: 같은 조건 · 3,000원
    { divCd: '20', typeCd: '22', prepayCd: '10', unitCd: '10', feeId: '0000621477' },
  ],
} as const;

const SEE_DETAIL = '상세설명 참조';
const QUALITY_STANDARD = '제품 이상시 공정거래위원회 고시 소비자분쟁해결기준에 의거 보상합니다.';
const NAME_KEYWORDS = 5;

export interface SsgRegistrationOptions {
  /** 상품명 뒤 수량. 등록물이 `1p`. */
  quantity?: number;
  displayCategory?: SsgCategoryRef;
  standardCategory?: SsgCategoryRef;
  /** 안전인증번호. 있으면 고시를 어린이제품으로 채운다. */
  certNumber?: string;
}

export interface SsgFormValues {
  itemName: string;
  brandName: string;
  siteNo: string;
  displayCategory: { id: string; keyword: string };
  standardCategory: { id: string; keyword: string };
  salePrice: number;
  marginRate: number;
  stock: number;
  modelName: string;
  searchKeywords: string;
  notice: {
    classId: string;
    values: Record<string, string>;
    importPropId: string;
    importYn: 'Y' | 'N';
  };
  manufacturer: string;
  originCountry: string;
  shipping: {
    leadDays: number;
    outboundAddrId: string;
    returnAddrId: string;
    fees: { divCd: string; typeCd: string; prepayCd: string; unitCd: string; feeId: string }[];
  };
}

export interface SsgRegistrationForm {
  url: string;
  imageGroups: { ssg: string[] };
  detailUploads: { url: string }[];
  manualSteps: string[];
  ssg: SsgFormValues;
}

/** 화면이 세는 방식의 길이. 한글 등 영숫자 밖의 글자는 2 로 센다. */
export function ssgByteLength(text: string): number {
  let length = 0;
  for (const char of text) length += /^[\x00-\x7f]$/.test(char) ? 1 : 2;
  return length;
}

/** 원본명(`4000만두쫀뜩말랑이`)의 가격 접두. 이름의 일부인 숫자(`3D`)는 떼지 않는다. */
function stripPricePrefix(name: string): string {
  return name.trim().replace(/^\d{3,}(?=\S)(?!\d)/, '').trim();
}

/**
 * 상품명. 실측 `만두 쫀뜩 말랑이 1p 주물럭 스트레스볼 스퀴시`.
 *
 * 이름에 이미 있는 낱말은 키워드로 다시 붙이지 않고, 상한을 넘으면 뒤 키워드부터 뺀다 —
 * 화면이 저장할 때 넘치면 막는다.
 */
export function buildSsgProductName(name: string, keywords: readonly string[], quantity: number): string {
  const base = stripPricePrefix(name) || name.trim();
  let out = `${base} ${quantity}p`;
  const words = keywords
    .map((keyword) => keyword.replace(/\s+/g, ' ').trim())
    .filter((keyword) => keyword && !base.includes(keyword))
    .slice(0, NAME_KEYWORDS);
  for (const word of words) {
    const next = `${out} ${word}`;
    if (ssgByteLength(next) > SSG_NAME_MAX_BYTES) break;
    out = next;
  }
  // 이름만으로 넘치면 글자 단위로 자른다. 저장이 막히는 것보다 사람이 고치는 편이 낫다.
  while (ssgByteLength(out) > SSG_NAME_MAX_BYTES) out = out.slice(0, -1);
  return out.trim();
}

/** 검색어. 등록물은 쉼표로 이은 낱말 10개(`스트레스볼,스퀴시,완구,…`). */
export function buildSsgSearchKeywords(keywords: readonly string[]): string {
  const out: string[] = [];
  for (const raw of keywords) {
    const word = raw.replace(/[\s,]+/g, '').trim();
    if (!word || out.includes(word)) continue;
    out.push(word);
    if (out.length >= SSG_KEYWORD_MAX) break;
  }
  return out.join(',');
}

/** 공급가 미리보기. 실제 값은 화면 가격표가 같은 식으로 계산한다(`판매가 × (1 − 마진) ÷ 1.1`). */
export function ssgSupplyPrice(salePrice: number, marginRate: number = SSG_MARGIN_RATE): number {
  return salePrice > 0 ? Math.round((salePrice * (100 - marginRate)) / 100 / 1.1) : 0;
}

function noticeOr(value: string | undefined): string {
  const text = (value ?? '').trim();
  return text && text !== '상세페이지 참조' ? text : SEE_DETAIL;
}

/**
 * `번호:검색어` 한 줄 → 카테고리. 사람이 몰 화면에서 본 번호와 이름을 그대로 적는다.
 * 모양이 틀리면 `null` — 어댑터가 막는다.
 */
export function parseSsgCategory(raw: string | undefined): SsgCategoryRef | null {
  const text = (raw ?? '').trim();
  const matched = /^(\d{6,})\s*[:|]\s*(\S.*)$/.exec(text);
  if (!matched) return null;
  const keyword = matched[2]!.trim();
  return { id: matched[1]!, keyword, label: keyword };
}

export function ssgFormFromDraft(draft: MallProductDraft, options: SsgRegistrationOptions = {}): SsgRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const salePrice = Math.max(0, Math.round(draft.variants[0]?.salePrice ?? 0));
  const displayCategory = options.displayCategory ?? SSG_DEFAULT_DISPLAY_CATEGORY;
  const standardCategory = options.standardCategory ?? SSG_DEFAULT_STANDARD_CATEGORY;
  const notice = draft.notice.fields;
  const certNumber = (options.certNumber ?? notice.안전인증번호 ?? '').trim();
  const maker = draft.maker.trim() || '해피프랜즈';
  const origin = (notice.제조국 ?? '').trim() || '중국';
  // 품명은 셀피아 원본명이다. 등록물 고시 품명(`4000만두쫀뜩말랑이`)이 그랬다.
  const modelName = draft.sellerProductName.trim() || draft.displayName.trim();

  const values: Record<string, string> = certNumber
    ? {
      [SSG_NOTICE_PROP.품명및모델명]: modelName,
      [SSG_NOTICE_PROP.어린이제품인증대상]: `KC 인증 ${certNumber}`,
      [SSG_NOTICE_PROP.크기무게]: noticeOr(notice.크기),
      [SSG_NOTICE_PROP.색상]: noticeOr(notice.색상),
      [SSG_NOTICE_PROP.재질]: noticeOr(notice.재질),
      [SSG_NOTICE_PROP.사용연령]: noticeOr(notice.사용연령),
      [SSG_NOTICE_PROP.크기체중한계]: SEE_DETAIL,
      [SSG_NOTICE_PROP.출시년월]: noticeOr(notice.동일모델출시년월),
      [SSG_NOTICE_PROP.수입자]: maker,
      [SSG_NOTICE_PROP.취급주의]: noticeOr(notice.취급방법및주의사항),
      [SSG_NOTICE_PROP.품질보증기준]: QUALITY_STANDARD,
      [SSG_NOTICE_PROP.AS책임자]: KIDITEM_AS_PHONE,
    }
    : {
      [SSG_NOTICE_PROP.품명및모델명]: modelName,
      [SSG_NOTICE_PROP.인증허가]: SEE_DETAIL,
      [SSG_NOTICE_PROP.수입자]: maker,
      [SSG_NOTICE_PROP.AS책임자]: KIDITEM_AS_PHONE,
    };

  const rep = draft.representativeImageUrl.trim();
  const images = [rep, ...draft.additionalImageUrls.map((url) => url.trim())]
    .filter((url, index, all) => url && all.indexOf(url) === index)
    .slice(0, SSG_MAX_IMAGES);

  return {
    url: SSG_REGISTER_URL,
    imageGroups: { ssg: images },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    ssg: {
      itemName: buildSsgProductName(draft.displayName, draft.keywords, quantity),
      brandName: SSG_BRAND_NAME,
      siteNo: SSG_SITE_NO,
      displayCategory: { id: displayCategory.id, keyword: displayCategory.keyword },
      standardCategory: { id: standardCategory.id, keyword: standardCategory.keyword },
      salePrice,
      marginRate: SSG_MARGIN_RATE,
      stock: draft.variants[0]?.stock && draft.variants[0].stock > 0 ? draft.variants[0].stock : 999,
      modelName,
      searchKeywords: buildSsgSearchKeywords(draft.keywords),
      notice: {
        classId: certNumber ? SSG_NOTICE_CLASS.어린이제품 : SSG_NOTICE_CLASS.기타,
        values,
        importPropId: SSG_NOTICE_PROP.수입여부,
        importYn: 'Y',
      },
      manufacturer: maker,
      originCountry: origin,
      shipping: {
        leadDays: SSG_SHIPPING.leadDays,
        outboundAddrId: SSG_SHIPPING.outboundAddrId,
        returnAddrId: SSG_SHIPPING.returnAddrId,
        fees: SSG_SHIPPING.fees.map((fee) => ({ ...fee })),
      },
    },
    manualSteps: [
      `전시카테고리 ${displayCategory.label} · 표준분류 ${standardCategory.label} 로 골랐습니다. 상품에 맞는지 봅니다 — 안 맞으면 승인 반려될 수 있습니다.`,
      `판매가 ${salePrice.toLocaleString('ko-KR')}원 · 마진 ${SSG_MARGIN_RATE}% · 공급가 약 ${ssgSupplyPrice(salePrice).toLocaleString('ko-KR')}원(화면 계산)을 넣었습니다.`,
      certNumber
        ? `KC ${certNumber} 로 고시를 어린이제품으로 채웠습니다. 인증정보 표에 [어린이제품인증] 항목과 번호를 직접 추가합니다.`
        : 'KC 번호가 없어 고시를 기타로 채웠습니다. 어린이제품이면 번호를 넣고 다시 채웁니다.',
      '전시 시작은 채운 시각 3시간 뒤 정각으로 넣었습니다. 그보다 늦게 저장하면 화면이 막으니 시작일을 지금 이후로 고칩니다.',
      '확인 뒤 사람이 직접 [저장] 을 누릅니다. 저장하면 MD 승인 대기로 올라갑니다.',
    ],
  };
}
