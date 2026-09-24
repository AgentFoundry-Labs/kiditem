import { describe, expect, it } from 'vitest';
import { planCatalogDetailTargets } from './catalog-detail-targets';

const stored = (id: string, over: Partial<{ listModifiedOn: string | null; hasDetail: boolean; status: string | null }> = {}) => ({
  externalProductId: id,
  listModifiedOn: '2026-09-01',
  hasDetail: true,
  status: 'APPROVED',
  ...over,
});

describe('planCatalogDetailTargets', () => {
  it('targets new products, changed modifiedOn and rows without a detail section, in list order', () => {
    const plan = planCatalogDetailTargets({
      listed: [
        { externalProductId: 'unchanged', modifiedOn: '2026-09-01' },
        { externalProductId: 'changed', modifiedOn: '2026-09-20' },
        { externalProductId: 'new', modifiedOn: '2026-09-21' },
        { externalProductId: 'nodetail', modifiedOn: '2026-09-01' },
        { externalProductId: 'nullnow', modifiedOn: null },
      ],
      stored: [stored('unchanged'), stored('changed'), stored('nodetail', { hasDetail: false }), stored('nullnow')],
    });
    expect(plan.detailTargetProductIds).toEqual(['changed', 'new', 'nodetail', 'nullnow']);
    expect(plan.absentProductIds).toEqual([]);
  });

  it('lists stored products missing from the list as absent unless already recorded as deleted', () => {
    const plan = planCatalogDetailTargets({
      listed: [{ externalProductId: 'a', modifiedOn: '2026-09-01' }],
      stored: [stored('a'), stored('gone'), stored('gone-earlier', { status: 'DELETED' }), stored('inactive-old', { status: null })],
    });
    expect(plan.absentProductIds).toEqual(['gone', 'inactive-old']);
  });

  it('with requested products targets exactly those and confirms no deletions', () => {
    const plan = planCatalogDetailTargets({
      listed: [],
      stored: [stored('gone')],
      requestedProductIds: ['p1', 'p1', 'p2'],
    });
    expect(plan).toEqual({ detailTargetProductIds: ['p1', 'p2'], absentProductIds: [] });
  });

  it('ignores a duplicated list entry', () => {
    const plan = planCatalogDetailTargets({
      listed: [{ externalProductId: 'n', modifiedOn: null }, { externalProductId: 'n', modifiedOn: null }],
      stored: [],
    });
    expect(plan.detailTargetProductIds).toEqual(['n']);
  });
});
