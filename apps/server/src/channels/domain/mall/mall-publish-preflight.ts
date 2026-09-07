import type {
  MallAdapterManifest,
  MallPreflightRule,
  MallProfileField,
} from './mall-adapter-manifest';

/**
 * 송신 전 게이트.
 *
 * 사방넷은 몰이 거절한 뒤에야 실패 큐에서 사유를 보여줬다. 그 사유 대부분은
 * 보내기 전에 알 수 있는 것들이다(고시 미입력, KC 만료, 카테고리 미매핑,
 * 옵션명 '단품', 특수문자). 여기서 막으면 몰에 아무것도 안 나간다.
 *
 * 순수 함수다. DB·시계·네트워크를 만지지 않는다 — `asOf` 를 인자로 받는 이유.
 */

export interface PreflightCertification {
  certType: string;
  /** null 이면 만료 개념이 없는 인증(또는 해당 없음)으로 본다. */
  validTo: Date | null;
}

export interface PreflightProduct {
  masterProductId: string;
  name: string;
  salePrice: number | null;
  imageCount: number;
  optionNames: readonly string[];
  /** 이 몰의 카테고리로 매핑돼 있는가. */
  hasMallCategory: boolean;
  /** 상품정보고시 카테고리. null = 미입력. */
  noticeCategory: string | null;
  /** 고시 항목 중 비어 있는 필수 항목 이름. */
  noticeMissingFields: readonly string[];
  /** null = KC 정보가 아예 입력되지 않음. '해당없음'도 명시적으로 입력돼야 한다. */
  certification: PreflightCertification | null;
}

export interface PreflightProfile {
  id: string;
  name: string;
  /** 이 프로필이 실제로 값을 채운 필드. */
  filledFields: readonly MallProfileField[];
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
  profile: PreflightProfile | null;
  asOf: Date;
}) => string | null;

const CHECKS: Record<MallPreflightRule, RuleCheck> = {
  mall_category_mapped: ({ product, manifest }) =>
    product.hasMallCategory ? null : `${manifest.name} 카테고리가 매핑되지 않았습니다.`,

  notice_attributes: ({ product }) => {
    if (!product.noticeCategory) return '상품정보고시가 입력되지 않았습니다.';
    if (product.noticeMissingFields.length > 0) {
      return `상품정보고시 필수 항목이 비어 있습니다 — ${product.noticeMissingFields.join(', ')}`;
    }
    return null;
  },

  kc_certification: ({ product }) =>
    product.certification
      ? null
      : 'KC 인증 정보가 입력되지 않았습니다. 해당 없음도 명시적으로 선택해야 합니다.',

  kc_not_expired: ({ product, asOf }) => {
    const validTo = product.certification?.validTo;
    if (!validTo) return null;
    if (validTo.getTime() >= asOf.getTime()) return null;
    return `KC 인증이 ${validTo.toISOString().slice(0, 10)} 에 만료됐습니다.`;
  },

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

  profile_selected: ({ profile, manifest }) => {
    if (!profile) return '송신 프로필이 선택되지 않았습니다.';
    const filled = new Set(profile.filledFields);
    const missing = manifest.requiredProfileFields.filter((field) => !filled.has(field));
    return missing.length === 0
      ? null
      : `프로필 '${profile.name}' 에 필수 항목이 비어 있습니다 — ${missing.map((field) => PROFILE_FIELD_LABEL[field]).join(', ')}`;
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
  profile: PreflightProfile | null;
  asOf: Date;
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
