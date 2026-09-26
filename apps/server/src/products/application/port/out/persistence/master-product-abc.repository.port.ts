import type {
  ProductAbcFormulaPayload,
  ProductAbcGrade,
} from '@kiditem/shared/product-abc';
import type {
  SourceGenerationView,
} from '../../../../../finance/application/port/in/master-product-profitability-read.port';
import type { ProductAbcPublicationRead } from '../../../../adapter/out/persistence/read/product-abc-publication.reader';

export const MASTER_PRODUCT_ABC_REPOSITORY_PORT = Symbol(
  'MASTER_PRODUCT_ABC_REPOSITORY_PORT',
);

export type MasterProductAbcFormulaStateRecord = Readonly<{
  organizationId: string;
  activeFormulaVersionId: string | null;
  formulaRevision: number;
  publicationRevision: number;
  officialCutoffDate: string | null;
  publishedAt: string | null;
  publishedSellpiaOperationId: string | null;
  publishedAdvertisingSourceImportRunId: string | null;
  publishedMappingGeneration: string | null;
  mappingGeneration: string;
  formula: ProductAbcFormulaPayload | null;
}>;

export type MasterProductAbcCandidateRecord = Readonly<{
  masterProductId: string;
  saleStartDate: string;
  abcGrade: ProductAbcGrade;
  validObservationDays: number;
  gradeBasisCutoffDate: string;
  weightedRevenue: number;
  weightedOrderTimeSupplyCost: number;
  weightedAdvertisingSpend: number;
  weightedOperatingProfit: number;
  operatingProfitVelocity30: number;
  operatingMargin: number | null;
  lossPersistence: number;
  profitScore: number;
  marginScore: number | null;
  consistencyScore: number;
  economicScore: number;
  sellpiaOperationId: string;
  /** Null only under a formula that excludes advertising. */
  advertisingSourceImportRunId: string | null;
  sellpiaGeneration: string;
  advertisingGeneration: string | null;
  mappingGeneration: string;
}>;

export type MasterProductAbcSourceFence = Readonly<{
  selectedComplete: SourceGenerationView;
}>;

export type ProductAbcPublicationInput = Readonly<{
  organizationId: string;
  expectedFormulaRevision: number;
  expectedPublicationRevision: number;
  formulaVersionId: string;
  targetCutoff: string;
  actualCutoff: string;
  mappingGeneration: string;
  sourceFences: Readonly<{
    sellpia: MasterProductAbcSourceFence;
    /** Null under a formula that excludes advertising. */
    advertising: MasterProductAbcSourceFence | null;
  }>;
  saleAgeInputs: readonly Readonly<{
    masterProductId: string;
    mappingValid: boolean;
    saleStartDate: string | null;
  }>[];
  targetProductIds: readonly string[];
  candidates: readonly MasterProductAbcCandidateRecord[];
  calculatedAt: Date;
}>;

export type MasterProductAbcPublicationResult =
  | Readonly<{
      outcome: 'PUBLISHED';
      publicationRevision: number;
      changedProductCount: number;
    }>
  | Readonly<{ outcome: 'INPUT_CHANGED' }>;

export interface ProductAbcRepositoryPort {
  getFormulaState(organizationId: string): Promise<MasterProductAbcFormulaStateRecord>;
  readPublication(
    organizationId: string,
    masterProductIds: readonly string[],
  ): Promise<ProductAbcPublicationRead>;
  listCurrentAbcTargetIds(organizationId: string): Promise<readonly string[]>;
  publish(input: ProductAbcPublicationInput): Promise<MasterProductAbcPublicationResult>;
}
