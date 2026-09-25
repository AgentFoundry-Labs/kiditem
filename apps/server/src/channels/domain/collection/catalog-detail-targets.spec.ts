import { describe, expect, it } from 'vitest';
import { planCatalogDetailTargets } from './catalog-detail-targets';

const stored = (id: string, over: Partial<{ detailApplied: boolean; detailModifiedOn: string | null; status: string | null }> = {}) => ({
  externalProductId: id,
  detailApplied: true,
  detailModifiedOn: '2026-09-01',
  status: 'APPROVED',
  ...over,
});

describe('planCatalogDetailTargets', () => {
  it('targets new products, products whose list modifiedOn differs from the last detail publication, and rows never detailed — in list order', () => {
    const plan = planCatalogDetailTargets({
      listed: [
        { externalProductId: 'unchanged', modifiedOn: '2026-09-01' },
        { externalProductId: 'changed', modifiedOn: '2026-09-20' },
        { externalProductId: 'new', modifiedOn: '2026-09-21' },
        { externalProductId: 'nodetail', modifiedOn: '2026-09-01' },
        { externalProductId: 'nullnow', modifiedOn: null },
      ],
      stored: [stored('unchanged'), stored('changed'), stored('nodetail', { detailApplied: false, detailModifiedOn: null }), stored('nullnow')],
    });
    expect(plan.detailTargetProductIds).toEqual(['changed', 'new', 'nodetail', 'nullnow']);
    expect(plan.absentProductIds).toEqual([]);
  });

  it('a product Wing lists without modifiedOn is not re-targeted once its detail was applied with that null (KID-354 S3)', () => {
    const plan = planCatalogDetailTargets({
      listed: [{ externalProductId: 'nullboth', modifiedOn: null }, { externalProductId: 'nevernull', modifiedOn: null }],
      stored: [stored('nullboth', { detailModifiedOn: null }), stored('nevernull', { detailApplied: false, detailModifiedOn: null })],
    });
    expect(plan.detailTargetProductIds).toEqual(['nevernull']);
  });

  it('a failed details stage needs no bookkeeping: its targets stay targets because detailModifiedOn did not advance', () => {
    // 목록 단계가 새 modifiedOn을 저장해도 detailModifiedOn은 상세 finalize만 올린다.
    const plan = planCatalogDetailTargets({
      listed: [{ externalProductId: 'p', modifiedOn: '2026-09-20' }],
      stored: [stored('p', { detailModifiedOn: '2026-09-01' })],
    });
    expect(plan.detailTargetProductIds).toEqual(['p']);
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
