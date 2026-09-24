import type {
  SourcingInterestTargetSource,
  SourcingInterestTargetType,
} from '../../../../domain/sourcing-interest-target';

export const SOURCING_INTEREST_TARGET_REPOSITORY_PORT = Symbol(
  'SourcingInterestTargetRepositoryPort',
);

export type { SourcingInterestTargetSource, SourcingInterestTargetType };

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
