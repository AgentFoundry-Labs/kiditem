import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsPeriodDays,
} from '@kiditem/shared/product-operations';
import type { ProfitabilityEvidenceSnapshot } from '../../../../../finance/application/port/in/master-product-profitability-read.port';
import type { ProductAbcEvaluation } from '@kiditem/shared/product-abc';

export const PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT = Symbol(
  'PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT',
);

export type ProductOperationsAbcSourceManifest = Readonly<{
  sourceImportRunId: string;
  generation: string;
  mappingGeneration: string;
  coverageStartDate: string;
  coverageEndDate: string;
  capturedAt: string;
}>;

export type ProductOperationsDataStatusFacts = {
  displayDataAsOf: string | null;
  traffic: ProductOperationsDataSourceStatus;
  orders: ProductOperationsDataSourceStatus;
  actualCutoff: string | null;
  sellpia: ProductOperationsDataSourceStatus;
  advertising: ProductOperationsDataSourceStatus;
  mappingReady: boolean;
  contributionBasis: ProfitabilityEvidenceSnapshot['contributionBasis'];
  sourceVector: {
    sellpia: ProductOperationsAbcSourceManifest | null;
    advertising: ProductOperationsAbcSourceManifest | null;
  };
  formulaState: {
    formulaRevision: number;
    publicationRevision: number;
    officialCutoff: string | null;
    publishedAt: string | null;
    mappingGeneration: string;
  };
  products: Array<{
    masterProductId: string;
    abcGrade: 'A' | 'B' | 'C' | null;
    evaluation: ProductAbcEvaluation | null;
    mappingValid: boolean;
    saleStartDate: string | null;
  }>;
};

export interface ProductOperationsDataStatusRepositoryPort {
  read(
    organizationId: string,
    periodDays: ProductOperationsPeriodDays,
  ): Promise<ProductOperationsDataStatusFacts>;
}
