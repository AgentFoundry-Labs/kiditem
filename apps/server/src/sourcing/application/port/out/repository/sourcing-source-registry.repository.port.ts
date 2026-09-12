import type {
  SourceEntitlementDecisionImpact,
  SourceEntitlementLifecycle,
} from '../../../../domain/source-entitlement-policy';

export const SOURCING_SOURCE_REGISTRY_REPOSITORY_PORT = Symbol(
  'SourcingSourceRegistryRepositoryPort',
);

export const DEFAULT_SOURCING_SOURCE_SCOPE_KEY = 'default';

export interface SourcingSourceEntitlementRecord {
  id: string;
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  version: number;
  versionHash: string;
  lifecycle: SourceEntitlementLifecycle;
  decisionImpact: SourceEntitlementDecisionImpact;
  ownerLabel: string;
  legalBasis: string;
  allowedMethod: string;
  credentialRef: string | null;
  permittedFields: string[];
  prohibitedUses: string[];
  rateLimitValue: number | null;
  rateLimitWindowSeconds: number | null;
  geographyCoverage: string[];
  coverageDefinition: string | null;
  accountCoverage: string | null;
  searchCoverage: string | null;
  categoryCoverage: string | null;
  denominatorDefinition: string | null;
  historyBackfill: string | null;
  expectedDelayMinutes: number | null;
  maxStalenessMinutes: number | null;
  minimumCoverageBps: number | null;
  revisionPolicy: string | null;
  retentionDays: number | null;
  permissionStartsAt: Date | null;
  permissionExpiresAt: Date | null;
  killSwitch: boolean;
  reviewNote: string | null;
  reviewedByUserId: string;
  reviewedAt: Date;
  retiredAt: Date | null;
  createdAt: Date;
}

export interface CreateSourcingSourceEntitlementVersionCommand {
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  versionHash: string;
  lifecycle: SourceEntitlementLifecycle;
  decisionImpact: SourceEntitlementDecisionImpact;
  ownerLabel: string;
  legalBasis: string;
  allowedMethod: string;
  credentialRef: string | null;
  permittedFields: string[];
  prohibitedUses: string[];
  rateLimitValue: number | null;
  rateLimitWindowSeconds: number | null;
  geographyCoverage: string[];
  coverageDefinition: string | null;
  accountCoverage: string | null;
  searchCoverage: string | null;
  categoryCoverage: string | null;
  denominatorDefinition: string | null;
  historyBackfill: string | null;
  expectedDelayMinutes: number | null;
  maxStalenessMinutes: number | null;
  minimumCoverageBps: number | null;
  revisionPolicy: string | null;
  retentionDays: number | null;
  permissionStartsAt: Date | null;
  permissionExpiresAt: Date | null;
  killSwitch: boolean;
  reviewNote: string | null;
  reviewedByUserId: string;
  reviewedAt: Date;
}

export type CreateSourcingSourceEntitlementVersionResult =
  | {
      kind: 'created';
      duplicate: false;
      record: SourcingSourceEntitlementRecord;
    }
  | {
      kind: 'existing';
      duplicate: true;
      record: SourcingSourceEntitlementRecord;
    };

export interface SourcingSourceRegistryRepositoryPort {
  createVersion(
    command: CreateSourcingSourceEntitlementVersionCommand,
  ): Promise<CreateSourcingSourceEntitlementVersionResult>;

  findCurrent(input: {
    organizationId: string;
    sourceKey: string;
    scopeKey: string;
  }): Promise<SourcingSourceEntitlementRecord | null>;

  findCurrentBySourceKeys(input: {
    organizationId: string;
    sourceKeys: string[];
    scopeKey: string;
  }): Promise<SourcingSourceEntitlementRecord[]>;

  list(input: {
    organizationId: string;
    sourceKey?: string;
    scopeKey: string;
    includeHistory: boolean;
  }): Promise<SourcingSourceEntitlementRecord[]>;
}
