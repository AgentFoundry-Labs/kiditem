import { type MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 키드키즈 스토어 파트너센터(`partner.kidkids.net`) 상품등록.
 *
 * 실측 2026-09-14. 상품 목록 3,478개 전부와 최근 등록물 60개(2026-06~08)의 수정 화면을
 * 읽고 신규 등록 화면과 대조했다. 여기 적은 값은 전부 그 등록물에서 온 것이다.
 *
 *  - 노출 상품명 `[키드아이템] {이름} 1p {키워드…}` (최근 200개 중 194개가 접두어, 186개가 `1p`)
 *  - 송장용 상품명 = 셀피아 원본명(`4000과일바구니딸깍이키링`, 가격 접두 포함)
 *  - 소비자가 = 원본명 앞 숫자, 공급가 = 판매가 × 80%(이익율 20 이 3,450/3,478개)
 *  - 과세 · 옵션 없음 · 최저 1개 · 배송비 유료(CJ대한통운) · 전국 · 2~3일 · 일반상품
 *  - 제조원 해피프랜즈 · 원산지 중국 · 보증기간 7일
 *  - KC 가 있으면 `안전확인` + 번호 + 사용연령, 공정위 고시는 `어린이제품`(13줄).
 *    없으면 고시는 `기타 재화`(5줄). 최근 60개가 정확히 이렇게 갈린다(13 : 47).
 *  - 상세설명 `<center><img></center>` 한 장, 이미지 = 목록 1장 + 추가 최대 4장.
 */

/** 등록 폼 iframe 주소. 겉 `/new/pages/sales/goods_register.htm` 이 이걸 싣는다. */
export const KIDKIDS_REGISTER_URL = 'https://partner.kidkids.net/sales/goods_reg_renewal.htm';

/** 공급가 비율. 목록의 이익율 20 = 공급가가 판매가의 80%. */
export const KIDKIDS_SUPPLY_RATE = 0.8;

/**
 * 기본 분류 `선물/행사 > 완구선물 > 기타완구`.
 *
 * 최근 60개 중 52개가 `완구선물`(359) 아래였다. 그 안에서 말랑이는 `액체괴물`(2554),
 * 키링은 `미니게임기`(2553)였고 나머지가 `기타완구`(2556)다. 소분류는 상품마다 사람이 고친다.
 */
export const KIDKIDS_DEFAULT_CATEGORY = ['5', '359', '2556'] as const;
export const KIDKIDS_DEFAULT_CATEGORY_LABEL = '선물/행사 > 완구선물 > 기타완구';

/** 공정위 고시 분류 번호(`gs_id`). */
export const KIDKIDS_NOTICE_GROUP = { 어린이제품: '42', 기타재화: '54' } as const;

/**
 * AS 책임자 칸 문구. **몰이 정한 값이다** — 화면에 "반드시 [키드키즈 고객센터
 * 02-588-0115]로 등록 바랍니다" 라고 적혀 있고, 등록물 60개 전부 이 글자다.
 * 우리 A/S 번호(`KIDITEM_AS_PHONE`)를 넣으면 안 된다.
 */
export const KIDKIDS_AS_CONTACT = '[키드키즈 고객센터 02-588-0115]';

/** KC 인증 선택. 등록물은 전부 `B` 안전확인이었다. */
export type KidkidsKcType = 'A' | 'B' | 'C';
export const KIDKIDS_KC_TYPES: Readonly<Record<KidkidsKcType, string>> = {
  A: '안전인증',
  B: '안전확인',
  C: '공급자적합성확인',
};

/** 노출 상품명 상한. 화면이 100자에서 자른다. */
export const KIDKIDS_NAME_MAX = 100;
/** 검색키워드 상한. 화면이 75자에서 자른다. */
export const KIDKIDS_KEYWORD_MAX = 75;
/** 추가 이미지 칸(`goods_img_2~5`). */
export const KIDKIDS_EXTRA_IMAGES = 4;

const PRODUCT_PREFIX = '[키드아이템]';
const NAME_KEYWORDS = 4;
const QUALITY_STANDARD = '제품 이상시 공정거래위원회 고시 소비자분쟁해결기준에 의거 보상합니다.';
const SEE_DETAIL = '상세설명참조';

/**
 * 몰 고정 라디오. 신규 화면 기본값과 같지만 일부러 적는다 — 누가 기본값을 바꿔도
 * 우리 상품은 같은 모양으로 들어가야 한다.
 */
export const KIDKIDS_RADIOS: Readonly<Record<string, string>> = {
  /** 과세 */
  tax_type: 'A',
  /** 상품 옵션 없음 */
  optionYN: 'N',
  /** 인쇄문구 옵션 없음 */
  print_text_flag: 'N',
  /** 추가 구성 없음 */
  optionAddYN: 'N',
  /** 서비스 상품 없음 */
  serviceYN: 'N',
  /** 수량 할인 없음 */
  opt_qty: 'N',
  /** 파일 첨부 없음 */
  file_flag: 'N',
  /** 일반상품(회원 전용 아님) */
  only_member: 'N',
  /** 유료배송(무료배송 조건 20만원 · 기본 3,000원은 업체 설정) */
  logis_money_flag_gm: 'Y',
  /** 당일 발송 아님(59/60) */
  today_delivery: 'N',
};

export interface KidkidsRegistrationOptions {
  /** 상품명 뒤 수량. 등록물이 `1p`. */
  quantity?: number;
  /** 분류 세 단(`5>359>2556`). */
  categoryCodes?: readonly string[];
  /** 안전인증번호. 있으면 KC `인증` + 어린이제품 고시. */
  certNumber?: string;
  /** KC 인증 선택. 기본 안전확인. */
  kcType?: KidkidsKcType;
  /** 배송 기간 최장일. 등록물이 3(33개) 또는 7(27개). */
  deliveryMaxDays?: number;
}

export interface KidkidsRegistrationForm {
  url: string;
  fields: Record<string, string>;
  radios: Record<string, string>;
  /** 분류 세 단 + 공정위 고시 분류. 순서대로 고르고 단마다 목록을 기다린다. */
  selectorFields: Record<string, string>;
  /** 공정위 고시 줄. 고시 항목 번호(`info`) → 값. */
  infoRows: Record<string, string>;
  imageGroups: { main: string[]; img2: string[]; img3: string[]; img4: string[]; img5: string[] };
  detailHtmlTarget: string;
  detailUploads: { url: string }[];
  manualSteps: string[];
}

/**
 * 원본명(`4000과일바구니딸깍이키링`)에서 앞 가격을 뗀다.
 *
 * 가격은 세 자리 이상이고 이름에 바로 붙는다. `3D 입체퍼즐` 의 `3` 처럼 이름의 일부인
 * 숫자는 떼지 않는다.
 */
function stripPricePrefix(name: string): string {
  return name.trim().replace(/^\d{3,}(?=\S)(?!\d)/, '').trim();
}

/**
 * 노출 상품명.
 *
 * 실측 `[키드아이템] 애니멀 회전 주사위 키링 1p 휴대용 주사위 장난감 열쇠고리`. 이름에
 * 이미 있는 낱말은 키워드로 다시 붙이지 않는다. 100자를 넘으면 뒤 키워드부터 뺀다 —
 * 화면이 글자 중간을 자르면 반쪽 낱말이 남는다.
 */
export function buildKidkidsProductName(
  name: string,
  keywords: readonly string[],
  quantity: number,
): string {
  const base = stripPricePrefix(name) || name.trim();
  const head = `${PRODUCT_PREFIX} ${base} ${quantity}p`;
  const words = keywords
    .map((keyword) => keyword.replace(/\s+/g, ' ').trim())
    .filter((keyword) => keyword && !base.includes(keyword))
    .slice(0, NAME_KEYWORDS);
  let out = head;
  for (const word of words) {
    const next = `${out} ${word}`;
    if (next.length > KIDKIDS_NAME_MAX) break;
    out = next;
  }
  return out.slice(0, KIDKIDS_NAME_MAX);
}

/**
 * 검색키워드. 등록물은 공백으로 이은 낱말들(`휴대용주사위 주사위키링 회전주사위`).
 * 75자를 넘기지 않게 낱말 단위로 끊는다.
 */
export function buildKidkidsSearchKeywords(keywords: readonly string[]): string {
  const out: string[] = [];
  let length = 0;
  for (const raw of keywords) {
    const word = raw.replace(/\s+/g, '').trim();
    if (!word || out.includes(word)) continue;
    const next = length + (out.length > 0 ? 1 : 0) + word.length;
    if (next > KIDKIDS_KEYWORD_MAX) break;
    out.push(word);
    length = next;
  }
  return out.join(' ');
}

/**
 * 판매가. 화면이 끝자리를 0 으로 내린다(`set_sales_price`: "판매가 1자리 는 0으로
 * 변경 됩니다"). 그 알림이 뜨기 전에 우리가 먼저 내린다.
 */
export function kidkidsSalePrice(salePrice: number): number {
  return salePrice > 0 ? Math.floor(salePrice / 10) * 10 : 0;
}

/** 공급가. 화면 `PricePro` 와 같은 식(`ceil(판매가 × 공급률)`). 4,430 → 3,544. */
export function kidkidsSupplyPrice(salePrice: number, rate: number = KIDKIDS_SUPPLY_RATE): number {
  return salePrice > 0 ? Math.ceil(Math.round(salePrice * rate * 100) / 100) : 0;
}

/**
 * 소비자가. 원본명 앞 숫자(`4000…` → 4,000)가 등록물의 소비자가였다. 없거나 판매가
 * 이하이면 판매가를 쓴다 — 화면이 "소비자가가 판매가 보다 같거나 적습니다" 로 되묻는다.
 */
export function kidkidsConsumerPrice(names: readonly string[], salePrice: number): number {
  for (const name of names) {
    const matched = /^(\d+)/.exec(name.trim());
    const parsed = matched ? Number(matched[1]) : 0;
    if (parsed > salePrice) return parsed;
  }
  return salePrice;
}

/**
 * 사용연령. 등록물은 `8세이상` · `14세이상` 처럼 붙여 쓴다.
 *
 * 상세에 적힌 `만 3세 이상` 도 숫자를 살린다. KC 사용연령은 인증과 같아야 해서, 모양이
 * 다르다고 기본값 8세로 덮으면 3세용 상품이 8세용으로 올라간다.
 */
export function kidkidsAge(raw: string | undefined): string {
  const value = (raw ?? '').replace(/\s+/g, '');
  const years = /(\d+)세/.exec(value);
  if (years) return `${Number(years[1])}세이상`;
  const months = /(\d+)개월/.exec(value);
  if (months) return `${Number(months[1])}개월이상`;
  return '8세이상';
}

function noticeOr(value: string | undefined): string {
  const text = (value ?? '').trim();
  return text && text !== '상세페이지 참조' ? text : SEE_DETAIL;
}

export function kidkidsFormFromDraft(
  draft: MallProductDraft,
  options: KidkidsRegistrationOptions = {},
): KidkidsRegistrationForm {
  const quantity = options.quantity && options.quantity > 0 ? Math.round(options.quantity) : 1;
  const salePrice = kidkidsSalePrice(draft.variants[0]?.salePrice ?? 0);
  // 소비자가는 셀피아 원본명의 가격 접두에서만 읽는다. 노출 이름의 앞 숫자(`5000피스 퍼즐`)는
  // 가격이 아니다.
  const consumerPrice = kidkidsConsumerPrice([draft.sellerProductName], salePrice);
  const category = options.categoryCodes && options.categoryCodes.length === 3
    ? options.categoryCodes
    : KIDKIDS_DEFAULT_CATEGORY;
  const notice = draft.notice.fields;
  const certNumber = (options.certNumber ?? notice.안전인증번호 ?? '').trim();
  const kcType: KidkidsKcType = options.kcType ?? 'B';
  const age = kidkidsAge(notice.사용연령);
  const maker = draft.maker.trim() || '해피프랜즈';
  const origin = (notice.제조국 ?? '').trim() || '중국';
  // 품명은 셀피아 원본명이다. 등록물의 고시 품명이 송장용 상품명과 같았다.
  const modelName = draft.sellerProductName.trim() || draft.displayName.trim();
  const deliveryMax = options.deliveryMaxDays && options.deliveryMaxDays >= 2
    ? Math.min(99, Math.round(options.deliveryMaxDays))
    : 3;

  const fields: Record<string, string> = {
    goods_name: buildKidkidsProductName(draft.displayName, draft.keywords, quantity),
    delivery_gname: modelName.slice(0, KIDKIDS_NAME_MAX),
    // 순서가 뜻이 있다. 판매가를 먼저 넣고 공급가를 넣어야 화면이 공급률을 계산한다.
    final_cus_price: String(consumerPrice),
    sales_price: String(salePrice),
    supplier_price: String(kidkidsSupplyPrice(salePrice)),
    opt_low_qty: '1',
    manufacture_name: maker,
    org_country: origin,
    as_comment: '7일',
    logis_area: '전국',
    logis_from_day: '2',
    logis_to_day: String(deliveryMax),
  };
  const searchKeywords = buildKidkidsSearchKeywords(draft.keywords);
  if (searchKeywords) fields.search_keyword = searchKeywords;
  if (certNumber) {
    fields.kc_view_flag = kcType;
    fields.kc_no = certNumber;
    fields.kc_age = age;
  }

  const infoRows: Record<string, string> = certNumber
    ? {
      277: modelName,
      278: certNumber,
      279: noticeOr(notice.크기),
      280: noticeOr(notice.색상),
      281: noticeOr(notice.재질),
      282: age,
      283: noticeOr(notice.동일모델출시년월),
      284: maker,
      285: origin,
      286: noticeOr(notice.취급방법및주의사항),
      288: KIDKIDS_AS_CONTACT,
      388: SEE_DETAIL,
      287: QUALITY_STANDARD,
    }
    : {
      373: modelName,
      374: SEE_DETAIL,
      375: origin,
      376: maker,
      377: KIDKIDS_AS_CONTACT,
    };

  const rep = draft.representativeImageUrl.trim();
  const extras = draft.additionalImageUrls
    .map((url) => url.trim())
    .filter((url) => url && url !== rep)
    .slice(0, KIDKIDS_EXTRA_IMAGES);

  return {
    url: KIDKIDS_REGISTER_URL,
    fields,
    radios: { ...KIDKIDS_RADIOS, kc_view: certNumber ? 'Y' : 'N' },
    selectorFields: {
      category1: category[0]!,
      category2: category[1]!,
      category3: category[2]!,
      noticeGroup: certNumber ? KIDKIDS_NOTICE_GROUP.어린이제품 : KIDKIDS_NOTICE_GROUP.기타재화,
    },
    infoRows,
    imageGroups: {
      main: rep ? [rep] : [],
      img2: extras[0] ? [extras[0]] : [],
      img3: extras[1] ? [extras[1]] : [],
      img4: extras[2] ? [extras[2]] : [],
      img5: extras[3] ? [extras[3]] : [],
    },
    detailHtmlTarget: 'goods_desc',
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    manualSteps: [
      `분류는 ${category.join(' > ')} 로 골랐습니다. 소분류(액체괴물·미니게임기·기타완구 등)가 맞는지 봅니다.`,
      `판매가 ${salePrice.toLocaleString('ko-KR')}원 · 공급가 ${kidkidsSupplyPrice(salePrice).toLocaleString('ko-KR')}원(80%) · 소비자가 ${consumerPrice.toLocaleString('ko-KR')}원을 넣었습니다.`,
      certNumber
        ? `KC ${KIDKIDS_KC_TYPES[kcType]} ${certNumber} · 공정위 고시 어린이제품 13줄을 채웠습니다.`
        : 'KC 번호가 없어 인증 미해당 · 공정위 고시 기타 재화 5줄로 채웠습니다. 어린이제품이면 번호를 넣고 다시 채웁니다.',
      '확인 뒤 사람이 직접 [등록] 을 누릅니다. 누르면 KC 안내 알림과 확인창이 뜹니다.',
    ],
  };
}
