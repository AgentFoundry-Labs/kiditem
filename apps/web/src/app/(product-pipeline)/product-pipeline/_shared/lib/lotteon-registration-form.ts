import type { MallProductDraft } from './mall-product-draft';

/**
 * 롯데ON 판매자센터 등록 폼 값.
 *
 * 실측 2026-09-14. 기존 등록물(사방넷 OpenAPI 로 올라간 100여 개)의 상품 JSON 을 읽고, 새 등록 화면을
 * 확장 페이지 함수로 저장 없이 채워 화면 검사(`scwin.product.validation`)가 사진 한 칸만 남기는 것까지 봤다.
 * 등록물 `LO2752728442`(킬러볼 스피너 키링) 값:
 *   - 상품명 `킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리` · 판매가 2280 · 재고관리 안 함(999999999)
 *   - 표준카테고리 BC55031100(피젯토이) · 수수료 13% · 원산지 CN · 제조사 해피프랜즈
 *   - 고시 38(기타 재화): 0210 품명 `3500킬러볼스피너키링` · 1400 해당없음 · 1420 CN · 0070 제조자 · 1440 031-908-5401
 *   - 배송비 정책 406468(3만원 미만 3,000원) · 추가배송비 3108763(도서산간 5,000 · 제주 3,000) · 출고/반품지 PLO383047
 *   - 오늘발송 13:00 마감 · 반품 회수 DGNN_RTRV · 최대구매 1일 9,999개 · A/S `7일이내 교환, 반품 가능합니다.`
 */

export const LOTTEON_REGISTER_URL = 'https://store.lotteon.com/cm/main/index_SO.wsp';

/** 기존 등록물이 가장 많이 쓴 장난감 분류. 상품에 맞는 분류는 사람이 고른다. */
export const LOTTEON_DEFAULT_CATEGORY = { code: 'BC55010100', label: '장난감/완구>감각발달완구>기타감각발달완구' } as const;

/** 판매자상품명 상한. 화면은 UTF-8 바이트(한글 3)로 센다. */
export const LOTTEON_NAME_MAX_BYTES = 150;
/** 단품 이미지 창이 받는 최대 장수. */
export const LOTTEON_MAX_IMAGES = 10;

export const LOTTEON_NOTICE = {
  groupCode: '38',
  items: {
    품명: '0210',
    모델명: '0211',
    인증허가: '1400',
    제조자: '0070',
    수입자: '0071',
    AS책임자: '1440',
  },
} as const;

export const LOTTEON_AS_PHONE = '031-908-5401';
export const LOTTEON_AS_TEXT = '7일이내 교환, 반품 가능합니다.';

export const LOTTEON_DELIVERY = {
  costPolicy: '406468',
  extraCostPolicy: '3108763',
  shipPlace: 'PLO383047',
  returnPlace: 'PLO383047',
  courier: '0002',
  returnCourier: '0002',
  sameDay: true,
  closeTime: '1300',
  saturday: 'N',
  retrieveType: 'DGNN_RTRV',
} as const;

export const LOTTEON_PURCHASE = { maxQty: 9999, periodDays: 1 } as const;

const NAME_KEYWORDS = 10;
const STOCK = 999;
const MODEL_NO = /^[A-Za-z0-9\-_+/.]{1,40}$/;

/** 원산지 이름 → 롯데ON 국가 코드. 모르면 기존 등록물처럼 중국. */
const COUNTRY_CODES: Record<string, string> = {
  중국: 'CN',
  한국: 'KR',
  대한민국: 'KR',
  국산: 'KR',
  베트남: 'VN',
  일본: 'JP',
  미국: 'US',
  대만: 'TW',
  인도네시아: 'ID',
  태국: 'TH',
};

export interface LotteonRegistrationOptions {
  /** 상품명에 붙는 `(Np)`. */
  quantity?: number;
  /** 표준카테고리 코드(`BC` + 8자리). */
  category?: string;
  certNumber?: string;
}

export interface LotteonFormValues {
  category: string;
  productName: string;
  salePrice: number;
  stockManaged: boolean;
  stock: number;
  modelNo: string;
  maker: string;
  origin: { typeCode: 'DMST' | 'OVS'; code: string };
  notice: { groupCode: string; values: Record<string, string> };
  delivery: {
    costPolicy: string;
    extraCostPolicy: string;
    shipPlace: string;
    returnPlace: string;
    courier: string;
    returnCourier: string;
    sameDay: boolean;
    closeTime: string;
    saturday: 'Y' | 'N';
    retrieveType: string;
  };
  purchase: { maxQty: number; periodDays: number };
  asText: string;
  sellerCode: string;
}

export interface LotteonRegistrationForm {
  url: string;
  imageGroups: { lotteon: string[] };
  detailUploads: { url: string }[];
  manualSteps: string[];
  lotteon: LotteonFormValues;
}

const encoder = new TextEncoder();

export function lotteonByteLength(text: string): number {
  return encoder.encode(text).length;
}

function cutBytes(text: string, maxBytes: number): string {
  let out = '';
  for (const char of text) {
    if (lotteonByteLength(out + char) > maxBytes) break;
    out += char;
  }
  return out.trim();
}

/** 수집 원본명 앞의 소비자가(`3500킬러볼…`)를 뗀다. */
function stripPricePrefix(name: string): string {
  return name.replace(/^\d{3,}(?=\S)/, '').trim();
}

/**
 * 판매자상품명. 실측 `킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리`.
 * 상한을 넘으면 뒤 키워드부터 빼고, 그래도 넘치면 이름을 자르되 `(Np)` 는 남긴다.
 */
export function buildLotteonProductName(name: string, keywords: readonly string[], quantity: number): string {
  const base = (stripPricePrefix(name) || name.trim()).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  const words = keywords
    .map((keyword) => keyword.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim())
    .filter((keyword, index, all) => keyword && !base.includes(keyword) && all.indexOf(keyword) === index);
  const suffix = ` (${quantity}p)`;
  let out = `${base}${suffix}`;
  if (lotteonByteLength(out) > LOTTEON_NAME_MAX_BYTES) {
    return `${cutBytes(base, LOTTEON_NAME_MAX_BYTES - lotteonByteLength(suffix))}${suffix}`;
  }
  for (const word of words.slice(0, NAME_KEYWORDS)) {
    const next = `${out} ${word}`;
    if (lotteonByteLength(next) > LOTTEON_NAME_MAX_BYTES) break;
    out = next;
  }
  return out;
}

/** 표준카테고리 코드 모양(`BC55031100`). 틀리면 `null`. */
export function parseLotteonCategory(raw: string | undefined): string | null {
  const text = (raw ?? '').trim().toUpperCase();
  return /^BC\d{8}$/.test(text) ? text : null;
}

export function lotteonCountryCode(origin: string | undefined): string {
  const text = (origin ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  return COUNTRY_CODES[text] ?? 'CN';
}

export function lotteonFormFromDraft(
  draft: MallProductDraft,
  options: LotteonRegistrationOptions = {},
): LotteonRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const category = parseLotteonCategory(options.category) ?? LOTTEON_DEFAULT_CATEGORY.code;
  const notice = draft.notice.fields;
  const certNumber = (options.certNumber ?? notice.안전인증번호 ?? '').trim();
  const maker = draft.maker.trim() || '해피프랜즈';
  const countryCode = lotteonCountryCode(notice.제조국);
  // 정보고시 품명은 셀피아 원본명이다. 등록물 고시가 `3500킬러볼스피너키링` 이었다.
  const originalName = draft.sellerProductName.trim() || draft.displayName.trim();
  const variant = draft.variants[0];
  const salePrice = Math.max(0, Math.round(variant?.salePrice ?? 0));
  const sku = (variant?.sellerSku ?? '').replace(/\s/g, '');
  const modelNo = MODEL_NO.test(sku) ? sku : '';

  const rep = draft.representativeImageUrl.trim();
  const images = [rep, ...draft.additionalImageUrls.map((url) => url.trim())]
    .filter((url, index, all) => url && all.indexOf(url) === index)
    .slice(0, LOTTEON_MAX_IMAGES);

  return {
    url: LOTTEON_REGISTER_URL,
    imageGroups: { lotteon: images },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    lotteon: {
      category,
      productName: buildLotteonProductName(draft.displayName, draft.keywords, quantity),
      salePrice,
      // 기존 등록물은 재고를 관리하지 않는다(화면이 999999999 로 둔다).
      stockManaged: false,
      stock: variant?.stock && variant.stock > 0 ? variant.stock : STOCK,
      modelNo,
      maker,
      origin: countryCode === 'KR' ? { typeCode: 'DMST', code: 'KR' } : { typeCode: 'OVS', code: countryCode },
      notice: {
        groupCode: LOTTEON_NOTICE.groupCode,
        values: {
          [LOTTEON_NOTICE.items.품명]: originalName,
          // 모델명·수입자 칸은 줄 필수라 비우면 저장이 막힌다.
          [LOTTEON_NOTICE.items.모델명]: modelNo || '해당없음',
          [LOTTEON_NOTICE.items.인증허가]: certNumber ? `KC 인증 ${certNumber}` : '해당없음',
          [LOTTEON_NOTICE.items.제조자]: maker,
          [LOTTEON_NOTICE.items.수입자]: maker,
          [LOTTEON_NOTICE.items.AS책임자]: LOTTEON_AS_PHONE,
        },
      },
      delivery: { ...LOTTEON_DELIVERY },
      purchase: { ...LOTTEON_PURCHASE },
      asText: LOTTEON_AS_TEXT,
      sellerCode: '',
    },
    manualSteps: [
      `표준카테고리 ${category === LOTTEON_DEFAULT_CATEGORY.code ? LOTTEON_DEFAULT_CATEGORY.label : category} 로 골랐습니다. 상품에 맞는지 봅니다.`,
      '상품 이미지는 가로·세로 500px 이상이어야 롯데ON 이 받습니다. 판매옵션 목록의 이미지를 확인합니다.',
      '배송비는 기존 등록물과 같은 3만원 미만 3,000원 정책입니다. 판매자센터 대표 정책(9,900원 미만)과 다릅니다.',
      '수입구분은 화면 기본값(병행수입)입니다. 공식수입이면 상품주요정보에서 바꿉니다.',
      certNumber
        ? `정보고시 인증 칸에 KC ${certNumber} 를 적었습니다. KC 대상 분류면 인증정보 칸에 구분·번호를 직접 넣습니다.`
        : '정보고시 인증 칸은 기존 등록물처럼 `해당없음` 입니다. KC 대상 분류면 인증정보를 직접 넣습니다.',
      '확인 뒤 사람이 직접 [저장] 을 누릅니다.',
    ],
  };
}
