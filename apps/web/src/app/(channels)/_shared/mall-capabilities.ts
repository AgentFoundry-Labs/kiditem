import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';

/**
 * 연결된 몰 한 곳으로 **무엇이 되는가** — 사방넷 스케줄러와 같은 칸이다(사장님 2026-09-17):
 * 주문수집 · 클레임수집 · 운송장 송신 · 문의수집 · 문의답변 · 상품등록 · 상품수정 ·
 * 상품상태송신(품절 · 판매중지) · 재고송신.
 *
 * 상태는 셋뿐이다.
 *  - `ready`(초록): 지금 된다. 경로가 실제로 있다.
 *  - `pending`(회색): 아직 안 된다. 만들면 되는 일이다.
 *  - `unavailable`(빨강): 그 몰에는 그 일이 없다. 만들 수도 없다.
 *
 * 근거는 전부 이미 있는 권위에서 온다. 주문수집·송장전송은 서버 매니페스트
 * (`collectsOrders`·`uploadsTracking`, 주문이 셀피아로 들어오는 몰은 `orderCollectionVia`),
 * 상품등록은 등록 어댑터 레지스트리, '없는 일'은
 * 매니페스트의 `applicable: false`(쿠팡 로켓·쿠팡직배송처럼 우리가 발주를 받는 사입
 * 채널)다. 화면이 몰 이름을 보고 추측하지 않는다 — 추측으로 칠한 초록은 눌러도 안 된다.
 */
export type CapabilityState = 'ready' | 'pending' | 'unavailable';

export const CAPABILITY_KEYS = [
  'orders',
  'claims',
  'tracking',
  'inquiries',
  'inquiryReplies',
  'register',
  'update',
  'soldout',
  'stock',
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type MallCapabilities = Record<CapabilityKey, CapabilityState>;

/** 서버 매니페스트에서 이 판정에 쓰는 조각. */
export interface MallManifestFacts {
  applicable: boolean;
  /** 몰 방식이 아직 확인되지 않았다. 이때 `supports` 는 비어 있다(모름). */
  unverified: boolean;
  supports: { soldOut: boolean };
  /**
   * 우리가 그 몰 관리자에 품절을 쓰는 구현을 만들었는가.
   *
   * `supports.soldOut`(그 몰이 품절을 지원하는가)과 다르다. 지원하는데 우리가 아직
   * 안 뚫은 몰이 대부분이라, 이 칸의 초록은 **이 값**만 보고 켠다.
   */
  soldOutRoute?: 'mall_admin' | null;
  hazards: { soldOutDeletesListing: boolean };
}

export function mallCapabilities(
  channel: Pick<MallChannelSummary, 'collectsOrders' | 'uploadsTracking'>,
  context: {
    /** 상품등록 어댑터가 있는가(다른 몰 등록에 함께 실리는 경우 포함). */
    hasAdapter: boolean;
    /** 서버 매니페스트. 못 받았으면 null — 그때는 없는 일로 단정하지 않는다. */
    manifest: MallManifestFacts | null;
  },
): MallCapabilities {
  const { manifest } = context;
  const applicable = manifest ? manifest.applicable : true;
  // 확인된 몰인데 품절을 안 받는다고 하면 없는 일이다. 확인 전이면 모른다.
  const takesSoldOut = !manifest || manifest.unverified || manifest.supports?.soldOut !== false;
  // 발주를 받는 사입 채널(쿠팡 로켓 · 직배송)에는 고객 클레임 · 문의도, 우리가 고칠 상품
  // 페이지도, 우리가 보낼 재고도 없다. 그 칸은 빨강이다.
  const onlyWhereApplicable: CapabilityState = applicable ? 'pending' : 'unavailable';
  return {
    orders: channel.collectsOrders ? 'ready' : 'pending',
    // ⚠️ 클레임 · 문의 수집, 문의 답변, 상품수정 · 재고 송신 경로는 아직 어느 몰에도 없다
    // (2026-09-17). 그래서 초록이 없다. 경로가 붙으면 그 권위(서버가 내려주는 플래그)를
    // 여기서 읽고 초록을 켠다. 몰 이름으로 켜지 않는다.
    claims: onlyWhereApplicable,
    tracking: channel.uploadsTracking ? 'ready' : 'pending',
    inquiries: onlyWhereApplicable,
    inquiryReplies: onlyWhereApplicable,
    // 개념이 없는 채널은 어댑터가 있든 없든 빨강이다. 거기 초록을 칠하면 거짓말이다.
    register: !applicable
      ? 'unavailable'
      : context.hasAdapter ? 'ready' : 'pending',
    update: onlyWhereApplicable,
    // 품절 송신은 확장이 그 몰 관리자에 직접 쓰는 몰만 초록이다(`soldOutRoute`).
    // 몰이 품절을 받는다는 사실만으로 켜지 않는다 — 그건 몰의 사정이고, 이 칸은
    // **우리가 지금 보낼 수 있는가**를 말한다. 몰이 안 받는다고 확인된 곳은 빨강이다.
    soldout: !applicable || !takesSoldOut
      ? 'unavailable'
      : manifest?.soldOutRoute === 'mall_admin' ? 'ready' : 'pending',
    stock: onlyWhereApplicable,
  };
}

function countOf(capabilities: MallCapabilities, state: CapabilityState): number {
  return CAPABILITY_KEYS.filter((key) => capabilities[key] === state).length;
}

/** 되는 일 수. 정렬과 요약에 쓴다. */
export function readyCount(capabilities: MallCapabilities): number {
  return countOf(capabilities, 'ready');
}

export type CapabilityTotals = Record<CapabilityKey, Record<CapabilityState, number>>;

/** 일마다 됨 · 아직 · 불가 몰 수. 맨 위 요약 막대가 이 숫자다. */
export function capabilityTotals(
  rows: readonly { capabilities: MallCapabilities }[],
): CapabilityTotals {
  const totals = Object.fromEntries(
    CAPABILITY_KEYS.map((key) => [key, { ready: 0, pending: 0, unavailable: 0 }]),
  ) as CapabilityTotals;
  for (const row of rows) {
    for (const key of CAPABILITY_KEYS) totals[key][row.capabilities[key]] += 1;
  }
  return totals;
}

/**
 * 다 되는 몰부터 세운다. 되는 일 수가 같으면 없는 일(빨강)이 적은 몰, 그다음 거래가
 * 있는 몰, 마지막은 이름순이다 — 같은 조건이면 늘 같은 자리에 서야 눈으로 찾는다.
 */
export function sortByCapability<
  T extends { channel: MallChannelSummary; capabilities: MallCapabilities },
>(rows: readonly T[]): T[] {
  const activity = (row: T) => row.channel.orderCount + row.channel.listingCount;
  return [...rows].sort((a, b) =>
    readyCount(b.capabilities) - readyCount(a.capabilities)
    || countOf(a.capabilities, 'unavailable') - countOf(b.capabilities, 'unavailable')
    || activity(b) - activity(a)
    || a.channel.mallName.localeCompare(b.channel.mallName, 'ko'));
}

/**
 * 주문수집 줄의 이름. 셀피아가 그 몰에서 직접 주문을 가져오는 몰(옥션 · 지마켓 · 11번가 ·
 * 신세계 · 스마트스토어 · 쿠팡 마켓플레이스)은 줄 이름부터 '셀피아 주문수집'이다 — 우리 수집기로 가져오는 몰과
 * 같은 초록이지만 길이 다르다는 것이 카드에서 바로 읽혀야 한다(사장님 2026-09-17).
 */
export function ordersLabelFor(
  channel: Pick<MallChannelSummary, 'orderCollectionVia'>,
): string | null {
  return channel.orderCollectionVia === 'sellpia' ? '셀피아 주문수집' : null;
}

/** 주문수집 줄에 붙는 사연. */
export function ordersNoteFor(
  channel: Pick<MallChannelSummary, 'orderCollectionVia'>,
): string | null {
  return channel.orderCollectionVia === 'sellpia'
    ? '이 몰의 주문은 셀피아 주문수집으로 들어옵니다. 우리 수집기는 따로 돌지 않습니다.'
    : null;
}

/**
 * 상품등록 줄에 붙는 사연.
 *
 * 제 어댑터 없이 다른 몰 등록에 함께 실리는 몰(옥션 ← G마켓 ESM)과, 한 번에 다른 몰까지
 * 올리는 몰(G마켓)에만 적는다. 옥션을 '아직' 으로 두면 따로 등록해야 하는 몰로 읽힌다
 * (사장님 지적 2026-09-11).
 */
export function registerNoteFor(
  mallKey: string,
  adapter: { mallKey: string; mallName: string; alsoPublishesTo?: readonly string[] } | null,
  mallNameOf: (key: string) => string,
): string | null {
  if (!adapter) return null;
  if (adapter.mallKey !== mallKey) return `${adapter.mallName} 등록 한 번에 함께 올라갑니다.`;
  const others = (adapter.alsoPublishesTo ?? []).map(mallNameOf);
  return others.length > 0 ? `${others.join('·')}까지 한 번에 올라갑니다.` : null;
}

/**
 * 품절관리 줄에 붙는 사연 — 몰이 품절을 받는지, 받을 때 무엇을 조심하는지.
 *
 * 회색은 전부 '아직' 이지만 사연이 다르다. 몰이 품절을 받는데 우리 경로만 없는 곳과, 몰
 * 방식부터 확인해야 하는 곳은 다음 할 일이 다르다.
 */
export function soldOutNoteFor(manifest: MallManifestFacts | null): string | null {
  if (!manifest || !manifest.applicable) return null;
  if (manifest.unverified) return '이 몰의 품절 방식은 아직 확인 전입니다.';
  if (manifest.supports?.soldOut === false) return null;
  return manifest.hazards?.soldOutDeletesListing
    ? '몰은 품절을 받지만 완전품절이 영구삭제라 판매중지로 보내야 합니다. 우리 송신 경로는 아직 없습니다.'
    : '몰은 품절·해제를 받습니다. 우리 송신 경로가 아직 없습니다.';
}
