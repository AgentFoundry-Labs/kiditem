/**
 * 몰 분류 추천 — 이 몰에 보낸 적 없는 판매상품의 몰 분류를, 같은 상품이 다른 몰에서 쓰는 분류로 짐작한다.
 *
 * 우리 판매상품은 사방넷이 여러 몰에 함께 보낸 것이 많다. 다른 몰 A 에서 분류 X 인 상품들이 이 몰에서 대부분 Y
 * 였다면 Y 를 권한다. 몰마다 한 표씩(그 몰 분류에서 이 몰 분류로 간 비율) 더하고 투표한 몰 수로 나눈 값이
 * `share` 다. 짐작일 뿐이라 사람이 확인해 저장해야 쓴다(실측 적중률: 둘 이상의 몰이 투표하고 `share` 0.5 이상이면
 * 88~96%, 모든 짐작을 합치면 61~78%).
 */

export interface ProductMallPath {
  salesProductId: string;
  mallKey: string;
  path: string;
}

export interface MallCategorySuggestion {
  path: string;
  /** 투표한 몰들이 이 분류에 준 몫의 평균(0~1). */
  share: number;
  /** 투표한 몰 수. */
  voters: number;
}

export class MallCategorySuggester {
  /** `원래몰|원래분류|대상몰` → 대상몰 분류별 상품 수. */
  private readonly cooccurrence = new Map<string, Map<string, number>>();
  private readonly pathsByProduct = new Map<string, Map<string, string>>();

  constructor(paths: readonly ProductMallPath[]) {
    for (const item of paths) {
      const path = item.path.trim();
      if (!path) continue;
      const byMall = this.pathsByProduct.get(item.salesProductId) ?? new Map<string, string>();
      byMall.set(item.mallKey, path);
      this.pathsByProduct.set(item.salesProductId, byMall);
    }
    for (const byMall of this.pathsByProduct.values()) {
      for (const [source, sourcePath] of byMall) {
        for (const [target, targetPath] of byMall) {
          if (source === target) continue;
          const key = `${source}|${sourcePath}|${target}`;
          const counts = this.cooccurrence.get(key) ?? new Map<string, number>();
          counts.set(targetPath, (counts.get(targetPath) ?? 0) + 1);
          this.cooccurrence.set(key, counts);
        }
      }
    }
  }

  suggest(salesProductId: string, targetMall: string): MallCategorySuggestion | null {
    const byMall = this.pathsByProduct.get(salesProductId);
    if (!byMall) return null;
    const tally = new Map<string, number>();
    let voters = 0;
    for (const [source, sourcePath] of byMall) {
      if (source === targetMall) continue;
      const counts = this.cooccurrence.get(`${source}|${sourcePath}|${targetMall}`);
      if (!counts) continue;
      const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
      voters += 1;
      for (const [path, count] of counts) tally.set(path, (tally.get(path) ?? 0) + count / total);
    }
    if (voters === 0) return null;
    const [best] = [...tally.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    return best ? { path: best[0], share: Math.round((best[1] / voters) * 100) / 100, voters } : null;
  }
}
