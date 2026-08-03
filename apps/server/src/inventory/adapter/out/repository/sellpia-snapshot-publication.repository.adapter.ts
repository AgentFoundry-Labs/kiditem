import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, type SellpiaInventoryState, type SourceImportRun } from '@prisma/client';
import {
  VerifiedSellpiaSourceImportRunSchema,
  type SellpiaInventoryImportResponse,
} from '@kiditem/shared/source-import';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SellpiaPublicationExecution,
} from '../../../application/port/out/repository/sellpia-import-run.repository.port';
import type {
  SellpiaSnapshotPublicationRepositoryPort,
  SellpiaSnapshotPublicationResult,
} from '../../../application/port/out/repository/sellpia-snapshot-publication.repository.port';
import type { ParsedSellpiaInventoryRow } from '../../../application/service/sellpia-inventory-workbook.parser';
import { evaluateSellpiaInventoryQuality } from '../../../domain/policy/sellpia-inventory-quality.policy';
import { lockSellpiaInventoryTransaction } from './sellpia-inventory-transaction-lock';

const SOURCE_TYPE = 'sellpia_inventory';
const SOURCE_ORIGIN = 'https://kiditem.sellpia.com';
const SOURCE_ACCOUNT_KEY = 'kiditem';
const SAME_HASH_CONFIRMATION_DELAY_MS = 3 * 60_000;
const UPSERT_BATCH_SIZE = 500;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

type PublishInput = Parameters<
  SellpiaSnapshotPublicationRepositoryPort['publishSnapshot']
>[0];
type VerifyInput = Parameters<
  SellpiaSnapshotPublicationRepositoryPort['verifySameHash']
>[0];
type PublicationResult =
  | { kind: 'completed'; response: SellpiaSnapshotPublicationResult }
  | { kind: 'blocked'; message: string };

@Injectable()
export class SellpiaSnapshotPublicationRepositoryAdapter
implements SellpiaSnapshotPublicationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async publishSnapshot(input: PublishInput): Promise<SellpiaSnapshotPublicationResult> {
    if (input.rows.length === 0) {
      throw new BadRequestException('Sellpia inventory snapshot has no valid rows');
    }
    const result = await this.prisma.$transaction(async (tx): Promise<PublicationResult> => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const [state, run] = await Promise.all([
        lockedState(tx, input.organizationId),
        lockedRun(tx, input.organizationId, input.runId),
      ]);
      const generation = assertPublicationFence(state, input);
      assertRunningRun(run, input);

      const [previousActiveRows, previousRun] = await Promise.all([
        tx.sellpiaInventorySku.findMany({
          where: { organizationId: input.organizationId, isActive: true },
          select: { code: true },
        }),
        state.lastCompletedImportRunId
          ? tx.sourceImportRun.findFirst({
              where: {
                id: state.lastCompletedImportRunId,
                organizationId: input.organizationId,
                sourceType: SOURCE_TYPE,
                channelAccountId: null,
                status: 'completed',
              },
              select: { rowCount: true },
            })
          : null,
      ]);
      const quality = evaluateSellpiaInventoryQuality({
        fileHash: input.fileHash,
        previousRowCount: previousRun?.rowCount ?? previousActiveRows.length,
        previousActiveProductCodes: previousActiveRows.map(({ code }) => code),
        incomingProductCodes: input.rows.map(({ sellpiaProductCode }) => sellpiaProductCode),
        facts: input.qualityFacts,
        confirmedReferencedProductCodes: input.confirmedReferencedProductCodes,
      });
      if (quality.blocked) {
        const message = 'Sellpia inventory snapshot failed quality thresholds';
        await recordPublicationFailure(tx, state, input, generation, {
          qualityReport: quality.report as Prisma.InputJsonValue,
          errorCode: 'sellpia_invalid_workbook',
          errorMessage: message,
          rowCount: input.rows.length,
        });
        return { kind: 'blocked', message };
      }

      const changes = await replaceInventorySkus(tx, input);
      const now = new Date();
      const publicationSequence = await nextPublicationSequence(
        tx,
        input.organizationId,
      );
      const completed = await tx.sourceImportRun.updateMany({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          status: 'running',
          attemptToken: input.attemptToken,
        },
        data: {
          status: 'completed',
          rowCount: input.rows.length,
          importedAt: now,
          lastVerifiedAt: now,
          verificationCount: 1,
          lastTrigger: input.execution.trigger,
          freshnessGeneration: generation,
          qualityReport: quality.report as Prisma.InputJsonValue,
          errorCode: null,
          errorMessage: null,
          publicationSequence,
        },
      });
      if (completed.count !== 1) {
        throw new ConflictException('Sellpia inventory publication lost its run fence');
      }
      await completeGeneration(tx, state, input, generation, now, input.runId);
      const completedRun = await tx.sourceImportRun.findFirstOrThrow({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
        },
      });
      return {
        kind: 'completed',
        response: importResponse(completedRun, false, 'published', changes),
      };
    }, TRANSACTION_OPTIONS);
    if (result.kind === 'blocked') throw new BadRequestException(result.message);
    return result.response;
  }

  async verifySameHash(input: VerifyInput): Promise<SellpiaSnapshotPublicationResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const [state, run] = await Promise.all([
        lockedState(tx, input.organizationId),
        lockedRun(tx, input.organizationId, input.runId),
      ]);
      const generation = assertPublicationFence(state, input);
      if (
        run.status !== 'completed'
        || run.sourceType !== SOURCE_TYPE
        || run.fileHash !== input.fileHash
        || run.channelAccountId !== null
        || state.lastCompletedImportRunId !== run.id
      ) {
        throw new ConflictException(
          'Completed Sellpia import run is not the current snapshot basis',
        );
      }

      const now = new Date();
      const currentGenerationReason = state.requestedGeneration === generation
        ? state.refreshReason
        : null;
      // Compatibility for a legacy generation that was claimed before Orders
      // submission was decoupled. New order uploads cannot create this reason.
      if (currentGenerationReason === 'order_transmission_requested') {
        const hasNewerPendingGeneration = state.requestedGeneration > generation;
        const nextGeneration = hasNewerPendingGeneration
          ? state.requestedGeneration
          : generation + 1n;
        const scheduled = await tx.sourceImportRun.updateMany({
          where: {
            id: run.id,
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            channelAccountId: null,
            status: 'completed',
          },
          data: {
            lastTrigger: currentGenerationReason,
            freshnessGeneration: generation,
          },
        });
        if (scheduled.count !== 1) {
          throw new ConflictException('Sellpia same-hash scheduling lost its run fence');
        }
        const confirmationRequest = hasNewerPendingGeneration
          ? {}
          : {
              requestedGeneration: nextGeneration,
              refreshRequestedAt: now,
              refreshReason: 'same_hash_confirmation',
              syncNotBefore: new Date(now.getTime() + SAME_HASH_CONFIRMATION_DELAY_MS),
            };
        await updateStateWithFence(tx, state, input, generation, {
          ...confirmationRequest,
          activeSyncToken: null,
          activeSyncOwnerUserId: null,
          activeSyncStartedAt: null,
          activeSyncLeaseExpiresAt: null,
          activeGeneration: null,
          freshnessFence: randomUUID(),
        });
        const scheduledRun = await tx.sourceImportRun.findFirstOrThrow({
          where: {
            id: run.id,
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            channelAccountId: null,
            status: 'completed',
          },
        });
        return importResponse(
          scheduledRun,
          true,
          'same_hash_confirmation_scheduled',
          zeroChanges(),
        );
      }

      const verifiedUpdate = await tx.sourceImportRun.updateMany({
        where: {
          id: run.id,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          status: 'completed',
        },
        data: {
          lastVerifiedAt: now,
          verificationCount: { increment: 1 },
          lastTrigger: currentGenerationReason ?? run.lastTrigger,
          freshnessGeneration: generation,
          manualFreshExportConfirmedAt:
            input.execution.kind === 'manual' ? now : run.manualFreshExportConfirmedAt,
          manualFreshExportConfirmedBy:
            input.execution.kind === 'manual' ? input.userId : run.manualFreshExportConfirmedBy,
          errorCode: null,
          errorMessage: null,
        },
      });
      if (verifiedUpdate.count !== 1) {
        throw new ConflictException('Sellpia same-hash verification lost its run fence');
      }
      await completeGeneration(tx, state, input, generation, now, run.id);
      const verified = await tx.sourceImportRun.findFirstOrThrow({
        where: {
          id: run.id,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          status: 'completed',
        },
      });
      return importResponse(
        verified,
        true,
        'same_hash_verified',
        zeroChanges(),
      );
    }, TRANSACTION_OPTIONS);
  }
}

async function replaceInventorySkus(
  tx: Prisma.TransactionClient,
  input: PublishInput,
): Promise<SellpiaSnapshotPublicationResult['changes']> {
  const existing = await tx.sellpiaInventorySku.findMany({
    where: {
      organizationId: input.organizationId,
      code: { in: input.rows.map((row) => row.sellpiaProductCode) },
    },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map(({ code }) => code));
  const createdSkuCount = input.rows.filter(
    (row) => !existingCodes.has(row.sellpiaProductCode),
  ).length;
  const updatedSkuCount = input.rows.length - createdSkuCount;

  for (let offset = 0; offset < input.rows.length; offset += UPSERT_BATCH_SIZE) {
    const payload = JSON.stringify(
      input.rows.slice(offset, offset + UPSERT_BATCH_SIZE).map(toUpsertPayload),
    );
    await tx.$executeRaw`
      INSERT INTO sellpia_inventory_skus (
        id, organization_id, code, name, option_name, barcode,
        current_stock, purchase_price, sale_price, is_active, raw_json,
        last_import_run_id, created_at, updated_at
      )
      SELECT
        (record->>'sellpiaInventorySkuId')::uuid,
        ${input.organizationId}::uuid,
        record->>'code',
        record->>'name',
        record->>'optionName',
        record->>'barcode',
        (record->>'currentStock')::integer,
        (record->>'purchasePrice')::integer,
        (record->>'salePrice')::integer,
        TRUE,
        record->'rawJson',
        ${input.runId}::uuid,
        NOW(),
        NOW()
      FROM jsonb_array_elements(${payload}::jsonb) AS record
      ON CONFLICT (organization_id, code)
      DO UPDATE SET
        name = EXCLUDED.name,
        option_name = EXCLUDED.option_name,
        barcode = EXCLUDED.barcode,
        current_stock = EXCLUDED.current_stock,
        purchase_price = EXCLUDED.purchase_price,
        sale_price = EXCLUDED.sale_price,
        is_active = TRUE,
        raw_json = EXCLUDED.raw_json,
        last_import_run_id = EXCLUDED.last_import_run_id,
        updated_at = NOW()
    `;
  }

  const completeCodes = input.rows.map((row) => row.sellpiaProductCode);
  const inactivatedSkuCount = await tx.sellpiaInventorySku.count({
    where: {
      organizationId: input.organizationId,
      code: { notIn: completeCodes },
      isActive: true,
    },
  });
  await tx.sellpiaInventorySku.updateMany({
    where: {
      organizationId: input.organizationId,
      code: { notIn: completeCodes },
    },
    data: {
      currentStock: 0,
      isActive: false,
      lastImportRunId: input.runId,
    },
  });
  await ensureCanonicalInventoryProducts(tx, input.organizationId);
  await rebuildChannelListingProductSummaries(tx, input.organizationId);
  return {
    createdSkuCount,
    updatedSkuCount,
    inactivatedSkuCount,
  };
}

async function ensureCanonicalInventoryProducts(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO master_products (
      id, organization_id, origin_channel_listing_id, code, name,
      tags, image_urls, is_active, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      sku.organization_id,
      NULL,
      'INV-SELLPIA-' || sku.id::text,
      sku.name,
      ARRAY[]::text[],
      ARRAY[]::text[],
      sku.is_active AND sku.current_stock > 0,
      NOW(),
      NOW()
    FROM sellpia_inventory_skus sku
    WHERE sku.organization_id = ${organizationId}::uuid
    ON CONFLICT (organization_id, code)
    DO UPDATE SET
      name = EXCLUDED.name,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
  `;

  await tx.$executeRaw`
    UPDATE sellpia_inventory_skus sku
    SET master_product_id = product.id,
        updated_at = NOW()
    FROM master_products product
    WHERE sku.organization_id = ${organizationId}::uuid
      AND product.organization_id = sku.organization_id
      AND product.code = 'INV-SELLPIA-' || sku.id::text
      AND sku.master_product_id IS DISTINCT FROM product.id
  `;
}

async function rebuildChannelListingProductSummaries(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`
    WITH option_owners AS (
      SELECT
        option.listing_id,
        option.id AS option_id,
        COUNT(component.id) AS component_count,
        COUNT(DISTINCT sku.master_product_id) AS owner_count,
        MIN(sku.master_product_id::text)::uuid AS owner_id
      FROM channel_listing_options option
      LEFT JOIN channel_listing_option_inventory_components component
        ON component.channel_listing_option_id = option.id
        AND component.organization_id = option.organization_id
      LEFT JOIN sellpia_inventory_skus sku
        ON sku.id = component.sellpia_inventory_sku_id
        AND sku.organization_id = component.organization_id
      WHERE option.organization_id = ${organizationId}::uuid
      GROUP BY option.listing_id, option.id
    ), listing_owners AS (
      SELECT
        listing.id AS listing_id,
        CASE
          WHEN COUNT(option_owners.option_id) > 0
            AND BOOL_AND(option_owners.component_count > 0)
            AND BOOL_AND(option_owners.owner_count = 1)
            AND COUNT(DISTINCT option_owners.owner_id) = 1
          THEN MIN(option_owners.owner_id::text)::uuid
          ELSE NULL
        END AS owner_id
      FROM channel_listings listing
      LEFT JOIN option_owners ON option_owners.listing_id = listing.id
      WHERE listing.organization_id = ${organizationId}::uuid
      GROUP BY listing.id
    )
    UPDATE channel_listings listing
    SET master_product_id = listing_owners.owner_id,
        updated_at = NOW()
    FROM listing_owners
    WHERE listing.id = listing_owners.listing_id
      AND listing.organization_id = ${organizationId}::uuid
      AND listing.master_product_id IS DISTINCT FROM listing_owners.owner_id
  `;
}

async function recordPublicationFailure(
  tx: Prisma.TransactionClient,
  state: SellpiaInventoryState,
  input: PublishInput,
  generation: bigint,
  failure: {
    qualityReport: Prisma.InputJsonValue;
    errorCode: string;
    errorMessage: string;
    rowCount: number;
  },
): Promise<void> {
  const now = new Date();
  const failed = await tx.sourceImportRun.updateMany({
    where: {
      id: input.runId,
      organizationId: input.organizationId,
      sourceType: SOURCE_TYPE,
      channelAccountId: null,
      status: 'running',
      attemptToken: input.attemptToken,
    },
    data: {
      status: 'failed',
      rowCount: failure.rowCount,
      qualityReport: failure.qualityReport,
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
    },
  });
  if (failed.count !== 1) {
    throw new ConflictException('Sellpia quality failure lost its run fence');
  }
  await updateStateWithFence(tx, state, input, generation, {
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    activeSyncScope: null,
    activeGeneration: null,
    failedGeneration: generation,
    lastAttemptAt: now,
    lastAttemptStatus: 'failed',
    lastAttemptSyncScope: state.activeSyncScope ?? state.requestedSyncScope,
    lastErrorCode: failure.errorCode,
    lastErrorMessage: failure.errorMessage,
    freshnessFence: randomUUID(),
  });
}

async function completeGeneration(
  tx: Prisma.TransactionClient,
  state: SellpiaInventoryState,
  input: PublishInput | VerifyInput,
  generation: bigint,
  now: Date,
  completedRunId: string,
): Promise<void> {
  await updateStateWithFence(tx, state, input, generation, {
    lastVerifiedAt: now,
    lastCompletedImportRunId: completedRunId,
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    activeSyncScope: null,
    activeGeneration: null,
    verifiedGeneration: generation,
    failedGeneration: null,
    lastAttemptAt: now,
    lastAttemptStatus: 'completed',
    lastAttemptSyncScope: state.activeSyncScope ?? state.requestedSyncScope,
    lastErrorCode: null,
    lastErrorMessage: null,
    freshnessFence: randomUUID(),
  });
}

async function updateStateWithFence(
  tx: Prisma.TransactionClient,
  state: SellpiaInventoryState,
  input: PublishInput | VerifyInput,
  generation: bigint,
  data: Prisma.SellpiaInventoryStateUncheckedUpdateManyInput,
): Promise<void> {
  const updated = await tx.sellpiaInventoryState.updateMany({
    where: {
      organizationId: input.organizationId,
      freshnessFence: state.freshnessFence,
      sourceOrigin: SOURCE_ORIGIN,
      sourceAccountKey: SOURCE_ACCOUNT_KEY,
      activeSyncToken: input.execution.claimToken,
      activeSyncOwnerUserId: input.userId,
      activeGeneration: generation,
    },
    data,
  });
  if (updated.count !== 1) {
    throw new ConflictException('Sellpia inventory publication lost its generation fence');
  }
}

function assertPublicationFence(
  state: SellpiaInventoryState,
  input: PublishInput | VerifyInput,
): bigint {
  if (
    state.sourceOrigin !== SOURCE_ORIGIN
    || state.sourceAccountKey !== SOURCE_ACCOUNT_KEY
  ) {
    throw new ConflictException('Sellpia inventory source binding is not confirmed');
  }
  if (
    input.execution.kind === 'browser'
    && (
      input.execution.sourceOrigin !== SOURCE_ORIGIN
      || input.execution.sourceAccountKey !== SOURCE_ACCOUNT_KEY
    )
  ) {
    throw new ConflictException('Sellpia source binding does not match');
  }
  if (
    input.execution.kind === 'manual'
    && input.execution.manualFreshExportConfirmed !== true
  ) {
    throw new ConflictException('Manual Sellpia import is not attested');
  }
  const generation = parseGeneration(input.execution.activeGeneration);
  if (
    state.activeSyncToken !== input.execution.claimToken
    || state.activeSyncOwnerUserId !== input.userId
    || state.activeGeneration !== generation
  ) {
    throw new ConflictException('Sellpia inventory publication generation is stale');
  }
  return generation;
}

function assertRunningRun(run: SourceImportRun, input: PublishInput): void {
  if (
    run.organizationId !== input.organizationId
    || run.sourceType !== SOURCE_TYPE
    || run.channelAccountId !== null
    || run.fileHash !== input.fileHash
    || run.status !== 'running'
    || run.attemptToken !== input.attemptToken
  ) {
    throw new ConflictException('Sellpia inventory run publication fence is stale');
  }
}

async function lockedState(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<SellpiaInventoryState> {
  await tx.$queryRaw`
    SELECT organization_id
    FROM sellpia_inventory_states
    WHERE organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  const state = await tx.sellpiaInventoryState.findUnique({
    where: { organizationId },
  });
  if (!state) throw new ConflictException('Sellpia inventory state is missing');
  return state;
}

async function lockedRun(
  tx: Prisma.TransactionClient,
  organizationId: string,
  runId: string,
): Promise<SourceImportRun> {
  await tx.$queryRaw`
    SELECT id
    FROM source_import_runs
    WHERE id = ${runId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  const run = await tx.sourceImportRun.findFirst({
    where: { id: runId, organizationId },
  });
  if (!run) throw new ConflictException('Sellpia inventory run is missing');
  return run;
}

async function nextPublicationSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<bigint> {
  const rows = await tx.$queryRaw<Array<{ publicationSequence: bigint }>>`
    SELECT COALESCE(MAX(publication_sequence), 0::bigint) + 1 AS "publicationSequence"
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = ${SOURCE_TYPE}
  `;
  const sequence = rows[0]?.publicationSequence;
  if (sequence === undefined) {
    throw new ConflictException('Could not allocate Sellpia publication sequence');
  }
  return sequence;
}

function toUpsertPayload(row: ParsedSellpiaInventoryRow) {
  return {
    sellpiaInventorySkuId: randomUUID(),
    code: row.sellpiaProductCode,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    currentStock: row.currentStock,
    purchasePrice: row.purchasePrice,
    salePrice: row.salePrice,
    rawJson: row.rawJson,
  };
}

function parseGeneration(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new BadRequestException('Sellpia inventory generation is invalid');
  }
  return BigInt(value);
}

function zeroChanges(): SellpiaSnapshotPublicationResult['changes'] {
  return {
    createdSkuCount: 0,
    updatedSkuCount: 0,
    inactivatedSkuCount: 0,
  };
}

function importResponse(
  run: SourceImportRun,
  duplicate: boolean,
  outcome: SellpiaInventoryImportResponse['outcome'],
  changes: SellpiaSnapshotPublicationResult['changes'],
): SellpiaSnapshotPublicationResult {
  const verifiedRun = VerifiedSellpiaSourceImportRunSchema.parse({
    id: run.id,
    sourceType: 'sellpia_inventory',
    channelAccountId: null,
    fileName: run.fileName,
    fileHash: run.fileHash,
    status: run.status,
    rowCount: run.rowCount,
    importedAt: run.importedAt?.toISOString() ?? null,
    lastVerifiedAt: run.lastVerifiedAt?.toISOString() ?? null,
    verificationCount: run.verificationCount,
    lastTrigger: run.lastTrigger,
    freshnessGeneration: run.freshnessGeneration?.toString() ?? null,
    manualFreshExportConfirmedAt:
      run.manualFreshExportConfirmedAt?.toISOString() ?? null,
    manualFreshExportConfirmedBy: run.manualFreshExportConfirmedBy,
    qualityReport: run.qualityReport,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  });
  return { run: verifiedRun, duplicate, outcome, changes };
}
