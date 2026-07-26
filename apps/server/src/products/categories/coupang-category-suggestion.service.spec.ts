import { describe, expect, it, vi } from 'vitest';
import { CoupangCategorySuggestionService } from './coupang-category-suggestion.service';

const KEYHOLDER = '[64687] 생활용품>생활소품>열쇠고리/키홀더';

describe('CoupangCategorySuggestionService', () => {
  it('infers from active Coupang listings in the current organization only', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        displayName: '4구 스핀 딸깍이 키링 1p 휴대용 열쇠고리',
        category: KEYHOLDER,
      },
    ]);
    const service = new CoupangCategorySuggestionService({
      channelListing: { findMany },
    } as never);

    const result = await service.suggest('organization-1', ['4000과일바구니딸깍이키링']);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        isActive: true,
        channelAccount: {
          is: {
            organizationId: 'organization-1',
            channel: 'coupang',
            status: 'active',
          },
        },
        displayName: { not: null },
        category: { startsWith: '[' },
      },
      select: { displayName: true, category: true },
    });
    expect(result).toEqual({
      corpusSize: 1,
      results: [
        {
          name: '4000과일바구니딸깍이키링',
          suggestion: expect.objectContaining({
            categoryCell: KEYHOLDER,
            confidence: 'high',
          }),
        },
      ],
    });
  });
});
