import type {
  SalesProduct,
  SalesProductCreateInput,
  SalesProductFromCandidatesRequest,
  SalesProductFromCandidatesResult,
  SalesProductUpdateInput,
} from '@kiditem/shared/sales-product';

export interface CandidateSalesProductRegistrationDeps {
  findByCandidate: (candidateId: string) => Promise<SalesProduct | null>;
  update: (salesProductId: string, body: SalesProductUpdateInput) => Promise<SalesProduct>;
  createFromCandidates: (
    body: SalesProductFromCandidatesRequest,
  ) => Promise<SalesProductFromCandidatesResult>;
}

/**
 * Reuses the Channels-owned selling product linked to a candidate, or creates it from
 * candidate-owned source data. Building is lazy so an existing target is never
 * overwritten and does not require a second read of candidate content.
 */
export async function ensureCandidateSalesProduct(
  candidateId: string,
  buildInput: (candidateId: string) => Promise<SalesProductCreateInput>,
  deps: CandidateSalesProductRegistrationDeps,
): Promise<SalesProduct> {
  const existing = await deps.findByCandidate(candidateId);
  if (existing) return requireUsableCandidateSalesProduct(candidateId, existing, deps);

  const product = await buildInput(candidateId);
  const gap = candidateSalesProductGap(product);
  if (gap) throw new Error(gap);

  const result = await deps.createFromCandidates({ items: [{ candidateId, product }] });
  const created = result.products.find((item) => item.candidateId === candidateId);
  if (!created) throw new Error('수집상품을 판매상품으로 준비하지 못했습니다.');

  const linked = await deps.findByCandidate(candidateId);
  if (!linked || linked.id !== created.salesProductId) {
    throw new Error('수집상품에 연결된 판매상품을 확인하지 못했습니다.');
  }
  return requireUsableCandidateSalesProduct(candidateId, linked, deps);
}

/** 새 판매상품으로 만들 수 없는 이유. 판매가를 데이터에서 추측하지 않는다. */
export function candidateSalesProductGap(
  input: Pick<SalesProductCreateInput, 'name' | 'options'>,
): string | null {
  if (!input.name.trim()) return '상품명이 비어 있습니다.';
  if (input.options.length === 0 || input.options.some((option) => option.salePrice <= 0)) {
    return '판매가가 비어 있습니다(0원). 수집상품 상세에서 판매가를 넣어 주세요.';
  }
  return null;
}

async function requireUsableCandidateSalesProduct(
  candidateId: string,
  product: SalesProduct,
  deps: CandidateSalesProductRegistrationDeps,
): Promise<SalesProduct> {
  if (product.sourceCandidateId !== candidateId) {
    throw new Error('수집상품에 연결된 판매상품을 확인하지 못했습니다.');
  }

  const options = product.options.filter((option) => option.supplyStatus !== 'unused');
  if (options.length === 0 || options.some((option) => option.salePrice <= 0)) {
    throw new Error('판매상품의 판매가와 사용할 옵션을 확인해주세요.');
  }

  if (product.status !== 'archived') return product;
  return deps.update(product.id, { status: 'active', expectedVersion: product.version });
}
