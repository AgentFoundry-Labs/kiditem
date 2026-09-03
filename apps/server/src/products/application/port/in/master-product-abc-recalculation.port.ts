import type {
  ProfitabilityEvidenceSnapshot,
} from '../../../../finance/application/port/in/master-product-profitability-read.port';

export const MASTER_PRODUCT_ABC_RECALCULATION_PORT = Symbol(
  'MASTER_PRODUCT_ABC_RECALCULATION_PORT',
);

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
    }
>;

export type MasterProductAbcRecalculationInput = Readonly<{
  organizationId: string;
}>;

export interface MasterProductAbcRecalculationPort {
  recalculate(input: MasterProductAbcRecalculationInput): Promise<ProductAbcRecalculationResult>;
}
