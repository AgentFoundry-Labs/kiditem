import { describe, expect, it } from 'vitest';
import {
  getRecomposePromptOverride,
  isHeadWearableCategory,
} from '../services/thumbnail-recompose-prompts';

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
});
