import { KIDITEM_AS_PHONE, MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 티처몰(퍼스트몰) 판매자 상품등록.
 *
 * 값과 규칙은 **실제 등록된 상품 둘에서 읽어온 것**이다(라이브 실측 2026-09-10,
 * `1243601 할로윈 LED 거미줄` · `1242700 킬러볼 스피너 키링`).
 *
 * 다섯 몰을 붙이고 나서 이 몰만 다른 것 셋:
 *
 *  1. **사진에 파일 칸이 없다.** 몰 서버에 먼저 올리고 그 주소를 표에 넣는다.
 *     한 번 올리면 서버가 일곱 크기를 만들어 준다.
 *  2. **가격이 셋이다.** 소비자가 / 판매가 / 공급가. 공급가는 정산 기준값이고
 *     화면이 계산해 주지 않아 우리가 넣는다(실측 두 건 모두 판매가 × 0.8).
 *  3. **상품정보고시가 서른아홉 줄이다.** 품목을 고르면 다섯 줄만 생기므로
 *     나머지는 '+' 로 만들어야 한다. 제목 칸도 자유 입력이다.
 */

export const TEACHERVILLE_REGISTER_URL =
  'https://shop.teacherville.co.kr/selleradmin/goods/regist';

/**
 * 판매 수수료. 화면이 `수수료 : 판매가의 [20.00]%` 라고 적어 둔다.
 *
 * 공급가 = 판매가 × (1 - 이 값). 실측 두 건이 정확히 맞는다
 * (2,590 → 2,072 / 2,280 → 1,824).
 */
export const TEACHERVILLE_COMMISSION_RATE = 0.2;

/** 상품정보고시 품목. 실측 등록물 둘 다 `(40)기타 재화` 였다. */
export const TEACHERVILLE_NOTICE_CATEGORY = '40';

/** 재고·안전재고·무게. 실측 그대로. */
export const TEACHERVILLE_STOCK = 999;

/** 기본 분류. 실측 등록물 둘 다 이 경로였다. */
export const TEACHERVILLE_DEFAULT_CATEGORY = '티처몰 > 학급운영';

/** A/S 전화. 실측 그대로. */
export const TEACHERVILLE_AS_PHONE = KIDITEM_AS_PHONE;

/**
 * 상품정보고시 서른아홉 줄.
 *
 * 순서와 제목이 실측 등록물 그대로다. 값이 상품마다 다른 줄만 초안에서 채우고,
 * 나머지는 등록물이 쓰던 문구를 그대로 쓴다. `null` 은 "초안에서 채운다"는 표시다.
 */
const NOTICE_ROWS: readonly (readonly [string, string | null])[] = [
  ['품명 및 모델명', null],
  ['제조사(수입자/병행수입)', null],
  ['제조국', null],
  ['취급시 주의사항', null],
  ['품질보증기준', '관련 법 및 소비자 분쟁 해결 기준을 따름'],
  ['A/S 책임자와 전화번호', TEACHERVILLE_AS_PHONE],
  ['수입여부', 'Y'],
  ['법에 의한 인증 허가 등을 받았음을 확인할 수 있는 경우 그에 대한 사항', '해당없음'],
  ['안전인증여부', null],
  ['표시단위', '해당없음'],
  ['총 용량', '해당없음'],
  ['단위용량', '해당없음'],
  ['판매개수', '1EA'],
  ['색상', null],
  ['사이즈', null],
  ['제품 구성', null],
  ['재질', null],
  ['배송설치비용', '해당없음'],
  ['안전인증번호', null],
  ['상품_무게', '상세설명참조'],
  ['포장단위', '상세설명참조'],
  ['자가검사번호', '해당없음'],
  ['취소/중도해약/해지조건 및 환불방법', '해당없음'],
  ['이용조건', '해당없음'],
  ['소비자 상담 관련 전화번호', '해당없음'],
  ['서비스 제공 사업자', '해당없음'],
  ['제조연월일,유통기한,품질유지기한(기타_유통기간)', '해당없음'],
  ['종자업 등록번호', '해당없음'],
  ['종자 발아율', '해당없음'],
  ['품종 보호 등록번호', '해당없음'],
  ['품종 생산, 수입판매 신고 번호', '해당없음'],
  ['규격묘 표시', '해당없음'],
  ['유전자변형종자표시', '해당없음'],
  ['형식승인번호/종별', '해당없음'],
  ['재질시험압력', '해당없음'],
  ['분사거리/분사시간', '해당없음'],
  ['어는점/사용 범위(온도)', '해당없음'],
  ['충전가스/내압', '해당없음'],
  ['개당 구성 수량', null],
];

export interface TeachervilleRegistrationOptions {
  /** 상품명 뒤에 붙는 수량. 실측 `(1p)`. */
  quantity?: number;
  /** 소비자가. 없으면 원본 상품명 앞의 숫자에서 읽는다. */
  consumerPrice?: number;
  /** 분류 경로. `대분류 > 중분류` 를 `>` 로 잇는다. 코드가 아니라 이름이다. */
  categoryPath?: string;
}

export interface TeachervilleRegistrationForm {
  url: string;
  formId: 'goodsRegist';
  fields: Record<string, string>;
  /** 같은 이름을 쓰는 묶음 칸. 고시 제목·내용 서른아홉 쌍. */
  groups: { noticeTitles: string[]; noticeDescs: string[] };
  /** 분류 경로. 단계 이름 배열이다. */
  categoryPaths: string[][];
  /** 상품 사진. 대표 다음에 추가 이미지, 한 장이 한 상품컷이 된다. */
  imageGroups: { photos: string[] };
  /**
   * 상세설명 이미지.
   *
   * 확장이 몰이 읽을 수 있는 주소인지 보고, 아니면 호스팅에 먼저 올린 뒤
   * `<center><img …></center>` 로 만들어 `contents` 에 넣는다. 이 배열을 빼먹으면
   * 넣을 것이 없어 상세설명 단계가 통째로 건너뛰어진다.
   */
  detailUploads: { url: string }[];
  /** 상세설명이 들어갈 칸. 위지윅을 거치지 않는다. */
  detailHtmlTarget: 'contents';
  manualSteps: string[];
}

/**
 * 티처몰 상품명.
 *
 * 실측: `킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리`
 * 접두어가 없고, **소비자가를 뗀다**(도매꾹·아트공구와 같고 올웨이즈와 반대다).
 * 수량은 괄호로 붙는다.
 */
export function buildTeachervilleProductName(
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
 * 소비자가.
 *
 * 우리 원본명(`3500킬러볼스피너키링`)은 앞에 소비자가를 달고 있고, 실측 등록물의
 * `consumerPrice` 가 정확히 그 숫자였다(3500 · 4000). 그 표기가 없으면 판매가를
 * 쓴다 — 0 으로 두면 화면에 할인율이 이상하게 찍힌다.
 */
export function teachervilleConsumerPrice(displayName: string, salePrice: number): number {
  const matched = /^(\d+)/.exec(displayName.trim());
  const parsed = matched ? Number.parseInt(matched[1]!, 10) : 0;
  return parsed >= salePrice && parsed > 0 ? parsed : salePrice;
}

/** 공급가 = 판매가 - 수수료. 화면이 계산해 주지 않는다. */
export function teachervilleSupplyPrice(salePrice: number): number {
  return Math.round(salePrice * (1 - TEACHERVILLE_COMMISSION_RATE));
}

/** `대분류 > 중분류` → 단계 이름 배열. 빈 단계는 버린다. */
export function parseTeachervilleCategory(raw: string): string[] {
  return raw.split('>').map((part) => part.trim()).filter(Boolean);
}

/** 고시 서른아홉 줄. 상품마다 다른 줄만 초안에서 채운다. */
export function buildTeachervilleNotice(
  draft: MallProductDraft,
  quantity: number,
): { titles: string[]; descs: string[] } {
  const notice = draft.notice.fields;
  const filled: Record<string, string> = {
    '품명 및 모델명': notice.품명및모델명?.trim() || draft.displayName.trim(),
    '제조사(수입자/병행수입)': draft.maker.trim() || draft.brand.trim() || '해당없음',
    제조국: notice.제조국?.trim() || '중국',
    '취급시 주의사항': notice.취급방법및주의사항?.trim() || '상세설명참조',
    안전인증여부: notice.KC인증?.trim() || '해당없음',
    색상: notice.색상?.trim() || '상세설명참조',
    사이즈: notice.크기?.trim() || '상세설명참조',
    '제품 구성': `${quantity}P`,
    재질: notice.재질?.trim() || '상세설명참조',
    안전인증번호: notice.안전인증번호?.trim() || '해당없음',
    '개당 구성 수량': String(quantity),
  };
  const titles: string[] = [];
  const descs: string[] = [];
  for (const [title, fixed] of NOTICE_ROWS) {
    titles.push(title);
    descs.push(fixed ?? filled[title] ?? '해당없음');
  }
  return { titles, descs };
}

export function teachervilleFormFromDraft(
  draft: MallProductDraft,
  options: TeachervilleRegistrationOptions = {},
): TeachervilleRegistrationForm {
  const variant = draft.variants[0];
  if (!variant) {
    throw new Error(`"${draft.displayName}" 에 옵션(SKU)이 없어 티처몰 폼을 만들 수 없습니다.`);
  }
  const quantity = options.quantity ?? 1;
  const salePrice = Math.max(0, Math.round(variant.salePrice));
  const consumerPrice = options.consumerPrice && options.consumerPrice > 0
    ? Math.round(options.consumerPrice)
    : teachervilleConsumerPrice(draft.displayName, salePrice);
  const categoryPath = parseTeachervilleCategory(
    options.categoryPath ?? TEACHERVILLE_DEFAULT_CATEGORY,
  );
  const notice = buildTeachervilleNotice(draft, quantity);

  const photos = [draft.representativeImageUrl, ...draft.additionalImageUrls].filter(Boolean);

  const manualSteps: string[] = [];
  if (photos.length === 0) {
    manualSteps.push('상품 사진이 없습니다. 상품 생성에서 썸네일을 먼저 확정하세요.');
  }
  if (categoryPath.length === 0) {
    manualSteps.push('분류를 고르지 않았습니다. `대분류 > 중분류` 이름으로 넣으세요.');
  }
  if (draft.detailImageUrls.length === 0) {
    manualSteps.push('상세설명 이미지가 없습니다. 상품 생성에서 상세페이지를 먼저 확정하세요.');
  }
  manualSteps.push(
    `공급가 ${teachervilleSupplyPrice(salePrice).toLocaleString('ko-KR')}원은 `
    + `판매가의 ${(1 - TEACHERVILLE_COMMISSION_RATE) * 100}% 입니다. 계약 수수료가 다르면 고치세요.`,
  );
  manualSteps.push('배송방법·구매수량 제한은 화면 기본값입니다. 상품마다 다르면 바꾸세요.');
  manualSteps.push('값이 맞는지 확인한 뒤 화면에서 직접 저장하세요. 자동 저장하지 않습니다.');

  return {
    url: TEACHERVILLE_REGISTER_URL,
    formId: 'goodsRegist',
    fields: {
      goodsName: buildTeachervilleProductName(draft.displayName, draft.keywords, quantity),
      // 이 몰은 키워드 칸이 하나다. 콤마로 잇고 띄어쓰기를 넣지 않는다(실측 그대로).
      keyword: draft.keywords.join(','),
      // 간략 설명. 실측이 원본 상품명 그대로였다(`3500킬러볼스피너키링`).
      summary: draft.displayName.trim(),
      goodsSubInfo: TEACHERVILLE_NOTICE_CATEGORY,
      'consumerPrice[]': String(consumerPrice),
      'price[]': String(salePrice),
      // 수수료 유형이 `SUPR`(원) 이라 이 칸의 값이 곧 공급가다.
      'commissionRate[]': String(teachervilleSupplyPrice(salePrice)),
      'stock[]': String(TEACHERVILLE_STOCK),
      'safe_stock[]': '0',
      'weight[]': '0',
    },
    groups: { noticeTitles: [...notice.titles], noticeDescs: [...notice.descs] },
    categoryPaths: categoryPath.length > 0 ? [categoryPath] : [],
    imageGroups: { photos },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    detailHtmlTarget: 'contents',
    manualSteps,
  };
}
