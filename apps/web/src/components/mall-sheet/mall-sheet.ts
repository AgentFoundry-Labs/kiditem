import type {
  SalesProductMallSheet,
  SalesProductMallSheetCheck,
  SalesProductMallSheetTarget,
  SalesProductMallSheetTargetChoice,
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

/** 사람이 고를 등록 설정 한 줄 — 상품 × 몰. 설정이 둘 이상인 것만 나온다. */
export interface MallSheetTargetChoice {
  /** 고른 값을 담는 열쇠(`상품id|몰키`). */
  key: string;
  salesProductId: string;
  code: string;
  name: string;
  mallKey: string;
  targets: SalesProductMallSheetTarget[];
}

/** 고른 등록 설정을 담는 열쇠. 상품 × 몰마다 하나다. */
export function targetSelectionKey(salesProductId: string, mallKey: string): string {
  return `${salesProductId}|${mallKey}`;
}

/** 이 확인 결과에서 사람이 골라야 하는 상품 × 몰. 0개 · 1개인 상품 × 몰은 나오지 않는다. */
export function mallSheetTargetChoices(check: SalesProductMallSheetCheck): MallSheetTargetChoice[] {
  return check.products.flatMap((product) => product.mallTargets
    .filter((mall) => mall.selectionRequired)
    .map((mall) => ({
      key: targetSelectionKey(product.salesProductId, mall.mallKey),
      salesProductId: product.salesProductId,
      code: product.code,
      name: product.name,
      mallKey: mall.mallKey,
      targets: mall.targets,
    })));
}

/**
 * 아직 등록 설정을 고르지 않은 상품 × 몰 수. `salesProductIds` 를 주면 그 상품만 센다 — 고르지 않은 상품 하나가
 * 나머지 상품의 받기까지 막지 않게, 받기는 실제로 담은 상품만 본다.
 */
export function unchosenMallTargets(
  check: SalesProductMallSheetCheck,
  selection: Readonly<Record<string, string>>,
  salesProductIds?: readonly string[],
): number {
  const only = salesProductIds ? new Set(salesProductIds) : null;
  return mallSheetTargetChoices(check)
    .filter((choice) => !only || only.has(choice.salesProductId))
    .filter((choice) => !choice.targets.some((target) => target.id === selection[choice.key]))
    .length;
}

/**
 * 이 묶음에 넣을 상품의 고른 설정만. 받기는 몰이 받는 상품 수로 잘라 여러 번 보내므로, 그 묶음에 없는 상품의
 * 선택을 함께 보내면 서버가 거절한다.
 */
export function chosenTargetsFor(
  check: SalesProductMallSheetCheck,
  selection: Readonly<Record<string, string>>,
  salesProductIds: readonly string[],
): SalesProductMallSheetTargetChoice[] {
  const batch = new Set(salesProductIds);
  return mallSheetTargetChoices(check)
    .filter((choice) => batch.has(choice.salesProductId))
    .flatMap((choice) => {
      const targetId = selection[choice.key];
      return targetId && choice.targets.some((target) => target.id === targetId)
        ? [{ salesProductId: choice.salesProductId, mallKey: choice.mallKey, targetId }]
        : [];
    });
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
