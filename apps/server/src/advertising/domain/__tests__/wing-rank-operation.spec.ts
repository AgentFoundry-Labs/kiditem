import { describe, expect, it } from 'vitest';
import { WING_RANK_MAX_KEYWORDS } from '@kiditem/shared/advertising-operations';
import { planWingRank } from '../wing-rank-operation';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function selection(count: number) {
  const keywords = Array.from({ length: count }, (_, index) => `키워드${index}`);
  return {
    selection: { productCount: count, resumed: false, pendingProductCount: count, keywordCount: count, targets: keywords.map((keyword) => ({ keyword })) },
    assignments: keywords.map((keyword, index) => ({ keyword, vendorItemId: `V${index}`, productName: '상품', category: null, candidateIndex: 0 })),
  };
}

describe('Wing rank plan (KID-362)', () => {
  it('cuts a server-picked selection above the keyword limit in its pending-first order instead of refusing', () => {
    const plan = planWingRank({ channelAccountId: ACCOUNT, ...selection(WING_RANK_MAX_KEYWORDS + 5) });
    expect(plan.keywords).toHaveLength(WING_RANK_MAX_KEYWORDS);
    expect(plan.keywords[0]?.keyword).toBe('키워드0');
    expect(plan.keywords.at(-1)?.keyword).toBe(`키워드${WING_RANK_MAX_KEYWORDS - 1}`);
  });

  it('still refuses when there is no representative keyword to rank', () => {
    expect(() => planWingRank({ channelAccountId: ACCOUNT, ...selection(0) })).toThrow(expect.objectContaining({ code: 'ADVERTISING_RANK_TARGETS_EMPTY' }));
  });
});
