import { KIDITEM_AS_PHONE, type MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 아이스크림몰(아이스크림 PO/BO) 상품등록.
 *
 * 실측 2026-09-11. 기존 등록물 `goodsNo=11411122`
 * (`슈가 귤 쫀득 쫀뜩 주물럭 1p 귤주물럭 찐득이`)을 읽고 신규 폼과 대조했다.
 * 상세는 `docs/superpowers/2026-09-11-icecream-mall-product-register-research.md`.
 *
 * 여섯 몰과 다른 것 셋:
 *
 *  1. **`<form>` 이 섹션마다 하나씩 열한 개다.** 한 폼을 찾아 채우는 방식이 통하지
 *     않아 `formFields` 를 폼 id 로 나눠 담는다.
 *  2. **고시가 분류로 열리지 않는다.** 품목코드를 주고 몰의 함수를 불러야 행이 그려진다.
 *     그 행들은 `name` 이 없어 제목으로 찾아야 한다(11번가와 같은 사정).
 *  3. **공급가 = 판매가 × 0.75.** 티처몰(×0.8)과 다르다.
 */

/** 신규 등록 화면. 메뉴 `상품 > 상품 정보 관리 > 상품 등록` 의 주소다. */
export const ICECREAM_REGISTER_URL =
  'https://po.i-screammall.co.kr/goods/temporaryGeneralGoods.temporaryGeneralGoodsView.do';

/** 마진율. 실측 등록물이 25% 였고 공급가 1,950 = 판매가 2,600 × 0.75 로 맞는다. */
export const ICECREAM_MARGIN_RATE = 0.25;

/**
 * 상품고시 품목코드. 실측 등록물이 `023 영유아용품` 이었다.
 *
 * 화면에서 이 칸은 **disabled** 다 — 사람이 고르는 값이 아니라 몰이 정한다. 우리는
 * 고시 행을 열기 위한 열쇠로만 쓴다.
 */
export const ICECREAM_NOTICE_ITEM_CODE = '023';

/** 판매기간. 실측 등록물이 2050-12-31 까지였다. */
export const ICECREAM_SALE_END = '2050-12-31';

/** 재고수량. 재고관리를 쓰지 않는 몰이라 0 이다(실측). */
export const ICECREAM_STOCK = 0;

/** A/S 전화번호. **아이스크림몰 실측 등록물의 번호** 그대로다. */
export const ICECREAM_AS_PHONE = KIDITEM_AS_PHONE;

/**
 * 몰 고정 선택값. 전부 **실측 등록물에서 읽은 값**이다(`goodsNo=11411122`).
 *
 * 예전엔 이름·가격 몇 칸만 채웠더니 배송비·과세·재고가 빈 채로 남아 기존 상품과
 * 달랐다(라이브 2026-09-11). 등록물에 있는 항목은 전부 채운다.
 */
export const ICECREAM_SELECTS = {
  goodsInfo: { buyrAgeLmtCd: '0' },
  priceInfo: { taxGbCd: '01' },
  deliveryInfo: {
    deliGoodsGbCd: '01',
    deliGoodsDtlGbCd: '10',
    deliDday: '2',
    deliPsbRgnCd: '01',
    /** 조건부 무료(5만원 미만 3,000원 / 반품비 3,000원). 우리 계정의 배송정책 번호다. */
    deliPolcNo: '3916',
  },
} as const;

/** 몰 고정 라디오. 실측 등록물 그대로. */
export const ICECREAM_RADIOS = {
  goodsInfo: {
    dispYn: 'Y',
    schPsbYn: 'Y',
    milgRsrvPsbYn: 'Y',
    gvgfPsbYn: 'N',
    indDvsnPayGoodsYn: 'N',
    szGdeUseYn: 'N',
  },
  deliveryInfo: {
    cmbDeliYn: 'Y',
    ordCnclPsbYn: 'Y',
    exchPsbYn: 'Y',
    rtnPsbYn: 'Y',
    wthdYn: 'Y',
    notUseRtnTermCd: '10',
  },
  saleInfo: {
    stkMgrYn: 'N',
    buyQtyLmtYn: 'N',
    optnYn: 'N',
    safeStkNotiYn: 'N',
  },
} as const;

/** 결제가능수단. 신용카드·실시간계좌이체·포인트(실측). */
export const ICECREAM_PAY_WAYS = ['11', '12', '32'] as const;

/** 추가 이미지 칸 상한. 화면 안내 그대로 아홉 장이다(실측 2026-09-11). */
export const ICECREAM_MAX_ADDITIONAL_IMAGES = 9;

/** 기본 분류. 실측 등록물이 쓰던 자리다. */
export const ICECREAM_DEFAULT_CATEGORY = '아이스크림몰>학급운영>학생선물>장난감/완구';
export const ICECREAM_DEFAULT_CATEGORY_CODE = 'BC0105010200';

/**
 * 고시 열여섯 줄 중 우리가 채우는 열두 줄.
 *
 * 제목은 화면에 찍힌 글자 그대로다 — 칸에 `name` 이 없어 이 글자로 찾는다.
 * `null` 이면 초안에서 채우고, 값이 있으면 몰 고정값이다.
 */
const NOTICE_ROWS: readonly (readonly [string, string | null])[] = [
  ['품명 및 모델명', null],
  ['크기, 중량', null],
  ['색상', null],
  ['재질', null],
  ['사용연령(체중범위)', null],
  ['동일모델의 출시년월', null],
  ['제조자', null],
  ['제조국', null],
  ['취급방법 및 주의사항', null],
  ['품질보증기준', '공정거래위원회 고시 소비자 분쟁해결 기준에 따름'],
  ['A/S 책임자 / 전화번호', ICECREAM_AS_PHONE],
];

export interface IcecreamRegistrationOptions {
  /** 상품명 뒤에 붙는 수량. 실측 `1p`. */
  quantity?: number;
  /** 정상가(소비자가). 없으면 원본 상품명 앞의 숫자를 쓴다. */
  listPrice?: number;
  /** 분류 경로. `아이스크림몰>…` 를 `>` 로 잇는다. */
  categoryPath?: string;
  /** 분류 코드(`BC…`). 경로만 넣으면 몰이 못 찾을 수 있어 함께 받는다. */
  categoryCode?: string;
  /** 네이버 최저가. 우리 데이터에 없어 사람이 정한다. */
  naverMinPrice?: number;
  /** 네이버 최저가 조사 주소. */
  naverMinPriceUrl?: string;
  /** 조사일(`YYYY-MM-DD`). 없으면 비운다 — 날짜를 지어내지 않는다. */
  naverMinPriceCheckedOn?: string;
  /**
   * 셀피아 SKU 코드. 몰의 업체상품코드 칸(`entrGoodsNo`)에 심는다. 사방넷이 `모델명`에
   * 셀피아 코드를 넣어 보낸 자리와 같다 — 심어 두면 등록 상품을 가져올 때 이름이 아니라
   * 코드로 정확히 이어진다(KID-246). 목록 조회가 이 칸을 그대로 돌려준다.
   */
  sellpiaCode?: string;
}

export interface IcecreamRegistrationForm {
  url: string;
  /**
   * 폼 id → 그 폼의 칸 값.
   *
   * 이 몰만 `<form>` 이 열한 개라 어느 폼의 칸인지까지 말해 줘야 한다. 같은 이름의
   * 칸이 여러 폼에 있어서(`deliFcstDt` 등) 폼을 무시하면 엉뚱한 칸에 들어간다.
   */
  formFields: Record<string, Record<string, string>>;
  /** 폼 id → 라디오 이름 → 고를 값. */
  formRadios: Record<string, Record<string, string>>;
  /** 폼 id → 체크박스 이름 → 켤 값들(또는 true). */
  formChecks: Record<string, Record<string, string[] | boolean>>;
  /** 분류. 칸이 readonly 라 팝업 대신 코드와 경로를 직접 넣는다. */
  category: { code: string; path: string };
  /**
   * 고시.
   *
   * `itemCode` 로 몰의 `getAnnoucementItemInfo` 를 불러 행을 연 뒤, 제목으로 찾아
   * 값을 넣는다. 행을 열지 않으면 채울 칸 자체가 없다.
   */
  notice: {
    itemCode: string;
    safeCertiTgtYn: 'Y' | 'N';
    /** KC인증 필 유무 라디오(`072`). */
    kcCertified: 'Y' | 'N';
    certNumber: string;
    rows: { title: string; value: string }[];
  };
  /** 대표 한 장, 추가 여러 장. 추가 칸은 `+` 로 늘린다. */
  imageGroups: { representative: string[]; additional: string[] };
  /** 상세설명 이미지. 확장이 주소를 만들어 HTML 로 넣는다. */
  detailUploads: { url: string }[];
  /** 상세설명이 들어갈 칸. 네이버 SmartEditor 2 의 뒷단 textarea 다. */
  detailHtmlTarget: 'detailHtmlEditor';
  manualSteps: string[];
}

/**
 * 아이스크림몰 상품명.
 *
 * 실측 `슈가 귤 쫀득 쫀뜩 주물럭 1p 귤주물럭 찐득이`. 접두어가 없고 앞의 소비자가를
 * 떼며 수량이 중간에 `1p` 로 들어간다 — 11번가와 같은 규칙이다(티처몰은 `(1p)`).
 */
export function buildIcecreamProductName(
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
 * 정상가(소비자가).
 *
 * 우리 원본명(`4000슈가귤쫀득쫀뜩주물럭`)이 앞에 소비자가를 달고 있고, 실측 등록물의
 * 정상가가 정확히 그 숫자(4,000)였다. 그 표기가 없으면 판매가를 쓴다 — 0 으로 두면
 * 화면에 할인율이 이상하게 찍힌다.
 */
export function icecreamListPrice(displayName: string, salePrice: number): number {
  const matched = /^(\d+)/.exec(displayName.trim());
  const parsed = matched ? Number.parseInt(matched[1]!, 10) : 0;
  return parsed >= salePrice && parsed > 0 ? parsed : salePrice;
}

/** 공급가 = 판매가 × (1 - 마진율). 화면이 계산해 주지 않는다. */
export function icecreamSupplyPrice(salePrice: number): number {
  return Math.round(salePrice * (1 - ICECREAM_MARGIN_RATE));
}

/** `아이스크림몰>학급운영>…` → 단계 이름 배열. 빈 단계는 버린다. */
export function parseIcecreamCategory(raw: string): string[] {
  return raw.split('>').map((part) => part.trim()).filter(Boolean);
}

/** 고시 열한 줄. 상품마다 다른 줄만 초안에서 채운다. */
export function buildIcecreamNotice(
  draft: MallProductDraft,
): { title: string; value: string }[] {
  const notice = draft.notice.fields;
  const filled: Record<string, string> = {
    '품명 및 모델명': notice.품명및모델명?.trim() || draft.sellerProductName.trim(),
    '크기, 중량': notice.크기?.trim() || '상세페이지 참조',
    색상: notice.색상?.trim() || '상세페이지 참조',
    재질: notice.재질?.trim() || '상세페이지 참조',
    '사용연령(체중범위)': notice.사용연령?.trim() || '전체 연령',
    '동일모델의 출시년월': notice.동일모델출시년월?.trim() || '',
    제조자: notice.제조자?.trim() || draft.maker.trim() || '해당없음',
    제조국: notice.제조국?.trim() || '중국',
    '취급방법 및 주의사항': notice.취급방법및주의사항?.trim() || '상세페이지 참조',
  };
  return NOTICE_ROWS.map(([title, fixed]) => ({
    title,
    value: fixed ?? filled[title] ?? '',
  })).filter((row) => row.value.length > 0);
}

export function icecreamFormFromDraft(
  draft: MallProductDraft,
  options: IcecreamRegistrationOptions = {},
): IcecreamRegistrationForm {
  const variant = draft.variants[0];
  if (!variant) {
    throw new Error(`"${draft.displayName}" 에 옵션(SKU)이 없어 아이스크림몰 폼을 만들 수 없습니다.`);
  }
  const quantity = options.quantity ?? 1;
  const salePrice = Math.max(0, Math.round(variant.salePrice));
  const listPrice = options.listPrice && options.listPrice > 0
    ? Math.round(options.listPrice)
    : icecreamListPrice(draft.displayName, salePrice);
  const supplyPrice = icecreamSupplyPrice(salePrice);
  const categoryPath = (options.categoryPath ?? ICECREAM_DEFAULT_CATEGORY).trim();
  const categoryCode = (options.categoryCode ?? ICECREAM_DEFAULT_CATEGORY_CODE).trim();
  const certNumber = draft.notice.fields.안전인증번호?.trim() ?? '';
  const additional = draft.additionalImageUrls.filter(Boolean);

  const manualSteps: string[] = [];
  if (!draft.representativeImageUrl) manualSteps.push('대표 이미지가 없습니다.');
  if (draft.detailImageUrls.length === 0) {
    manualSteps.push('상세설명 이미지가 없습니다. 상품 생성에서 상세페이지를 먼저 확정하세요.');
  }
  if (!certNumber) {
    manualSteps.push('안전인증번호가 없습니다. 어린이제품이면 화면에서 넣으세요.');
  }
  if (!options.naverMinPrice) {
    manualSteps.push('네이버 최저가를 넣지 않았습니다. 이 몰은 최저가와 조사 근거를 요구합니다.');
  }
  if (additional.length > ICECREAM_MAX_ADDITIONAL_IMAGES) {
    manualSteps.push(
      `추가 이미지가 ${additional.length}장인데 칸이 ${ICECREAM_MAX_ADDITIONAL_IMAGES}개뿐이라 앞의 `
      + `${ICECREAM_MAX_ADDITIONAL_IMAGES}장만 넣습니다.`,
    );
  }
  manualSteps.push('분류는 팝업으로 고르는 칸이라 값이 틀어졌으면 화면에서 다시 고르세요.');
  manualSteps.push('값이 맞는지 확인한 뒤 화면에서 직접 등록하세요. 자동 등록하지 않습니다.');
  manualSteps.push('등록 후 `승인요청` 까지 해야 합니다. 이건 사람이 눌러야 합니다.');

  return {
    url: ICECREAM_REGISTER_URL,
    formFields: {
      goodsInfo: {
        goodsNm: buildIcecreamProductName(draft.displayName, draft.keywords, quantity),
        saleEndDtm: ICECREAM_SALE_END,
        // 값이 없으면 칸 자체를 만들지 않는다 — 빈 업체상품코드를 몰에 써넣지 않는다.
        ...((options.sellpiaCode ?? '').trim()
          ? { entrGoodsNo: (options.sellpiaCode ?? '').trim() }
          : {}),
        ...ICECREAM_SELECTS.goodsInfo,
      },
      priceInfo: {
        supPcost: String(supplyPrice),
        norPrc: String(listPrice),
        salePrc: String(salePrice),
        mrgnRate: String(Math.round(ICECREAM_MARGIN_RATE * 100)),
        ...ICECREAM_SELECTS.priceInfo,
      },
      deliveryInfo: { ...ICECREAM_SELECTS.deliveryInfo },
      saleInfo: {
        stkQty: String(ICECREAM_STOCK),
        limtQty: String(ICECREAM_STOCK),
        safeStkQty: String(ICECREAM_STOCK),
        paysPointRate: '1',
        ...(options.naverMinPrice ? { naverMinPrc: String(Math.round(options.naverMinPrice)) } : {}),
        ...(options.naverMinPriceUrl ? { naverMinPrcUrl: options.naverMinPriceUrl } : {}),
        ...(options.naverMinPriceCheckedOn
          ? { naverMinPrcIvstgDt: options.naverMinPriceCheckedOn }
          : {}),
      },
    },
    formRadios: {
      goodsInfo: { ...ICECREAM_RADIOS.goodsInfo },
      deliveryInfo: { ...ICECREAM_RADIOS.deliveryInfo },
      saleInfo: { ...ICECREAM_RADIOS.saleInfo },
    },
    formChecks: {
      priceInfo: {
        ctgCmsnRateAplyYn: true,
        'payWayCd[]': [...ICECREAM_PAY_WAYS],
      },
    },
    category: { code: categoryCode, path: categoryPath },
    notice: {
      itemCode: ICECREAM_NOTICE_ITEM_CODE,
      safeCertiTgtYn: certNumber ? 'Y' : 'N',
      kcCertified: certNumber ? 'Y' : 'N',
      certNumber,
      rows: buildIcecreamNotice(draft),
    },
    imageGroups: {
      representative: draft.representativeImageUrl ? [draft.representativeImageUrl] : [],
      additional,
    },
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    detailHtmlTarget: 'detailHtmlEditor',
    manualSteps,
  };
}
