import { KIDITEM_AS_PHONE, MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 도매꾹 상품공급사센터 등록 폼.
 *
 * 값과 규칙은 **실제 등록된 상품에서 읽어온 것**이다(라이브 실측 2026-09-10,
 * 상품번호 67662430 `생수통 치즈 슬라임(3탄)`). 폼에 무엇을 넣을 수 있는가가
 * 아니라, 이 판매자가 실제로 무엇을 넣어 왔는가가 기준이다.
 *
 * 키즈노트와 다른 점 — 같은 상품이라도 몰마다 다른 값이 들어간다는 증거다.
 *  1. **`[키드아이템]` 접두어가 없다.** 도매꾹 상품명은 `상품명 + 수량 + 키워드` 다.
 *  2. **가격 접두 코드도 없다.** 키즈노트 고시 품명은 `3500킬러볼스피너키링` 처럼
 *     셀피아 원본명을 그대로 넣지만, 도매꾹 고시 품명은 `주물럭` 같은 짧은 품목명이다.
 *  3. **묶음 판매다.** `unitQty`(최소 구매수량) 가 있고 실측값이 5 였다. 소매몰에는
 *     없는 개념이라 초안이 들고 있지 않고, 사람이 몰별 값으로 고른다.
 *  4. 제조사 표기가 `해피프렌즈` 다. 쿠팡·키즈노트에 쓰는 `해피프랜즈` 와 철자가
 *     다르다 — 오타처럼 보이지만 이 몰에 등록된 실제 표기라 그대로 따른다.
 *  5. 빈 칸에 빈 문자열이 아니라 `.` 을 넣어 왔다(`itemSize`, `itemWeight`).
 *
 * 같은 점 — 상세설명은 키즈노트와 **같은 호스팅 URL** 을 쓴다
 * (`kiditem.diskn.com/<해시>`). 한 번 올린 이미지를 두 몰이 공유한다.
 */

export const DOMEGGOOK_REGISTER_URL = 'https://www.domeggook.com/sc/item/regFrm';

/** 상품정보고시 상품군. 34개 중 어린이제품. */
export const DOMEGGOOK_INFO_DUTY_TYPE_CHILD = '23';

/**
 * '어린이제품'(23) 고시 칸.
 *
 * ⚠️ 이름이 두 갈래다. 의미 키(`itemCode`·`itemCompany`·`itemCountry`·`itemSize`)는
 * 기본정보 칸과 연동되고, 나머지는 `infoDuty[0]`~`[8]` 처럼 번호다. 번호는 화면
 * 순서와 일치하지 않는다(색상이 1, 재질이 2, 사용연령이 3, 한계가 8).
 * **상품군을 바꾸면 이 맵 전체가 달라진다.**
 */
export const DOMEGGOOK_CHILD_NOTICE_FIELD = {
  품명및모델명: 'infoDuty[itemCode]',
  KC인증: 'infoDuty[0]',
  크기중량: 'infoDuty[itemSize]',
  색상: 'infoDuty[1]',
  재질: 'infoDuty[2]',
  사용연령: 'infoDuty[3]',
  크기체중한계: 'infoDuty[8]',
  동일모델출시년월: 'infoDuty[4]',
  제조자: 'infoDuty[itemCompany]',
  제조국: 'infoDuty[itemCountry]',
  취급방법: 'infoDuty[5]',
  품질보증기준: 'infoDuty[6]',
  AS책임자: 'infoDuty[7]',
} as const;

/** 거래조건 4칸. 실측에서 전부 같은 값이었다. */
export const DOMEGGOOK_TERMS_FIELDS = [
  'infoDuty[c1]',
  'infoDuty[c2]',
  'infoDuty[c3]',
  'infoDuty[c4]',
] as const;

export const DOMEGGOOK_TERMS_VALUE = '상세정보참고';

/**
 * 화면의 키워드 칸 수.
 *
 * ⚠️ 이 칸들은 `name` 이 없다(class `lKeywordTmp`). 숨은 `itemKeyword` 만 채우면
 * 화면은 빈 채로 남고, 페이지가 그 칸들로 숨은 값을 다시 만들어 우리 값을 덮는다.
 */
export const DOMEGGOOK_KEYWORD_SLOTS = 10;

/** 고시 기본값. 실측 그대로다. */
export const DOMEGGOOK_CHILD_NOTICE_DEFAULTS: Record<string, string> = {
  KC인증: '내용없음',
  크기중량: '상세설명참조',
  색상: '상세설명참조',
  재질: '상세설명참조',
  사용연령: '내용없음',
  크기체중한계: '상세설명참조',
  동일모델출시년월: '상세설명참조',
  제조자: '내용없음',
  제조국: '중국',
  취급방법: '상세설명참조',
  품질보증기준: '상세설명참조',
  AS책임자: `고객센터 ${KIDITEM_AS_PHONE}`,
};

/** 기본정보 고정값. 실측 전 상품 동일. */
export const DOMEGGOOK_BASE_VALUE = {
  /** 이 몰에 등록된 제조사 표기. 다른 몰의 `해피프랜즈` 와 철자가 다르다. */
  itemCompany: '해피프렌즈',
  itemCountry: '수입산_아시아_중국',
  /** 빈 값 대신 점 하나. 실측 관행이다. */
  itemSize: '.',
  itemWeight: '.',
  supplyAmt: '0',
  maxQty: '0',
} as const;

/**
 * 배송·반품·판매 조건. 상품 67662430 실측값이다.
 *
 * 등록폼 기본값과 다른 것들이라 손대지 않으면 이 판매자의 조건이 되지 않는다
 * (라이브 대조 2026-09-10). 특히 배송비는 기본이 '고정단가 1구간'인데 실제로는
 * '수량별 2구간'(1개~3,000원 / 43개~0원)이다.
 */
export const DOMEGGOOK_TRADE_TERMS = {
  /** 배송비 결제방식: 구매자(선불·착불)선택. 등록폼 기본은 선결제(S). */
  deliveryWho: 'C',
  /** 배송비 구간 수. 등록폼 기본은 1. */
  deliverySectionCount: '2',
  /** 배송비를 수량으로 나눈다. 등록폼 기본은 고정단가(fix). */
  deliBuyerOpt: 'qty',
  /** `수량+단가|수량+단가`. 1개부터 3,000원, 43개부터 무료. */
  deliBuyerTblStr: '1+3000|43+0',
  deliveryAmount: '0',
  /** 반품배송비(편도). */
  returnDeliAmt: '3000',
} as const;

/**
 * 원산지 세 칸. `수입산 > 아시아 > 중국` 의 내부 번호다(실측).
 * 화면 값이고, `itemCountry` 는 도매꾹이 제출할 때 여기서 만든다.
 */
export const DOMEGGOOK_ORIGIN_SELECT = {
  originType: '1',
  originArea: '4',
  originNation: '36',
} as const;

/**
 * 안전인증 두 칸. `일반` + `[어린이제품] 안전확인`(실측).
 * 인증번호는 상품마다 달라 여기 두지 않는다.
 */
export const DOMEGGOOK_CERT_SELECT = {
  certExempt: '01',
  certType: 'B02',
} as const;

/** 라디오 기본 선택. 실측 그대로다. */
export const DOMEGGOOK_RADIOS = {
  /** 도매꾹 판매(SELL) / 내 상점(SHOP) */
  itemSection: 'SELL',
  /** 과세 */
  taxAdded: '1',
  /** 택배 */
  deliveryMethod: 'TB',
  /** 안전인증 대상 */
  itemSafetyCert: '1',
  onlyForAdult: '0',
  /**
   * 대표이미지 올리는 방식. `1`=일반업로드(한 장 넣으면 몰이 크기를 만든다),
   * `0`=전문가용업로드(크기별로 다른 이미지를 넣는다).
   *
   * 등록폼 기본값은 `1` 인데, 이 판매자의 실제 등록물은 전부 `0` 이다
   * (라이브 실측 2026-09-10, 상품 67662430). `1` 로 두면 `image1~4` 가 숨은 칸이
   * 되어 우리가 넣은 사진 넉 장이 아무 데도 안 붙는다.
   */
  imageResize: '0',
  /** 배송비 결제방식 — 구매자(선불,착불)선택. */
  deliveryWho: DOMEGGOOK_TRADE_TERMS.deliveryWho,
  /** 배송비 구간 수 — 2구간. */
  lAmtSectionCntDeliDome: DOMEGGOOK_TRADE_TERMS.deliverySectionCount,
} as const;

/** 노출 마켓. 도매꾹만 켜고 공급사(supply)는 끈다. */
export const DOMEGGOOK_MARKETS = { dome: true, supply: false } as const;

export interface DomeggookRegistrationOptions {
  /** 도매꾹 분류 코드(`09_03_05_11_00_00` 6단). 사람이 고른다. */
  categoryCode?: string;
  /** 최소 구매수량(묶음). 도매라 1이 아닌 경우가 많다. 실측 5. */
  unitQty?: number;
  /** 상품명에 붙는 수량 표기. `1p` 형태. */
  quantity?: number;
  /**
   * 모델명(`itemCode`). 실측 `9735-1`.
   *
   * 도매꾹 화면 라벨은 '모델명'이고, 그 옆 '공급사상품코드'는 별개이며 비어 있었다.
   * 값의 모양은 셀피아 상품코드와 같은 `숫자-숫자` 다.
   */
  itemCode?: string;
  /**
   * 안전인증번호. 실측 `CB065R1579-2008`.
   *
   * 화면의 인증번호 칸은 `name` 이 없어 폼으로는 못 닿는다. 확장이 선택자로 찾아
   * 넣고, 도매꾹이 제출할 때 `itemCertNumber[1]` 을 만든다.
   */
  certNumber?: string;
}

export interface DomeggookRegistrationForm {
  url: string;
  formId: 'lFormRegItem';
  fields: Record<string, string>;
  checks: Record<string, boolean>;
  radios: Record<string, string>;
  fileUploads: { name: string; url: string }[];
  /**
   * 상세설명 HTML 이 들어갈 칸.
   *
   * 확장이 직접 쓰지 않는다. '상품상세내용 작성하기' 버튼을 눌러 팝업 에디터로
   * 넣고, 이 칸은 들어갔는지 확인하는 데 쓴다.
   */
  detailHtmlTarget: 'itemMemo[Item]';
  detailUploads: { url: string }[];
  /**
   * `내 다른 판매상품 홍보` 칸 내용. 비어 있으면 확장이 그 항목을 끈다.
   * 값이 있으면 켠 채로 채운다.
   */
  promoHtml: string;
  /**
   * 이름이 없어 폼으로는 못 닿는 체크박스. 확장이 선택자로 찾아 누른다.
   *
   * `imageAllow` = `이미지 사용허용`(도매매 판매시 필수옵션).
   */
  selectorChecks: { imageAllow: boolean };
  /**
   * 이름이 없어 폼으로는 못 닿는 입력칸. 확장이 선택자로 찾아 넣는다.
   *
   * 원산지 세 칸은 계단식이고, 안전인증 칸은 상품군을 고르면 다시 그려진다.
   */
  selectorFields: {
    originType: string;
    originArea: string;
    originNation: string;
    certExempt: string;
    certType: string;
    certNumber: string;
  };
  /**
   * 이름 없는 묶음 입력에 넣을 값.
   *
   * 키워드 10칸은 `name` 이 없어서 이름으로 못 닿는다. 화면 칸을 채워야 하고,
   * 채우면 숨은 `itemKeyword` 는 페이지가 알아서 다시 만든다.
   */
  groups: { keywords: string[] };
  manualSteps: string[];
}

/**
 * 대표이미지 칸.
 *
 * 전문가용업로드(`imageResize=0`)에서 보이는 칸은 `image1~4` 이고 순서대로
 * 760·330·150·75 픽셀 이상이다. `image0` 은 일반업로드 전용이라 이 방식에서는
 * 숨는다(라이브 실측 2026-09-10). 큰 것부터 채운다.
 */
const IMAGE_SLOTS = ['image1', 'image2', 'image3', 'image4'] as const;

/**
 * `내 다른 판매상품 홍보` 칸에 넣는 값.
 *
 * 이 항목은 켜면 도매꾹이 내용을 요구한다 — 비우고 켜면 "내용을 입력해주세요"
 * 로 제출이 막힌다(라이브 확인 2026-09-10). 이 판매자의 등록물은 이 칸에
 * `descn2` 를 들고 있다(상품 67662430 `itemMemo[OtherItem]`). 같은 값을 쓴다.
 */
export const DOMEGGOOK_PROMO_HTML = 'descn2';

/**
 * 도매꾹 상품명.
 *
 * 실측: `생수통 치즈 슬라임(3탄) 1p 끈끈이 주물럭 스트레스해소`
 * 상품명 + 수량 + 키워드이고, 접두어가 없다.
 *
 * ⭐ 몰마다 상품명이 다르다. 우리 원본명은 `2000생수통치즈슬라임(3탄)` 처럼 앞에
 * 소비자가가 붙어 있는데(셀피아 표기), 도매꾹 등록물에는 그 숫자가 없다. 도매
 * 단가는 따로 넣으므로 상품명에 남은 소비자가는 사는 사람을 헷갈리게 한다.
 * 그래서 여기서 떼어낸다 — 키즈노트 고시 품명은 반대로 원본명을 그대로 쓴다.
 */
export function stripPricePrefix(name: string): string {
  // 숫자로 시작할 때만 뗀다. `3M` 처럼 숫자가 이름의 일부인 경우를 지우지 않도록
  // 뒤에 글자가 남는지 확인한다.
  const stripped = name.trim().replace(/^\d+\s*/, '');
  return stripped.length > 0 ? stripped : name.trim();
}

export function buildDomeggookTitle(
  name: string,
  keywords: readonly string[],
  quantity: number,
): string {
  return [stripPricePrefix(name), `${quantity}p`, ...keywords]
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 고시 품명.
 *
 * 실측값이 `주물럭` 이었다 — 상품명 전체도, 셀피아 원본명도 아닌 짧은 품목명이다.
 * 우리에게 그 짧은 이름을 가진 필드가 없어서 초안의 고시 품명을 쓰고, 없으면
 * 상품명을 쓴다. 사람이 폼에서 줄이는 것이 정답인 칸이라 안내를 남긴다.
 */
function noticeItemName(draft: MallProductDraft): string {
  return draft.notice.fields.품명및모델명?.trim() || draft.displayName.trim();
}

export function domeggookFormFromDraft(
  draft: MallProductDraft,
  options: DomeggookRegistrationOptions = {},
): DomeggookRegistrationForm {
  const variant = draft.variants[0];
  if (!variant) {
    throw new Error(`"${draft.displayName}" 에 옵션(SKU)이 없어 도매꾹 폼을 만들 수 없습니다.`);
  }
  const quantity = options.quantity ?? 1;
  const unitQty = options.unitQty ?? 1;

  const fields: Record<string, string> = {
    mode: 'addItem',
    itemTitle: buildDomeggookTitle(draft.displayName, draft.keywords, quantity),
    itemCompany: DOMEGGOOK_BASE_VALUE.itemCompany,
    itemCountry: DOMEGGOOK_BASE_VALUE.itemCountry,
    itemSize: DOMEGGOOK_BASE_VALUE.itemSize,
    itemWeight: DOMEGGOOK_BASE_VALUE.itemWeight,
    // 가격은 숫자만. 도매꾹은 콤마를 받지 않는다.
    amt1: String(Math.max(0, Math.round(variant.salePrice))),
    supplyAmt: DOMEGGOOK_BASE_VALUE.supplyAmt,
    unitQty: String(unitQty),
    qty: String(Math.max(0, variant.stock)),
    maxQty: DOMEGGOOK_BASE_VALUE.maxQty,
    // 판매단가 표. 1구간만 쓰므로 `구간+단가` 하나다.
    amtSectionTblStr: `1+${Math.max(0, Math.round(variant.salePrice))}`,
    // 배송조건. 등록폼 기본값과 다르다.
    deliveryAmount: DOMEGGOOK_TRADE_TERMS.deliveryAmount,
    deliBuyerOpt: DOMEGGOOK_TRADE_TERMS.deliBuyerOpt,
    deliBuyerTblStr: DOMEGGOOK_TRADE_TERMS.deliBuyerTblStr,
    returnDeliAmt: DOMEGGOOK_TRADE_TERMS.returnDeliAmt,
    infoDutyType: DOMEGGOOK_INFO_DUTY_TYPE_CHILD,
    ...(options.categoryCode ? { itemCategory: options.categoryCode } : {}),
    ...(options.itemCode ? { itemCode: options.itemCode } : {}),
  };

  // 고시: 기본값 위에 초안 값을 덮는다.
  const noticeValues: Record<string, string> = {
    ...DOMEGGOOK_CHILD_NOTICE_DEFAULTS,
    품명및모델명: noticeItemName(draft),
  };
  const optionColor = variant.options.find((option) => option.type === '색상')?.value;
  if (optionColor && optionColor !== '단일') noticeValues.색상 = optionColor;
  if (draft.notice.fields.제조국) noticeValues.제조국 = draft.notice.fields.제조국;
  if (draft.notice.fields.사용연령) noticeValues.사용연령 = draft.notice.fields.사용연령;

  for (const [key, value] of Object.entries(noticeValues)) {
    const target = DOMEGGOOK_CHILD_NOTICE_FIELD[key as keyof typeof DOMEGGOOK_CHILD_NOTICE_FIELD];
    if (target && value) fields[target] = value;
  }
  for (const term of DOMEGGOOK_TERMS_FIELDS) fields[term] = DOMEGGOOK_TERMS_VALUE;

  const imageUrls = [draft.representativeImageUrl, ...draft.additionalImageUrls]
    .filter((url) => url.length > 0)
    .slice(0, IMAGE_SLOTS.length);

  const manualSteps: string[] = [];
  if (!options.categoryCode) {
    // 6단 코드를 지어내지 않는다. 대신 도매꾹이 이미지로 추천한 분류를 확장이 받는다.
    manualSteps.push('분류는 도매꾹 AI 추천을 그대로 받습니다. 다르면 화면에서 바꾸세요.');
  }
  if (options.unitQty === undefined) {
    manualSteps.push('최소 구매수량(묶음)이 1로 들어갔습니다. 도매 단위가 다르면 바꾸세요.');
  }
  manualSteps.push('고시 품명이 상품명 전체입니다. 실제 등록물은 짧은 품목명을 씁니다.');
  if (!options.itemCode) {
    manualSteps.push('모델명이 비어 있습니다. 실제 등록물은 `9735-1` 형태를 씁니다.');
  }
  if (!options.certNumber) {
    manualSteps.push('안전인증번호가 비어 있습니다. `[어린이제품] 안전확인` 번호를 넣으세요.');
  }
  manualSteps.push(
    '배송비는 수량별 2구간(1개~3,000원 / 43개~무료), 반품배송비 3,000원으로 넣었습니다. '
    + '상품마다 다르면 화면에서 바꾸세요.',
  );
  if (draft.detailImageUrls.length === 0) {
    manualSteps.push('상세설명 이미지가 없습니다. 상품 생성에서 상세페이지를 먼저 확정하세요.');
  }
  manualSteps.push('값이 맞는지 확인하세요. 폼만 채웠고 [등록]은 누르지 않았습니다.');

  return {
    url: DOMEGGOOK_REGISTER_URL,
    formId: 'lFormRegItem',
    fields,
    checks: {
      'market[]:dome': DOMEGGOOK_MARKETS.dome,
      'market[]:supply': DOMEGGOOK_MARKETS.supply,
      // 최초배송비가 무료면 왕복배송비 부과. 실측 상품이 켜 두었다.
      returnDeliAmtDouble: true,
      // 배수단위로판매. 묶음(`unitQty`) 판매라 함께 켠다.
      byUnitQty: true,
    },
    radios: { ...DOMEGGOOK_RADIOS },
    fileUploads: imageUrls.map((url, index) => ({ name: IMAGE_SLOTS[index] as string, url })),
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    detailHtmlTarget: 'itemMemo[Item]',
    promoHtml: DOMEGGOOK_PROMO_HTML,
    selectorChecks: { imageAllow: true },
    selectorFields: {
      ...DOMEGGOOK_ORIGIN_SELECT,
      ...DOMEGGOOK_CERT_SELECT,
      certNumber: options.certNumber?.trim() ?? '',
    },
    // 화면의 키워드 칸은 10개다. 넘치면 확장이 알려 준다.
    groups: { keywords: draft.keywords.slice(0, DOMEGGOOK_KEYWORD_SLOTS) },
    manualSteps,
  };
}
