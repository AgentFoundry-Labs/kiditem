/**
 * 채널 레지스트리 — 몰과 마켓을 아우르는 채널 목록 하나.
 *
 * 키 · 이름 · 공유 계정 행 · 능력(수집 · 송장 · 등록 방식 · 검증 여부)을 답한다.
 * 어떻게 로그인하고 어떻게 폼을 채우는지는 답하지 않는다 — 그건 확장 스펙이 같은 키로
 * 들고 있는 브라우저 사정이다.
 *
 * 이 목록이 열 곳에 흩어져 있던 동안 서로 어긋났다. 서버는 카카오를 수집하지 않는 몰로,
 * 확장은 `collectKakaoOrders` 를 가진 몰로 알고 있었고, 웹은 로켓을 수집 못 하는 몰로 그렸다.
 * 사본을 늘리지 않는 것이 이 파일의 유일한 규칙이다 — 서버 · 웹은 여기서 읽고, 확장은
 * `scripts/generate-channel-registry.mjs` 가 만든 `extensions/kiditem-os/shared/channel-registry.js`
 * 를 읽는다(확장은 빌드가 없어 생성물을 커밋한다).
 */

/** 몰인가 마켓 판매자 시스템인가. 마켓은 몰 등록 마법사에 서지 않는다. */
export type ChannelKind = 'mall' | 'marketplace';

/**
 * 이 채널의 주문이 우리에게 오는 길.
 *
 *  - `extension`: 우리 확장 수집기가 가져온다(쿠팡 로켓은 발주 수집이 그 자리를 채운다).
 *  - `sellpia`: 셀피아가 그 몰에서 직접 가져오고, 주문은 셀피아 주문수집으로 들어온다.
 *  - `none`: 아직 길이 없다.
 *
 * ⚠️ 근거는 **코드에 실제로 있는 경로**다. 문서에 스펙만 적힌 것은 켜지 않는다.
 */
export type ChannelCollector = 'extension' | 'sellpia' | 'none';

/**
 * 상품등록을 어떻게 보내는가. `none` 은 두 가지를 겸한다 — `verified` 가 가른다.
 * `none` + 확인됨 = 등록 개념 자체가 없는 채널(발주 전용), `none` + 확인 전 = 경로 미조사.
 */
export type ChannelRegisterPath = 'form' | 'excel' | 'api' | 'none';

export interface ChannelRegistryEntry {
  readonly key: string;
  readonly name: string;
  readonly kind: ChannelKind;
  /** 이 채널이 쓰는 기존 마켓 행의 채널. 없으면 제 키가 곧 계정 행 채널이다(ADR-0012). */
  readonly sharedAccountChannel?: string;
  /** 확장 폼 스펙 키가 제 키와 다를 때만. 옥션은 지마켓 ESM 폼 하나로 함께 올라간다. */
  readonly formSpec?: string;
  readonly collector: ChannelCollector;
  /** 확장에 발송처리(송장 등록) 경로가 실제로 있는 채널. */
  readonly uploadTracking: boolean;
  readonly register: ChannelRegisterPath;
  /** 채널의 방식이 문서 · 실측으로 확인됐는가. 확인 전이면 송신 능력을 열지 않는다. */
  readonly verified: boolean;
  /** `apps/web/public` 아래의 공식 파비콘 경로. 파일이 없으면 null 이고 화면이 머리글자로 대신한다. */
  readonly logo: string | null;
}

/**
 * 몰 27 + 마켓 2.
 *
 * 몰의 순서는 주문수집 카탈로그 순서다 — 쇼핑몰 계정 화면의 기본 정렬이 이 순서를 쓴다.
 */
export const CHANNEL_REGISTRY = [
  { key: 'one-polaris', name: '원폴라리스', kind: 'mall', collector: 'none', uploadTracking: false, register: 'none', verified: false, logo: null },
  { key: 'icecream-mall', name: '아이스크림몰', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'none', verified: false, logo: '/mall-logos/icecream-mall.png' },
  { key: 'kidkids', name: '키드키즈', kind: 'mall', collector: 'extension', uploadTracking: true, register: 'form', verified: false, logo: '/mall-logos/kidkids.ico' },
  { key: 'kidsnote', name: '키즈노트', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'excel', verified: true, logo: '/mall-logos/kidsnote.png' },
  { key: 'haebub-mall', name: '해법몰', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'excel', verified: true, logo: '/mall-logos/haebub-mall.ico' },
  { key: 'onch', name: '온채널', kind: 'mall', collector: 'extension', uploadTracking: true, register: 'excel', verified: true, logo: '/mall-logos/onch.ico' },
  { key: 'kkomangse', name: '꼬망세', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'form', verified: false, logo: '/mall-logos/kkomangse.ico' },
  { key: 'art09', name: '아트공구', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'excel', verified: false, logo: '/mall-logos/art09.ico' },
  { key: 'tekville-edu', name: '테크빌교육', kind: 'mall', collector: 'none', uploadTracking: false, register: 'none', verified: false, logo: '/mall-logos/tekville-edu.ico' },
  { key: 'benepia-mul', name: '베네피아물', kind: 'mall', collector: 'none', uploadTracking: false, register: 'none', verified: false, logo: '/mall-logos/benepia-mul.png' },
  { key: 'domeggook', name: '도매꾹', kind: 'mall', collector: 'extension', uploadTracking: true, register: 'none', verified: false, logo: '/mall-logos/domeggook.ico' },
  { key: 'lotte-on', name: '롯데ON', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'api', verified: true, logo: '/mall-logos/lotte-on.png' },
  { key: 'boribori', name: '보리보리', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'api', verified: false, logo: '/mall-logos/boribori.ico' },
  { key: 'always', name: '올웨이즈', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'none', verified: false, logo: '/mall-logos/always.png' },
  { key: 'woongjin-class', name: '웅진클래스몰', kind: 'mall', collector: 'none', uploadTracking: false, register: 'none', verified: false, logo: '/mall-logos/woongjin-class.ico' },
  { key: 'kakao', name: '카카오 톡스토어', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'api', verified: true, logo: '/mall-logos/kakao.ico' },
  { key: 'toss', name: '토스쇼핑', kind: 'mall', collector: 'none', uploadTracking: false, register: 'api', verified: true, logo: '/mall-logos/toss.ico' },
  { key: 'teacher-mall', name: '티쳐몰', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'form', verified: true, logo: '/mall-logos/teacher-mall.ico' },
  { key: 'gs-shop', name: 'GS샵', kind: 'mall', collector: 'extension', uploadTracking: false, register: 'form', verified: false, logo: '/mall-logos/gs-shop.ico' },
  { key: 'coupang-direct', name: '쿠팡직배송', kind: 'mall', sharedAccountChannel: 'rocket', collector: 'extension', uploadTracking: false, register: 'none', verified: true, logo: '/mall-logos/coupang-direct.ico' },
  { key: 'gmarket', name: '지마켓', kind: 'mall', collector: 'sellpia', uploadTracking: false, register: 'api', verified: false, logo: '/mall-logos/gmarket.ico' },
  { key: 'auction', name: '옥션', kind: 'mall', formSpec: 'gmarket', collector: 'sellpia', uploadTracking: false, register: 'api', verified: false, logo: '/mall-logos/auction.png' },
  { key: '11st', name: '11번가', kind: 'mall', collector: 'sellpia', uploadTracking: false, register: 'api', verified: false, logo: '/mall-logos/11st.ico' },
  { key: 'smartstore', name: '스마트스토어', kind: 'mall', collector: 'sellpia', uploadTracking: false, register: 'api', verified: false, logo: '/mall-logos/smartstore.ico' },
  { key: 'ssg', name: '신세계(SSG)', kind: 'mall', collector: 'sellpia', uploadTracking: false, register: 'api', verified: false, logo: '/mall-logos/ssg.ico' },
  { key: 'thirtymall', name: '떠리몰', kind: 'mall', collector: 'none', uploadTracking: false, register: 'api', verified: false, logo: '/mall-logos/thirtymall.ico' },
  { key: 'yoons', name: '윤선생', kind: 'mall', collector: 'none', uploadTracking: false, register: 'none', verified: false, logo: '/mall-logos/yoons.ico' },

  // ── 마켓 판매자 시스템 — 몰 등록 마법사에 서지 않는다 ──────────────────────
  { key: 'coupang', name: '쿠팡(마켓플레이스)', kind: 'marketplace', collector: 'sellpia', uploadTracking: false, register: 'api', verified: true, logo: '/mall-logos/coupang.ico' },
  { key: 'rocket', name: '쿠팡 로켓', kind: 'marketplace', collector: 'extension', uploadTracking: false, register: 'none', verified: true, logo: '/mall-logos/rocket.ico' },
] as const satisfies readonly ChannelRegistryEntry[];

export type ChannelRegistryRow = (typeof CHANNEL_REGISTRY)[number];
export type ChannelKey = ChannelRegistryRow['key'];

export type MallChannelRow = Extract<ChannelRegistryRow, { kind: 'mall' }>;
export type MallChannelKey = MallChannelRow['key'];
export type MarketplaceChannelRow = Extract<ChannelRegistryRow, { kind: 'marketplace' }>;
export type MarketplaceChannelKey = MarketplaceChannelRow['key'];

const BY_KEY = new Map<string, ChannelRegistryEntry>(
  CHANNEL_REGISTRY.map((entry) => [entry.key, entry]),
);

/** 레지스트리에 있는 채널. 모르는 키면 null. */
export function findChannel(key: string): ChannelRegistryEntry | null {
  return BY_KEY.get(key) ?? null;
}

export function isChannelKey(key: string): key is ChannelKey {
  return BY_KEY.has(key);
}

/** 몰만. 주문수집 카탈로그와 몰 등록 매니페스트가 이 목록이다. */
export const MALL_CHANNELS: readonly MallChannelRow[] = CHANNEL_REGISTRY.filter(
  (entry): entry is MallChannelRow => entry.kind === 'mall',
);

/** 마켓 판매자 시스템만. 쿠팡 윙과 쿠팡 로켓이다. */
export const MARKETPLACE_CHANNELS: readonly MarketplaceChannelRow[] = CHANNEL_REGISTRY.filter(
  (entry): entry is MarketplaceChannelRow => entry.kind === 'marketplace',
);

/** 몰인 채널. 마켓 키와 모르는 키는 null. */
export function findMallChannel(key: string): MallChannelRow | null {
  const entry = BY_KEY.get(key);
  return entry && entry.kind === 'mall' ? (entry as MallChannelRow) : null;
}

/**
 * 관찰 기록 · 알림 · 타일이 쓰는 키 — 계정 행을 함께 쓰는 채널은 그 행의 채널 하나로 모은다.
 *
 * 쿠팡직배송은 제 계정 행이 없고 로켓 행을 함께 쓴다. 접지 않으면 같은 계정의 로그인 상태가
 * 두 키로 갈린다. 쓰는 쪽과 읽는 쪽이 이 함수 하나를 함께 쓴다.
 */
export function channelOutcomeKey(key: string): string {
  return findChannel(key)?.sharedAccountChannel ?? key;
}

/** 확장이 이 채널의 폼을 채울 때 여는 스펙 키. 대개 제 키와 같다. */
export function channelFormSpec(key: string): string {
  return findChannel(key)?.formSpec ?? key;
}

/** 우리 확장 수집기가 주문을 가져오는 채널. */
export function channelCollectsViaExtension(key: string): boolean {
  return findChannel(key)?.collector === 'extension';
}

/** 주문이 어디로든 들어오는 채널(우리 수집기 또는 셀피아). */
export function channelCollectsOrders(key: string): boolean {
  const collector = findChannel(key)?.collector;
  return collector === 'extension' || collector === 'sellpia';
}

/** 확장에 발송처리(송장 등록) 경로가 있는 채널. */
export function channelUploadsTracking(key: string): boolean {
  return findChannel(key)?.uploadTracking === true;
}

/**
 * 이 채널에 상품등록 · 품절 개념이 있는가.
 *
 * `register: 'none'` 이 곧 '없다'는 아니다. 확인 전이라 경로를 모르는 채널과, 쿠팡이 발주하고
 * 우리가 납품해서 애초에 등록할 것이 없는 채널은 화면에서 다르게 말해야 한다 — 앞은 '아직',
 * 뒤는 '그 일이 없다'다. 확인된 `none` 만 없는 일이다.
 */
export function channelRegistersListings(
  entry: Pick<ChannelRegistryEntry, 'register' | 'verified'>,
): boolean {
  return !(entry.register === 'none' && entry.verified);
}

/** 공식 파비콘 경로. 없으면 null. */
export function channelLogoPath(key: string): string | null {
  return findChannel(key)?.logo ?? null;
}
