import type {
  ProductAbcEvaluation,
  ProductAbcFormulaSummary,
  ProductAbcGrade,
} from '@kiditem/shared/product-abc';

export const MASTER_PRODUCT_ABC_REPOSITORY_PORT = Symbol(
  'MASTER_PRODUCT_ABC_REPOSITORY_PORT',
);

export type MasterProductAbcFormulaStateRecord = Readonly<{
  revision: number;
  formulaVersionId: string | null;
  formula: ProductAbcFormulaSummary | null;
}>;

export interface MasterProductAbcRepositoryPort {
  listSellingMasterProductIds(organizationId: string): Promise<readonly string[]>;
  getFormulaState(organizationId: string): Promise<MasterProductAbcFormulaStateRecord>;
  ensureInitialFormula(input: {
    organizationId: string;
    expectedRevision: number;
    formula: ProductAbcFormulaSummary;
  }): Promise<{ state: MasterProductAbcFormulaStateRecord; created: boolean; stale: boolean }>;
  findCurrentEvaluations(input: {
    organizationId: string;
    masterProductIds: readonly string[];
  }): Promise<ReadonlyMap<string, ProductAbcEvaluation>>;
  publishEvaluations(input: {
    organizationId: string;
    expectedFormulaStateRevision: number;
    formulaVersionId: string | null;
    evaluations: ReadonlyMap<string, ProductAbcEvaluation>;
    reason: string;
  }): Promise<{ changedProductCount: number; stale: boolean }>;
}

export type MasterProductAbcPublishedGrade = Readonly<{
  masterProductId: string;
  abcGrade: ProductAbcGrade | null;
  evaluation: ProductAbcEvaluation;
}>;
