import type {
  ProductAbcEvaluation,
  ProductAbcFormulaSummary,
  ProductAbcGrade,
} from '@kiditem/shared/product-abc';
import type { ActiveOperationAttemptTransaction } from '../../../../../operations/application/port/active-browser-attempt-transaction';

export const MASTER_PRODUCT_ABC_REPOSITORY_PORT = Symbol(
  'MASTER_PRODUCT_ABC_REPOSITORY_PORT',
);

export type MasterProductAbcFormulaStateRecord = Readonly<{
  revision: number;
  formulaVersionId: string | null;
  formula: ProductAbcFormulaSummary | null;
}>;

export type EnsureInitialMasterProductAbcFormulaInput = Readonly<{
  organizationId: string;
  expectedRevision: number;
  formula: ProductAbcFormulaSummary;
}>;

export type PublishMasterProductAbcEvaluationsInput = Readonly<{
  organizationId: string;
  expectedFormulaStateRevision: number;
  formulaVersionId: string | null;
  evaluations: ReadonlyMap<string, ProductAbcEvaluation>;
  reason: string;
}>;

export interface MasterProductAbcRepositoryPort {
  listSellingMasterProductIds(organizationId: string): Promise<readonly string[]>;
  reconcileInventoryActivity(organizationId: string): Promise<{
    deactivatedMasterProductIds: readonly string[];
    reactivatedMasterProductIds: readonly string[];
  }>;
  getFormulaState(organizationId: string): Promise<MasterProductAbcFormulaStateRecord>;
  ensureInitialFormula(
    input: EnsureInitialMasterProductAbcFormulaInput,
  ): Promise<{ state: MasterProductAbcFormulaStateRecord; created: boolean; stale: boolean }>;
  ensureInitialFormulaInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: EnsureInitialMasterProductAbcFormulaInput,
  ): Promise<{ state: MasterProductAbcFormulaStateRecord; created: boolean; stale: boolean }>;
  findCurrentEvaluations(input: {
    organizationId: string;
    masterProductIds: readonly string[];
  }): Promise<ReadonlyMap<string, ProductAbcEvaluation>>;
  publishEvaluations(
    input: PublishMasterProductAbcEvaluationsInput,
  ): Promise<{ changedProductCount: number; stale: boolean }>;
  publishEvaluationsInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: PublishMasterProductAbcEvaluationsInput,
  ): Promise<{ changedProductCount: number; stale: boolean }>;
}

export type MasterProductAbcPublishedGrade = Readonly<{
  masterProductId: string;
  abcGrade: ProductAbcGrade | null;
  evaluation: ProductAbcEvaluation;
}>;
