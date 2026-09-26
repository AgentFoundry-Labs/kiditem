import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type {
  ProductMatchingCandidate,
  ProductSourceIdentityQuery,
  ProductSourceReadModel,
} from './product-source-read.port';
import type { ProductAvailabilityCandidate } from './product-availability.port';

export type {
  ProductMatchingCandidate,
  ProductSourceIdentityQuery,
  ProductSourceReadModel,
} from './product-source-read.port';
export type { ProductAvailabilityCandidate } from './product-availability.port';

export type ProductAvailabilityQuery = {
  organizationId: string;
  masterProductIds: string[];
};

export type ProductSaleAgeMapping = Readonly<{
  listingId: string;
  options: readonly Readonly<{
    components: readonly Readonly<{
      quantity: number;
      masterProductId: string | null;
    }>[];
  }>[];
}>;

export type ProductAvailabilityCandidateQuery = {
  organizationId: string;
  query: string;
  limit: number;
  stockStatus: 'in_stock' | 'all';
};

/** Caller-owned transaction. Products never starts or commits it. */
export type ProductTransactionContext<TClient = unknown> = Readonly<{
  client: TClient;
}>;

declare const PRODUCT_LOCK_EVIDENCE: unique symbol;

/** Opaque proof that the caller's transaction holds the Products source lock. */
export type ProductLockEvidence = Readonly<{
  readonly [PRODUCT_LOCK_EVIDENCE]: true;
}>;

export type ProductCollectionFence = Readonly<{
  freshnessFence: string;
  freshnessGeneration: bigint;
  lastVerifiedAt: Date | null;
  lastCompletedOperationId: string | null;
  requestedGeneration: bigint;
  databaseNow: Date;
}>;

export const PRODUCT_TRANSACTIONAL_READ_PORT = Symbol(
  'PRODUCT_TRANSACTIONAL_READ_PORT',
);

export interface ProductTransactionalReadPort {
  lockCollectionFence<TClient>(
    context: ProductTransactionContext<TClient>,
    organizationId: string,
  ): Promise<ProductCollectionFence | null>;

  lock<TClient>(
    context: ProductTransactionContext<TClient>,
    organizationId: string,
  ): Promise<ProductLockEvidence>;

  readAvailability<TClient>(
    context: ProductTransactionContext<TClient>,
    lock: ProductLockEvidence,
    input: ProductAvailabilityQuery,
  ): Promise<InventoryAvailabilityBatch>;

  readAvailabilityCandidates<TClient>(
    context: ProductTransactionContext<TClient>,
    lock: ProductLockEvidence,
    input: ProductAvailabilityCandidateQuery,
  ): Promise<ProductAvailabilityCandidate[]>;

  readActiveMatchingCandidates<TClient>(
    context: ProductTransactionContext<TClient>,
    lock: ProductLockEvidence,
    organizationId: string,
  ): Promise<ProductMatchingCandidate[]>;

  readSourceIdentities<TClient>(
    context: ProductTransactionContext<TClient>,
    input: ProductSourceIdentityQuery,
  ): Promise<ProductSourceReadModel[]>;

  readSaleAgeMappings<TClient>(
    context: ProductTransactionContext<TClient>,
    organizationId: string,
    masterProductIds: string[],
  ): Promise<ProductSaleAgeMapping[]>;
}
