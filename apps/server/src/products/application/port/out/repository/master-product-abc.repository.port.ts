import type {
  MasterProductAbcMetric,
  MasterProductAbcPeriodDays,
  MasterProductAbcPolicyResponse,
  ProductAbcGrade,
} from '@kiditem/shared/product-abc';

export const MASTER_PRODUCT_ABC_REPOSITORY_PORT = Symbol(
  'MASTER_PRODUCT_ABC_REPOSITORY_PORT',
);

export type MasterProductAbcPolicyRecord = MasterProductAbcPolicyResponse;

export interface MasterProductAbcRepositoryPort {
  findPolicy(organizationId: string): Promise<MasterProductAbcPolicyRecord | null>;
  savePolicy(
    organizationId: string,
    policy: Omit<MasterProductAbcPolicyRecord, 'lastCalculatedAt' | 'sourceCapturedAt'>,
  ): Promise<MasterProductAbcPolicyRecord>;
  publishGrades(input: {
    organizationId: string;
    policy: MasterProductAbcPolicyRecord;
    sourceCapturedAt: Date | null;
    grades: ReadonlyMap<string, ProductAbcGrade | null>;
    metricValues: ReadonlyMap<string, number | null>;
  }): Promise<{ changedProductCount: number; policy: MasterProductAbcPolicyRecord }>;
}
