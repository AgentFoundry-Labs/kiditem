import { describe, expect, it } from 'vitest';
import { buildBoldVerticalProductTitle } from '../detail-page-product-title';

describe('buildBoldVerticalProductTitle', () => {
  it('does not classify bubble-pop slime as a soap-bubble product', () => {
    const result = buildBoldVerticalProductTitle('퐁퐁 버블팝슬라임');

    expect(result?.heroSubtext).toBe('말랑말랑 촉감 놀이!');
    expect(result?.heroDescription).toBe('쫀득하게 주무르며 즐기는 슬라임!');
    expect(result?.heroDescription).not.toContain('비눗방울');
    expect(result?.heroDescription).not.toContain('목에 걸고');
  });

  it('keeps necklace bubble products on the bubble copy path', () => {
    const result = buildBoldVerticalProductTitle('휴대용목걸이비눗방울');

    expect(result?.first).toBe('휴대용 목걸이');
    expect(result?.second).toBe('비눗방울!');
    expect(result?.heroDescription).toContain('비눗방울');
  });
});
