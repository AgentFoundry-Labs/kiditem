import { describe, expect, it, vi } from 'vitest';
import { SourcingKeywordSuggestionService } from '../sourcing-keyword-suggestion.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const batch = {
  keyword: 'A Pencil', capturedAt: '2026-08-14T00:00:30.000Z',
  items: [{ rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' as const }],
  productNameTokens: [{ keyword: '연필', count: 4 }],
};

// 수집(범위 검증·발행)은 실행 kind `sourcing.coupang_keyword_suggestion`의 PG 스펙이 본다(KID-360).
describe('Coupang keyword suggestion snapshot', () => {
  it('reads the latest published snapshot under the normalized keyword', async () => {
    const snapshots = { findLatest: vi.fn(async () => ({ capturedAt: new Date(batch.capturedAt),
      items: batch.items, productNameTokens: batch.productNameTokens })) };
    const service = new SourcingKeywordSuggestionService(snapshots);
    await expect(service.snapshot({ organizationId, keyword: ' Ａ Pencil ' })).resolves.toEqual({
      keyword: 'A Pencil', generatedAt: batch.capturedAt, sourceKey: 'coupang.keyword_suggestion',
      schemaVersion: 'coupang-keyword-suggestion/v1', items: batch.items,
      productNameTokens: batch.productNameTokens,
    });
    expect(snapshots.findLatest).toHaveBeenCalledWith({ organizationId, normalizedKeyword: 'a pencil' });
  });

  it('answers an empty snapshot when nothing is published yet', async () => {
    const service = new SourcingKeywordSuggestionService({ findLatest: vi.fn(async () => null) });
    await expect(service.snapshot({ organizationId, keyword: 'x' })).resolves.toMatchObject({ generatedAt: null, items: [] });
  });
});
