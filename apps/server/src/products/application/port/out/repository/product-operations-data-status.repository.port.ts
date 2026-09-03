import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsPeriodDays,
} from '@kiditem/shared/product-operations';

export const PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT = Symbol(
  'PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT',
);

export type ProductOperationsAbcSourceManifest = Readonly<{
  sourceImportRunId: string;
  generation: string;
  mappingGeneration: string;
  coverageStartDate: string;
  coverageEndDate: string;
  coveredMonths: readonly string[];
  capturedAt: string;
}>;

export type ProductOperationsDataStatusFacts = {
  displayDataAsOf: string | null;
  traffic: ProductOperationsDataSourceStatus;
  actualCutoff: string | null;
  sellpia: ProductOperationsDataSourceStatus;
  advertising: ProductOperationsDataSourceStatus;
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
    mappingValid: boolean;
  }>;
};

export interface ProductOperationsDataStatusRepositoryPort {
  read(
    organizationId: string,
    periodDays: ProductOperationsPeriodDays,
  ): Promise<ProductOperationsDataStatusFacts>;
}
