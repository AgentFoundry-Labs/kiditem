/**
 * Channels가 다른 owner(readiness·products 신선도)에 내주는 카탈로그 신선도 capability (KID-354).
 * 구현은 실행 reader로 마지막 동기화 연쇄의 끝(next 없는 목록 또는 목록이 이은 상세의 성공)을 읽고, 호출자는
 * 실행 표를 모른다. 몰 중립 — Wing만의 sourceType을 밖에 내지 않는다.
 */
export const CHANNEL_CATALOG_FRESHNESS_PORT = Symbol('CHANNEL_CATALOG_FRESHNESS_PORT');

export interface ChannelCatalogFreshness {
  /** 마지막 동기화 연쇄가 끝난 시각(ISO). 한 번도 없으면 null. */
  syncedAt: string | null;
}

export interface ChannelCatalogFreshnessPort {
  catalogFreshness(input: { organizationId: string; channelAccountId: string }): Promise<ChannelCatalogFreshness>;
}
