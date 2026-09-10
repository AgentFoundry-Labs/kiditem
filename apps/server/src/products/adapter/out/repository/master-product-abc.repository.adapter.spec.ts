import { describe, expect, it, vi } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD } from '@kiditem/shared/product-abc';
import { MasterProductAbcRepositoryAdapter } from './master-product-abc.repository.adapter';
import type { ProductAbcPublicationInput } from '../../../application/port/out/repository/master-product-abc.repository.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const formulaVersionId = '00000000-0000-4000-8000-000000000002';
const sellpiaRunId = '00000000-0000-4000-8000-000000000003';
const advertisingRunId = '00000000-0000-4000-8000-000000000004';
const productId = '00000000-0000-4000-8000-000000000005';

function publication(overrides: Partial<ProductAbcPublicationInput> = {}): ProductAbcPublicationInput {
  return {
    organizationId,
    expectedFormulaRevision: 1,
    expectedPublicationRevision: 0,
    formulaVersionId,
    targetCutoff: '2026-08-31',
    actualCutoff: '2026-08-31',
    mappingGeneration: '7',
    sourceFences: {
      sellpia: {
        selectedComplete: sourceView(sellpiaRunId, '12'),
      },
    advertising: {
      selectedComplete: sourceView(advertisingRunId, '18'),
    },
    },
    saleAgeInputs: [{ masterProductId: productId, mappingValid: false, saleStartDate: null }],
    targetProductIds: [productId],
    candidates: [],
    calculatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

function sourceView(sourceImportRunId: string, publicationSequence: string) {
  return {
    sourceImportRunId,
    publicationSequence,
    mappingGeneration: '7',
    coverageStartDate: '2026-01-01',
    coverageEndDate: '2026-08-31',
    capturedAt: '2026-09-01T00:00:00.000Z',
  };
}

function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    organizationId,
    activeFormulaVersionId: formulaVersionId,
    formulaRevision: 1,
    publicationRevision: 0,
    officialCutoffDate: null,
    publishedSellpiaSourceImportRunId: null,
    publishedAdvertisingSourceImportRunId: null,
    publishedMappingGeneration: null,
    mappingGeneration: '7',
    formulaJson: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
    ...overrides,
  };
}

describe('MasterProductAbcRepositoryAdapter', () => {
  it('takes source, mapping, and ABC locks before the formula CAS', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (query: { values?: unknown[] }) => {
        const key = query.values?.find((value): value is string =>
          typeof value === 'string' && value.startsWith('kiditem.'));
        if (key) calls.push(key);
        if (calls.length === 4) return [stateRow({ formulaRevision: 2 })];
        return [];
      }),
      masterProductAbcEvaluation: { deleteMany: vi.fn(), createMany: vi.fn() },
      masterProduct: { updateMany: vi.fn() },
      channelListing: { findMany: vi.fn(async () => []) },
    };
    const prisma = { $transaction: vi.fn(async (work) => work(tx)) };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await expect(repository.publish(publication())).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
    expect(calls).toEqual([
      'kiditem.sellpia-product-profitability:' + organizationId,
      'kiditem.coupang-ad-profitability:' + organizationId,
      'kiditem.product-mapping:' + organizationId,
      'kiditem.master-product-abc:' + organizationId,
    ]);
    expect(tx.masterProduct.updateMany).not.toHaveBeenCalled();
  });

  it('does not open a second transaction for a CAS miss from the source vector', async () => {
    let queryCount = 0;
    const tx = {
      $queryRaw: vi.fn(async () => {
        queryCount += 1;
        if (queryCount === 5) return [stateRow()];
        if (queryCount === 6) return [{
          sourceImportRunId: '00000000-0000-4000-8000-000000000099',
          publicationSequence: '99',
          mappingGeneration: '7',
          coverageStartDate: new Date('2026-01-01T00:00:00.000Z'),
          coverageEndDate: new Date('2026-08-31T00:00:00.000Z'),
          status: 'completed',
          expiresAt: null,
        }];
        return [];
      }),
      masterProductAbcEvaluation: { deleteMany: vi.fn(), createMany: vi.fn() },
      masterProduct: { updateMany: vi.fn() },
      channelListing: { findMany: vi.fn(async () => []) },
    };
    const prisma = {
      $transaction: vi.fn(async (work) => work(tx)),
    };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await expect(repository.publish(publication())).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.masterProductAbcEvaluation.deleteMany).not.toHaveBeenCalled();
  });
});
