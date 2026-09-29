export const ORDER_COLLECTION_FRESHNESS_PORT = Symbol('ORDER_COLLECTION_FRESHNESS_PORT');

/**
 * Orders 수집 kind마다 마지막 성공 실행의 끝난 시각(KID-359). 대시보드의 수집 시각 칸이 원천 이름(`sourceType`)을
 * 키로 읽으므로 kind마다 그 원천 이름으로 준다. 실패한 실행은 수집이 아니라서 세지 않는다.
 */
export interface OrderCollectionFreshnessPort {
  readLastSucceeded(organizationId: string): Promise<ReadonlyMap<string, Date>>;
}
