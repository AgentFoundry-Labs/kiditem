import type {
  ProductAbcFormulaPayload,
  ProductAbcReadModel,
} from '@kiditem/shared/product-abc';

export const PRODUCT_ABC_READ_PORT = Symbol('PRODUCT_ABC_READ_PORT');

export type ProductAbcView = Readonly<{
  masterProductId: string;
  abc: ProductAbcReadModel;
  /** The evaluation matches every fact fence of the current publication. */
  contributionEligible: boolean;
  /** First sale day the evidence knows; `null` when it knows none. */
  saleStartDate: string | null;
}>;

/**
 * The as-of the whole snapshot carries. `targetCutoff` is the cutoff Products
 * asked every source for; `actualCutoff` is what the sources actually reached.
 * A result short of the target is retained and displayed as stale, never
 * erased, so both travel together.
 */
export type ProductAbcSnapshot = Readonly<{
  targetCutoff: string;
  actualCutoff: string | null;
  /** Latest capture time across the sources behind that evidence. */
  capturedAt: string | null;
  publication: Readonly<{
    publicationRevision: number;
    officialCutoffDate: string;
    publishedAt: string;
    sellpiaOperationId: string;
    advertisingSourceImportRunId: string | null;
    mappingGeneration: string;
    formulaRevision: number | null;
    formula: ProductAbcFormulaPayload | null;
  }> | null;
  products: readonly ProductAbcView[];
}>;

/**
 * Products' published ABC read.
 *
 * Products owns the evidence cutoff and the display-status derivation; a
 * consumer names the products it cares about and reads the published result
 * rather than deriving one of its own (ADR 0002). A named product with no
 * evidence still comes back, carrying the status its missing evidence earns.
 */
export interface ProductAbcReadPort {
  readAbc(input: {
    organizationId: string;
    masterProductIds: readonly string[];
  }): Promise<ProductAbcSnapshot>;
}
