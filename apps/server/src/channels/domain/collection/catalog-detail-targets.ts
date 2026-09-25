import { CATALOG_DELETED_STATUS } from './catalog-deletion-confirmation';

/**
 * 상세를 받을 상품과 삭제 확인이 필요한 상품을 목록 결과와 저장된 행으로 정한다 (KID-348 → KID-354).
 * 순수 규칙이며 DB·시각을 모른다. 서버 목록 kind의 finalize가 부르고, 확장은 계산하지 않는다.
 */
export type ListedCatalogProduct = {
  externalProductId: string;
  /** Wing 목록의 `modifiedOn`. 목록이 주지 않으면 `null`. */
  modifiedOn: string | null;
};

export type StoredCatalogListing = {
  externalProductId: string;
  /**
   * 마지막으로 상세를 반영했을 때의 목록 `modifiedOn`. 상세를 반영한 적이 없으면 `null`.
   * 목록 단계는 이 값을 건드리지 않고 상세 단계 finalize만 올린다 — 그래서 실패한 상세 단계의 대상은
   * 다음 동기화가 자연히 다시 잡는다(KID-354: 별도 "못 끝낸 대상" 추적 없음).
   */
  detailModifiedOn: string | null;
  status: string | null;
};

export type CatalogDetailPlan = {
  detailTargetProductIds: string[];
  absentProductIds: string[];
};

/**
 * 대상은 셋이다: 저장된 행이 없는 신규 상품, 상세를 반영한 적이 없는 상품, 목록 `modifiedOn`이 마지막 상세
 * 반영 시점과 다른 상품. `modifiedOn`이 한쪽만 없어도 다르다고 본다.
 *
 * 사라진 상품은 저장돼 있으나 목록에 없고 아직 삭제로 기록되지 않은 상품이다. 활성 여부는 보지 않는다.
 *
 * 운영자가 상품을 지목하면(`requestedProductIds`) 그 상품만 대상이고 삭제 확인은 없다.
 */
export function planCatalogDetailTargets(input: {
  listed: readonly ListedCatalogProduct[];
  stored: readonly StoredCatalogListing[];
  requestedProductIds?: readonly string[];
}): CatalogDetailPlan {
  if (input.requestedProductIds) {
    return { detailTargetProductIds: dedupe(input.requestedProductIds), absentProductIds: [] };
  }
  const storedById = new Map(input.stored.map((row) => [row.externalProductId, row]));
  const listedIds = new Set<string>();
  const targets: string[] = [];
  for (const product of input.listed) {
    if (listedIds.has(product.externalProductId)) continue;
    listedIds.add(product.externalProductId);
    const stored = storedById.get(product.externalProductId);
    if (!stored || stored.detailModifiedOn === null || stored.detailModifiedOn !== product.modifiedOn) {
      targets.push(product.externalProductId);
    }
  }
  const absent = input.stored
    .filter((row) => !listedIds.has(row.externalProductId) && row.status !== CATALOG_DELETED_STATUS)
    .map((row) => row.externalProductId);
  return { detailTargetProductIds: targets, absentProductIds: dedupe(absent) };
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
