import { describe, expect, it } from 'vitest';
import {
  getRecomposePromptOverride,
  isHeadWearableCategory,
  isApparelCategory,
} from '../domain/prompts/thumbnail-recompose-prompts';
import { buildProductContextHeader } from '../domain/prompts/thumbnail-prompts';

describe('getRecomposePromptOverride', () => {
  it('uses explicit with-box / no-box variants before inferred kind', () => {
    expect(getRecomposePromptOverride(null, 'with-box')).toContain('package box small in the back');
    expect(getRecomposePromptOverride('single-product', 'no-box')).toContain('package is fully removed');
  });

  it('routes inferred recompose kinds to dedicated prompt packs', () => {
    expect(getRecomposePromptOverride('single-product', 'auto')).toContain('single standalone product');
    expect(getRecomposePromptOverride('box-only-window', 'auto')).toContain('transparent display window');
    expect(getRecomposePromptOverride('text-heavy', 'auto')).toContain('REMOVING all text overlays');
  });

  it('routes head wearable multi-variant products to the child-model prompt', () => {
    expect(isHeadWearableCategory('완구/역할놀이/머리띠')).toBe(true);
    expect(getRecomposePromptOverride('multi-variant-loose', 'auto', '머리띠')).toContain(
      'worn by a child model',
    );
    expect(getRecomposePromptOverride('multi-variant-loose', 'auto', '문구/오피스')).toContain(
      'multi-VARIANT product set',
    );
  });

  it('routes apparel multi-variant products to the mannequin + swatch prompt', () => {
    expect(isApparelCategory('패션의류/유아동/티셔츠')).toBe(true);
    expect(isApparelCategory(null, '아이용 망토 코스튬')).toBe(true);
    expect(isApparelCategory('완구/역할놀이/머리띠')).toBe(false);

    const apparelPrompt = getRecomposePromptOverride(
      'multi-variant-loose',
      'auto',
      '패션의류/원피스',
      null,
    );
    expect(apparelPrompt).toContain('mannequin');
    expect(apparelPrompt).toContain('COLOR SWATCH DOTS');

    // 의류 키워드는 productName 으로도 잡힘 (category 가 비어 있어도 동작)
    const apparelByName = getRecomposePromptOverride(
      'multi-variant-loose',
      'auto',
      null,
      '아이용 망토 5종 세트',
    );
    expect(apparelByName).toContain('mannequin');
  });

  it('routes mixed-item-set kind to the dedicated set prompt', () => {
    const prompt = getRecomposePromptOverride('mixed-item-set', 'auto');
    expect(prompt).toContain('SET');
    expect(prompt).toContain('hero');
  });

  it('routes lighting-lifestyle kind to the realistic interior mood prompt', () => {
    const prompt = getRecomposePromptOverride('lighting-lifestyle', 'auto');
    expect(prompt).toContain('LIGHTING');
    expect(prompt).toContain('REALISTIC');
    expect(prompt).toContain('interior');
  });
});

describe('buildProductContextHeader', () => {
  it('returns empty string when no name and no category', () => {
    expect(buildProductContextHeader(null, null)).toBe('');
    expect(buildProductContextHeader('', '')).toBe('');
  });

  it('emits PRODUCT QUANTITY line when product name declares "8종 세트"', () => {
    const header = buildProductContextHeader('크리스마스 지우개 8종 세트', '문구/오피스');
    expect(header).toContain('## PRODUCT CONTEXT');
    expect(header).toContain('PRODUCT QUANTITY: 8');
    expect(header).toContain('8 units / pieces / variants');
  });

  it('emits PRODUCT QUANTITY line when product name declares "12개"', () => {
    const header = buildProductContextHeader('탐사 샘물 2L 12개', '식품/생수');
    expect(header).toContain('PRODUCT QUANTITY: 12');
  });

  it('omits PRODUCT QUANTITY line when no quantity is detected', () => {
    const header = buildProductContextHeader('단순한 상품', '완구');
    expect(header).not.toContain('PRODUCT QUANTITY');
    expect(header).toContain('## PRODUCT CONTEXT');
  });

  it('does NOT misinterpret "N개월" as a quantity', () => {
    const header = buildProductContextHeader('만 24개월 영유아용 보습크림', '뷰티');
    expect(header).not.toContain('PRODUCT QUANTITY');
  });
});
