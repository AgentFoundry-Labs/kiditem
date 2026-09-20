import type { MallProductDraft } from './mall-product-draft';
import { mallDisplayName } from '@kiditem/shared/sales-product';

/**
 * 몰 중립 초안 → GS SHOP 파트너스 상품등록(`partners.gsshop.com/product/products/create`).
 *
 * 실측 2026-09-14. 기존 등록물(`1128331771`)의 상품 JSON·정보고시·기술서를 읽고, 새 등록 화면에 채워 화면
 * 저장소 값과 화면 표시까지 저장 없이 확인했다. 여기 적은 값은 그 등록물에서 왔다.
 *
 *  - 노출상품명 `{이름} (1p) {키워드…}` · 송장상품명 `{이름} (1p) {키워드 하나}`(30바이트)
 *  - 분류 `완구/게임 > 완구/게임 > 팬시/드레스 액세서리 > 팬시/드레스 액세서리` · 전시 `피규어/프라모델`(1662165)
 *  - 브랜드 키드아이템 · 수수료율 20% → 공급가는 화면이 계산(830 → 664)
 *  - 구성상품 제조사 해피프랜즈 · 원산지 중국
 *  - 배송 CJ대한통운 · 3,000원(3만원 이상 무료) · 반품 3,000 · 교환 6,000 · 제주/도서 3,000 · 편의점 비대상
 *  - 정보고시 `기타 재화`(43): 품명 = 셀피아 원본명 · 인증 = 해당없음 · 제조국 · 제조자(A/S 는 GS 고정)
 */

/** 새 상품등록 화면. `/update/<번호>`·`/copy/<번호>` 는 판매중 상품 수정·복사다. */
export const GSSHOP_REGISTER_URL = 'https://partners.gsshop.com/product/products/create';

export const GSSHOP_DEFAULT_CATEGORY = {
  code: 'B35012701',
  label: '완구/게임 > 완구/게임 > 팬시/드레스 액세서리 > 팬시/드레스 액세서리',
} as const;

export const GSSHOP_DEFAULT_SECTION = {
  id: '1662165',
  label: '도서/문구/취미 > 문구/사무용품 > 피규어/프라모델/완구 > 피규어/프라모델',
} as const;

/** 계정에 등록된 브랜드. 협력사마다 번호가 다르다. */
export const GSSHOP_BRAND = { code: '244211', name: '키드아이템' } as const;

/** 수수료율(%). 등록물이 20. 공급가 = 판매가 × (1 − 수수료율). */
export const GSSHOP_MARGIN_RATE = 20;

/** 화면이 세는 바이트 상한(한글 2 · 영숫자 1). */
export const GSSHOP_EXPOSURE_NAME_MAX_BYTES = 160;
export const GSSHOP_INVOICE_NAME_MAX_BYTES = 30;
export const GSSHOP_MODEL_NAME_MAX_BYTES = 60;

/** 대표 1 + 추가 7. */
export const GSSHOP_MAX_IMAGES = 8;

/** 정보고시 `기타 재화` 항목 코드. A/S(43143)는 GS 고객센터로 고정이라 넣지 않는다. */
export const GSSHOP_NOTICE = {
  groupCode: '43',
  items: { 품명및모델명: '43026', 인증허가: '43141', 제조국: '43142', 제조자: '43004' },
} as const;

/** 배송·반품·교환. 협력사 기본 주소지(0001)와 등록물 조건. */
export const GSSHOP_DELIVERY = {
  courier: 'DH',
  convenienceReturn: 'N',
  fee: 3000,
  freeOver: 30000,
  returnFee: 3000,
  exchangeFee: 6000,
  remote: { fee: 3000, returnFee: 3000, exchangeFee: 3000 },
  refundType: '10',
  shipAddress: '0001',
  returnAddress: '0001',
  bundle: 'A01',
  weight: 'A02',
  length: 'B02',
} as const;

// 등록물 노출상품명이 키워드 여덟 개였다. 160바이트 안에서 넣을 수 있는 만큼.
const NAME_KEYWORDS = 10;
const STOCK = 999;
const SAFE_STOCK = 5;
// 노출상품명에서 화면이 막는 글자.
const EXPOSURE_FORBIDDEN = /["<>|\\?*]/g;
// 송장상품명에서 화면이 막는 글자(? * 는 저장할 때 공백으로 바뀐다).
const INVOICE_FORBIDDEN = /[:"<>|\\'?*]/g;

export interface GsshopRegistrationOptions {
  /** 상품명의 `(1p)`. */
  quantity?: number;
  /** 분류 코드(`B35012701`). */
  category?: string;
  /** 전시 카테고리 매장 번호. */
  sectionId?: string;
  /** 협력사 상품코드. 비우면 후보 번호로 만든다. */
  supplierProductCode?: string;
  /** 안전인증번호. 있으면 정보고시 인증 칸에 적는다. */
  certNumber?: string;
}

export interface GsshopFormValues {
  category: string;
  sectionId: string;
  supplierProductCode: string;
  mdId: string;
  employeeNo: string;
  exposureName: string;
  invoiceName: string;
  brand: { code: string; name: string };
  modelName: string;
  composition: { content: string; packageCount: number; maker: string; origin: string };
  salePrice: number;
  marginRate: number;
  delivery: {
    courier: string;
    convenienceReturn: 'Y' | 'N';
    fee: number;
    freeOver: number;
    returnFee: number;
    exchangeFee: number;
    remote: { fee: number; returnFee: number; exchangeFee: number };
    refundType: string;
    shipAddress: string;
    returnAddress: string;
    bundle: string;
    weight: string;
    length: string;
  };
  stock: number;
  safeStock: number;
  notice: { groupCode: string; values: Record<string, string> };
}

export interface GsshopRegistrationForm {
  url: string;
  imageGroups: { gsshop: string[] };
  detailUploads: { url: string }[];
  manualSteps: string[];
  gsshop: GsshopFormValues;
}

/** 화면이 세는 방식의 길이. 영숫자 밖의 글자는 2 로 센다. */
export function gsshopByteLength(text: string): number {
  let length = 0;
  for (const char of text) length += /^[\x00-\x7f]$/.test(char) ? 1 : 2;
  return length;
}

function cutBytes(text: string, maxBytes: number): string {
  let out = '';
  for (const char of text) {
    if (gsshopByteLength(out + char) > maxBytes) break;
    out += char;
  }
  return out.trim();
}

/** 원본명 앞의 소비자가(`1200땅콩말랑키링`). 이름의 일부인 숫자(`3D`)는 떼지 않는다. */
function stripPricePrefix(name: string): string {
  return mallDisplayName(name);
}

function nameParts(name: string, keywords: readonly string[], forbidden: RegExp) {
  const base = (stripPricePrefix(name) || name.trim()).replace(forbidden, '').replace(/\s+/g, ' ').trim();
  const words = keywords
    .map((keyword) => keyword.replace(forbidden, '').replace(/\s+/g, ' ').trim())
    .filter((keyword, index, all) => keyword && !base.includes(keyword) && all.indexOf(keyword) === index);
  return { base, words };
}

/**
 * 노출상품명. 실측 `땅콩 말랑 키링 (1p) 열쇠고리 가꾸 백참 키보드 키홀더 가방 장식 악세사리`.
 * 상한을 넘으면 뒤 키워드부터 뺀다.
 */
export function buildGsshopExposureName(name: string, keywords: readonly string[], quantity: number): string {
  const { base, words } = nameParts(name, keywords, EXPOSURE_FORBIDDEN);
  let out = `${base} (${quantity}p)`;
  for (const word of words.slice(0, NAME_KEYWORDS)) {
    const next = `${out} ${word}`;
    if (gsshopByteLength(next) > GSSHOP_EXPOSURE_NAME_MAX_BYTES) break;
    out = next;
  }
  return cutBytes(out, GSSHOP_EXPOSURE_NAME_MAX_BYTES);
}

/**
 * 송장상품명(택배 송장에 찍힌다). 실측 `땅콩 말랑 키링 (1p) 열쇠고리`(28/30).
 * 키워드는 하나만, 넘치면 빼고, 그래도 넘치면 이름을 자른다.
 */
export function buildGsshopInvoiceName(name: string, keywords: readonly string[], quantity: number): string {
  const { base, words } = nameParts(name, keywords, INVOICE_FORBIDDEN);
  const withQuantity = `${base} (${quantity}p)`;
  const withKeyword = words[0] ? `${withQuantity} ${words[0]}` : withQuantity;
  if (gsshopByteLength(withKeyword) <= GSSHOP_INVOICE_NAME_MAX_BYTES) return withKeyword;
  if (gsshopByteLength(withQuantity) <= GSSHOP_INVOICE_NAME_MAX_BYTES) return withQuantity;
  const suffix = ` (${quantity}p)`;
  return `${cutBytes(base, GSSHOP_INVOICE_NAME_MAX_BYTES - gsshopByteLength(suffix))}${suffix}`;
}

/**
 * 협력사 상품코드. 계정 안에서 겹치면 저장이 막힌다. 후보 번호에서 만들어 같은 상품은 늘 같은 코드가 된다.
 * 영문·숫자 20자 이내(화면 규칙).
 */
export function gsshopSupplierProductCode(candidateId: string): string {
  const hex = candidateId.replace(/[^0-9a-f]/gi, '').slice(0, 12).toUpperCase();
  return `KID${hex || '000000000000'}`;
}

/** 공급가 미리보기. 실제 값은 화면이 판매가·수수료율로 계산한다. */
export function gsshopSupplyPrice(salePrice: number, marginRate: number = GSSHOP_MARGIN_RATE): number {
  return salePrice > 0 ? Math.round((salePrice * (100 - marginRate)) / 100) : 0;
}

/** 분류 코드(대 3자 + 중·소·세 각 2자리). 모양이 틀리면 `null`. */
export function parseGsshopCategory(raw: string | undefined): string | null {
  const text = (raw ?? '').trim().toUpperCase();
  return /^[A-Z]\d{8}$/.test(text) ? text : null;
}

/** 전시 카테고리 매장 번호. 모양이 틀리면 `null`. */
export function parseGsshopSection(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  return /^\d{5,}$/.test(text) ? text : null;
}

export function gsshopFormFromDraft(draft: MallProductDraft, options: GsshopRegistrationOptions = {}): GsshopRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const category = parseGsshopCategory(options.category) ?? GSSHOP_DEFAULT_CATEGORY.code;
  const sectionId = parseGsshopSection(options.sectionId) ?? GSSHOP_DEFAULT_SECTION.id;
  const supplierProductCode = (options.supplierProductCode ?? '').trim() || gsshopSupplierProductCode(draft.candidateId);
  const notice = draft.notice.fields;
  const certNumber = (options.certNumber ?? notice.안전인증번호 ?? '').trim();
  const maker = draft.maker.trim() || '해피프랜즈';
  const origin = (notice.제조국 ?? '').trim() || '중국';
  // 정보고시 품명은 셀피아 원본명이다. 등록물 고시가 `1200땅콩말랑키링` 이었다.
  const originalName = draft.sellerProductName.trim() || draft.displayName.trim();
  const salePrice = Math.max(0, Math.round(draft.variants[0]?.salePrice ?? 0));

  const rep = draft.representativeImageUrl.trim();
  const images = [rep, ...draft.additionalImageUrls.map((url) => url.trim())]
    .filter((url, index, all) => url && all.indexOf(url) === index)
    .slice(0, GSSHOP_MAX_IMAGES);

  return {
    url: GSSHOP_REGISTER_URL,
    imageGroups: { gsshop: images },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    gsshop: {
      category,
      sectionId,
      supplierProductCode,
      // 담당MD 는 계정에 붙은 MD 중 첫 번째를 확장이 화면에서 고른다.
      mdId: '',
      employeeNo: '',
      exposureName: buildGsshopExposureName(draft.displayName, draft.keywords, quantity),
      invoiceName: buildGsshopInvoiceName(draft.displayName, draft.keywords, quantity),
      brand: { code: GSSHOP_BRAND.code, name: GSSHOP_BRAND.name },
      modelName: cutBytes(originalName, GSSHOP_MODEL_NAME_MAX_BYTES),
      composition: {
        content: stripPricePrefix(draft.displayName) || draft.displayName.trim(),
        packageCount: quantity,
        maker,
        origin,
      },
      salePrice,
      marginRate: GSSHOP_MARGIN_RATE,
      delivery: {
        ...GSSHOP_DELIVERY,
        remote: { ...GSSHOP_DELIVERY.remote },
      },
      stock: draft.variants[0]?.stock && draft.variants[0].stock > 0 ? draft.variants[0].stock : STOCK,
      safeStock: SAFE_STOCK,
      notice: {
        groupCode: GSSHOP_NOTICE.groupCode,
        values: {
          [GSSHOP_NOTICE.items.품명및모델명]: originalName,
          [GSSHOP_NOTICE.items.인증허가]: certNumber ? `KC 인증 ${certNumber}` : '해당없음',
          [GSSHOP_NOTICE.items.제조국]: origin,
          [GSSHOP_NOTICE.items.제조자]: maker,
        },
      },
    },
    manualSteps: [
      `상품분류 ${GSSHOP_DEFAULT_CATEGORY.code === category ? GSSHOP_DEFAULT_CATEGORY.label : category} · 전시 카테고리 ${GSSHOP_DEFAULT_SECTION.id === sectionId ? GSSHOP_DEFAULT_SECTION.label : sectionId} 로 골랐습니다. 상품에 맞는지 봅니다.`,
      `판매가 ${salePrice.toLocaleString('ko-KR')}원 · 수수료율 ${GSSHOP_MARGIN_RATE}% → 공급가 약 ${gsshopSupplyPrice(salePrice).toLocaleString('ko-KR')}원(화면 계산)을 넣었습니다.`,
      `협력사 상품코드는 ${supplierProductCode} 입니다. 이미 쓰인 코드라는 경고가 있으면 바꿉니다.`,
      certNumber
        ? `정보고시 인증 칸에 KC ${certNumber} 를 적었습니다. 안전인증 대상이면 인증/허가 구분·기관·번호·발급일을 직접 넣습니다.`
        : '정보고시 인증 칸은 기존 등록물처럼 `해당없음` 입니다. 안전인증 대상이면 인증정보를 직접 넣습니다.',
      '담당MD는 계정의 첫 번째 MD, 배송은 CJ대한통운 3,000원(3만원 이상 무료)·반품 3,000원·교환 6,000원·제주/도서 3,000원입니다.',
      '확인 뒤 사람이 직접 [전체저장] 을 누릅니다.',
    ],
  };
}
