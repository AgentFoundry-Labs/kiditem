import type { ProductTransactionContext } from './product-transactional-read.port';

export const PRODUCT_MAPPING_GENERATION_PORT = Symbol(
  'PRODUCT_MAPPING_GENERATION_PORT',
);

/**
 * Advances the Products-owned mapping-evidence generation inside the
 * caller's own transaction. An absent state is initialized without
 * selecting a formula or publishing any ABC output. Callers invoke this
 * only after a canonical mapping mutation has succeeded in that same
 * transaction (KID-310: replaces the direct `masterProductAbcFormulaState`
 * write other owners used to perform through the retired common helper). The
 * mapping lock itself is `products/transaction/product-mapping-lock.ts` (KID-111).
 */
export interface ProductMappingGenerationPort {
  advanceMappingGeneration<TClient>(
    context: ProductTransactionContext<TClient>,
    organizationId: string,
  ): Promise<bigint>;
}
