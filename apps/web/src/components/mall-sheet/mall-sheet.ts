import type {
  SalesProductMallSheet,
  SalesProductMallSheetCheck,
} from '@kiditem/shared/sales-product';

/** 분류가 없어 막힌 상품을 (몰 · 추천 분류)로 묶은 것. 한 번에 저장한다. */
export interface MallSheetCategoryGroup {
  mallKey: string;
  /** 다른 몰 분류로 짐작한 이 몰 분류. 없으면 null — 사람이 적어야 한다. */
  suggestion: string | null;
  /** 짐작 몫의 평균(0~1). */
  share: number;
  /** 추천 분류가 몰 번호로 풀리는가(번호로 받는 몰). */
  resolves: boolean;
  /** 짐작 근거 — 같은 상품의 다른 몰 분류 · 이름이 비슷한 판매상품 · 둘이 섞임. 추천이 없으면 null. */
  basis: 'other_malls' | 'similar_names' | 'mixed' | null;
  salesProductIds: string[];
  /** 같은 순서의 `코드 상품명` — 추천이 맞는지 사람이 볼 수 있게. */
  names: string[];
}

export function mallSheetCategoryGroups(
  check: SalesProductMallSheetCheck,
  sheet: Pick<SalesProductMallSheet, 'mallKeys'>,
): MallSheetCategoryGroup[] {
  const groups = new Map<string, MallSheetCategoryGroup & { shareSum: number }>();
  for (const product of check.products) {
    if (product.problems.length === 0) continue;
    for (const category of product.categories) {
      if (category.resolved) continue;
      const suggestion = category.suggestion?.path ?? null;
      const key = `${category.mallKey}|${suggestion ?? ''}`;
      const group = groups.get(key) ?? {
        mallKey: category.mallKey,
        suggestion,
        share: 0,
        shareSum: 0,
        resolves: category.suggestion?.resolves ?? false,
        basis: category.suggestion?.basis ?? null,
        salesProductIds: [],
        names: [],
      };
      if (category.suggestion && group.basis !== category.suggestion.basis) group.basis = 'mixed';
      group.salesProductIds.push(product.salesProductId);
      group.names.push(`${product.code} ${product.name}`);
      group.shareSum += category.suggestion?.share ?? 0;
      groups.set(key, group);
    }
  }
  const order = (mallKey: string) => sheet.mallKeys.indexOf(mallKey);
  return [...groups.values()]
    .map(({ shareSum, ...group }) => ({ ...group, share: group.salesProductIds.length ? shareSum / group.salesProductIds.length : 0 }))
    .sort((left, right) =>
      order(left.mallKey) - order(right.mallKey)
      || Number(right.suggestion !== null) - Number(left.suggestion !== null)
      || right.salesProductIds.length - left.salesProductIds.length);
}

const STORAGE_KEY = 'kiditem.mallSheetFixed.v1';

/** 이 브라우저에서 바꿔 둔 몰 고정값. 읽지 못하면 빈 값(기본값을 쓴다). */
export function readStoredFixed(): Record<string, Record<string, string>> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Record<string, string>>) : {};
  } catch {
    return {};
  }
}

export function storeFixed(values: Record<string, Record<string, string>>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // 개인 창 · 막힌 저장소에서는 기억하지 않는다. 기본값으로 다시 시작한다.
  }
}
