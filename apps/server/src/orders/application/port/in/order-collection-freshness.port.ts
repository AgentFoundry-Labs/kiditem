export const ORDER_COLLECTION_FRESHNESS_PORT = Symbol('ORDER_COLLECTION_FRESHNESS_PORT');

/**
 * 실행 계약으로 옮긴 Orders 수집의 마지막 성공 시각(KID-359). 대시보드의 수집 시각 칸은 옛 원천 이름
 * (`source_import_runs.source_type`)으로 읽으므로 같은 이름으로 준다 — 옛 run과 합칠 때는 읽는 쪽이 늦은 시각을 쓴다.
 */
export interface OrderCollectionFreshnessPort {
  readLastSucceeded(organizationId: string): Promise<ReadonlyMap<string, Date>>;
}
