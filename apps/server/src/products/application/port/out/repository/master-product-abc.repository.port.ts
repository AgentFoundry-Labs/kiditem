import type {
  ProductAbcFormulaPayload,
  ProductAbcGrade,
} from '@kiditem/shared/product-abc';
import type {
  SourceGenerationView,
} from '../../../../../finance/application/port/in/master-product-profitability-read.port';

export const MASTER_PRODUCT_ABC_REPOSITORY_PORT = Symbol(
  'MASTER_PRODUCT_ABC_REPOSITORY_PORT',
);

export type MasterProductAbcFormulaStateRecord = Readonly<{
  organizationId: string;
  activeFormulaVersionId: string | null;
  formulaRevision: number;
  publicationRevision: number;
  officialCutoffDate: string | null;
  publishedSellpiaSourceImportRunId: string | null;
  publishedAdvertisingSourceImportRunId: string | null;
  publishedMappingGeneration: string | null;
  mappingGeneration: string;
  formula: ProductAbcFormulaPayload | null;
}>;

export type MasterProductAbcCandidateRecord = Readonly<{
  masterProductId: string;
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
  sellpiaSourceImportRunId: string;
  advertisingSourceImportRunId: string;
  sellpiaGeneration: string;
  advertisingGeneration: string;
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
    advertising: MasterProductAbcSourceFence;
  }>;
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
  listCurrentAbcTargetIds(organizationId: string): Promise<readonly string[]>;
  publish(input: ProductAbcPublicationInput): Promise<MasterProductAbcPublicationResult>;
}
