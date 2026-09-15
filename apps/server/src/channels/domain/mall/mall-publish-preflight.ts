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

export interface PreflightKc {
  /** 운영자가 고른 KC 상태(`exists` · `none` · `unknown`). 고르지 않았으면 null. */
  status: string | null;
  /** KC 인증번호. 몰 공통 칸의 안전인증번호도 여기로 모인다. 없으면 null. */
  number: string | null;
}

export interface PreflightProduct {
  masterProductId: string;
  name: string;
  salePrice: number | null;
  imageCount: number;
  optionNames: readonly string[];
  /** 이 몰의 카테고리로 매핑돼 있는가. */
  hasMallCategory: boolean;
  /** 이 상품에 이어진 수집상품의 KC 입력값. 이어진 수집상품이 없으면 null. */
  kc: PreflightKc | null;
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
 * KC 입력이 송신할 수 있는 상태인가.
 *
 * 번호가 있거나, 해당 없음(`none`)을 명시적으로 골랐을 때만 통과다. 확인 필요(`unknown`)와
 * 미입력은 같은 뜻이다 — 아무도 확인하지 않았다.
 */
export function isKcReady(kc: PreflightKc | null): boolean {
  if (!kc) return false;
  return kc.number !== null || kc.status === 'none';
}

function kcViolation(kc: PreflightKc | null): string | null {
  if (isKcReady(kc)) return null;
  if (!kc) return 'KC 인증 정보를 입력한 수집상품이 이 상품에 이어져 있지 않습니다.';
  if (kc.status === 'exists') return 'KC 인증이 있다고 했지만 인증번호가 없습니다.';
  return 'KC 인증 여부가 입력되지 않았습니다. 해당 없음도 명시적으로 선택해야 합니다.';
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

  kc_certification: ({ product }) => kcViolation(product.kc),

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

  profile_selected: ({ account, manifest }) => {
    if (!account) return `${manifest.name} 계정이 없습니다. 쇼핑몰 계정 화면에서 먼저 연결하세요.`;
    if (!account.listingProfileFields) {
      return `${manifest.name} 계정에 등록 기본값(배송·반품·출고지)이 없습니다.`;
    }
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
