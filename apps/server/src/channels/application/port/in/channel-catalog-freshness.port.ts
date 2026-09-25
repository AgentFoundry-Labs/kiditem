/**
 * Channels가 다른 owner(readiness·products 신선도)에 내주는 카탈로그 신선도 capability (KID-354).
 * `source_import_runs`를 직접 읽던 리더를 대체한다: 구현은 실행 reader(`channels.wing_catalog_details`
 * succeeded 최신)를 읽고, 호출자는 옛 표도 실행 표도 모른다. 몰 중립 — Wing만의 sourceType을 밖에 내지 않는다.
 */
export const CHANNEL_CATALOG_FRESHNESS_PORT = Symbol('CHANNEL_CATALOG_FRESHNESS_PORT');

export interface ChannelCatalogFreshness {
  /** 마지막으로 상세까지 반영을 끝낸 시각(ISO). 한 번도 없으면 null. */
  syncedAt: string | null;
}

export interface ChannelCatalogFreshnessPort {
  catalogFreshness(input: { organizationId: string; channelAccountId: string }): Promise<ChannelCatalogFreshness>;
}
