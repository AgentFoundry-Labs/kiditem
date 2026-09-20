import { KIDITEM_AS_PHONE, type MallProductDraft } from './mall-product-draft';
import { mallDisplayName, mallNamePriceCode } from '@kiditem/shared/sales-product';

/**
 * 몰 중립 초안 → 네이버 스마트스토어센터 상품등록(`sell.smartstore.naver.com/#/products/create`).
 *
 * 실측 2026-09-14. 기존 등록물(`13660537717`)의 상품 JSON 을 읽고, 새 등록 화면에 채워 화면 모델과
 * 폼 검증까지 저장 없이 확인했다. 여기 적은 값은 그 등록물에서 왔다.
 *
 *  - 상품명 `{이름} 1p {키워드…}`(접두어 없음) — `초코파이 크런치 슬랑이 1p 왁뿌 주물럭 스트레스볼`
 *  - 카테고리 `출산/육아 > 완구/인형 > 감각발달완구 > 기타감각발달완구`
 *  - ⭐ 판매가 = 셀피아 원본명 앞 소비자가(6,000), 즉시할인 = 소비자가 − 우리 판매가(2,440) → 실판매 3,560
 *  - 브랜드 `kiditem` · 제조사 · 원산지 수입(중국) · 수입사 `거영아이앤디(KY I&D)`
 *  - 어린이제품인증 [어린이제품]안전확인 · 고시 `기타 재화`(품명·모델명 = 셀피아 원본명, 인증 = 상세설명 참조)
 *  - 태그 = 키워드 · 배송/반품·교환/A/S 는 계정 기본값(화면이 이미 채워 둔다)
 */

/** 새 상품등록 화면. 해시가 `#/products/edit/<번호>` 면 판매중 상품 수정이다. */
export const SMARTSTORE_REGISTER_URL = 'https://sell.smartstore.naver.com/#/products/create';

/** 상품명 입력칸 `maxlength`. */
export const SMARTSTORE_NAME_MAX = 100;

/** 상품명 뒤에 붙이는 키워드 수. 등록물이 세 개였다. */
const NAME_KEYWORDS = 3;

/** 태그 개수·길이. 길이는 UTF-8 바이트다(한글 10자 · 영문 30자). 넘으면 화면이 거절한다. */
export const SMARTSTORE_TAG_MAX = 10;
export const SMARTSTORE_TAG_MAX_BYTES = 30;

/** 대표 1장 + 추가이미지 칸 수. */
export const SMARTSTORE_MAX_EXTRA_IMAGES = 9;

/** 등록물 브랜드(직접입력). */
export const SMARTSTORE_BRAND_NAME = 'kiditem';

/** 수입사. 원산지를 수입으로 고르면 필수다. */
export const SMARTSTORE_IMPORTER = '거영아이앤디(KY I&D)';

/** [어린이제품]안전확인. 등록물 인증이 이것이다(안전인증 1040 · 공급자적합성확인 1042). */
export const SMARTSTORE_CHILD_CERT_ID = '1041';

/** 원산지 selectize 옵션 키 — 수입산 · 아시아 · 중국. */
export const SMARTSTORE_ORIGIN_CHINA = { exposureType: 'IMPORT', firstSub: '0200', secondSub: '0200037' } as const;

/** 검색해서 고르는 카테고리. 검색어로 목록을 받고 번호로 고른다. */
export interface SmartstoreCategoryRef {
  id: string;
  keyword: string;
  label: string;
}

export const SMARTSTORE_DEFAULT_CATEGORY: SmartstoreCategoryRef = {
  id: '50004643',
  keyword: '기타감각발달완구',
  label: '출산/육아 > 완구/인형 > 감각발달완구 > 기타감각발달완구',
};

const SEE_DETAIL = '상세설명 참조';
// 네이버가 상품명·모델명·태그에서 막는 글자.
const FORBIDDEN = /[\\*?"<>]/g;
const DOMESTIC = new Set(['한국', '국산', '대한민국']);

export interface SmartstoreRegistrationOptions {
  /** 상품명 뒤 수량. 등록물이 `1p`. */
  quantity?: number;
  category?: SmartstoreCategoryRef;
  /** 어린이제품 안전확인 번호. 있으면 어린이제품인증을 채운다. */
  certNumber?: string;
}

export interface SmartstoreFormValues {
  category: { id: string; keyword: string };
  productName: string;
  /** 판매가(할인 전). */
  salePrice: number;
  /** 즉시할인(원). 0 이면 할인 없음. */
  discountWon: number;
  stock: number;
  modelName: string;
  brandName: string;
  manufacturerName: string;
  /** 수입 원산지. 국산이면 `null`(화면 기본값이 국산이다). */
  origin: { exposureType: string; firstSub: string; secondSub: string; importer: string } | null;
  childCert: { certId: string; number: string; companyName: string } | null;
  notice: {
    type: 'ETC';
    itemName: string;
    modelName: string;
    certificateDetails: string;
    manufacturer: string;
    afterServiceDirector: string;
  };
  tags: string[];
}

export interface SmartstoreRegistrationForm {
  url: string;
  imageGroups: { smartstore: string[] };
  detailUploads: { url: string }[];
  manualSteps: string[];
  smartstore: SmartstoreFormValues;
}

function stripPricePrefix(name: string): string {
  return mallDisplayName(name);
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * 상품명. 실측 `초코파이 크런치 슬랑이 1p 왁뿌 주물럭 스트레스볼`.
 *
 * 이름에 이미 있는 낱말은 키워드로 다시 붙이지 않고, 상한을 넘으면 뒤 키워드부터 뺀다.
 */
export function buildSmartstoreProductName(name: string, keywords: readonly string[], quantity: number): string {
  const base = (stripPricePrefix(name) || name.trim()).replace(FORBIDDEN, '').replace(/\s+/g, ' ').trim();
  let out = `${base} ${quantity}p`;
  const words = keywords
    .map((keyword) => keyword.replace(FORBIDDEN, '').replace(/\s+/g, ' ').trim())
    .filter((keyword, index, all) => keyword && !base.includes(keyword) && all.indexOf(keyword) === index)
    .slice(0, NAME_KEYWORDS);
  for (const word of words) {
    const next = `${out} ${word}`;
    if (next.length > SMARTSTORE_NAME_MAX) break;
    out = next;
  }
  return out.slice(0, SMARTSTORE_NAME_MAX).trim();
}

/**
 * 판매가와 즉시할인.
 *
 * 등록물이 `판매가 6,000(원본명 앞 소비자가) − 즉시할인 2,440 = 3,560(우리 판매가)` 이었다. 할인은
 * 10원 단위라 내림한다 — 실판매가가 우리 판매가 밑으로 내려가지 않게. 소비자가가 없거나 우리 가격보다
 * 싸면 할인 없이 우리 판매가만 쓴다.
 */
export function smartstorePricing(
  names: readonly string[],
  salePrice: number,
): { salePrice: number; discountWon: number } {
  const ours = Number.isFinite(salePrice) && salePrice > 0 ? Math.round(salePrice) : 0;
  const consumer = names
    .map((name) => mallNamePriceCode(name) ?? 0)
    .find((value) => value > 0) ?? 0;
  const discountWon = consumer > ours ? Math.floor((consumer - ours) / 10) * 10 : 0;
  return discountWon >= 10 && ours > 0 ? { salePrice: consumer, discountWon } : { salePrice: ours, discountWon: 0 };
}

/** 태그. 공백·금지 글자를 빼고, 한글 10자(30바이트)를 넘는 것과 중복은 버린다. 10개까지. */
export function buildSmartstoreTags(keywords: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of keywords) {
    const tag = raw.replace(FORBIDDEN, '').replace(/\s+/g, '');
    if (!tag || out.includes(tag) || utf8Length(tag) > SMARTSTORE_TAG_MAX_BYTES) continue;
    out.push(tag);
    if (out.length >= SMARTSTORE_TAG_MAX) break;
  }
  return out;
}

/**
 * `번호:검색어` 한 줄 → 카테고리. 사람이 스마트스토어 화면에서 본 번호와 마지막 단 이름을 적는다.
 * 모양이 틀리면 `null` — 어댑터가 막는다.
 */
export function parseSmartstoreCategory(raw: string | undefined): SmartstoreCategoryRef | null {
  const text = (raw ?? '').trim();
  const matched = /^(\d{8,})\s*[:|]\s*(\S.*)$/.exec(text);
  if (!matched) return null;
  const keyword = matched[2]!.trim();
  return { id: matched[1]!, keyword, label: keyword };
}

export function smartstoreFormFromDraft(
  draft: MallProductDraft,
  options: SmartstoreRegistrationOptions = {},
): SmartstoreRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const category = options.category ?? SMARTSTORE_DEFAULT_CATEGORY;
  const notice = draft.notice.fields;
  const certNumber = (options.certNumber ?? notice.안전인증번호 ?? '').trim();
  const maker = draft.maker.trim() || '해피프랜즈';
  const origin = (notice.제조국 ?? '').trim() || '중국';
  // 모델명·고시 품명은 셀피아 원본명이다. 등록물 고시가 `6000초코파이크런치슬랑이` 였다
  // (검색용 모델명은 셀피아 코드였지만 초안에는 코드가 없다).
  const originalName = (draft.sellerProductName.trim() || draft.displayName.trim()).replace(FORBIDDEN, '');
  const pricing = smartstorePricing([draft.sellerProductName, draft.displayName], draft.variants[0]?.salePrice ?? 0);
  const ours = pricing.salePrice - pricing.discountWon;

  const rep = draft.representativeImageUrl.trim();
  const images = [rep, ...draft.additionalImageUrls.map((url) => url.trim())]
    .filter((url, index, all) => url && all.indexOf(url) === index)
    .slice(0, 1 + SMARTSTORE_MAX_EXTRA_IMAGES);

  const importOrigin = origin === '중국'
    ? { ...SMARTSTORE_ORIGIN_CHINA, importer: SMARTSTORE_IMPORTER }
    : null;

  return {
    url: SMARTSTORE_REGISTER_URL,
    imageGroups: { smartstore: images },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    smartstore: {
      category: { id: category.id, keyword: category.keyword },
      productName: buildSmartstoreProductName(draft.displayName, draft.keywords, quantity),
      salePrice: pricing.salePrice,
      discountWon: pricing.discountWon,
      stock: draft.variants[0]?.stock && draft.variants[0].stock > 0 ? draft.variants[0].stock : 999,
      modelName: originalName,
      brandName: SMARTSTORE_BRAND_NAME,
      manufacturerName: maker,
      origin: importOrigin,
      childCert: certNumber ? { certId: SMARTSTORE_CHILD_CERT_ID, number: certNumber, companyName: maker } : null,
      notice: {
        type: 'ETC',
        itemName: originalName,
        modelName: originalName,
        certificateDetails: SEE_DETAIL,
        manufacturer: maker,
        afterServiceDirector: KIDITEM_AS_PHONE,
      },
      tags: buildSmartstoreTags(draft.keywords),
    },
    manualSteps: [
      `카테고리 ${category.label} 로 골랐습니다. 상품에 맞는지 봅니다.`,
      pricing.discountWon > 0
        ? `판매가 ${pricing.salePrice.toLocaleString('ko-KR')}원(원본명 소비자가) − 즉시할인 ${pricing.discountWon.toLocaleString('ko-KR')}원 = ${ours.toLocaleString('ko-KR')}원으로 넣었습니다.`
        : `판매가 ${ours.toLocaleString('ko-KR')}원을 넣었습니다(원본명에 소비자가가 없어 즉시할인 없음).`,
      certNumber
        ? `어린이제품인증 [안전확인] ${certNumber} · 인증상호 ${maker} 를 넣었습니다. 인증기관(필수)·인증일자는 제품안전정보센터에서 번호로 찾아 넣습니다 — 안전인증·공급자적합성확인이면 종류를 바꿉니다.`
        : "KC 번호가 없어 어린이제품인증을 비워 뒀습니다. 번호를 넣거나, 인증대상이 아니면 '대상 아님' 을 고릅니다.",
      ...(importOrigin
        ? []
        : [DOMESTIC.has(origin)
          ? '원산지는 화면 기본값(국산) 그대로 뒀습니다. 상품 주요정보에서 확인합니다.'
          : `원산지 ${origin} 는 채우지 않았습니다. 상품 주요정보에서 고릅니다.`]),
      '배송·반품/교환·A/S 는 계정 기본값 그대로입니다(조건부 무료 3,000원 · 3만원 이상 무료).',
      '확인 뒤 사람이 직접 [저장하기] 를 누릅니다.',
    ],
  };
}
