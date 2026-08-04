import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CoupangRocketMatchingCsvImportResponseSchema,
  type CompletedSourceArtifactRun,
} from '@kiditem/shared/source-import';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ImportRocketSellpiaMatchingCsvInput } from '../../../application/port/in/rocket-sellpia-matching-csv-import.port';
import type { RocketSellpiaMatchingCsvImportRepositoryPort } from '../../../application/port/out/repository/rocket-sellpia-matching-csv-import.repository.port';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';
import {
  ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
  rocketMatchingCsvRowsToCatalogProducts,
} from './rocket-sellpia-matching-csv.catalog';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

@Injectable()
export class RocketSellpiaMatchingCsvImportRepositoryAdapter
implements RocketSellpiaMatchingCsvImportRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  importMatchingCsv(input: ImportRocketSellpiaMatchingCsvInput) {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `rocket-sellpia-matching-csv:${input.organizationId}:${input.channelAccountId}`;
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
        FROM channel_accounts
        WHERE organization_id = ${input.organizationId}::uuid
          AND id = ${input.channelAccountId}::uuid
      `;
      const account = await tx.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          organizationId: input.organizationId,
          channel: 'rocket',
          status: 'active',
        },
        select: { id: true },
      });
      if (!account) throw new NotFoundException('Active Rocket channel account not found');

      const duplicate = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          fileHash: input.fileHash,
          status: 'completed',
        },
      });
      if (duplicate) {
        await upsertChannelCatalogIdentities(tx, {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          lastImportRunId: duplicate.id,
          rawSource: ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
          products: rocketMatchingCsvRowsToCatalogProducts(input.rows),
        });
        return CoupangRocketMatchingCsvImportResponseSchema.parse({
          run: toCompletedRun(duplicate),
          duplicate: true,
          changes: zeroChanges(),
        });
      }

      const sourceRun = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          fileName: input.fileName,
          fileHash: input.fileHash,
          status: 'running',
          rowCount: input.rows.length,
          createdBy: input.userId,
        },
      });
      const identities = await upsertChannelCatalogIdentities(tx, {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        lastImportRunId: sourceRun.id,
        rawSource: ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
        products: rocketMatchingCsvRowsToCatalogProducts(input.rows),
      });
      const completed = await tx.sourceImportRun.update({
        where: { id: sourceRun.id },
        data: {
          status: 'completed',
          importedAt: new Date(),
          publicationSequence: await nextPublicationSequence(tx, input.organizationId),
        },
      });
      return CoupangRocketMatchingCsvImportResponseSchema.parse({
        run: toCompletedRun(completed),
        duplicate: false,
        changes: identities.changes,
      });
    }, TRANSACTION_OPTIONS);
  }
}

async function nextPublicationSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<bigint> {
  const lockKey = `channel-catalog-sequence:${organizationId}:${ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE}`;
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
  const rows = await tx.$queryRaw<Array<{ publicationSequence: bigint }>>`
    SELECT COALESCE(MAX(publication_sequence), 0::bigint) + 1 AS "publicationSequence"
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = ${ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE}
  `;
  if (rows[0]?.publicationSequence === undefined) {
    throw new ConflictException('Could not allocate Rocket matching CSV publication sequence');
  }
  return rows[0].publicationSequence;
}

function toCompletedRun(run: {
  id: string;
  sourceType: string;
  channelAccountId: string | null;
  fileName: string | null;
  fileHash: string | null;
  status: string;
  rowCount: number;
  importedAt: Date | null;
  lastVerifiedAt: Date | null;
  verificationCount: number;
  lastTrigger: string | null;
  freshnessGeneration: bigint | null;
  manualFreshExportConfirmedAt: Date | null;
  manualFreshExportConfirmedBy: string | null;
  qualityReport: Prisma.JsonValue | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CompletedSourceArtifactRun {
  if (!run.fileName || !run.fileHash || !run.importedAt || run.status !== 'completed') {
    throw new ConflictException('Rocket matching CSV run is missing completed provenance');
  }
  return {
    id: run.id,
    sourceType: 'coupang_rocket_matching_csv',
    channelAccountId: run.channelAccountId,
    fileName: run.fileName,
    fileHash: run.fileHash,
    status: 'completed',
    rowCount: run.rowCount,
    importedAt: run.importedAt.toISOString(),
    lastVerifiedAt: run.lastVerifiedAt?.toISOString() ?? null,
    verificationCount: run.verificationCount,
    lastTrigger: null,
    freshnessGeneration: run.freshnessGeneration?.toString() ?? null,
    manualFreshExportConfirmedAt:
      run.manualFreshExportConfirmedAt?.toISOString() ?? null,
    manualFreshExportConfirmedBy: run.manualFreshExportConfirmedBy,
    qualityReport: null,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function zeroChanges() {
  return {
    createdProductCount: 0,
    updatedProductCount: 0,
    createdSkuCount: 0,
    updatedSkuCount: 0,
  };
}
