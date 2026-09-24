import { CATALOG_DELETED_STATUS } from './catalog-deletion-confirmation';

/**
 * details 단계가 상세를 받을 상품과 삭제 확인이 필요한 상품을 목록 결과와 저장된 행으로
 * 정한다 (KID-348). 순수 규칙이며 DB·시각을 모른다.
 */
export type ListedCatalogProduct = {
  externalProductId: string;
  /** Wing 목록의 `modifiedOn`. 목록이 주지 않으면 `null`. */
  modifiedOn: string | null;
};

export type StoredCatalogListing = {
  externalProductId: string;
  /** `rawJson.list.modifiedOn`(또는 구역 이전 평면 `modifiedOn`). */
  listModifiedOn: string | null;
  /** `rawJson.detail`(또는 평면 `detailDocuments`)이 있는가. */
  hasDetail: boolean;
  status: string | null;
};

export type CatalogDetailPlan = {
  detailTargetProductIds: string[];
  absentProductIds: string[];
};

/**
 * 대상은 셋이다: 저장된 행이 없는 신규 상품, 목록 `modifiedOn`이 저장값과 다른 상품, 상세
 * 구역이 없는 상품. `modifiedOn`이 한쪽만 없어도 다르다고 본다.
 *
 * 사라진 상품은 저장돼 있으나 목록에 없고 아직 삭제로 기록되지 않은 상품이다. 활성 여부는
 * 보지 않는다 — 옛 규칙이 비활성으로만 둔 행도 한 번은 확인해서 삭제인지 가린다.
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
    if (!stored || stored.listModifiedOn !== product.modifiedOn || !stored.hasDetail) {
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

/**
 * 앞 동기화의 상세 단계가 끝나지 못했으면(실패·만료·중단) 그 대상은 반영되지 않았다. 목록 단계가
 * 이미 새 `modifiedOn`을 저장했으므로 비교만으로는 다시 잡히지 않으니, 아직 목록에 있는 그 상품을
 * 이번 대상에 더한다 (KID-348: 실패한 동기화의 대상은 다음 동기화가 다시 받는다).
 */
export function withUnfinishedDetailTargets(
  plan: CatalogDetailPlan,
  listedProductIds: readonly string[],
  unfinishedTargetIds: readonly string[],
): CatalogDetailPlan {
  const targets = new Set(plan.detailTargetProductIds);
  const unfinished = new Set(unfinishedTargetIds);
  for (const id of listedProductIds) {
    if (unfinished.has(id)) targets.add(id);
  }
  return {
    detailTargetProductIds: listedProductIds.filter((id) => targets.has(id)),
    absentProductIds: plan.absentProductIds,
  };
}
