import type { MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 아트공구(Cafe24) 상품등록 폼.
 *
 * 값과 규칙은 **실제 등록된 상품에서 읽어온 것**이다(라이브 실측 2026-09-10,
 * 상품번호 123858 `[펜시네550] 컬러 와이드 LCD 전자 메모보드`).
 *
 * 세 몰 중 가장 순하다.
 *  1. **신규 폼과 수정 폼의 이름이 같다.** 온채널은 완전히 달라서 한 번 크게 데었는데
 *     여기는 핵심 28칸이 그대로다(실측 대조: 수정 330칸 / 신규 322칸, 겹치지 않는
 *     것은 전부 화면 전용).
 *  2. **몰이 이미지를 자기 서버에 받아 준다.** 대표이미지는 파일 칸에, 상세설명은
 *     편집기 파일매니저에 올리면 Cafe24 주소가 나온다 — 남의 호스팅이 필요 없다.
 *     주소로 넣는 길도 있지만 그러면 Cafe24 가 그 주소를 가지러 와야 하고, 우리
 *     산출물은 로컬 MinIO 라 못 읽는다(라이브 실측 2026-09-10).
 *
 * 다른 점 — 상품명 접두어가 `[펜시네550]` 처럼 붙는다. 도매꾹은 접두어가 없고
 * 온채널은 `(18개)` 를 뒤에 붙인다. 몰마다 상품명이 다르다는 증거가 또 하나다.
 */

export const ARTGONGGU_REGISTER_URL =
  'https://zzogzzog1.cafe24.com/disp/admin/shop1/product/ProductRegister';

/** 상세설명 칸. PC 와 모바일 두 곳에 같은 HTML 이 들어간다(실측). */
export const ARTGONGGU_DETAIL_TARGET = 'product_description';

/**
 * 대표이미지는 한 장만 넘긴다.
 *
 * 화면에는 상세(500)·목록(300)·작은목록(100)·축소(220) 네 칸이 있지만, 파일을
 * 한 번 올리면 Cafe24 가 네 크기를 만든다(라이브 확인 2026-09-10:
 * `/web/product/big|medium|tiny/...`). 우리가 네 번 넣을 이유가 없다.
 */
export const ARTGONGGU_IMAGE_SLOT_COUNT = 4;

/** 기본정보 고정값. 실측 그대로다. */
export const ARTGONGGU_BASE = {
  /** 과세 10%. */
  product_tax_type: 'A',
  prd_tax_type_per: '10',
  /** 신상품. */
  prd_used_type: 'N',
  /** 재고 관리 사용 + 넉넉한 수량. 실측 9999. */
  sp_use_manage_stock: 'T',
  sp_stock_number: '9999',
  /** 원산지. 실측 표기 그대로. */
  origin_level1: 'E',
  made_in: '중국OEM',
  /** 배송 — 택배 · 선불 · 2~3일 · 3,000원. */
  delivery_method: '01',
  delivery_place: '전국지역',
  delivery_start: '2',
  delivery_end: '3',
  delivery_fee_type: 'T',
  ship_fee: '3000.00',
  buy_unit: '1',
  product_min: '1',
  /**
   * 아래는 신규 폼 기본값과 **다른** 값들이다.
   *
   * 손대지 않으면 등록물과 달라지는 칸만 모았다(라이브 대조 2026-09-10: 신규 폼과
   * 등록물 121325 의 차이 28곳). 기본값과 같은 칸은 여기 두지 않는다 — 같은 값을
   * 다시 쓰면 무엇이 우리 결정인지 안 보인다.
   */
  /** 모바일 상세 이미지 폭. 신규 기본 320. */
  mobile_img_resize1: '640',
  /** 마진율. 신규 기본 10. */
  'margin_rate[0]': '0.00',
  'add_price[0]': '0',
  /** 최대 구매수량 제한 없음. */
  product_max: '0',
  /** 옵션 설정 안 함. 신규 기본 T. */
  is_option_setting: 'F',
  /** 상품 무게. 신규 기본 0.1. */
  product_weight: '1.00',
} as const;

/** 라디오 기본 선택. 실측 그대로다. */
export const ARTGONGGU_RADIOS = {
  /** 진열함 · 판매함. */
  'is_display[1]': 'T',
  'selling_status[1]': 'T',
  /** 옵션 없음. */
  has_option: 'F',
  /** 성인 상품 아님. */
  is_adult: 'F',
  /**
   * 결제·배송·교환 안내를 공통설정으로 쓰지 않는다. 신규 기본은 전부 `T`(공통)인데
   * 등록물은 전부 `F`(상품별)다 — 이 상점은 상품마다 다른 안내를 쓴다.
   */
  global_payment: 'F',
  global_shipping: 'F',
  global_exchange: 'F',
} as const;

export interface ArtgongguRegistrationOptions {
  /** 상품명 앞에 붙는 표기. 실측 `[펜시네550]`. */
  namePrefix?: string;
  /** 상품명에 붙는 수량. 실측 `1p`. */
  quantity?: number;
  /**
   * 상품분류 경로. `대분류 > 중분류 > 소분류` 를 `>` 로 이어 여러 줄 준다.
   * 코드가 아니라 이름이다. 한 상품에 여러 분류를 붙일 수 있다.
   */
  categoryPaths?: string[];
  /**
   * 공급가(매입가). 우리가 이 몰에 넘기는 값이다.
   *
   * 실측 두 건이 소비자가의 약 53.8% 였지만(8067/15000 · 1615/3000) 두 건으로
   * 비율을 굳히지 않는다 — 틀리면 매입 단가가 어긋난다. 사람이 정한다.
   */
  supplyPrice?: number;
}

export interface ArtgongguRegistrationForm {
  url: string;
  formId: 'eProductRegisterForm';
  fields: Record<string, string>;
  radios: Record<string, string>;
  checks: Record<string, boolean>;
  /**
   * 대표이미지 원본 주소 한 장.
   *
   * 확장이 이 주소에서 이미지를 읽어 Cafe24 파일 칸에 올린다. 몰에 주소를 넘기는
   * 것이 아니다 — 우리 산출물은 로컬이라 몰이 가지러 올 수 없다.
   */
  imageUrls: string[];
  /** 상품분류 경로들. 단계별 이름 배열이다. */
  categoryPaths: string[][];
  detailUploads: { url: string }[];
  detailHtmlTarget: typeof ARTGONGGU_DETAIL_TARGET;
  manualSteps: string[];
}

/**
 * 아트공구 상품명.
 *
 * 실측: `[펜시네550] 컬러 와이드 LCD 전자 메모보드 (15인치)1p 대형 컬러전자칠판`
 * 접두어 + 상품명 + 수량 + 키워드다.
 *
 * 원본명 앞의 소비자가는 뗀다 — 도매꾹과 같은 이유다. 다만 `item_name` 에는
 * 원본명을 그대로 남긴다(실측: `15000컬러와이드LCD전자메모보드(15인치)`).
 */
export function buildArtgongguProductName(
  name: string,
  keywords: readonly string[],
  quantity: number,
  prefix: string,
): string {
  const base = name.trim().replace(/^\d+\s*/, '') || name.trim();
  return [prefix.trim(), base, `${quantity}p`, ...keywords.slice(0, 3)]
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `대분류 > 중분류 > 소분류` → 단계 이름 배열. 빈 단계는 버린다. */
export function parseCategoryPath(raw: string): string[] {
  return raw.split('>').map((part) => part.trim()).filter(Boolean);
}

export function artgongguFormFromDraft(
  draft: MallProductDraft,
  options: ArtgongguRegistrationOptions = {},
): ArtgongguRegistrationForm {
  const variant = draft.variants[0];
  if (!variant) {
    throw new Error(`"${draft.displayName}" 에 옵션(SKU)이 없어 아트공구 폼을 만들 수 없습니다.`);
  }
  const quantity = options.quantity ?? 1;
  const prefix = options.namePrefix?.trim() ?? '';
  const salePrice = Math.max(0, Math.round(variant.salePrice));

  const fields: Record<string, string> = {
    product_name: buildArtgongguProductName(draft.displayName, draft.keywords, quantity, prefix),
    // 셀피아 원본명 그대로. 내부 조회용이라 가격 접두어를 떼지 않는다.
    item_name: draft.displayName,
    purchase_prd_name: draft.displayName,
    product_tag: draft.keywords.join(','),
    'product_price[1]': String(salePrice),
    ...ARTGONGGU_BASE,
  };

  /**
   * 소비자가는 상품명 앞의 숫자다.
   *
   * 셀피아 원본명이 `3000감정잔디인형` 처럼 소비자가로 시작한다. 등록물 두 건에서
   * 그 숫자가 그대로 `product_custom[1]` 에 들어가 있었다(3000 · 15000).
   * 몰 상품명에서는 떼고, 이 칸에는 넣는다.
   */
  const consumerPrice = /^(\d+)/.exec(draft.displayName.trim())?.[1];
  if (consumerPrice) fields['product_custom[1]'] = consumerPrice;
  if (options.supplyPrice !== undefined && options.supplyPrice > 0) {
    fields.product_buy = String(Math.round(options.supplyPrice));
  }

  const imageUrl = draft.representativeImageUrl;
  const manualSteps: string[] = [];
  if (!prefix) {
    manualSteps.push('상품명 접두어가 비어 있습니다. 실제 등록물은 `[펜시네550]` 형태를 씁니다.');
  }
  if ((options.categoryPaths ?? []).length === 0) {
    manualSteps.push('상품분류를 고르지 않았습니다. 이 몰은 분류가 필수입니다.');
  }
  if (!imageUrl) {
    manualSteps.push('대표이미지가 없습니다.');
  }
  if (draft.detailImageUrls.length === 0) {
    manualSteps.push('상세설명 이미지가 없습니다. 상품 생성에서 상세페이지를 먼저 확정하세요.');
  }
  if (!consumerPrice) {
    manualSteps.push('소비자가를 상품명에서 읽지 못했습니다. 화면에서 넣으세요.');
  }
  if (options.supplyPrice === undefined || options.supplyPrice <= 0) {
    // 두 건에서 소비자가의 약 53.8% 였지만 두 건으로 비율을 굳히지 않는다.
    manualSteps.push('공급가가 비어 있습니다. 실측 등록물은 소비자가의 약 54% 였습니다.');
  }
  manualSteps.push(
    '판매가는 셀피아 판매가를 그대로 넣었습니다. 이 몰 등록물은 소비자가의 약 63% 였습니다 — 다르면 바꾸세요.',
  );
  manualSteps.push('값이 맞는지 확인하세요. 폼만 채웠고 [등록]은 누르지 않았습니다.');

  return {
    url: ARTGONGGU_REGISTER_URL,
    formId: 'eProductRegisterForm',
    fields,
    radios: { ...ARTGONGGU_RADIOS },
    // 공급사 메인진열. 등록물이 켜 두었고 신규 기본은 꺼짐이다.
    checks: { 'supplier_main_display[1][]': true },
    // 한 장만 넘긴다. Cafe24 가 네 크기를 만든다.
    imageUrls: imageUrl ? [imageUrl] : [],
    categoryPaths: (options.categoryPaths ?? [])
      .map(parseCategoryPath)
      .filter((path) => path.length > 0),
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    detailHtmlTarget: ARTGONGGU_DETAIL_TARGET,
    manualSteps,
  };
}
