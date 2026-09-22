import type { SalesProduct, SalesProductCreateInput } from '@kiditem/shared/sales-product';
import { describe, expect, it, vi } from 'vitest';
import {
  ensureCandidateSalesProduct,
  type CandidateSalesProductRegistrationDeps,
} from './candidate-sales-product-registration';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const SALES_PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

function linkedProduct(overrides: Partial<SalesProduct> = {}): SalesProduct {
  return {
    id: SALES_PRODUCT_ID,
    sourceCandidateId: CANDIDATE_ID,
    name: '소싱 상품',
    status: 'active',
    version: 4,
    options: [{ id: 'option-1', salePrice: 12000, supplyStatus: 'selling' }],
    ...overrides,
  } as SalesProduct;
}

function input(salePrice: number): SalesProductCreateInput {
  return {
    name: '소싱 상품',
    optionAxes: [],
    options: [{ values: [], salePrice, normalPrice: null }],
  } as SalesProductCreateInput;
}

function deps(overrides: Partial<CandidateSalesProductRegistrationDeps> = {}) {
  return {
    findByCandidate: vi.fn(async () => null),
    update: vi.fn(async (_id: string, _body: never) => linkedProduct({ version: 5 })),
    createFromCandidates: vi.fn(async () => ({
      products: [{ candidateId: CANDIDATE_ID, salesProductId: SALES_PRODUCT_ID, code: 'K-1', created: true }],
      created: 1,
      reused: 0,
    })),
    ...overrides,
  } as CandidateSalesProductRegistrationDeps;
}

describe('ensureCandidateSalesProduct', () => {
  it('reuses a linked product without building or overwriting its data', async () => {
    const existing = linkedProduct();
    const used = deps({ findByCandidate: vi.fn(async () => existing) });
    const buildInput = vi.fn(async () => input(15000));

    await expect(ensureCandidateSalesProduct(CANDIDATE_ID, buildInput, used)).resolves.toBe(existing);

    expect(buildInput).not.toHaveBeenCalled();
    expect(used.createFromCandidates).not.toHaveBeenCalled();
    expect(used.update).not.toHaveBeenCalled();
  });

  it('revives an archived product with its current version and retains its stored price', async () => {
    const archived = linkedProduct({ status: 'archived', version: 8 });
    const revived = linkedProduct({ version: 9 });
    const used = deps({
      findByCandidate: vi.fn(async () => archived),
      update: vi.fn(async () => revived),
    });

    await expect(ensureCandidateSalesProduct(CANDIDATE_ID, vi.fn(), used)).resolves.toBe(revived);

    expect(used.update).toHaveBeenCalledWith(SALES_PRODUCT_ID, { status: 'active', expectedVersion: 8 });
    expect(used.createFromCandidates).not.toHaveBeenCalled();
  });

  it('creates only from the candidate input and reads the linked product back', async () => {
    const created = linkedProduct();
    const used = deps({
      findByCandidate: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(created),
    });
    const buildInput = vi.fn(async () => input(17900));

    await expect(ensureCandidateSalesProduct(CANDIDATE_ID, buildInput, used)).resolves.toBe(created);

    expect(used.createFromCandidates).toHaveBeenCalledWith({
      items: [{ candidateId: CANDIDATE_ID, product: input(17900) }],
    });
    expect(used.findByCandidate).toHaveBeenCalledTimes(2);
  });

  it('rejects an absent final sale price without creating or inventing one', async () => {
    const used = deps();
    const buildInput = vi.fn(async () => input(0));

    await expect(ensureCandidateSalesProduct(CANDIDATE_ID, buildInput, used)).rejects.toThrow(
      '판매가가 비어 있습니다(0원). 수집상품 상세에서 판매가를 넣어 주세요.',
    );

    expect(used.createFromCandidates).not.toHaveBeenCalled();
  });

  it('does not reactivate or change an existing product whose usable options lack prices', async () => {
    const existing = linkedProduct({
      status: 'archived',
      options: [{ id: 'option-1', salePrice: 0, supplyStatus: 'selling' }],
    });
    const used = deps({ findByCandidate: vi.fn(async () => existing) });

    await expect(ensureCandidateSalesProduct(CANDIDATE_ID, vi.fn(), used)).rejects.toThrow(
      '판매상품의 판매가와 사용할 옵션을 확인해주세요.',
    );

    expect(used.update).not.toHaveBeenCalled();
    expect(used.createFromCandidates).not.toHaveBeenCalled();
  });
});
