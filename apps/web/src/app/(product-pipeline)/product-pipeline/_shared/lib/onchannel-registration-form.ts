import type { MallProductDraft } from './mall-product-draft';

/**
 * 몰 중립 초안 → 온채널 공급사 상품등록 폼.
 *
 * 값과 규칙은 **실제 등록된 상품에서 읽어온 것**이다(라이브 실측 2026-09-10,
 * 상품 `CH5280806` / num 12513346 `첼로 모양 지우개 세트 (18개) 미니어처지우개`).
 *
 * 세 몰을 붙이고 나니 같은 상품이 몰마다 얼마나 다른 모양을 요구하는지가 분명하다.
 *
 * | | 키즈노트 | 도매꾹 | 온채널 |
 * |---|---|---|---|
 * | 상품명 | `[키드아이템] 원본명 1p 키워드` | `상품명 1p 키워드` | `상품명 (18개) 키워드` |
 * | 키워드 | 상품명에 섞음 | `itemKeyword` 콤마 하나 | `keyword1`~`keyword10` 개별 칸 |
 * | 분류 | 코드 4단(AJAX 계단식) | 6단 코드 문자열 하나 | **이름 4단**(생활/건강 > 문구/사무용품 > …) |
 * | 고시 | `fieldset` → `field636~938` | `infoDutyType` → `infoDuty[...]` | 개별 이름 칸(`prd_model`·`use_age`…) |
 * | 상세설명 | `kiditem.diskn.com` 호스팅 | 같은 diskn URL 공유 | **`onimg.onch3.co.kr` 자체 호스팅** |
 * | 가격 | 판매가 하나 | `amt1` + 묶음 `unitQty` | **공급가/판매가 2단**(`onch_price`/`option_price`) |
 *
 * 그래서 초안은 몰 고유 개념을 하나도 갖지 않고, 어댑터가 자기 몰 모양으로 옮긴다.
 *
 * ⚠️ 온채널은 **등록 ≠ 판매**다. 등록만 하고 승인 요청을 하지 않으면 **익일 23:59에
 * 일괄 삭제**된다(등록일 +1일 기준). 폼을 채우는 것으로 끝나지 않는다.
 */

/**
 * 신규 등록 폼.
 *
 * ⚠️ **수정 폼(`modify_products.php`)과 필드 이름이 다르다**(라이브 확인 2026-09-10).
 * 수정폼 `product_nm`·`keyword1~10`·`input_category_first` 가 신규폼에서는
 * `product_name`·`product_subject[]`·`category_cate_first` 다. 등록된 상품을 읽을 때는
 * 수정폼을 보고, 값을 넣을 때는 신규폼 이름을 써야 한다. 섞으면 폼이 조용히 빈 채로 남는다.
 */
export const ONCHANNEL_REGISTER_URL = 'https://www.onch3.co.kr/regist_pending_products.php';
export const ONCHANNEL_PENDING_LIST_URL =
  'https://www.onch3.co.kr/pending_products_management.php';
export const ONCHANNEL_MODIFY_URL = 'https://www.onch3.co.kr/modify_products.php';
/** 상세설명 이미지는 온채널 자체 호스팅에 올린다. */
export const ONCHANNEL_IMAGE_UPLOAD_URL = 'https://www.onch3.co.kr/access/img_upload_access.php';

/** 키워드 칸 수. 실측 상품은 8개를 채웠다. */
export const ONCHANNEL_KEYWORD_SLOTS = 10;

/**
 * 배송·반품 고정값. 실측 그대로다.
 *
 * 출고지·반품지는 저장된 주소록 id 를 참조한다(`extends_*_address_id`). 주소 문자열만
 * 넣으면 몰이 받지 않으므로 id 를 함께 보낸다.
 */
export const ONCHANNEL_DELIVERY = {
  trans_nm: 'CJ 대한통운',
  /** I = 선불 추정. 실측값 그대로 쓴다. */
  send_type: 'I',
  send_price: '3000',
  quantity: '1',
  jeju_send_price: '4000',
  etc_send_price: '5000',
  trans_info1: '오후 1시',
  trans_info2: '제조사',
  trans_info3: '2~3일',
  is_bundle: 'Y',
  extends_release_address_id: '181',
  extends_release_zipcode: '10203',
  extends_release_address: '경기 고양시 일산서구 법곳길137번길 5-11 거영아이앤디',
  extends_return_address_id: '181',
  extends_return_zipcode: '10203',
  extends_return_address: '경기 고양시 일산서구 법곳길137번길 5-11 거영아이앤디',
} as const;

/**
 * KC 인증. 실측 상품은 **실제 인증번호**를 들고 있었다.
 *
 * 다른 몰에는 `상세정보 별도표기` 로 넘겼지만 온채널에는 번호가 들어간다. 상품마다
 * 다른 값이라 초안의 인증 정보가 있으면 그걸 쓰고, 없으면 사람에게 넘긴다.
 */
export const ONCHANNEL_KC_DEFAULT = {
  kc_type: '[어린이제품]안전확인',
  kc_gov: 'FITI시험연구원',
  kc_name: 'KY I&D',
} as const;

/** 고시 기본값. 실측 그대로다. */
export const ONCHANNEL_NOTICE_DEFAULT = {
  make_ymd: '해당년월일',
  warr_prov: '상세페이지참조',
  as_phone: '031-908-5401',
  deliver_time: '2~3일',
  size_weight: '상세페이지참조',
  prd_color: '랜덤',
  prd_quality: '플라스틱외',
  use_age: '상세페이지참조',
  same_model: '상세페이지참조',
  make_import: 'KY I&D',
  make_con: '중국',
  note_bene:
    '1. 용도 이외에 다른 용도로 사용하지 마십시오.'
    + '2.입에 넣어 삼키거나 빨지 마십시오.'
    + '3.화기나 직사광선, 고온에 가까이 하지 마십시오.',
} as const;

/** 거래조건 4칸. 실측 문구 그대로다. */
export const ONCHANNEL_DEAL_INFO = {
  deal_info1:
    '전자상거래등에서의소비자보호에관한법률 제17조제2항 및 동 시행령 제21조에 의한 '
    + '청약철회 제한 사유에 해당하는 경우 및 기타 법률에 따릅니다.',
  deal_info2:
    '교환/반품/보증조건 및 품질보증기준은「소비자기본법」에 따른 소비자분쟁해결기준에 '
    + '따라 피해를 보상',
  deal_info3: '본 상품은 소비자분쟁해결기준(공정거래위원회 고시)에 따라 피해를 보상받을 수 있습니다.',
  deal_info4: '본 상품은 소비자분쟁해결기준(공정거래위원회 고시)에 따라 피해를 보상받을 수 있습니다.',
} as const;

export const ONCHANNEL_BASE = {
  nat_sec: 'KR',
  product_id: 'kiditem',
  /** 과세 여부. 실측 N. */
  sec_tax: 'N',
  coupang_send_agree: 'Y',
  sale_num: '50',
  min_moq_sec: '1',
  /** 온채널 자체 분류(상품정보고시 분류). 실측 17 = 영유아용품. */
  onch_sel_cate: '17',
  /** 공급업체 분류. 1=제조사 / 3=수입사 / 2=벤더사. 실측 제조사. */
  supp_sec: '1',
  /** 도매채널. 1=가격자율 / 3=가격준수 / 25=프리미엄 상품관. 실측 가격자율. */
  prd_channel: '1',
} as const;

/** 배송 안내 3칸. 신규폼에서는 `product_trans_info[]` 배열이다. */
export const ONCHANNEL_TRANS_INFO = [
  ONCHANNEL_DELIVERY.trans_info1,
  ONCHANNEL_DELIVERY.trans_info2,
  ONCHANNEL_DELIVERY.trans_info3,
] as const;

/** 온채널 4단 분류는 코드가 아니라 **이름**이다. */
export interface OnchannelCategoryPath {
  first: string;
  second: string;
  third: string;
  fourth: string;
}

export interface OnchannelRegistrationOptions {
  /** 분류 4단 이름. 없으면 넣지 않고 사람에게 넘긴다. */
  category?: OnchannelCategoryPath;
  /** 상품명 괄호에 들어가는 구성 수량. 실측 `(18개)`. */
  packQuantity?: number;
  /** 공급가. 우리가 온채널에 파는 값. 없으면 판매가에서 역산하지 않고 비운다. */
  supplyPrice?: number;
  /** KC 인증번호. 상품마다 다르다. */
  kcNumber?: string;
}

export interface OnchannelRegistrationForm {
  url: string;
  formId: 'registProductForm';
  fields: Record<string, string>;
  radios: Record<string, string>;
  checks: string[];
  /**
   * 분류 네 칸. 계단식이라 한꺼번에 넣으면 뒤 세 칸이 빈 채로 남는다.
   * 확장이 앞 칸을 고르고 다음 목록이 채워지기를 기다리며 순서대로 넣는다.
   */
  selectorFields: {
    categoryFirst: string;
    categorySecond: string;
    categoryThird: string;
    categoryFourth: string;
  };
  /** 대표 이미지. 온채널 자체 호스팅에 먼저 올려야 한다. */
  imageUploads: { url: string }[];
  /** 상세설명 이미지. 업로드 후 `contents` 에 `<center><p><img ...>` 로 넣는다. */
  detailUploads: { url: string }[];
  detailHtmlTarget: 'product_contents';
  /**
   * 같은 이름을 쓰는 여러 칸에 순서대로 넣을 값.
   *
   * 키워드 10칸은 전부 `product_subject[]`, 배송안내 3칸은 전부
   * `product_trans_info[]` 다. `product_subject[0]` 같은 번호 이름은 한 칸도 없어서
   * 이름으로 넣으면 통째로 사라진다(라이브 실측 2026-09-10).
   */
  groups: { keywords: string[]; transInfo: string[] };
  manualSteps: string[];
}

/**
 * 온채널 상품명.
 *
 * 실측: `첼로 모양 지우개 세트 (18개) 미니어처지우개`
 * 상품명 + `(수량개)` + 첫 키워드다. 키즈노트의 `1p` 도, 접두어도 없다.
 */
export function buildOnchannelProductName(
  name: string,
  keywords: readonly string[],
  packQuantity: number,
): string {
  return [name.trim(), `(${packQuantity}개)`, keywords[0] ?? '']
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function onchannelFormFromDraft(
  draft: MallProductDraft,
  options: OnchannelRegistrationOptions = {},
): OnchannelRegistrationForm {
  const variant = draft.variants[0];
  if (!variant) {
    throw new Error(`"${draft.displayName}" 에 옵션(SKU)이 없어 온채널 폼을 만들 수 없습니다.`);
  }
  const packQuantity = options.packQuantity ?? 1;

  const fields: Record<string, string> = {
    product_id: ONCHANNEL_BASE.product_id,
    product_sec_tax: ONCHANNEL_BASE.sec_tax,
    sale_num: ONCHANNEL_BASE.sale_num,
    coupang_send: ONCHANNEL_BASE.coupang_send_agree,
    product_trans_nm: ONCHANNEL_DELIVERY.trans_nm,
    extends_send_type: ONCHANNEL_DELIVERY.send_type,
    extends_send_price: ONCHANNEL_DELIVERY.send_price,
    extends_quantity: ONCHANNEL_DELIVERY.quantity,
    extends_jeju_send_price: ONCHANNEL_DELIVERY.jeju_send_price,
    extends_etc_send_price: ONCHANNEL_DELIVERY.etc_send_price,
    extends_is_bundle: ONCHANNEL_DELIVERY.is_bundle,
    extends_release_address_id: ONCHANNEL_DELIVERY.extends_release_address_id,
    extends_release_zipcode: ONCHANNEL_DELIVERY.extends_release_zipcode,
    extends_release_address: ONCHANNEL_DELIVERY.extends_release_address,
    extends_return_address_id: ONCHANNEL_DELIVERY.extends_return_address_id,
    extends_return_zipcode: ONCHANNEL_DELIVERY.extends_return_zipcode,
    extends_return_address: ONCHANNEL_DELIVERY.extends_return_address,
    product_deal_info1: ONCHANNEL_DEAL_INFO.deal_info1,
    product_deal_info2: ONCHANNEL_DEAL_INFO.deal_info2,
    product_deal_info3: ONCHANNEL_DEAL_INFO.deal_info3,
    product_deal_info4: ONCHANNEL_DEAL_INFO.deal_info4,
    notification_cate_num: ONCHANNEL_BASE.onch_sel_cate,
    product_name: buildOnchannelProductName(draft.displayName, draft.keywords, packQuantity),
    product_return_comment:
      '반품/교환시 공급사에서 직접 수거접수하는 업체이며, 단순변심으로 인한 반품시 '
      + '왕복배송비 6,000원 / 반품시 본 박스 훼손시 반품 불가합니다.',
    // 옵션은 한 줄뿐이다. 공급가와 판매가가 따로다.
    // 신규폼은 `options[0][...]` 배열이 아니라 단일 이름을 쓴다.
    option_nm: `${draft.displayName.replace(/\s+/g, '')}(${packQuantity}개)`,
    option_price: String(Math.max(0, Math.round(variant.salePrice))),
    disc_price: '0',
    min_moq_sec: ONCHANNEL_BASE.min_moq_sec,
    ...(options.supplyPrice !== undefined
      ? { onch_price: String(Math.max(0, Math.round(options.supplyPrice))) }
      : {}),
    ...(options.kcNumber ? { kc_sec: options.kcNumber } : {}),
  };




  // 상품정보고시. `notification_cate_num` 을 고르면 이 열일곱 칸이 생긴다
  // (라이브 실측 2026-09-10). 고르기 전에 넣으면 칸이 없어서 그냥 사라진다 —
  // 확장이 방아쇠를 먼저 당기고 칸이 생기기를 기다린 뒤 채운다.
  Object.assign(fields, {
    prd_model: draft.displayName.replace(/\s+/g, ''),
    make_ymd: ONCHANNEL_NOTICE_DEFAULT.make_ymd,
    note_bene: ONCHANNEL_NOTICE_DEFAULT.note_bene,
    warr_prov: ONCHANNEL_NOTICE_DEFAULT.warr_prov,
    as_phone: ONCHANNEL_NOTICE_DEFAULT.as_phone,
    deliver_time: ONCHANNEL_NOTICE_DEFAULT.deliver_time,
    kc_type: ONCHANNEL_KC_DEFAULT.kc_type,
    kc_gov: ONCHANNEL_KC_DEFAULT.kc_gov,
    kc_name: ONCHANNEL_KC_DEFAULT.kc_name,
    size_weight: ONCHANNEL_NOTICE_DEFAULT.size_weight,
    prd_color: ONCHANNEL_NOTICE_DEFAULT.prd_color,
    prd_quality: ONCHANNEL_NOTICE_DEFAULT.prd_quality,
    use_age: ONCHANNEL_NOTICE_DEFAULT.use_age,
    same_model: ONCHANNEL_NOTICE_DEFAULT.same_model,
    make_import: ONCHANNEL_NOTICE_DEFAULT.make_import,
    make_con: ONCHANNEL_NOTICE_DEFAULT.make_con,
  });
  const optionColor = variant.options.find((option) => option.type === '색상')?.value;
  if (optionColor && optionColor !== '단일') fields.prd_color = optionColor;

  const manualSteps: string[] = [];
  if (!options.category) {
    manualSteps.push('온채널 분류 4단을 화면에서 고르세요. 코드가 아니라 이름이라 자동으로 정하지 않습니다.');
  }
  if (options.supplyPrice === undefined) {
    // 우리 데이터에 없는 값이다. 셀피아 매입가·판매가 어느 쪽과도 맞지 않는다
    // (실측: 첼로모양지우개세트 매입 280 · 판매 650 vs 온채널 공급 10,500 / 18개 세트).
    manualSteps.push('공급가(온채널가)를 화면에서 채우세요. 우리 데이터에 없는 값이라 비워 뒀습니다.');
  }
  if (!options.kcNumber) {
    manualSteps.push('KC 인증번호가 비어 있습니다. 상품마다 다른 값이라 확인이 필요합니다.');
  }
  if (draft.detailImageUrls.length === 0) {
    manualSteps.push('상세설명 이미지가 없습니다. 상품 생성에서 상세페이지를 먼저 확정하세요.');
  }
  // 이게 이 몰에서 가장 중요한 안내다.
  // 신규 등록은 약관동의 → 기본정보 → 가격/옵션 3단계 마법사다. 상품정보고시 칸은
  // 뒤 단계에서 생성되므로 첫 화면에서 전부 채워지지 않는다.
  manualSteps.push('약관동의까지 하고 기본 정보 화면으로 넘겨 뒀습니다. 가격/옵션 화면도 확인하세요.');
  manualSteps.push('등록만 하면 익일 23:59에 삭제됩니다. 반드시 승인 요청까지 하세요.');
  manualSteps.push('값이 맞는지 확인하세요. 폼만 채웠고 [등록]은 누르지 않았습니다.');

  return {
    url: ONCHANNEL_REGISTER_URL,
    formId: 'registProductForm',
    fields,
    radios: {
      // 약관동의 화면의 두 갈래. 안 고르면 다음 단계로 못 넘어간다.
      product_supp_sec: ONCHANNEL_BASE.supp_sec,
      product_prd_channel: ONCHANNEL_BASE.prd_channel,
      product_sec_tax: ONCHANNEL_BASE.sec_tax,
      coupang_send: ONCHANNEL_BASE.coupang_send_agree,
      extends_send_type: ONCHANNEL_DELIVERY.send_type,
      extends_is_bundle: ONCHANNEL_DELIVERY.is_bundle,
      min_moq_sec: ONCHANNEL_BASE.min_moq_sec,
    },
    selectorFields: {
      categoryFirst: options.category?.first ?? '',
      categorySecond: options.category?.second ?? '',
      categoryThird: options.category?.third ?? '',
      categoryFourth: options.category?.fourth ?? '',
    },
    // 동의 체크가 둘이다. `agree_terms` 는 약관동의 화면, `modify_agree_terms` 는
    // 상품상세정보 아래의 '확인 하였습니다.' 다. 실측 상품이 둘 다 켜 두었다.
    checks: ['agree_terms', 'modify_agree_terms'],
    imageUploads: draft.representativeImageUrl ? [{ url: draft.representativeImageUrl }] : [],
    detailUploads: draft.detailImageUrls.map((url) => ({ url })),
    detailHtmlTarget: 'product_contents',
    groups: {
      keywords: draft.keywords.slice(0, ONCHANNEL_KEYWORD_SLOTS),
      transInfo: [...ONCHANNEL_TRANS_INFO],
    },
    manualSteps,
  };
}
