/**
 * 몰 분류 추천 — 이 몰에 보낸 적 없는 판매상품의 몰 분류를 짐작한다. 짐작일 뿐이라 사람이 확인해 저장해야 쓴다.
 *
 * 1. 같은 상품의 다른 몰 분류(`other_malls`): 우리 판매상품은 사방넷이 여러 몰에 함께 보낸 것이 많다. 다른 몰 A 에서
 *    분류 X 인 상품들이 이 몰에서 대부분 Y 였다면 Y 를 권한다. 몰마다 한 표씩(그 몰 분류에서 이 몰 분류로 간 비율)
 *    더하고 투표한 몰 수로 나눈 값이 `share` 다(실측 적중률: 둘 이상의 몰이 투표하고 `share` 0.5 이상이면 88~96%,
 *    모든 짐작을 합치면 61~78%).
 * 2. 이름이 비슷한 판매상품(`similar_names`): 수집상품에서 새로 만든 판매상품처럼 어느 몰 분류도 없으면, 이름이 비슷한
 *    판매상품들이 이 몰에서 쓰는 분류를 비슷한 정도로 무게를 주어 권한다. 이름은 글자 두 개씩 끊어 비교한다 — 우리
 *    이름은 `과일바구니딸깍이키링` 처럼 띄어 쓰지 않는 일이 많다.
 */

export interface ProductMallPath {
  salesProductId: string;
  mallKey: string;
  path: string;
  /** 판매상품 이름(비슷한 이름 추천에 쓴다). */
  name?: string;
}

export interface MallCategorySuggestion {
  path: string;
  /** 투표한 몰들(또는 비슷한 이름의 판매상품들)이 이 분류에 준 몫(0~1). */
  share: number;
  /** 투표한 몰 수(또는 비슷한 이름의 판매상품 수). */
  voters: number;
  basis: 'other_malls' | 'similar_names';
}

/** 비슷한 이름으로 볼 최소 점수(두 글자 조각 Dice 계수)와 볼 이웃 수. */
const MIN_NAME_SIMILARITY = 0.3;
const NAME_NEIGHBORS = 12;

/** 이름 → 글자 두 개씩 조각(가격 코드 · 괄호 속 수량 · 숫자는 뺀다). */
export function nameBigrams(name: string): Set<string> {
  const text = name
    .replace(/^\d{3,}(?!\d)\s*/, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, ' ');
  const grams = new Set<string>();
  for (const word of text.split(' ')) {
    if (!word || /^\d+$/.test(word)) continue;
    if (word.length === 1) continue;
    for (let index = 0; index < word.length - 1; index += 1) {
      const gram = word.slice(index, index + 2);
      if (!/^\d+$/.test(gram)) grams.add(gram);
    }
  }
  return grams;
}

function dice(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

export class MallCategorySuggester {
  /** `원래몰|원래분류|대상몰` → 대상몰 분류별 상품 수. */
  private readonly cooccurrence = new Map<string, Map<string, number>>();
  private readonly pathsByProduct = new Map<string, Map<string, string>>();
  private readonly gramsByProduct = new Map<string, Set<string>>();

  constructor(paths: readonly ProductMallPath[]) {
    for (const item of paths) {
      const path = item.path.trim();
      if (!path) continue;
      const byMall = this.pathsByProduct.get(item.salesProductId) ?? new Map<string, string>();
      byMall.set(item.mallKey, path);
      this.pathsByProduct.set(item.salesProductId, byMall);
      if (item.name && !this.gramsByProduct.has(item.salesProductId)) {
        this.gramsByProduct.set(item.salesProductId, nameBigrams(item.name));
      }
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

  /** `name` 은 다른 몰 분류가 하나도 없을 때 비슷한 이름으로 짐작하는 데 쓴다. */
  suggest(salesProductId: string, targetMall: string, name?: string): MallCategorySuggestion | null {
    return this.fromOtherMalls(salesProductId, targetMall)
      ?? (name ? this.fromSimilarNames(salesProductId, targetMall, name) : null);
  }

  private fromOtherMalls(salesProductId: string, targetMall: string): MallCategorySuggestion | null {
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
    const best = pickBest(tally);
    return best ? { path: best[0], share: round(best[1] / voters), voters, basis: 'other_malls' } : null;
  }

  private fromSimilarNames(salesProductId: string, targetMall: string, name: string): MallCategorySuggestion | null {
    const grams = nameBigrams(name);
    if (grams.size === 0) return null;
    const neighbors: { path: string; score: number }[] = [];
    for (const [otherId, byMall] of this.pathsByProduct) {
      if (otherId === salesProductId) continue;
      const path = byMall.get(targetMall);
      const otherGrams = this.gramsByProduct.get(otherId);
      if (!path || !otherGrams) continue;
      const score = dice(grams, otherGrams);
      if (score >= MIN_NAME_SIMILARITY) neighbors.push({ path, score });
    }
    if (neighbors.length === 0) return null;
    const nearest = neighbors.sort((left, right) => right.score - left.score).slice(0, NAME_NEIGHBORS);
    const tally = new Map<string, number>();
    for (const neighbor of nearest) tally.set(neighbor.path, (tally.get(neighbor.path) ?? 0) + neighbor.score);
    const total = nearest.reduce((sum, neighbor) => sum + neighbor.score, 0);
    const best = pickBest(tally);
    return best ? { path: best[0], share: round(best[1] / total), voters: nearest.length, basis: 'similar_names' } : null;
  }
}

function pickBest(tally: ReadonlyMap<string, number>): [string, number] | undefined {
  return [...tally.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
