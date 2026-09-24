/**
 * 목록에서 사라진 상품의 삭제 확인 결과를 가른다 (KID-348, 2026-09-24 21:19 "삭제 상태만 기록").
 *
 * Wing이 `displayDeletedProduct=true` 조회에서 삭제 상태로 돌려준 상품만 삭제로 기록한다.
 * 삭제되지 않은 채 돌아온 상품(`present`)은 목록 누락이 일시적이었던 것이라 그대로 두고,
 * 아무 답이 없거나(`not_found`) 확인 자체가 오지 않은 상품은 미확인으로 품질 보고에 남긴다.
 */
export const CATALOG_DELETED_STATUS = 'DELETED';

export type CatalogDeletionOutcome = 'deleted' | 'present' | 'not_found';

export type CatalogDeletionConfirmation = {
  externalProductId: string;
  outcome: CatalogDeletionOutcome;
};

export type ResolvedAbsentProducts = {
  deleted: string[];
  present: string[];
  unconfirmed: string[];
  /** 사라진 목록에 없는 상품의 확인 — 서버가 거절할 입력. */
  unexpected: string[];
};

export function resolveAbsentProducts(
  absent: readonly string[],
  confirmations: readonly CatalogDeletionConfirmation[],
): ResolvedAbsentProducts {
  const absentSet = new Set(absent);
  const outcomeById = new Map<string, CatalogDeletionOutcome>();
  const unexpected = new Set<string>();
  for (const confirmation of confirmations) {
    if (!absentSet.has(confirmation.externalProductId)) {
      unexpected.add(confirmation.externalProductId);
      continue;
    }
    outcomeById.set(confirmation.externalProductId, confirmation.outcome);
  }
  const resolved: ResolvedAbsentProducts = { deleted: [], present: [], unconfirmed: [], unexpected: [...unexpected] };
  for (const id of absentSet) {
    const outcome = outcomeById.get(id);
    if (outcome === 'deleted') resolved.deleted.push(id);
    else if (outcome === 'present') resolved.present.push(id);
    else resolved.unconfirmed.push(id);
  }
  return resolved;
}
