import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  CreateSourcingSourceEntitlementVersionCommand,
  CreateSourcingSourceEntitlementVersionResult,
  SourcingSourceEntitlementRecord,
  SourcingSourceRegistryRepositoryPort,
} from '../../../application/port/out/repository/sourcing-source-registry.repository.port';

type EntitlementRow = Prisma.SourcingSourceEntitlementVersionGetPayload<Record<string, never>>;

@Injectable()
export class SourcingSourceRegistryRepositoryAdapter
  implements SourcingSourceRegistryRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  createVersion(
    command: CreateSourcingSourceEntitlementVersionCommand,
  ): Promise<CreateSourcingSourceEntitlementVersionResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockSourceScope(
        tx,
        command.organizationId,
        command.sourceKey,
        command.scopeKey,
      );

      const current = await tx.sourcingSourceEntitlementVersion.findFirst({
        where: {
          organizationId: command.organizationId,
          sourceKey: command.sourceKey,
          scopeKey: command.scopeKey,
          isCurrent: true,
        },
      });
      if (current?.versionHash === command.versionHash) {
        return { kind: 'existing', duplicate: true, record: toRecord(current) };
      }

      if (current) {
        await tx.sourcingSourceEntitlementVersion.updateMany({
          where: {
            id: current.id,
            organizationId: command.organizationId,
            isCurrent: true,
          },
          data: { isCurrent: false, retiredAt: command.reviewedAt },
        });
      }

      const record = await tx.sourcingSourceEntitlementVersion.create({
        data: {
          organizationId: command.organizationId,
          sourceKey: command.sourceKey,
          scopeKey: command.scopeKey,
          version: (current?.version ?? 0) + 1,
          versionHash: command.versionHash,
          sourceLifecycle: command.lifecycle,
          decisionImpact: command.decisionImpact,
          ownerLabel: command.ownerLabel,
          legalBasis: command.legalBasis,
          allowedMethod: command.allowedMethod,
          credentialRef: command.credentialRef,
          permittedFields: command.permittedFields,
          prohibitedUses: command.prohibitedUses,
          rateLimitValue: command.rateLimitValue,
          rateLimitWindowSeconds: command.rateLimitWindowSeconds,
          geographyCoverage: command.geographyCoverage,
          coverageDefinition: command.coverageDefinition,
          accountCoverage: command.accountCoverage,
          searchCoverage: command.searchCoverage,
          categoryCoverage: command.categoryCoverage,
          denominatorDefinition: command.denominatorDefinition,
          historyBackfillPolicy: command.historyBackfill,
          expectedDelaySeconds: minutesToSeconds(command.expectedDelayMinutes),
          maxStalenessSeconds: minutesToSeconds(command.maxStalenessMinutes),
          minimumCoverageBps: command.minimumCoverageBps,
          revisionPolicy: command.revisionPolicy,
          retentionDays: command.retentionDays,
          permissionStartsAt: command.permissionStartsAt,
          permissionExpiresAt: command.permissionExpiresAt,
          killSwitch: command.killSwitch,
          killReason: command.reviewNote,
          isCurrent: true,
          reviewedByUserId: command.reviewedByUserId,
          reviewedAt: command.reviewedAt,
        },
      });

      return { kind: 'created', duplicate: false, record: toRecord(record) };
    });
  }

  async findCurrent(input: {
    organizationId: string;
    sourceKey: string;
    scopeKey: string;
  }): Promise<SourcingSourceEntitlementRecord | null> {
    const row = await this.prisma.sourcingSourceEntitlementVersion.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceKey: input.sourceKey,
        scopeKey: input.scopeKey,
        isCurrent: true,
      },
    });
    return row ? toRecord(row) : null;
  }

  async findCurrentBySourceKeys(input: {
    organizationId: string;
    sourceKeys: string[];
    scopeKey: string;
  }): Promise<SourcingSourceEntitlementRecord[]> {
    if (input.sourceKeys.length === 0) return [];
    const rows = await this.prisma.sourcingSourceEntitlementVersion.findMany({
      where: {
        organizationId: input.organizationId,
        sourceKey: { in: input.sourceKeys },
        scopeKey: input.scopeKey,
        isCurrent: true,
      },
      orderBy: { sourceKey: 'asc' },
    });
    return rows.map(toRecord);
  }

  async list(input: {
    organizationId: string;
    sourceKey?: string;
    scopeKey: string;
    includeHistory: boolean;
  }): Promise<SourcingSourceEntitlementRecord[]> {
    const rows = await this.prisma.sourcingSourceEntitlementVersion.findMany({
      where: {
        organizationId: input.organizationId,
        scopeKey: input.scopeKey,
        ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
        ...(input.includeHistory ? {} : { isCurrent: true }),
      },
      orderBy: [{ sourceKey: 'asc' }, { version: 'desc' }],
    });
    return rows.map(toRecord);
  }
}

async function lockSourceScope(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceKey: string,
  scopeKey: string,
): Promise<void> {
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`sourcing-source:${organizationId}:${sourceKey}:${scopeKey}`}, 0)
    )::text AS "lock"
  `;
}

function toRecord(row: EntitlementRow): SourcingSourceEntitlementRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceKey: row.sourceKey,
    scopeKey: row.scopeKey,
    version: row.version,
    versionHash: row.versionHash,
    lifecycle: row.sourceLifecycle as SourcingSourceEntitlementRecord['lifecycle'],
    decisionImpact: row.decisionImpact as SourcingSourceEntitlementRecord['decisionImpact'],
    ownerLabel: requiredValue(row.ownerLabel, 'ownerLabel', row.id),
    legalBasis: requiredValue(row.legalBasis, 'legalBasis', row.id),
    allowedMethod: requiredValue(row.allowedMethod, 'allowedMethod', row.id),
    credentialRef: row.credentialRef,
    permittedFields: row.permittedFields,
    prohibitedUses: row.prohibitedUses,
    rateLimitValue: row.rateLimitValue,
    rateLimitWindowSeconds: row.rateLimitWindowSeconds,
    geographyCoverage: row.geographyCoverage,
    coverageDefinition: row.coverageDefinition,
    accountCoverage: row.accountCoverage,
    searchCoverage: row.searchCoverage,
    categoryCoverage: row.categoryCoverage,
    denominatorDefinition: row.denominatorDefinition,
    historyBackfill: row.historyBackfillPolicy,
    expectedDelayMinutes: secondsToMinutes(row.expectedDelaySeconds),
    maxStalenessMinutes: secondsToMinutes(row.maxStalenessSeconds),
    minimumCoverageBps: row.minimumCoverageBps,
    revisionPolicy: row.revisionPolicy,
    retentionDays: row.retentionDays,
    permissionStartsAt: row.permissionStartsAt,
    permissionExpiresAt: row.permissionExpiresAt,
    killSwitch: row.killSwitch,
    reviewNote: row.killReason,
    reviewedByUserId: requiredValue(row.reviewedByUserId, 'reviewedByUserId', row.id),
    reviewedAt: requiredValue(row.reviewedAt, 'reviewedAt', row.id),
    retiredAt: row.retiredAt,
    createdAt: row.createdAt,
  };
}

function minutesToSeconds(value: number | null): number | null {
  return value == null ? null : value * 60;
}

function secondsToMinutes(value: number | null): number | null {
  return value == null ? null : value / 60;
}

function requiredValue<T>(value: T | null, field: string, id: string): T {
  if (value == null) {
    throw new Error(`Source entitlement ${id} is missing required ${field}.`);
  }
  return value;
}
