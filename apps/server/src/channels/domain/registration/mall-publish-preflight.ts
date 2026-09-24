import type { SalesProductKcStatus } from '@kiditem/shared/sales-product';
import type {
  MallAdapterManifest,
  MallPreflightRule,
  MallProfileField,
} from './mall-adapter-manifest';

/**
 * 송신 전 게이트.
 *
 * 사방넷은 몰이 거절한 뒤에야 실패 큐에서 사유를 보여줬다. 그 사유 대부분은
 * 보내기 전에 알 수 있는 것들이다(KC 미입력, 카테고리 미매핑, 옵션명 '단품',
 * 특수문자). 여기서 막으면 몰에 아무것도 안 나간다.
 *
 * 순수 함수다. DB·시계·네트워크를 만지지 않는다.
 *
 * 상품정보고시 누락과 KC 유효기간 만료는 여기서 판정하지 않는다. 판정할 값을 저장하는 곳이
 * 아직 없다 — 고시·KC 정본을 어느 모델에 둘지는 KID-168 이 정한다. `kcStatus` 는 '해당 없음'을
 * 말하는 칸일 뿐 그 결정을 대신하지 않는다.
 */

export interface PreflightProduct {
  masterProductId: string;
  name: string;
  salePrice: number | null;
  imageCount: number;
  optionNames: readonly string[];
  /** 이 몰의 카테고리로 매핑돼 있는가. */
  hasMallCategory: boolean;
  /** 판매상품이 들고 있는 인증 문서의 번호들. 비어 있으면 KC 를 아무도 확인하지 않았다는 뜻이다. */
  certificationNumbers: readonly string[];
  /** KC 가 이 상품에 걸리는 방식. '해당 없음'을 말할 수 있는 유일한 자리다. */
  kcStatus: SalesProductKcStatus;
  /**
   * 발행된 셀피아 스냅샷의 재고. 재고 연결이 없거나 스냅샷에 없으면 null 이다.
   *
   * ⚠️ `null` 은 0 이 아니라 **모른다**는 뜻이다. 모른다고 막으면 재고를 우리가 들지 않는
   * 상품까지 어느 몰에도 못 보낸다.
   */
  stock: number | null;
}

/** 이 몰의 계정 행. 계정이 없으면 null 로 넘긴다. */
export interface PreflightAccount {
  /** 등록 기본값 문서가 실제로 채운 필드. 문서가 없으면 null. */
  listingProfileFields: readonly MallProfileField[] | null;
}

export interface PreflightViolation {
  rule: MallPreflightRule;
  message: string;
}

export interface PreflightResult {
  mallKey: string;
  mallName: string;
  masterProductId: string;
  ok: boolean;
  violations: PreflightViolation[];
}

const PROFILE_FIELD_LABEL: Record<MallProfileField, string> = {
  shipping: '배송비 정책',
  returnPolicy: '반품·교환비',
  releaseAddress: '출고지',
  returnAddress: '반품지',
  asPhone: 'A/S 연락처',
};

/**
 * KC 가 송신할 수 있는 상태인가.
 *
 * 인증 문서에 번호가 하나라도 있거나, KC 대상이 아니라고 사람이 `kcStatus='none'` 으로 말해 둔
 * 상품이면 통과다. `unknown` 은 아직 아무도 확인하지 않았다는 뜻이라 막고, `exists` 는 있다고만
 * 말한 것이라 번호를 요구한다 — 번호 없이 보내면 몰이 거절한 뒤 실패 큐에서야 사유가 보인다.
 */
export function isKcReady(product: {
  kcStatus: SalesProductKcStatus;
  certificationNumbers: readonly string[];
}): boolean {
  return product.kcStatus === 'none'
    || product.certificationNumbers.some((number) => number.trim().length > 0);
}

function kcViolation(product: PreflightProduct): string | null {
  return isKcReady(product)
    ? null
    : '판매상품에 KC 인증 문서가 없습니다. 상품 정보에서 인증번호를 입력하거나 KC 해당 없음으로 표시하세요.';
}

/**
 * 몰이 조용히 깨지는 문자.
 *
 * 한글·영문·숫자·공백과 상품명에 흔한 기호만 통과시킨다. 사방넷 원문 함정
 * ("다국어·특수기호 → 인코딩 오류")을 송신 전 룰로 승격한 것이다.
 */
const SAFE_TEXT = /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s()[\]+\-_/,.%&~!*'":;#@]*$/;

function unsafeCharacters(value: string): string[] {
  const found = new Set<string>();
  for (const char of value) {
    if (!SAFE_TEXT.test(char)) found.add(char);
  }
  return [...found];
}

type RuleCheck = (input: {
  manifest: MallAdapterManifest;
  product: PreflightProduct;
  account: PreflightAccount | null;
}) => string | null;

const CHECKS: Record<MallPreflightRule, RuleCheck> = {
  mall_category_mapped: ({ product, manifest }) =>
    product.hasMallCategory ? null : `${manifest.name} 카테고리가 매핑되지 않았습니다.`,

  kc_certification: ({ product }) => kcViolation(product),

  images_present: ({ product }) =>
    product.imageCount > 0 ? null : '등록 이미지가 없습니다.',

  price_positive: ({ product }) =>
    product.salePrice !== null && product.salePrice > 0
      ? null
      : '판매가가 설정되지 않았습니다.',

  option_name_forbids_danpum: ({ product }) => {
    const offenders = product.optionNames.filter((name) => name.includes('단품'));
    return offenders.length === 0
      ? null
      : `옵션명에 '단품' 이 들어가면 몰이 거절합니다 — ${offenders.join(', ')}`;
  },

  charset_korean_english_only: ({ product }) => {
    const offenders = new Set<string>();
    for (const value of [product.name, ...product.optionNames]) {
      for (const char of unsafeCharacters(value)) offenders.add(char);
    }
    return offenders.size === 0
      ? null
      : `상품명·옵션명에 인코딩 오류를 일으키는 문자가 있습니다 — ${[...offenders].join(' ')}`;
  },

  option_count_within_limit: ({ product, manifest }) => {
    const limit = manifest.limits.maxOptionsPerListing;
    if (limit === null || product.optionNames.length <= limit) return null;
    return `옵션이 ${product.optionNames.length}개인데 ${manifest.name} 상한은 ${limit}개입니다.`;
  },

  /**
   * 품절 게이트.
   *
   * 매트릭스는 품절 상품도 재고 0 으로 세운다 — 그 표가 답하는 것은 "어느 몰에 무엇이
   * 있나"이기 때문이다. "지금 보내도 되나"는 여기가 답한다. 둘을 한 조건으로 합치면
   * 품절되는 순간 상품이 화면에서 사라져 사장님이 몰에 뭐가 올라가 있는지 모르게 된다.
   */
  out_of_stock: ({ product }) =>
    product.stock === 0 ? '품절이라 보내지 않습니다. 재고가 0 입니다.' : null,

  /**
   * 등록 기본값 게이트.
   *
   * 문서가 통째로 없는 것은 막지 않고 몰 카드의 `needs_profile` 이 말한다(쇼핑몰 계정 설정 창에서 입력, KID-235).
   * 문서가 있는데 필수 항목이 빈 것은 막는다.
   */
  profile_selected: ({ account, manifest }) => {
    if (!account) return `${manifest.name} 계정이 없습니다. 쇼핑몰 계정 화면에서 먼저 연결하세요.`;
    if (!account.listingProfileFields) return null;
    const filled = new Set(account.listingProfileFields);
    const missing = manifest.requiredProfileFields.filter((field) => !filled.has(field));
    return missing.length === 0
      ? null
      : `${manifest.name} 등록 기본값에 필수 항목이 비어 있습니다 — ${missing.map((field) => PROFILE_FIELD_LABEL[field]).join(', ')}`;
  },
};

/**
 * 상품 1건 × 몰 1개를 판정한다.
 *
 * `unverified` 또는 `applicable: false` 인 몰은 룰을 돌리지 않고 바로 막는다.
 * 룰을 통과했다는 이유로 보낼 경로가 없는 몰에 송신이 시작되면 안 된다.
 */
export function evaluateMallPreflight(input: {
  manifest: MallAdapterManifest;
  product: PreflightProduct;
  account: PreflightAccount | null;
}): PreflightResult {
  const { manifest, product } = input;
  const base = {
    mallKey: manifest.key,
    mallName: manifest.name,
    masterProductId: product.masterProductId,
  };

  if (!manifest.applicable) {
    return {
      ...base,
      ok: false,
      violations: [{ rule: 'mall_category_mapped', message: `${manifest.name}은(는) 상품 판매 채널이 아닙니다.` }],
    };
  }
  if (manifest.unverified || !manifest.supports.createListing) {
    return {
      ...base,
      ok: false,
      violations: [{ rule: 'mall_category_mapped', message: `${manifest.name} 등록 경로가 아직 확인되지 않았습니다.` }],
    };
  }

  const violations: PreflightViolation[] = [];
  for (const rule of manifest.preflightRules) {
    const message = CHECKS[rule](input);
    if (message) violations.push({ rule, message });
  }
  return { ...base, ok: violations.length === 0, violations };
}
