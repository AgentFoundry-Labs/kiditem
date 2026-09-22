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
 * 아직 없다 — 고시·KC 를 상품 사실로 어디에 둘지는 KID-168 이 정한다.
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
 * 판매상품의 인증 문서에 번호가 하나라도 있어야 통과다(KID-310). 수집상품 3단 조인을 걷어내면서
 * 게이트가 아는 KC 출처는 `SalesProduct.certifications` 하나가 됐다. '해당 없음'을 명시하는 자리는
 * 아직 없다 — 고시 · KC 를 상품 사실로 어디에 둘지는 KID-168 이 정한다.
 */
export function isKcReady(certificationNumbers: readonly string[]): boolean {
  return certificationNumbers.some((number) => number.trim().length > 0);
}

function kcViolation(certificationNumbers: readonly string[]): string | null {
  return isKcReady(certificationNumbers)
    ? null
    : '판매상품에 KC 인증 문서가 없습니다. 상품 정보에서 인증번호를 입력하세요.';
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

  kc_certification: ({ product }) => kcViolation(product.certificationNumbers),

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
   * 문서가 통째로 없는 것은 막지 않는다 — `config.listingProfile` 을 저장하는 화면이 아직
   * 없어서(KID-235) 사람이 만들 길이 없다. 만들 수 없는 것을 게이트로 두면 어느 몰도 열리지
   * 않고, 그 사실은 몰 카드의 `needs_profile` 이 이미 말한다. 문서가 있는데 필수 항목이 빈
   * 것은 사람이 고칠 수 있으므로 계속 막는다.
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
