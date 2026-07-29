import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({ apiClient: { post } }));

import {
  buildUnresolvedCategoryError,
  resolveWingCategories,
} from './wing-category-resolution';

describe('WING category resolution', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('deduplicates names and only auto-applies high-confidence catalog matches', async () => {
    post.mockResolvedValue({
      corpusSize: 2,
      results: [
        {
          name: '키링',
          suggestion: {
            categoryCell: '[64687] 생활용품>생활소품>열쇠고리/키홀더',
            code: 64687,
            path: '생활용품>생활소품>열쇠고리/키홀더',
            leaf: '열쇠고리/키홀더',
            score: 0.8,
            confidence: 'high',
            basedOn: ['기존 키링'],
            support: 2,
          },
        },
        {
          name: '보드게임',
          suggestion: {
            categoryCell: '[77448] 완구/취미>보드게임>기타보드게임',
            code: 77448,
            path: '완구/취미>보드게임>기타보드게임',
            leaf: '기타보드게임',
            score: 0.35,
            confidence: 'medium',
            basedOn: ['기존 보드게임'],
            support: 1,
          },
        },
      ],
    });

    const result = await resolveWingCategories([' 키링 ', '키링', '보드게임']);

    expect(post).toHaveBeenCalledWith('/api/categories/coupang-suggestions', {
      names: ['키링', '보드게임'],
    });
    expect(result.get('키링')?.categoryCell).toContain('[64687]');
    expect(result.get('보드게임')?.categoryCell).toBeNull();
    expect(result.get('보드게임')?.suggestion?.categoryCell).toContain('[77448]');
  });

  it('does not auto-apply a low-confidence suggestion and keeps the hint', async () => {
    post.mockResolvedValue({
      corpusSize: 1,
      results: [
        {
          name: '모호한 상품',
          suggestion: {
            categoryCell: '[77390] 완구/취미>스포츠/야외완구>물총',
            code: 77390,
            path: '완구/취미>스포츠/야외완구>물총',
            leaf: '물총',
            score: 0.21,
            confidence: 'low',
            basedOn: ['기존 상품'],
            support: 1,
          },
        },
      ],
    });

    const result = await resolveWingCategories(['모호한 상품']);

    expect(result.get('모호한 상품')?.categoryCell).toBeNull();
    expect(buildUnresolvedCategoryError(['모호한 상품'], result)).toContain(
      '후보: 완구/취미>스포츠/야외완구>물총',
    );
  });
});
