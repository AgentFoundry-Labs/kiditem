import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  evaluateSourceEntitlement,
  validateSourceEntitlementVersion,
  type SourceEntitlementDecisionImpact,
  type SourceEntitlementLifecycle,
  type SourceEntitlementOperation,
} from '../../domain/source-entitlement-policy';
import { hashSourcingIntelligenceJson } from '../../domain/sourcing-intelligence-hash';
import {
  DEFAULT_SOURCING_SOURCE_SCOPE_KEY,
  SOURCING_SOURCE_REGISTRY_REPOSITORY_PORT,
  type CreateSourcingSourceEntitlementVersionCommand,
  type SourcingSourceEntitlementRecord,
  type SourcingSourceRegistryRepositoryPort,
} from '../port/out/repository/sourcing-source-registry.repository.port';

const SOURCE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const SOURCE_SCOPE_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,159}$/;
const POSTGRES_INT_MAX = 2_147_483_647;
const MAX_PERSISTED_MINUTES = Math.floor(POSTGRES_INT_MAX / 60);
const CREDENTIAL_REFERENCE_PATTERN =
  /^(env|secret|vault|github-env|aws-secrets-manager):[A-Za-z0-9_./:-]{1,220}$/;

export interface CreateSourcingSourceEntitlementVersionInput {
  organizationId: string;
  sourceKey: string;
  scopeKey?: string;
  lifecycle: SourceEntitlementLifecycle;
  decisionImpact: SourceEntitlementDecisionImpact;
  ownerLabel: string;
  legalBasis: string;
  allowedMethod: string;
  credentialRef?: string | null;
  permittedFields?: string[];
  prohibitedUses?: string[];
  rateLimitValue?: number | null;
  rateLimitWindowSeconds?: number | null;
  geographyCoverage?: string[];
  coverageDefinition?: string | null;
  accountCoverage?: string | null;
  searchCoverage?: string | null;
  categoryCoverage?: string | null;
  denominatorDefinition?: string | null;
  historyBackfill?: string | null;
  expectedDelayMinutes?: number | null;
  maxStalenessMinutes?: number | null;
  minimumCoverageBps?: number | null;
  revisionPolicy?: string | null;
  retentionDays?: number | null;
  permissionStartsAt?: Date | null;
  permissionExpiresAt?: Date | null;
  killSwitch?: boolean;
  reviewNote?: string | null;
  reviewedByUserId: string;
}

@Injectable()
export class SourcingSourceRegistryService {
  constructor(
    @Inject(SOURCING_SOURCE_REGISTRY_REPOSITORY_PORT)
    private readonly repository: SourcingSourceRegistryRepositoryPort,
  ) {}

  async createVersion(input: CreateSourcingSourceEntitlementVersionInput) {
    const command = normalizeEntitlementCommand(input);
    const validation = validateSourceEntitlementVersion(command);
    const readinessViolations = decisionImpactReadinessViolations(command);
    if (!validation.valid || readinessViolations.length > 0) {
      throw new BadRequestException({
        code: 'invalid_source_entitlement',
        violations: [
          ...(validation.valid ? [] : validation.violations),
          ...readinessViolations,
        ],
      });
    }
    return this.repository.createVersion(command);
  }

  async suspend(input: {
    organizationId: string;
    sourceKey: string;
    scopeKey?: string;
    reviewedByUserId: string;
    reason: string;
  }) {
    const current = await this.repository.findCurrent({
      organizationId: input.organizationId,
      sourceKey: normalizeSourceKey(input.sourceKey),
      scopeKey: normalizeScopeKey(input.scopeKey),
    });
    if (!current) throw new NotFoundException('Source entitlement not found');

    return this.createVersion({
      organizationId: input.organizationId,
      sourceKey: current.sourceKey,
      scopeKey: current.scopeKey,
      lifecycle: 'suspended',
      decisionImpact: 'disabled',
      ownerLabel: current.ownerLabel,
      legalBasis: current.legalBasis,
      allowedMethod: current.allowedMethod,
      credentialRef: current.credentialRef,
      permittedFields: current.permittedFields,
      prohibitedUses: current.prohibitedUses,
      rateLimitValue: current.rateLimitValue,
      rateLimitWindowSeconds: current.rateLimitWindowSeconds,
      geographyCoverage: current.geographyCoverage,
      coverageDefinition: current.coverageDefinition,
      accountCoverage: current.accountCoverage,
      searchCoverage: current.searchCoverage,
      categoryCoverage: current.categoryCoverage,
      denominatorDefinition: current.denominatorDefinition,
      historyBackfill: current.historyBackfill,
      expectedDelayMinutes: current.expectedDelayMinutes,
      maxStalenessMinutes: current.maxStalenessMinutes,
      minimumCoverageBps: current.minimumCoverageBps,
      revisionPolicy: current.revisionPolicy,
      retentionDays: current.retentionDays,
      permissionStartsAt: current.permissionStartsAt,
      permissionExpiresAt: current.permissionExpiresAt,
      killSwitch: true,
      reviewNote: requiredText(input.reason, 'reason'),
      reviewedByUserId: input.reviewedByUserId,
    });
  }

  list(input: {
    organizationId: string;
    sourceKey?: string;
    scopeKey?: string;
    includeHistory?: boolean;
  }) {
    return this.repository.list({
      organizationId: input.organizationId,
      ...(input.sourceKey && { sourceKey: normalizeSourceKey(input.sourceKey) }),
      scopeKey: normalizeScopeKey(input.scopeKey),
      includeHistory: input.includeHistory ?? false,
    });
  }

  async authorize(input: {
    organizationId: string;
    sourceKey: string;
    scopeKey?: string;
    operation: SourceEntitlementOperation;
    at: Date;
  }): Promise<{
    allowed: boolean;
    reasonCode: string | null;
    entitlement: SourcingSourceEntitlementRecord | null;
  }> {
    const entitlement = await this.repository.findCurrent({
      organizationId: input.organizationId,
      sourceKey: normalizeSourceKey(input.sourceKey),
      scopeKey: normalizeScopeKey(input.scopeKey),
    });
    if (!entitlement) {
      return {
        allowed: false,
        reasonCode: 'source_entitlement_missing',
        entitlement: null,
      };
    }
    const result = evaluateSourceEntitlement({
      lifecycle: entitlement.lifecycle,
      decisionImpact: entitlement.decisionImpact,
      operation: input.operation,
      killSwitch: entitlement.killSwitch,
      permissionStartsAt: entitlement.permissionStartsAt,
      permissionExpiresAt: entitlement.permissionExpiresAt,
      at: input.at,
    });
    if (
      result.allowed &&
      (input.operation === 'score' || input.operation === 'train') &&
      decisionImpactReadinessViolations(entitlement).length > 0
    ) {
      return {
        allowed: false,
        reasonCode: 'source_quality_contract_incomplete',
        entitlement,
      };
    }
    return {
      allowed: result.allowed,
      reasonCode: result.reason,
      entitlement,
    };
  }
}

function decisionImpactReadinessViolations(input: {
  decisionImpact: SourceEntitlementDecisionImpact;
  permittedFields: string[];
  coverageDefinition: string | null;
  denominatorDefinition: string | null;
  maxStalenessMinutes: number | null;
  minimumCoverageBps: number | null;
  revisionPolicy: string | null;
  retentionDays: number | null;
}): string[] {
  if (input.decisionImpact !== 'enabled') return [];
  return [
    ...(input.permittedFields.length > 0
      ? []
      : ['decision_impact_requires_permitted_fields']),
    ...(input.coverageDefinition
      ? []
      : ['decision_impact_requires_coverage_definition']),
    ...(input.denominatorDefinition
      ? []
      : ['decision_impact_requires_denominator_definition']),
    ...(input.maxStalenessMinutes !== null
      ? []
      : ['decision_impact_requires_max_staleness']),
    ...(input.minimumCoverageBps !== null
      ? []
      : ['decision_impact_requires_minimum_coverage']),
    ...(input.revisionPolicy
      ? []
      : ['decision_impact_requires_revision_policy']),
    ...(input.retentionDays !== null
      ? []
      : ['decision_impact_requires_retention_policy']),
  ];
}

function normalizeEntitlementCommand(
  input: CreateSourcingSourceEntitlementVersionInput,
): CreateSourcingSourceEntitlementVersionCommand {
  const credentialRef = optionalText(input.credentialRef);
  if (credentialRef && !CREDENTIAL_REFERENCE_PATTERN.test(credentialRef)) {
    throw new BadRequestException(
      'credentialRef must be a secret reference such as env:NAME or vault:path',
    );
  }
  const normalized = {
    organizationId: input.organizationId,
    sourceKey: normalizeSourceKey(input.sourceKey),
    scopeKey: normalizeScopeKey(input.scopeKey),
    lifecycle: input.lifecycle,
    decisionImpact: input.decisionImpact,
    ownerLabel: requiredText(input.ownerLabel, 'ownerLabel'),
    legalBasis: requiredText(input.legalBasis, 'legalBasis'),
    allowedMethod: requiredText(input.allowedMethod, 'allowedMethod'),
    credentialRef,
    permittedFields: normalizedStrings(input.permittedFields ?? []),
    prohibitedUses: normalizedStrings(input.prohibitedUses ?? []),
    rateLimitValue: nullablePositiveInteger(input.rateLimitValue, 'rateLimitValue'),
    rateLimitWindowSeconds: nullablePositiveInteger(
      input.rateLimitWindowSeconds,
      'rateLimitWindowSeconds',
    ),
    geographyCoverage: normalizedStrings(input.geographyCoverage ?? []),
    coverageDefinition: optionalText(input.coverageDefinition),
    accountCoverage: optionalText(input.accountCoverage),
    searchCoverage: optionalText(input.searchCoverage),
    categoryCoverage: optionalText(input.categoryCoverage),
    denominatorDefinition: optionalText(input.denominatorDefinition),
    historyBackfill: optionalText(input.historyBackfill),
    expectedDelayMinutes: nullableNonNegativeInteger(
      input.expectedDelayMinutes,
      'expectedDelayMinutes',
      MAX_PERSISTED_MINUTES,
    ),
    maxStalenessMinutes: nullablePositiveInteger(
      input.maxStalenessMinutes,
      'maxStalenessMinutes',
      MAX_PERSISTED_MINUTES,
    ),
    minimumCoverageBps: nullablePositiveInteger(
      input.minimumCoverageBps,
      'minimumCoverageBps',
      10_000,
    ),
    revisionPolicy: optionalText(input.revisionPolicy),
    retentionDays: nullablePositiveInteger(input.retentionDays, 'retentionDays'),
    permissionStartsAt: input.permissionStartsAt ?? null,
    permissionExpiresAt: input.permissionExpiresAt ?? null,
    killSwitch: input.killSwitch ?? false,
    reviewNote: optionalText(input.reviewNote),
    reviewedByUserId: input.reviewedByUserId,
    reviewedAt: new Date(),
  };
  if (
    normalized.permissionStartsAt &&
    !Number.isFinite(normalized.permissionStartsAt.getTime())
  ) {
    throw new BadRequestException('permissionStartsAt must be a valid date');
  }
  if (
    normalized.permissionExpiresAt &&
    !Number.isFinite(normalized.permissionExpiresAt.getTime())
  ) {
    throw new BadRequestException('permissionExpiresAt must be a valid date');
  }
  if (
    normalized.permissionStartsAt &&
    normalized.permissionExpiresAt &&
    normalized.permissionStartsAt.getTime() >= normalized.permissionExpiresAt.getTime()
  ) {
    throw new BadRequestException(
      'permissionStartsAt must be before permissionExpiresAt',
    );
  }
  return {
    ...normalized,
    versionHash: hashSourcingIntelligenceJson({
      ...normalized,
      permissionStartsAt:
        normalized.permissionStartsAt?.toISOString() ?? null,
      permissionExpiresAt:
        normalized.permissionExpiresAt?.toISOString() ?? null,
      reviewedAt: null,
    }),
  };
}

function normalizeSourceKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SOURCE_KEY_PATTERN.test(normalized)) {
    throw new BadRequestException('Invalid sourceKey');
  }
  return normalized;
}

function normalizeScopeKey(value: string | undefined): string {
  const normalized = (value ?? DEFAULT_SOURCING_SOURCE_SCOPE_KEY)
    .trim()
    .toLowerCase();
  if (!SOURCE_SCOPE_KEY_PATTERN.test(normalized)) {
    throw new BadRequestException('Invalid scopeKey');
  }
  return normalized;
}

function normalizedStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(`${field} is required`);
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function nullablePositiveInteger(
  value: number | null | undefined,
  field: string,
  maximum = POSTGRES_INT_MAX,
): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new BadRequestException(
      `${field} must be a positive integer no greater than ${maximum}`,
    );
  }
  return value;
}

function nullableNonNegativeInteger(
  value: number | null | undefined,
  field: string,
  maximum = POSTGRES_INT_MAX,
): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new BadRequestException(
      `${field} must be a non-negative integer no greater than ${maximum}`,
    );
  }
  return value;
}
