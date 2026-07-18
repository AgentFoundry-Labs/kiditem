import { describe, expect, it } from 'vitest';
import {
  normalizeChannelRecipeName,
  rankChannelRecipeNameCandidates,
  scoreChannelRecipeNameCandidate,
} from './channel-recipe-name-matcher';

const sku = (code: string, name: string, optionName: string | null = null) => ({
  sellpiaInventorySkuId: `00000000-0000-4000-8000-${code.padStart(12, '0')}`,
  code,
  name,
  optionName,
  currentStock: 1,
});

describe('channel recipe name matcher', () => {
  it('removes trailing unit-only option labels from the identity text', () => {
    expect(normalizeChannelRecipeName('키즈 식판 단품 1개')).toBe('키즈식판');
  });

  it('preserves numeric product attributes after removing sales-unit noise', () => {
    expect(normalizeChannelRecipeName('아동용 120cm 3단 우산 1개')).toBe('아동용120cm3단우산');
  });

  it('normalizes sales noise while preserving a meaningful option', () => {
    const result = scoreChannelRecipeNameCandidate(
      [{ listingName: 'KY I&D 초경량 UV 차단 3단 접이식 우산 1p 휴대용 양산', itemName: '네이비 M' }],
      sku('1', '초경량UV차단3단접이식우산', '네이비'),
    );
    expect(result.kind).toBe('contained_name');
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  it('does not lower confidence when listing and option repeat the same full name', () => {
    const result = scoreChannelRecipeNameCandidate(
      [{
        listingName: '11000 찍찍이 가방 캐치볼 (블루)',
        itemName: '11000 찍찍이 가방 캐치볼 (블루)',
      }],
      sku('1', '11000찍찍이가방캐치볼', '블루'),
    );
    expect(result.kind).toBe('normalized_name');
    expect(result.score).toBe(1);
  });

  it('ranks one unique contained product phrase above unrelated inventory', () => {
    const result = rankChannelRecipeNameCandidates(
      [{ listingName: '동물인형 목욕타올 1p 어린이 샤워 타올', itemName: '1개' }],
      [
        sku('1', '동물인형목욕타올'),
        sku('2', '동물모양어린이칫솔'),
      ],
    );
    expect(result[0]).toMatchObject({ kind: 'contained_name', sku: { code: '1' } });
    expect(result[0]!.score).toBeGreaterThanOrEqual(0.6);
  });

  it('preserves random and color options as identity instead of unit noise', () => {
    const result = rankChannelRecipeNameCandidates(
      [{ listingName: '초경량 UV 차단 3단 접이식 우산', itemName: '네이비 M' }],
      [
        sku('1', '초경량UV차단3단접이식우산', '랜덤'),
        sku('2', '초경량UV차단3단접이식우산', '네이비'),
      ],
    );
    expect(result[0]?.sku.code).toBe('2');
    expect(result[0]?.kind).toBe('contained_name');
    expect(result[1]?.kind).toBe('fuzzy_name');
  });

  it('retains close option siblings so the classifier can refuse an ambiguous guess', () => {
    const result = rankChannelRecipeNameCandidates(
      [{ listingName: '게틀링 LED 멜로디 비눗방울총', itemName: '블랙+골드' }],
      [
        sku('1', '게틀링LED멜로디비눗방울총', '블랙'),
        sku('2', '게틀링LED멜로디비눗방울총', '골드'),
      ],
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.kind).toBe('contained_name');
    expect(result[1]?.kind).toBe('contained_name');
    expect(result[0]!.score - result[1]!.score).toBeLessThan(0.12);
  });
});
