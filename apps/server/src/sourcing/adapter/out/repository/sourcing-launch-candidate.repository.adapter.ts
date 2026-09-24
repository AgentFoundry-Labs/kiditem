import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  CreateSourcingLaunchCandidateCommand,
  CreateSourcingLaunchCandidateResult,
  SourcingLaunchCandidateRecord,
  SourcingLaunchCandidateRepositoryPort,
} from '../../../application/port/out/repository/sourcing-launch-candidate.repository.port';
import {
  readCurrentLaunchCandidates,
  readExactLaunchCandidatesByIds,
} from './launch-candidate.reader';

type LaunchCandidateRow = Prisma.SourcingLaunchCandidateGetPayload<
  Record<string, never>
>;

@Injectable()
export class SourcingLaunchCandidateRepositoryAdapter
  implements SourcingLaunchCandidateRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  createVersion(
    command: CreateSourcingLaunchCandidateCommand,
  ): Promise<CreateSourcingLaunchCandidateResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockLaunchIdentityAndSeries(tx, command);

      const existing = await tx.sourcingLaunchCandidate.findFirst({
        where: {
          organizationId: command.organizationId,
          identityHash: command.identityHash,
        },
      });
      if (existing) {
        return { kind: 'existing', duplicate: true, record: toRecord(existing) };
      }

      const targetChannelAccount = await tx.channelAccount.findFirst({
        where: {
          id: command.targetChannelAccountId,
          organizationId: command.organizationId,
          status: 'active',
          channel: 'coupang',
        },
        select: { id: true },
      });
      if (!targetChannelAccount) {
        return { kind: 'target_channel_account_invalid' };
      }

      if (command.sourceRecordId !== null) {
        const sourceRecord = await tx.sourceRecord.findFirst({
          where: {
            id: command.sourceRecordId,
            organizationId: command.organizationId,
          },
          select: { id: true },
        });
        if (!sourceRecord) return { kind: 'source_record_not_found' };
      }

      const latest = await tx.sourcingLaunchCandidate.findFirst({
        where: {
          organizationId: command.organizationId,
          candidateSeriesKey: command.candidateKey,
        },
        orderBy: { revision: 'desc' },
        select: { id: true, revision: true },
      });
      const row = await tx.sourcingLaunchCandidate.create({
        data: {
          organizationId: command.organizationId,
          sourceRecordId: command.sourceRecordId,
          supplierOfferSkuSnapshotId: command.supplierOfferSkuSnapshotId,
          targetChannelAccountId: command.targetChannelAccountId,
          supersedesLaunchCandidateId: latest?.id ?? null,
          candidateSeriesKey: command.candidateKey,
          revision: (latest?.revision ?? 0) + 1,
          identityHash: command.identityHash,
          name: command.title,
          productConceptVersionKey: command.productConceptVersionKey,
          koreanSellableBundleVersionKey:
            command.koreanSellableBundleVersionKey,
          launchPlanVersionKey: command.launchPlanVersion,
          complianceAssessmentVersionKey:
            command.complianceAssessmentVersion,
          ipClearanceVersionKey: command.ipAssessmentVersion,
          qualitySpecVersionKey: command.qualitySpecVersion,
          intendedAgeMinMonths: command.intendedAgeMinMonths,
          intendedAgeMaxMonths: command.intendedAgeMaxMonths,
          intendedUse: command.intendedUse,
          materialProfileKey: command.materialProfileKey,
          labelingProfileKey: command.labelingProfileKey,
          unitsPerSellableBundle: command.unitsPerSellableBundle,
          initialOrderQuantity: command.initialOrderQuantity,
          targetSalePriceKrw: command.targetSalePriceKrw,
          fulfillmentMode: command.fulfillmentMode,
          economicsStatus: command.economicsStatus,
          complianceStatus: command.complianceStatus,
          qualityStatus: command.qualityStatus,
          ipStatus: command.ipStatus,
          landedCostKrw: command.landedCostKrw,
          profitP10Krw: command.profitP10Krw,
          blockingRiskCodes: command.blockingRiskCodes,
          unknownRiskCodes: command.unknownRiskCodes,
          bundleSnapshot: command.bundleSnapshot as Prisma.InputJsonValue,
          launchPlanSnapshot: command.launchPlanSnapshot as Prisma.InputJsonValue,
          economicsSnapshot: command.economicsSnapshot as Prisma.InputJsonValue,
          complianceSnapshot:
            command.complianceSnapshot as Prisma.InputJsonValue,
          qualitySnapshot: command.qualitySnapshot as Prisma.InputJsonValue,
          ipSnapshot: command.ipSnapshot as Prisma.InputJsonValue,
          validUntil: command.validUntil,
          createdByUserId: command.createdByUserId,
        },
      });

      return { kind: 'created', duplicate: false, record: toRecord(row) };
    });
  }

  async findById(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingLaunchCandidateRecord | null> {
    const [row] = await readExactLaunchCandidatesByIds(this.prisma, {
      organizationId: input.organizationId,
      ids: [input.id],
    });
    return row ? toRecord(row) : null;
  }

  async findByIds(input: {
    organizationId: string;
    ids: string[];
  }): Promise<SourcingLaunchCandidateRecord[]> {
    if (input.ids.length === 0) return [];
    const rows = await readExactLaunchCandidatesByIds(this.prisma, input);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return input.ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toRecord(row)] : [];
    });
  }

  async findBySupplierOfferSnapshotIds(input: {
    organizationId: string;
    supplierOfferSkuSnapshotIds: string[];
  }): Promise<SourcingLaunchCandidateRecord[]> {
    if (input.supplierOfferSkuSnapshotIds.length === 0) return [];
    const rows = await readCurrentLaunchCandidates(this.prisma, {
      organizationId: input.organizationId,
      supplierOfferSkuSnapshotIds: Array.from(new Set(input.supplierOfferSkuSnapshotIds)),
    });
    return rows.map(toRecord);
  }

  async list(input: {
    organizationId: string;
    productConceptVersionKey?: string;
    limit: number;
  }): Promise<SourcingLaunchCandidateRecord[]> {
    const rows = await readCurrentLaunchCandidates(this.prisma, input);
    return rows.map(toRecord);
  }
}

async function lockLaunchIdentityAndSeries(
  tx: Prisma.TransactionClient,
  command: Pick<
    CreateSourcingLaunchCandidateCommand,
    'organizationId' | 'identityHash' | 'candidateKey'
  >,
): Promise<void> {
  const lockKeys = [
    `sourcing-launch-identity:${command.organizationId}:${command.identityHash}`,
    `sourcing-launch-series:${command.organizationId}:${command.candidateKey}`,
  ].sort();
  for (const lockKey of lockKeys) {
    await tx.$queryRaw`
      -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
    `;
  }
}

function toRecord(row: LaunchCandidateRow): SourcingLaunchCandidateRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    candidateKey: row.candidateSeriesKey,
    version: row.revision,
    identityHash: row.identityHash,
    sourceRecordId: row.sourceRecordId,
    supplierOfferSkuSnapshotId: row.supplierOfferSkuSnapshotId,
    targetChannelAccountId: row.targetChannelAccountId,
    productConceptVersionKey: row.productConceptVersionKey,
    title: row.name,
    koreanSellableBundleVersionKey: row.koreanSellableBundleVersionKey,
    unitsPerSellableBundle: row.unitsPerSellableBundle,
    initialOrderQuantity: row.initialOrderQuantity,
    targetSalePriceKrw: row.targetSalePriceKrw,
    fulfillmentMode: row.fulfillmentMode,
    intendedAgeMinMonths: row.intendedAgeMinMonths,
    intendedAgeMaxMonths: row.intendedAgeMaxMonths,
    intendedUse: row.intendedUse,
    materialProfileKey: row.materialProfileKey,
    labelingProfileKey: row.labelingProfileKey,
    launchPlanVersion: row.launchPlanVersionKey,
    complianceAssessmentVersion: row.complianceAssessmentVersionKey,
    qualitySpecVersion: row.qualitySpecVersionKey,
    ipAssessmentVersion: row.ipClearanceVersionKey,
    economicsStatus:
      row.economicsStatus as SourcingLaunchCandidateRecord['economicsStatus'],
    complianceStatus:
      row.complianceStatus as SourcingLaunchCandidateRecord['complianceStatus'],
    qualityStatus: row.qualityStatus as SourcingLaunchCandidateRecord['qualityStatus'],
    ipStatus: row.ipStatus as SourcingLaunchCandidateRecord['ipStatus'],
    landedCostKrw: row.landedCostKrw,
    profitP10Krw: row.profitP10Krw,
    blockingRiskCodes: row.blockingRiskCodes,
    unknownRiskCodes: row.unknownRiskCodes,
    bundleSnapshot: jsonObject(row.bundleSnapshot, 'bundleSnapshot', row.id),
    launchPlanSnapshot: jsonObject(
      row.launchPlanSnapshot,
      'launchPlanSnapshot',
      row.id,
    ),
    economicsSnapshot: jsonObject(
      row.economicsSnapshot,
      'economicsSnapshot',
      row.id,
    ),
    complianceSnapshot: jsonObject(
      row.complianceSnapshot,
      'complianceSnapshot',
      row.id,
    ),
    qualitySnapshot: jsonObject(row.qualitySnapshot, 'qualitySnapshot', row.id),
    ipSnapshot: jsonObject(row.ipSnapshot, 'ipSnapshot', row.id),
    validUntil: row.validUntil,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

function jsonObject(
  value: Prisma.JsonValue,
  field: string,
  id: string,
): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`Launch candidate ${id} has non-object ${field}.`);
}
