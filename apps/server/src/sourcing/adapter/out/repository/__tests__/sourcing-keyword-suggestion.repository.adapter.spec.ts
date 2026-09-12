import { describe, expect, it, vi } from 'vitest';
import { SourcingKeywordSuggestionRepositoryAdapter } from '../sourcing-keyword-suggestion.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const payload = {
  keyword: 'A Pencil', capturedAt: '2026-08-14T00:00:30.000Z',
  items: [{ rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' }],
  productNameTokens: [{ keyword: '연필', count: 4 }],
};
function harness(value: unknown = payload) {
  const findFirst = vi.fn(async () => value === null ? null : { payload: value });
  return { findFirst, repository: new SourcingKeywordSuggestionRepositoryAdapter({
    sourcingEvidenceObservation: { findFirst },
  } as never) };
}
describe('SourcingKeywordSuggestionRepositoryAdapter', () => {
  it('reads the current COMPLETE observation directly with organization, source and keyword fences', async () => {
    const { repository, findFirst } = harness();
    await expect(repository.findLatest({ organizationId, normalizedKeyword: 'a pencil' })).resolves.toEqual({
      capturedAt: new Date(payload.capturedAt), items: payload.items, productNameTokens: payload.productNameTokens,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId, sourceKey: 'coupang.keyword_suggestion', platform: 'coupang',
        evidenceFamily: 'keyword_suggestion', schemaVersion: 'coupang-keyword-suggestion/v1',
        conceptKey: 'a pencil', supersededByObservation: null,
        ingestionRun: {
          organizationId, sourceKey: 'coupang.keyword_suggestion', scopeKey: 'default',
          targetKey: 'keyword:a pencil', collectorVersion: 'coupang-keyword-suggestion/v1',
          status: 'COMPLETE', isCurrentComplete: true, completedAt: { not: null },
        },
      },
      select: { payload: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
    });
  });
  it('preserves an explicit empty COMPLETE snapshot', async () => {
    const { repository } = harness({ ...payload, items: [], productNameTokens: [] });
    await expect(repository.findLatest({ organizationId, normalizedKeyword: 'a pencil' })).resolves.toEqual({
      capturedAt: new Date(payload.capturedAt), items: [], productNameTokens: [],
    });
  });
  it.each([null, { ...payload, raw: { secret: true } }, { ...payload, keyword: 'other' }])(
    'returns missing for absent, invalid or mismatched current evidence without a historical fallback',
    async (value) => {
      const { repository } = harness(value);
      await expect(repository.findLatest({ organizationId, normalizedKeyword: 'a pencil' })).resolves.toBeNull();
    },
  );
});
