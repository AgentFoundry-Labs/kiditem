import type {
  SalesProduct,
  SalesProductCreateInput,
  SalesProductUpdateInput,
  SalesProductOptionsReplaceInput,
  SalesProductListQuery,
  SalesProductFromCandidatesRequest,
  SalesProductDemoteRequest,
  SalesProductFromCandidatesResult,
  SalesProductListResponse,
  SalesProductMallCategories,
} from '@kiditem/shared/sales-product';

export const SALES_PRODUCT_PORT = Symbol('SALES_PRODUCT_PORT');

/** Channels' shared authoring capability. Editing does not submit to a marketplace. */
export interface SalesProductPort {
  list(organizationId: string, query: SalesProductListQuery): Promise<SalesProductListResponse>;
  findByCandidate(organizationId: string, candidateId: string): Promise<SalesProduct | null>;
  get(organizationId: string, salesProductId: string): Promise<SalesProduct>;
  create(organizationId: string, input: SalesProductCreateInput): Promise<SalesProduct>;
  update(organizationId: string, salesProductId: string, input: SalesProductUpdateInput): Promise<SalesProduct>;
  replaceOptions(organizationId: string, salesProductId: string, input: SalesProductOptionsReplaceInput): Promise<SalesProduct>;
  createFromCandidates(organizationId: string, input: SalesProductFromCandidatesRequest): Promise<SalesProductFromCandidatesResult>;
  demoteToCandidate(organizationId: string, salesProductId: string, input: SalesProductDemoteRequest): Promise<SalesProduct>;
  mallCategories(organizationId: string, mallKey: string): Promise<SalesProductMallCategories>;
}
