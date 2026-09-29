import { channelFactTestPorts } from '../../../../test-helpers/channel-fact-ports';
import { describe, expect, it, vi } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD } from '@kiditem/shared/product-abc';
import { ProductTransactionalReadRepositoryAdapter } from './product-transactional-read.repository.adapter';
import { MasterProductAbcRepositoryAdapter } from './master-product-abc.repository.adapter';
import type { ProductAbcPublicationInput } from '../../../application/port/out/persistence/master-product-abc.repository.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const formulaVersionId = '00000000-0000-4000-8000-000000000002';
const sellpiaRunId = '00000000-0000-4000-8000-000000000003';
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
    },
    saleAgeInputs: [{ masterProductId: productId, mappingValid: false, saleStartDate: null }],
    targetProductIds: [productId],
    candidates: [],
    calculatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

function sourceView(operationId: string, publicationSequence: string) {
  return {
    operationId,
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
    publishedSellpiaOperationId: null,
    publishedMappingGeneration: null,
    mappingGeneration: '7',
    formulaJson: PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD,
    ...overrides,
  };
}

describe('MasterProductAbcRepositoryAdapter', () => {
  it('takes the mapping and ABC locks before the formula CAS', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (query: { values?: unknown[] }) => {
        const key = query.values?.find((value): value is string =>
          typeof value === 'string' && value.startsWith('kiditem.'));
        if (key) calls.push(key);
        if (calls.length === 2) return [stateRow({ formulaRevision: 2 })];
        return [];
      }),
      masterProductAbcEvaluation: { deleteMany: vi.fn(), createMany: vi.fn() },
      masterProduct: { updateMany: vi.fn() },
      channelListing: { findMany: vi.fn(async () => []) },
    };
    const prisma = { $transaction: vi.fn(async (work) => work(tx)) };
    const repository = new MasterProductAbcRepositoryAdapter(
      prisma as never,
      new ProductTransactionalReadRepositoryAdapter(),
      channelFactTestPorts(prisma as never).listings,
    );

    await expect(repository.publish(publication())).resolves.toEqual({ outcome: 'INPUT_CHANGED' });
    expect(calls).toEqual([
      'kiditem.product-mapping:' + organizationId,
      'kiditem.master-product-abc:' + organizationId,
    ]);
    expect(tx.masterProduct.updateMany).not.toHaveBeenCalled();
  });
});
