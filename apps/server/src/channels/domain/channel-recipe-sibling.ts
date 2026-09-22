/**
 * 몰끼리 같은 제목 — 같은 상품은 몰마다 거의 같은 제목으로 올린다(사장님 2026-09-19 "몰마다 보면 겹치는 상품명들이 많잖아
 * 일단 맞는거 부터 매칭하고"). 이미 이어진 다른 리스팅과 제목이 똑같고 그 리스팅들의 레시피가 모두 한 가지면, 그
 * 레시피(셀피아 SKU · 수량)를 그대로 쓴다.
 *
 * 제목은 띄어쓰기 · 문장부호 · 대소문자만 무시하고 숫자는 남긴다 — `(12개)` 와 `(6개)` 는 묶음이 달라 다른 제목이다.
 * 짧은 제목(6자 미만)은 흔한 이름이라 쓰지 않고, 같은 제목에 레시피가 둘 이상이면 사람이 고른다. 몰에 적힌 셀피아 코드가
 * 다른 상품을 가리키면 제목으로 덮지 않는다.
 */
export const SIBLING_TITLE_MIN_LENGTH = 6;

export type SiblingRecipe = {
  sellpiaInventorySkuId: string;
  quantity: number;
};

export function siblingTitleKey(title: string | null): string | null {
  const key = (title ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return key.length >= SIBLING_TITLE_MIN_LENGTH ? key : null;
}

export function siblingRecipeFor(
  recipes: readonly SiblingRecipe[],
  codeSkuIds: readonly string[],
): SiblingRecipe | null {
  const distinct = new Map(recipes.map((recipe) => [
    `${recipe.sellpiaInventorySkuId}x${recipe.quantity}`,
    recipe,
  ]));
  if (distinct.size !== 1) return null;
  const [recipe] = [...distinct.values()];
  if (!recipe || !Number.isSafeInteger(recipe.quantity) || recipe.quantity <= 0) return null;
  if (codeSkuIds.length > 0 && !codeSkuIds.includes(recipe.sellpiaInventorySkuId)) return null;
  return { sellpiaInventorySkuId: recipe.sellpiaInventorySkuId, quantity: recipe.quantity };
}
