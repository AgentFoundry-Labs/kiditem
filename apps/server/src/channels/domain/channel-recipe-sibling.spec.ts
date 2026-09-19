import { describe, expect, it } from 'vitest';
import { siblingRecipeFor, siblingTitleKey } from './channel-recipe-sibling';

const recipe = (sellpiaInventorySkuId: string, quantity = 1) => ({ sellpiaInventorySkuId, quantity });

/**
 * 같은 상품은 몰마다 거의 같은 제목으로 올린다(사장님 2026-09-19). 이미 이어진 다른 몰 리스팅과 제목이 같으면 그 레시피를
 * 쓴다 — 레시피가 한 가지일 때만.
 */
describe('siblingTitleKey', () => {
  it('띄어쓰기 · 문장부호 · 대소문자만 무시하고 묶음 숫자는 남긴다', () => {
    expect(siblingTitleKey('애니멀 회전 주사위 키링 (1p) 휴대용 주사위 장난감 열쇠고리'))
      .toBe(siblingTitleKey('애니멀 회전 주사위 키링(1P) 휴대용 주사위 장난감 열쇠고리'));
    expect(siblingTitleKey('우파루팡 쫀득 슈가 말랑이 (12개)')).not.toBe(siblingTitleKey('우파루팡 쫀득 슈가 말랑이 (6개)'));
  });

  it('짧은 제목은 흔한 이름이라 쓰지 않는다', () => {
    expect(siblingTitleKey('키링 1p')).toBeNull();
    expect(siblingTitleKey(null)).toBeNull();
  });
});

describe('siblingRecipeFor', () => {
  it('같은 제목의 레시피가 모두 같으면 그 레시피다', () => {
    expect(siblingRecipeFor([recipe('sku-a'), recipe('sku-a')], [])).toEqual(recipe('sku-a'));
  });

  it('같은 제목에 레시피가 둘 이상이면 고르지 않는다', () => {
    expect(siblingRecipeFor([recipe('sku-a'), recipe('sku-b')], [])).toBeNull();
    expect(siblingRecipeFor([recipe('sku-a', 1), recipe('sku-a', 12)], [])).toBeNull();
    expect(siblingRecipeFor([], [])).toBeNull();
  });

  it('몰에 적힌 셀피아 코드가 다른 상품을 가리키면 제목으로 덮지 않는다', () => {
    expect(siblingRecipeFor([recipe('sku-a')], ['sku-b'])).toBeNull();
    expect(siblingRecipeFor([recipe('sku-a')], ['sku-a'])).toEqual(recipe('sku-a'));
  });
});
