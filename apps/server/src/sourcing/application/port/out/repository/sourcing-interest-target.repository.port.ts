export const SOURCING_INTEREST_TARGET_REPOSITORY_PORT = Symbol(
  'SourcingInterestTargetRepositoryPort',
);

export type SourcingInterestTargetType = 'keyword' | 'category' | 'product';

export type SourcingInterestTargetSource =
  | 'keyword_analysis'
  | 'today_recommendation'
  | 'wing_catalog'
  | 'manual';

export interface SourcingInterestTargetRecord {
  id: string;
  organizationId: string;
  targetKey: string;
  targetType: SourcingInterestTargetType;
  label: string;
  sourceKeys: string[];
  keyword: string | null;
  category: string | null;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string | null;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertSourcingInterestTargetCommand {
  organizationId: string;
  targetKey: string;
  targetType: SourcingInterestTargetType;
  label: string;
  source: SourcingInterestTargetSource;
  keyword: string | null;
  category: string | null;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string | null;
}

export interface SourcingInterestTargetRepositoryPort {
  list(organizationId: string): Promise<SourcingInterestTargetRecord[]>;
  upsert(
    command: UpsertSourcingInterestTargetCommand,
  ): Promise<SourcingInterestTargetRecord>;
  delete(input: { organizationId: string; id: string }): Promise<boolean>;
}
