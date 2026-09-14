import type {
  ProfitabilityEvidenceSnapshot,
} from '../../../../finance/application/port/in/master-product-profitability-read.port';

export const MASTER_PRODUCT_ABC_RECALCULATION_PORT = Symbol(
  'MASTER_PRODUCT_ABC_RECALCULATION_PORT',
);

/**
 * Why no source pair exists although a source reads ready: the newest complete
 * generations end on different days, and `lateSource` ends earlier.
 */
export type ProductAbcSourcePairing = Readonly<{
  lateSource: 'sellpia' | 'advertising';
  sellpiaEndDate: string;
  advertisingEndDate: string;
}>;

export type ProductAbcRecalculationResult = Readonly<
  | {
      outcome: 'PUBLISHED';
      publicationRevision: number;
      formulaRevision: number;
      officialCutoff: string;
      classifiedProductCount: number;
      unclassifiedProductCount: number;
      changedProductCount: number;
    }
  | {
      outcome: 'SOURCE_NOT_READY';
      publicationRevision: number;
      officialCutoff: string | null;
      actualCutoff: string | null;
      sources: ProfitabilityEvidenceSnapshot['sources'];
      /** Present only when no pair exists and at least one source reads ready. */
      pairing?: ProductAbcSourcePairing;
    }
>;

export type MasterProductAbcRecalculationInput = Readonly<{
  organizationId: string;
}>;

export interface MasterProductAbcRecalculationPort {
  recalculate(input: MasterProductAbcRecalculationInput): Promise<ProductAbcRecalculationResult>;
}
