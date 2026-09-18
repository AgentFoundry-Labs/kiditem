import { KIDITEM_AS_PHONE, type MallNoticeField, type MallProductDraft } from './mall-product-draft';

/**
 * 카카오 톡스토어 판매자센터 등록 폼 값.
 *
 * 실측 2026-09-18. 기존 등록물의 상품 JSON 을 읽고, 새 등록 화면을 확장 페이지 함수로 저장 없이 채워 폼의 칸
 * 상태가 전부 `ng-valid` 가 되는 것까지 봤다. 등록물 `793407891`(포도 설기 말랑이) 값:
 *   - 상품명 `포도 설기 말랑이 1p 주물럭 슬랑이 스트레스볼 찐득볼` · 판매가 2850 · 재고 999 · 브랜드 kiditem
 *   - 카테고리 102106101109(완구/장난감/교구>교육/학습완구>클레이) · 원산지 수입산:아시아:중국
 *   - 인증 [어린이제품] 안전확인(KC_9) `CB065R1010-26001` · 고시 어린이제품: 품명 `4500포도설기말랑이` ·
 *     재질 고무 · 사용연령 8세이상 · 제조자 해피프랜즈 · 제조국 중국 · 주의사항 3줄 · A/S 031-908-5401
 *   - 배송 조건부 무료(3,000원 · 3만원 이상 무료) = 판매자 템플릿 `기본 배송 탬플릿` · 추천 리워드 끔
 */

export const KAKAO_REGISTER_URL = 'https://shopping-seller.kakao.com/product/store-seller/insert';

/** 상품명 상한. 화면이 70자(글자 수)에서 자른다. */
export const KAKAO_NAME_MAX = 70;
/** 대표 1 + 추가 5. */
export const KAKAO_MAX_IMAGES = 6;
/** 판매자 배송비 템플릿 이름. 고르면 조건부 무료 · A/S 안내문구가 따라온다. */
export const KAKAO_DELIVERY_TEMPLATE = '기본 배송 탬플릿';
/** 기존 등록물의 브랜드. 상품에 브랜드가 따로 있으면 그걸 쓴다. */
export const KAKAO_BRAND = 'kiditem';
export const KAKAO_CERT_TYPE = '[어린이제품] 안전확인';
export const KAKAO_NOTICE_GROUP = '어린이제품';
/** 기존 등록물의 취급 주의사항. */
export const KAKAO_CAUTION = '1. 용도 이외에 사용하지 마십시오. 2. 화기에 가까이 가지 마십시오. 3. 입에 넣거나 빨지 마십시오.';

/**
 * 고시 줄 제목(앞부분) → 우리 고시 어휘. 화면 줄 제목이 이 글자로 시작하면 그 값을 친다.
 * 값이 없거나 '상세페이지 참조' 류면 그 줄은 `상품상세설명 참조` 로 둔다.
 */
const NOTICE_ROWS: readonly (readonly [string, MallNoticeField])[] = [
  ['품명 및 모델명', '품명및모델명'],
  ['KC 인증정보', 'KC인증'],
  ['크기, 중량', '크기'],
  ['색상', '색상'],
  ['재질', '재질'],
  ['사용연령', '사용연령'],
  ['동일모델의 출시년월', '동일모델출시년월'],
  ['제조자', '제조자'],
  ['제조국', '제조국'],
  ['취급방법', '취급방법및주의사항'],
  ['품질보증기준', '품질보증기준'],
  ['A/S 책임자', 'AS책임자'],
];

const REFER_TO_DETAIL = /참조|별도\s*표기/;
const NAME_KEYWORDS = 10;
const STOCK = 999;

/** 제조국 → 원산지 지역. 톡스토어 목록 글자 그대로다. 모르는 나라는 지역을 비워 사람이 고르게 한다. */
const ORIGIN_REGIONS: Record<string, string> = {
  중국: '아시아',
  베트남: '아시아',
  일본: '아시아',
  대만: '아시아',
  홍콩: '아시아',
  인도: '아시아',
  인도네시아: '아시아',
  태국: '아시아',
  말레이시아: '아시아',
  필리핀: '아시아',
  캄보디아: '아시아',
  방글라데시: '아시아',
  미국: '북아메리카(북미)',
  캐나다: '북아메리카(북미)',
  독일: '유럽',
  프랑스: '유럽',
  이탈리아: '유럽',
  영국: '유럽',
  스페인: '유럽',
};

const DOMESTIC = new Set(['한국', '대한민국', '국산', '국내산']);

export interface KakaoRegistrationOptions {
  /** 상품명에 붙는 `Np`. */
  quantity?: number;
  /** 톡스토어 카테고리 코드. 비우면 톡스토어 AI 추천 카테고리를 고른다. */
  categoryId?: string;
  certNumber?: string;
}

export interface KakaoFormValues {
  productName: string;
  /** 비면 확장이 상품명으로 뜨는 AI 추천 카테고리의 [선택] 을 누른다. */
  categoryId: string;
  salePrice: number;
  stock: number;
  origin: { type: '국내산' | '수입산'; region: string; country: string };
  cert: { type: string; number: string } | null;
  notice: { group: string; values: Record<string, string> };
  deliveryTemplate: string;
  brand: string;
  manufacturer: string;
  sellerCode: string;
  affiliate: boolean;
}

export interface KakaoRegistrationForm {
  url: string;
  imageGroups: { kakao: string[] };
  detailUploads: { url: string }[];
  manualSteps: string[];
  kakao: KakaoFormValues;
}

/** 수집 원본명 앞의 소비자가(`4500포도…`)를 뗀다. */
function stripPricePrefix(name: string): string {
  return name.replace(/^\d{3,}(?=\S)/, '').trim();
}

function cutChars(text: string, max: number): string {
  return [...text].slice(0, max).join('').trim();
}

/**
 * 상품명. 실측 `포도 설기 말랑이 1p 주물럭 슬랑이 스트레스볼 찐득볼` — 이름 · `Np` · 키워드.
 * 70자를 넘으면 뒤 키워드부터 빼고, 그래도 넘치면 이름을 자르되 `Np` 는 남긴다.
 */
export function buildKakaoProductName(name: string, keywords: readonly string[], quantity: number): string {
  const base = (stripPricePrefix(name) || name.trim()).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  const suffix = ` ${quantity}p`;
  if ([...base].length + suffix.length > KAKAO_NAME_MAX) {
    return `${cutChars(base, KAKAO_NAME_MAX - suffix.length)}${suffix}`;
  }
  let out = `${base}${suffix}`;
  const words = keywords
    .map((keyword) => keyword.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim())
    .filter((keyword, index, all) => keyword && !base.includes(keyword) && all.indexOf(keyword) === index);
  for (const word of words.slice(0, NAME_KEYWORDS)) {
    const next = `${out} ${word}`;
    if ([...next].length > KAKAO_NAME_MAX) break;
    out = next;
  }
  return out;
}

/** 카테고리 코드 모양(세 자리씩 붙는 9~15자리 숫자). 틀리면 `null`. */
export function parseKakaoCategory(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  return /^\d{9,15}$/.test(text) && text.length % 3 === 0 ? text : null;
}

export function kakaoOrigin(country: string | undefined): KakaoFormValues['origin'] {
  const text = (country ?? '').trim();
  if (DOMESTIC.has(text)) return { type: '국내산', region: '', country: '' };
  const name = text || '중국';
  return { type: '수입산', region: ORIGIN_REGIONS[name] ?? '', country: ORIGIN_REGIONS[name] ? name : '' };
}

export function kakaoFormFromDraft(
  draft: MallProductDraft,
  options: KakaoRegistrationOptions = {},
): KakaoRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const categoryId = parseKakaoCategory(options.categoryId) ?? '';
  const fields = draft.notice.fields;
  const certNumber = (options.certNumber ?? fields.안전인증번호 ?? '').trim();
  const maker = draft.maker.trim() || '해피프랜즈';
  const origin = kakaoOrigin(fields.제조국);
  const variant = draft.variants[0];
  const salePrice = Math.max(0, Math.round(variant?.salePrice ?? 0));
  const brand = draft.brand.trim() && draft.brand.trim() !== '노브랜드' ? draft.brand.trim() : KAKAO_BRAND;

  // 고시 값. 품명은 셀피아 원본명이다(등록물 `4500포도설기말랑이`). 인증번호가 있으면 인증 줄에 적는다.
  const known: Partial<Record<MallNoticeField, string>> = {
    ...fields,
    품명및모델명: draft.sellerProductName.trim() || fields.품명및모델명,
    KC인증: certNumber ? `${KAKAO_CERT_TYPE} ${certNumber}` : fields.KC인증,
    제조자: fields.제조자 || maker,
    취급방법및주의사항: fields.취급방법및주의사항 && !REFER_TO_DETAIL.test(fields.취급방법및주의사항)
      ? fields.취급방법및주의사항
      : KAKAO_CAUTION,
    AS책임자: fields.AS책임자 || KIDITEM_AS_PHONE,
  };
  const noticeValues: Record<string, string> = {};
  for (const [row, field] of NOTICE_ROWS) {
    const value = (known[field] ?? '').trim();
    if (value && !REFER_TO_DETAIL.test(value)) noticeValues[row] = value;
  }

  const rep = draft.representativeImageUrl.trim();
  const images = [rep, ...draft.additionalImageUrls.map((url) => url.trim())]
    .filter((url, index, all) => url && all.indexOf(url) === index)
    .slice(0, KAKAO_MAX_IMAGES);

  return {
    url: KAKAO_REGISTER_URL,
    imageGroups: { kakao: images },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    kakao: {
      productName: buildKakaoProductName(draft.displayName, draft.keywords, quantity),
      categoryId,
      salePrice,
      stock: variant?.stock && variant.stock > 0 ? variant.stock : STOCK,
      origin,
      cert: certNumber ? { type: KAKAO_CERT_TYPE, number: certNumber } : null,
      notice: { group: KAKAO_NOTICE_GROUP, values: noticeValues },
      deliveryTemplate: KAKAO_DELIVERY_TEMPLATE,
      brand,
      manufacturer: maker,
      sellerCode: '',
      // 화면 기본은 켜짐(수수료가 붙는 추천 리워드)이다. 기존 등록물은 껐다.
      affiliate: false,
    },
    manualSteps: [
      categoryId
        ? `카테고리 ${categoryId} 로 골랐습니다. 상품에 맞는지 봅니다.`
        : '카테고리는 톡스토어 AI 추천 첫 줄로 골랐습니다. 상품에 맞는지 봅니다.',
      origin.region
        ? `원산지는 ${origin.type} > ${origin.region} > ${origin.country} 입니다.`
        : `원산지 나라(${fields.제조국 ?? '미상'})를 목록에서 직접 고릅니다.`,
      certNumber
        ? `KC 인증번호 ${certNumber} 를 [인증번호확인] 으로 조회했습니다. 모델명이 맞는지 봅니다.`
        : 'KC 인증번호가 없습니다. 어린이제품 인증 대상이면 인증정보를 직접 넣습니다.',
      '상품정보고시는 어린이제품으로, 값이 없는 줄은 `상품상세설명 참조` 로 넣었습니다.',
      `배송은 판매자 템플릿 '${KAKAO_DELIVERY_TEMPLATE}'(3만원 미만 3,000원) 입니다.`,
      '확인 뒤 사람이 직접 [저장하기] 를 누릅니다.',
    ],
  };
}
