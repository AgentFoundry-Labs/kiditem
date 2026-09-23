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
type ChannelKind = 'mall' | 'marketplace';

/**
 * 이 채널의 주문이 **지금 실제로** 우리에게 오는 길.
 *
 *  - `extension`: 우리 확장 수집기가 가져온다(쿠팡 로켓은 발주 수집이 그 자리를 채운다).
 *  - `sellpia`: 셀피아가 그 몰에서 직접 가져오고, 주문은 셀피아 주문수집으로 들어온다.
 *  - `none`: 아직 길이 없다.
 *
 * ⚠️ **있는 길을 모두 적는 칸이 아니라 켜 둔 길 하나를 적는 칸이다.** 11번가는 확장
 * 수집기 코드가 들어와 있지만 셀피아 양식이 확정되지 않아 운영에서 끄고 셀피아로
 * 받는다(KID-105 Q2) — 그래서 `sellpia` 다. 여기에 `extension` 을 적으면 화면이 되는
 * 것처럼 말하고 사람이 눌렀을 때 아무 일도 일어나지 않는다.
 */
export type ChannelCollector = 'extension' | 'sellpia' | 'none';

/**
 * 상품등록 실행(`register` kind)을 몰에 어떻게 전달하는가(KID-321). 실행 fence 는 몰과 무관하게
 * 하나이고, 이 값이 어댑터가 하는 일을 가른다.
 *
 *  - `form`: 확장이 몰 관리자 폼을 채우고 실행 컨텍스트가 있을 때만 [등록]을 누른다(쿠팡 WING 포함).
 *  - `api`: 서버 어댑터가 몰 API 로 보낸다.
 *  - `sheet`: 대량등록 엑셀을 만들어 운영자가 몰에 올린다(옛 `excel`).
 *  - `none`: 두 가지를 겸한다 — `verified` 가 가른다. `none` + 확인됨 = 등록 개념 자체가 없는
 *    채널(발주 전용), `none` + 확인 전 = 경로 미조사.
 */
export type ChannelDelivery = 'form' | 'api' | 'sheet' | 'none';

/** 품절 · 재개를 보내는 단위. */
export type ChannelSoldOutScope = 'option' | 'listing';

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
  readonly delivery: ChannelDelivery;
  /**
   * 대표이미지 반영 실행(`thumbnail_update`)을 이 채널의 어댑터가 지원하는가. 지금은 쿠팡 WING
   * (상품 수정 화면의 대표이미지 칸)뿐이다. 계정 결정 규칙은 이 값을 읽지 채널 키를 읽지 않는다.
   */
  readonly representativeImage: boolean;
  /**
   * 품절 · 재개를 몰에 보내는 단위. `option` 이면 옵션마다 따로 끄고 켜고, `listing` 이면 리스팅
   * 하나를 통째로 끈다. 지금 옵션 단위는 쿠팡 WING 뿐이다. 매니페스트는 채널 키가 아니라 이 값을 읽는다.
   */
  readonly soldOutScope: ChannelSoldOutScope;
  /** 채널의 방식이 문서 · 실측으로 확인됐는가. 확인 전이면 송신 능력을 열지 않는다. */
  readonly verified: boolean;
  /**
   * `apps/web/public` 아래의 공식 파비콘 경로. 파일이 없으면 null 이고 화면이 머리글자로
   * 대신한다 — 지금 비어 있는 곳은 원폴라리스뿐이다(사이트 `officeone.co.kr` 가 접속되지
   * 않는다). 남의 브랜드 자리에 아무 아이콘이나 붙이지 않는다.
   *
   * 외부에서 실시간으로 불러오지 않고 파일을 받아 둔다 — 몰이 경로를 바꾸는 날 표가
   * 통째로 깨지고 우리 화면이 남의 서버 상태에 묶인다.
   *
   * `/favicon.ico` 를 안 내주는 몰은 **그 페이지가 선언한 아이콘**을 받았다(2026-09-11).
   * 지마켓 · 옥션은 봇을 막아 브라우저로 받았고, 키즈노트는 쇼핑(`shop.kidsnote.com`)에
   * 아이콘이 없어 본사이트(`kidsnote.com`) 것을, 해법몰은 운영 사이트인 지니마켓
   * (`genimarket.co.kr`) 것을 쓴다. 올웨이즈 판매자센터 파비콘은 React 기본 아이콘이라
   * 공식 사이트(`alwayz.co`) 로고로 바꿨다.
   */
  readonly logo: string | null;
}

/**
 * 몰 27 + 마켓 2.
 *
 * 몰의 순서는 주문수집 카탈로그 순서다 — 쇼핑몰 계정 화면의 기본 정렬이 이 순서를 쓴다.
 */
const REGISTRY_ROWS = [
  { key: 'one-polaris', name: '원폴라리스', kind: 'mall', collector: 'none', uploadTracking: false, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: false, logo: null },
  { key: 'icecream-mall', name: '아이스크림몰', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/icecream-mall.png' },
  { key: 'kidkids', name: '키드키즈', kind: 'mall', collector: 'extension', uploadTracking: true, delivery: 'form', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/kidkids.ico' },
  { key: 'kidsnote', name: '키즈노트', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'sheet', representativeImage: false, soldOutScope: 'listing', verified: true, logo: '/mall-logos/kidsnote.png' },
  { key: 'haebub-mall', name: '해법몰', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'sheet', representativeImage: false, soldOutScope: 'listing', verified: true, logo: '/mall-logos/haebub-mall.ico' },
  { key: 'onch', name: '온채널', kind: 'mall', collector: 'extension', uploadTracking: true, delivery: 'sheet', representativeImage: false, soldOutScope: 'listing', verified: true, logo: '/mall-logos/onch.ico' },
  { key: 'kkomangse', name: '꼬망세', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'form', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/kkomangse.ico' },
  { key: 'art09', name: '아트공구', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'sheet', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/art09.ico' },
  { key: 'tekville-edu', name: '테크빌교육', kind: 'mall', collector: 'none', uploadTracking: false, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/tekville-edu.ico' },
  { key: 'benepia-mul', name: '베네피아물', kind: 'mall', collector: 'none', uploadTracking: false, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/benepia-mul.png' },
  { key: 'domeggook', name: '도매꾹', kind: 'mall', collector: 'extension', uploadTracking: true, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/domeggook.ico' },
  { key: 'lotte-on', name: '롯데ON', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: true, logo: '/mall-logos/lotte-on.png' },
  { key: 'boribori', name: '보리보리', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/boribori.ico' },
  { key: 'always', name: '올웨이즈', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/always.png' },
  { key: 'woongjin-class', name: '웅진클래스몰', kind: 'mall', collector: 'none', uploadTracking: false, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/woongjin-class.ico' },
  { key: 'kakao', name: '카카오 톡스토어', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: true, logo: '/mall-logos/kakao.ico' },
  { key: 'toss', name: '토스쇼핑', kind: 'mall', collector: 'none', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: true, logo: '/mall-logos/toss.ico' },
  { key: 'teacher-mall', name: '티쳐몰', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'form', representativeImage: false, soldOutScope: 'listing', verified: true, logo: '/mall-logos/teacher-mall.ico' },
  { key: 'gs-shop', name: 'GS샵', kind: 'mall', collector: 'extension', uploadTracking: false, delivery: 'form', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/gs-shop.ico' },
  { key: 'coupang-direct', name: '쿠팡직배송', kind: 'mall', sharedAccountChannel: 'rocket', collector: 'extension', uploadTracking: false, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: true, logo: '/mall-logos/coupang-direct.ico' },
  { key: 'gmarket', name: '지마켓', kind: 'mall', collector: 'sellpia', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/gmarket.ico' },
  { key: 'auction', name: '옥션', kind: 'mall', formSpec: 'gmarket', collector: 'sellpia', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/auction.png' },
  { key: '11st', name: '11번가', kind: 'mall', collector: 'sellpia', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/11st.ico' },
  { key: 'smartstore', name: '스마트스토어', kind: 'mall', collector: 'sellpia', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/smartstore.ico' },
  { key: 'ssg', name: '신세계(SSG)', kind: 'mall', collector: 'sellpia', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/ssg.ico' },
  { key: 'thirtymall', name: '떠리몰', kind: 'mall', collector: 'none', uploadTracking: false, delivery: 'api', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/thirtymall.ico' },
  { key: 'yoons', name: '윤선생', kind: 'mall', collector: 'none', uploadTracking: false, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: false, logo: '/mall-logos/yoons.ico' },

  // ── 마켓 판매자 시스템 — 몰 등록 마법사에 서지 않는다 ──────────────────────
  { key: 'coupang', name: '쿠팡 WING', kind: 'marketplace', collector: 'sellpia', uploadTracking: false, delivery: 'form', representativeImage: true, soldOutScope: 'option', verified: true, logo: '/mall-logos/coupang.ico' },
  { key: 'rocket', name: '쿠팡 로켓', kind: 'marketplace', collector: 'extension', uploadTracking: false, delivery: 'none', representativeImage: false, soldOutScope: 'listing', verified: true, logo: '/mall-logos/rocket.ico' },
] as const satisfies readonly ChannelRegistryEntry[];

/**
 * 읽는 쪽이 도는 목록. 리터럴 튜플(`REGISTRY_ROWS`)은 키 타입을 좁히는 데만 쓰고,
 * 밖으로는 넓힌 행 타입으로 내보낸다 — 튜플 그대로 내보내면 한 행에만 있는 칸
 * (`sharedAccountChannel`)을 읽을 때 합집합 전체에서 그 칸을 찾다 실패한다.
 */
export const CHANNEL_REGISTRY: readonly ChannelRegistryEntry[] = REGISTRY_ROWS;

export type ChannelRegistryRow = (typeof REGISTRY_ROWS)[number];
export type ChannelKey = ChannelRegistryRow['key'];

export type MallChannelRow = Extract<ChannelRegistryRow, { kind: 'mall' }>;
export type MallChannelKey = MallChannelRow['key'];
export type MarketplaceChannelRow = Extract<ChannelRegistryRow, { kind: 'marketplace' }>;

const BY_KEY = new Map<string, ChannelRegistryEntry>(
  REGISTRY_ROWS.map((entry) => [entry.key, entry]),
);

/** 레지스트리에 있는 채널. 모르는 키면 null. */
export function findChannel(key: string): ChannelRegistryEntry | null {
  return BY_KEY.get(key) ?? null;
}

export function isChannelKey(key: string): key is ChannelKey {
  return BY_KEY.has(key);
}

/** 몰만. 주문수집 카탈로그와 몰 등록 매니페스트가 이 목록이다. */
export const MALL_CHANNELS: readonly MallChannelRow[] = REGISTRY_ROWS.filter(
  (entry): entry is MallChannelRow => entry.kind === 'mall',
);

/** 마켓 판매자 시스템만. 쿠팡 윙과 쿠팡 로켓이다. */
export const MARKETPLACE_CHANNELS: readonly MarketplaceChannelRow[] = REGISTRY_ROWS.filter(
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

/**
 * 이 채널의 계정 행을 함께 쓰는 다른 채널. 쿠팡 로켓 행의 로그인은 쿠팡직배송이 저장한다
 * (ADR-0012) — 화면이 로켓 줄의 계정을 찾을 때 이 관계를 되짚는다.
 */
export function channelSharingAccountRow(key: string): ChannelRegistryEntry | null {
  return CHANNEL_REGISTRY.find((entry) => entry.sharedAccountChannel === key) ?? null;
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
 * `delivery: 'none'` 이 곧 '없다'는 아니다. 확인 전이라 경로를 모르는 채널과, 쿠팡이 발주하고
 * 우리가 납품해서 애초에 등록할 것이 없는 채널은 화면에서 다르게 말해야 한다 — 앞은 '아직',
 * 뒤는 '그 일이 없다'다. 확인된 `none` 만 없는 일이다.
 */
export function channelRegistersListings(
  entry: Pick<ChannelRegistryEntry, 'delivery' | 'verified'>,
): boolean {
  return !(entry.delivery === 'none' && entry.verified);
}

/** 이 채널의 `register` 실행을 몰에 전달하는 방식. 모르는 키는 `none`. */
export function channelDelivery(key: string): ChannelDelivery {
  return findChannel(key)?.delivery ?? 'none';
}

/** 대표이미지 반영 실행을 어댑터가 지원하는 채널. */
export function channelSupportsRepresentativeImage(key: string): boolean {
  return findChannel(key)?.representativeImage === true;
}

/** 품절 · 재개를 보내는 단위. 모르는 키는 `listing`. */
export function channelSoldOutScope(key: string): ChannelSoldOutScope {
  return findChannel(key)?.soldOutScope ?? 'listing';
}

/** 공식 파비콘 경로. 없으면 null. */
export function channelLogoPath(key: string): string | null {
  return findChannel(key)?.logo ?? null;
}
