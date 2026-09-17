/**
 * 몰마다의 채널 계정 행(ADR-0012).
 *
 * 몰·마켓 하나는 `ChannelAccount` 행 하나다. 몰 행은 `channel` 이 몰 키이고
 * `externalAccountId` 도 몰 키로 둔다 — 유니크 `[organizationId, channel, externalAccountId]`
 * 가 조직마다 몰 행 하나를 DB 에서 막게 하려는 것이다(NULL 이면 유니크가 걸리지 않는다).
 *
 * 이미 있는 마켓 판매자 시스템에 속한 몰은 새 행을 두지 않고 그 행을 쓴다. 쿠팡직배송은
 * supplier.coupang.com 의 `rocket` 행이다 — 직배송 주문과 수집 시도가 이미 그 행에 붙는다.
 *
 * 몰 목록 자체는 여기 없다. 채널 레지스트리(`@kiditem/shared/channel-registry`)의
 * `MALL_CHANNELS` 하나뿐이고, 이 파일은 그 몰들이 **어느 계정 행에 붙는지**만 답한다.
 */
import {
  MALL_CHANNELS,
  findMallChannel,
  type MallChannelKey,
  type MallChannelRow,
} from '@kiditem/shared/channel-registry';

export type OrderCollectionMall = MallChannelRow;
export type OrderCollectionMallKey = MallChannelKey;

/** 계정 행을 고르는 데 필요한 조각. 레지스트리 행 전체를 요구하지 않는다. */
export interface OrderCollectionMallEntry {
  key: string;
  name: string;
  /** 이 몰이 쓰는 기존 마켓 행의 채널. 없으면 몰 키가 곧 채널인 몰 행을 쓴다. */
  sharedAccountChannel?: string;
}

/** 레지스트리에 있는 몰. 마켓 키와 모르는 키면 null. */
export function findOrderCollectionMall(key: string): OrderCollectionMall | null {
  return findMallChannel(key);
}

/**
 * 몰의 계정 행이 가진 식별 값.
 *
 * `own` 은 몰 행(`channel` · `externalAccountId` 모두 몰 키)이고, `shared` 는 기존 마켓 행이라
 * 채널만 안다(그 행의 `externalAccountId` 는 마켓이 정한 값이다).
 */
export type OrderCollectionMallAccountIdentity =
  | { kind: 'own'; channel: string; externalAccountId: string }
  | { kind: 'shared'; channel: string };

export function orderCollectionMallAccountIdentity(
  mall: OrderCollectionMallEntry,
): OrderCollectionMallAccountIdentity {
  return mall.sharedAccountChannel
    ? { kind: 'shared', channel: mall.sharedAccountChannel }
    : { kind: 'own', channel: mall.key, externalAccountId: mall.key };
}

/** 몰 하나의 계정 행 조회 조건. 조직 조건은 부르는 쪽이 붙인다. */
export function orderCollectionMallAccountFilter(
  mall: OrderCollectionMallEntry,
): { channel: string; externalAccountId?: string } {
  const identity = orderCollectionMallAccountIdentity(mall);
  return identity.kind === 'own'
    ? { channel: identity.channel, externalAccountId: identity.externalAccountId }
    : { channel: identity.channel };
}

/**
 * 한 몰에 맞는 계정 행이 여럿일 때 고르는 순서 — 대표 계정, 먼저 만든 행.
 *
 * 몰 행은 유니크라 하나뿐이다. 조직에 여럿일 수 있는 것은 공유 마켓 행(rocket)뿐이고, 로그인
 * 저장·조회·수집 시작이 모두 이 순서로 같은 행을 고른다.
 */
export const ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER = [
  { isPrimary: 'desc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const;

/**
 * 고르는 순서로 정렬된 계정 행에서 몰마다 첫 행. 몰 행은 외부 계정 ID 까지 몰 키여야
 * 그 몰의 행이다.
 */
export function pickOrderCollectionMallAccounts<
  T extends { channel: string; externalAccountId: string | null },
>(rowsInPreferenceOrder: readonly T[]): Map<OrderCollectionMallKey, T> {
  const picked = new Map<OrderCollectionMallKey, T>();
  for (const row of rowsInPreferenceOrder) {
    const key = orderCollectionMallKeyForAccount(row);
    if (!key || picked.has(key)) continue;
    const identity = orderCollectionMallAccountIdentity(findOrderCollectionMall(key)!);
    if (identity.kind === 'own' && row.externalAccountId !== identity.externalAccountId) continue;
    picked.set(key, row);
  }
  return picked;
}

/** 레지스트리 몰들의 몰 행 채널(몰 키)과 공유 마켓 행 채널. 계정 행을 한 번에 읽을 때 쓴다. */
export function orderCollectionMallAccountChannels(): {
  own: OrderCollectionMallKey[];
  shared: string[];
} {
  const own: OrderCollectionMallKey[] = [];
  const shared = new Set<string>();
  for (const mall of MALL_CHANNELS) {
    const identity = orderCollectionMallAccountIdentity(mall);
    if (identity.kind === 'own') own.push(mall.key);
    else shared.add(identity.channel);
  }
  return { own, shared: [...shared] };
}

/**
 * 계정 행에서 그 행을 쓰는 주문 수집 몰을 되찾는다. 레지스트리 몰의 행이 아니면 null.
 *
 * 공유 마켓 행(`rocket`)은 쿠팡직배송으로 읽힌다. 그 행의 다른 원천(로켓 발주 등)에 이 값을
 * 붙이지 않도록, 부르는 쪽이 원천 종류로 먼저 거른다.
 */
export function orderCollectionMallKeyForAccount(account: {
  channel: string;
}): OrderCollectionMallKey | null {
  const mall = MALL_CHANNELS.find((entry) => {
    const identity = orderCollectionMallAccountIdentity(entry);
    return identity.channel === account.channel;
  });
  return mall?.key ?? null;
}
