/**
 * 상품 하나가 몰 하나에서 어떤 상태인가.
 *
 * 매트릭스 화면의 칸 하나가 이 값이다. 판정 근거는 두 개뿐이다 —
 * 실제 리스팅(`ChannelListing`)과 등록 시도 기록(`ProductPreparation`).
 * 둘 다 없으면 미등록이고, 그건 추측이 아니라 사실이다.
 *
 * 상태 문자열은 두 갈래로 들어온다.
 *  1. 몰이 준 원문 그대로(라이브 실측 2026-09-09):
 *     쿠팡 WING  승인완료 478 · 승인반려 5
 *     쿠팡 로켓  observed 157 · 활성 117 · 비활성 87 · 단종 22 · 미확인 5
 *  2. `normalizeCoupangProductStatus` 를 거친 값: active · paused · deleted · draft
 *
 * ⚠️ 그 정규화가 `UNDER_EXAMINATION`(심사중)과 `REJECTED`(반려)를 **둘 다
 * `draft`** 로 접는다(domain/coupang-normalization.ts). 검수중과 오류는 운영자가
 * 정반대로 대응해야 하는 상태인데 그 구별이 적재 시점에 사라진다. 그래서 여기서
 * `draft` 를 검수중으로 낙관하지도, 오류로 비관하지도 않고 `unknown` 으로 둔다 —
 * 둘 중 하나로 찍으면 절반은 반드시 거짓말이 된다.
 *
 * 접히지 않는 값도 지어내지 않고 `unknown` 으로 남긴다. 모르는 것을 안다고
 * 표시하는 것이 가장 나쁘다.
 */

export const MALL_LISTING_STATES = [
  'published',
  'reviewing',
  'preparing',
  'error',
  'paused',
  'discontinued',
  'unknown',
  'unregistered',
] as const;

export type MallListingState = (typeof MALL_LISTING_STATES)[number];

/** 몰이 준 원문 → 우리 어휘. 소문자로 맞춰 비교한다. */
const LISTING_STATUS_MAP: Record<string, MallListingState> = {
  '승인완료': 'published',
  '활성': 'published',
  active: 'published',
  approved: 'published',
  '승인반려': 'error',
  rejected: 'error',
  '비활성': 'paused',
  inactive: 'paused',
  suspended: 'paused',
  paused: 'paused',
  '단종': 'discontinued',
  '판매중지': 'discontinued',
  deleted: 'discontinued',
  // 크롤로 존재만 확인한 리스팅. 몰이 상태를 준 적이 없다.
  observed: 'unknown',
  '미확인': 'unknown',
};

/**
 * 리스팅 상태가 `unknown` 인 이유. 화면이 툴팁으로 쓴다.
 *
 * '모른다'가 다 같은 모름이 아니다. 고쳐야 할 곳이 서로 다르다.
 */
const UNKNOWN_REASON: Record<string, string> = {
  draft: '쿠팡 적재가 심사중과 반려를 같은 값으로 접습니다. 몰에서 확인하세요.',
  observed: '목록에서 존재만 확인했습니다. 몰이 준 상태가 아닙니다.',
  '미확인': '몰이 상태를 주지 않았습니다.',
};

const PREPARATION_STATUS_MAP: Record<string, MallListingState> = {
  draft: 'preparing',
  submitting: 'reviewing',
  registered: 'published',
  failed: 'error',
  // 취소는 등록을 시도했다가 접은 것이다. 남은 상태는 미등록과 같다.
  cancelled: 'unregistered',
};

export interface MallListingStateInput {
  /** 활성 리스팅이 있으면 그 원문 상태. 없으면 null. */
  listingStatus?: string | null;
  /** 리스팅이 존재하는가. 상태가 비어 있어도 존재 자체가 사실이다. */
  hasListing: boolean;
  /** 가장 최근 등록 시도 상태. 없으면 null. */
  preparationStatus?: string | null;
}

export interface MallListingStateResult {
  state: MallListingState;
  /** 판정이 무엇에 근거했는지. 화면이 툴팁으로 쓴다. */
  basis: 'listing' | 'preparation' | 'none';
  /** 리스팅은 살아 있는데 최근 재등록이 실패한 경우처럼, 칸에 덧붙일 사실. */
  warning: string | null;
}

/** `unknown` 으로 남은 이유. 다른 상태에서는 null. */
export function unknownReason(listingStatus: string | null | undefined): string | null {
  const key = (listingStatus ?? '').trim().toLowerCase();
  return UNKNOWN_REASON[key] ?? UNKNOWN_REASON[(listingStatus ?? '').trim()] ?? null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function mapListingStatus(status: string | null | undefined): MallListingState | null {
  const key = normalize(status);
  if (!key) return null;
  return LISTING_STATUS_MAP[key] ?? null;
}

function mapPreparationStatus(status: string | null | undefined): MallListingState | null {
  const key = normalize(status);
  if (!key) return null;
  return PREPARATION_STATUS_MAP[key] ?? null;
}

/**
 * 판정 순서.
 *
 * 1. 지금 보내는 중이면 그게 가장 최신 사실이다. 리스팅보다 먼저다.
 * 2. 리스팅이 있으면 리스팅이 기준이다. 몰이 실제로 들고 있는 것이기 때문이다.
 * 3. 리스팅이 없으면 시도 기록이 기준이다.
 * 4. 둘 다 없으면 미등록이다.
 *
 * 리스팅이 살아 있는데 최근 시도가 실패한 경우는 상태를 뒤집지 않는다. 상품은
 * 여전히 팔리고 있고, 실패한 것은 수정 재전송이다. 그 사실은 `warning` 으로 남긴다.
 */
export function resolveMallListingState(input: MallListingStateInput): MallListingStateResult {
  const prepared = mapPreparationStatus(input.preparationStatus);

  if (prepared === 'reviewing') {
    return { state: 'reviewing', basis: 'preparation', warning: null };
  }

  if (input.hasListing) {
    const fromListing = mapListingStatus(input.listingStatus) ?? 'unknown';
    const warning = prepared === 'error'
      ? '최근 수정 전송이 실패했습니다.'
      : fromListing === 'unknown'
        ? unknownReason(input.listingStatus)
        : null;
    return { state: fromListing, basis: 'listing', warning };
  }

  if (prepared && prepared !== 'unregistered') {
    return { state: prepared, basis: 'preparation', warning: null };
  }

  return { state: 'unregistered', basis: 'none', warning: null };
}

/** 상품 한 줄이 몇 개 몰에 살아 있는가. 요약 카드가 이 값을 센다. */
export function countPublished(states: readonly MallListingState[]): number {
  return states.filter((state) => state === 'published').length;
}

/** 사람이 손대야 하는 칸. 오류이거나 상태를 모르는 것. */
export function needsAttention(state: MallListingState): boolean {
  return state === 'error' || state === 'unknown';
}
