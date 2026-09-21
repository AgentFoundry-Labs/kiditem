import { allocateKidItemCode } from '../../../../common/kid-item-code';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type SellpiaInventoryState, type SourceImportRun } from '@prisma/client';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ProductSourceConflictError } from '../../../application/exception/product-source.error';
import { applySourceFacts, type MasterProduct as MasterProductDomain } from '../../../domain/master-product';
import { evaluateSellpiaInventoryQuality } from '../../../domain/policy/product-source-quality.policy';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import { lockProductSource } from './transaction/product-source-lock';
import { PRODUCT_SOURCE_ALERT_DEDUPE_KEY } from '../sellpia/product-source-failure-alert';
import type {
  ProductSourcePublicationRepositoryPort,
  SellpiaSnapshotPublicationChanges,
  SellpiaSnapshotPublicationInput,
} from '../../../application/port/out/persistence/product-source-publication.repository.port';

const SOURCE_TYPE = 'sellpia_inventory';
const SOURCE_ORIGIN = 'https://kiditem.sellpia.com';
const SOURCE_ACCOUNT_KEY = 'kiditem';
const UPSERT_BATCH_SIZE = 500;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

type MappingIdentityBasis = {
  id: string;
  code: string;
  barcode: string | null;
  sourceProductCode: string;
  sourceOptionCode: string;
};

@Injectable()
export class ProductSourcePublicationRepositoryAdapter
implements ProductSourcePublicationRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async publishSnapshot(
    input: SellpiaSnapshotPublicationInput,
  ): Promise<SellpiaSnapshotPublicationChanges> {
    return this.prisma.$transaction(async (tx) => {
      await lockProductMapping(tx, input.organizationId);
      await lockProductSource(tx, input.organizationId);
      const [state, run] = await Promise.all([
        lockedState(tx, input.organizationId),
        lockedRun(tx, input.organizationId, input.runId),
      ]);
      const generation = assertPublicationFence(state, input);
      assertRunningRun(run, input);

      const [previousRows, previousRun] = await Promise.all([
        tx.masterProduct.findMany({
          where: {
            organizationId: input.organizationId,
            sourceAccountKey: SOURCE_ACCOUNT_KEY,
          },
          select: { sourceProductCode: true, sourceOptionCode: true },
        }),
        state.lastCompletedImportRunId
          ? tx.sourceImportRun.findFirst({
              where: {
                id: state.lastCompletedImportRunId,
                organizationId: input.organizationId,
                sourceType: SOURCE_TYPE,
                channelAccountId: null,
                status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
              },
              select: { rowCount: true },
            })
          : null,
      ]);
      const quality = evaluateSellpiaInventoryQuality({
        fileHash: input.fileHash,
        previousRowCount: previousRun?.rowCount ?? previousRows.length,
        previousActiveProductCodes: previousRows.map((row) =>
          sourceIdentityKey(row.sourceProductCode, row.sourceOptionCode)),
        incomingProductCodes: input.rows.map((row) =>
          sourceIdentityKey(row.sourceProductCode, row.sourceOptionCode)),
        facts: input.qualityFacts,
      });

      const changes = await replaceProductSources(tx, input);
      const now = new Date();
      const publicationSequence = await allocatePublicationSequence(
        tx,
        input.organizationId,
        SOURCE_TYPE,
      );
      const completed = await tx.sourceImportRun.updateMany({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          attemptToken: input.attemptToken,
        },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          rowCount: input.rows.length,
          importedAt: now,
          lastVerifiedAt: now,
          verificationCount: 1,
          lastTrigger: input.execution.trigger,
          freshnessGeneration: generation,
          qualityReport: quality.report as Prisma.InputJsonValue,
          errorCode: null,
          errorMessage: null,
          fileHash: null,
          contentChecksum: input.contentChecksum ?? input.fileHash,
          ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
          ...(input.contentByteCount !== undefined
            ? { contentByteCount: input.contentByteCount }
            : {}),
          publicationSequence,
        },
      });
      if (completed.count !== 1) {
        throw new ProductSourceConflictError('Sellpia inventory publication lost its run fence');
      }
      await completeGeneration(tx, state, input, generation, now, input.runId);
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: PRODUCT_SOURCE_ALERT_DEDUPE_KEY,
        attemptId: run.id,
      });
      return changes;
    }, TRANSACTION_OPTIONS);
  }
}

async function replaceProductSources(
  tx: Prisma.TransactionClient,
  input: SellpiaSnapshotPublicationInput,
): Promise<SellpiaSnapshotPublicationChanges> {
  const mappingIdentityBefore = await readMappingIdentity(tx, input.organizationId);
  const existing = await tx.masterProduct.findMany({
    where: {
      organizationId: input.organizationId,
      sourceAccountKey: SOURCE_ACCOUNT_KEY,
    },
    select: {
      id: true,
      organizationId: true,
      code: true,
      sourceAccountKey: true,
      sourceProductCode: true,
      sourceOptionCode: true,
      name: true,
      optionName: true,
      barcode: true,
      currentStock: true,
      purchasePrice: true,
      imageUrls: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const existingByIdentity = new Map(
    existing.map((product) => [
      sourceIdentityKey(product.sourceProductCode, product.sourceOptionCode),
      product,
    ]),
  );
  const incomingKeys = new Set<string>();
  const upserts: Array<{
    id: string;
    code: string;
    sourceProductCode: string;
    sourceOptionCode: string;
    name: string;
    optionName: string | null;
    barcode: string | null;
    currentStock: number;
    purchasePrice: number | null;
  }> = [];
  const now = new Date();
  let createdProductCount = 0;
  let updatedProductCount = 0;

  for (const row of input.rows) {
    const identityKey = sourceIdentityKey(row.sourceProductCode, row.sourceOptionCode);
    if (incomingKeys.has(identityKey)) {
      throw new ProductSourceConflictError('Sellpia snapshot contains a duplicate source identity');
    }
    incomingKeys.add(identityKey);
    const previous = existingByIdentity.get(identityKey);
    if (previous) {
      const next = applySourceFacts(
        toDomainMasterProduct(previous),
        {
          name: row.name,
          optionName: row.optionName,
          barcode: row.barcode,
          currentStock: row.currentStock,
          purchasePrice: row.purchasePrice,
        },
        now,
      );
      upserts.push(toUpsertPayload(next));
      updatedProductCount += 1;
    } else {
      upserts.push({
        id: randomUUID(),
        code: await allocateKidItemCode(tx),
        sourceProductCode: row.sourceProductCode,
        sourceOptionCode: row.sourceOptionCode,
        name: row.name,
        optionName: row.optionName,
        barcode: row.barcode,
        currentStock: row.currentStock,
        purchasePrice: row.purchasePrice,
      });
      createdProductCount += 1;
    }
  }

  // Rows omitted from a complete source snapshot remain known products; only
  // their observed current stock becomes zero in this same publication.
  for (const previous of existing) {
    const identityKey = sourceIdentityKey(previous.sourceProductCode, previous.sourceOptionCode);
    if (incomingKeys.has(identityKey)) continue;
    const next = applySourceFacts(
      toDomainMasterProduct(previous),
      {
        name: previous.name,
        optionName: previous.optionName,
        barcode: previous.barcode,
        currentStock: 0,
        purchasePrice: previous.purchasePrice,
      },
      now,
    );
    upserts.push(toUpsertPayload(next));
  }

  for (let offset = 0; offset < upserts.length; offset += UPSERT_BATCH_SIZE) {
    const payload = JSON.stringify(upserts.slice(offset, offset + UPSERT_BATCH_SIZE));
    await tx.$executeRaw`
      INSERT INTO master_products (
        id, organization_id, code, source_account_key, source_product_code,
        source_option_code, name, option_name, barcode, current_stock,
        purchase_price, image_urls, created_at, updated_at
      )
      SELECT
        (record->>'id')::uuid,
        ${input.organizationId}::uuid,
        record->>'code',
        ${SOURCE_ACCOUNT_KEY},
        record->>'sourceProductCode',
        record->>'sourceOptionCode',
        record->>'name',
        record->>'optionName',
        record->>'barcode',
        (record->>'currentStock')::integer,
        (record->>'purchasePrice')::integer,
        ARRAY[]::text[],
        NOW(),
        NOW()
      FROM jsonb_array_elements(${payload}::jsonb) AS record
      ON CONFLICT (organization_id, source_account_key, source_product_code, source_option_code)
      DO UPDATE SET
        name = EXCLUDED.name,
        option_name = EXCLUDED.option_name,
        barcode = EXCLUDED.barcode,
        current_stock = EXCLUDED.current_stock,
        purchase_price = EXCLUDED.purchase_price,
        updated_at = EXCLUDED.updated_at
    `;
  }

  const mappingIdentityAfter = await readMappingIdentity(tx, input.organizationId);
  if (mappingIdentityChanged(mappingIdentityBefore, mappingIdentityAfter)) {
    await advanceProductMappingGeneration(tx, input.organizationId);
  }
  return {
    createdProductCount,
    updatedProductCount,
    inactivatedProductCount: 0,
  };
}


function toDomainMasterProduct(product: {
  id: string;
  organizationId: string;
  code: string;
  sourceAccountKey: string;
  sourceProductCode: string;
  sourceOptionCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  imageUrls: string[];
  createdAt: Date;
  updatedAt: Date;
}): MasterProductDomain {
  return product;
}

function toUpsertPayload(product: MasterProductDomain) {
  return {
    id: product.id,
    code: product.code,
    sourceProductCode: product.sourceProductCode,
    sourceOptionCode: product.sourceOptionCode,
    name: product.name,
    optionName: product.optionName,
    barcode: product.barcode,
    currentStock: product.currentStock,
    purchasePrice: product.purchasePrice,
  };
}

function sourceIdentityKey(sourceProductCode: string, sourceOptionCode: string): string {
  // The key is also fed into the JSON quality report's churn samples. A NUL
  // separator is a convenient in-memory key, but PostgreSQL rejects it when
  // that report is stored as JSONB. JSON preserves the pair boundary without
  // putting a control character into the persisted report.
  return JSON.stringify([sourceProductCode, sourceOptionCode]);
}

async function readMappingIdentity(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<MappingIdentityBasis[]> {
  return tx.masterProduct.findMany({
    where: {
      organizationId,
      sourceAccountKey: SOURCE_ACCOUNT_KEY,
    },
    select: {
      id: true,
      code: true,
      barcode: true,
      sourceProductCode: true,
      sourceOptionCode: true,
    },
  });
}

function mappingIdentityChanged(
  before: MappingIdentityBasis[],
  after: MappingIdentityBasis[],
): boolean {
  if (before.length !== after.length) return true;
  const beforeById = new Map(before.map((basis) => [basis.id, basis]));
  return after.some((basis) => {
    const previous = beforeById.get(basis.id);
    return !previous
      || previous.code !== basis.code
      || previous.barcode !== basis.barcode
      || previous.sourceProductCode !== basis.sourceProductCode
      || previous.sourceOptionCode !== basis.sourceOptionCode;
  });
}

async function completeGeneration(
  tx: Prisma.TransactionClient,
  state: SellpiaInventoryState,
  input: SellpiaSnapshotPublicationInput,
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
    lastAttemptSyncScope: state.activeSyncScope ?? state.requestedSyncScope,
    lastErrorCode: null,
    lastErrorMessage: null,
    freshnessFence: randomUUID(),
  });
}

async function updateStateWithFence(
  tx: Prisma.TransactionClient,
  state: SellpiaInventoryState,
  input: SellpiaSnapshotPublicationInput,
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
    throw new ProductSourceConflictError('Sellpia inventory publication lost its generation fence');
  }
}

function assertPublicationFence(
  state: SellpiaInventoryState,
  input: SellpiaSnapshotPublicationInput,
): bigint {
  if (state.sourceOrigin !== SOURCE_ORIGIN || state.sourceAccountKey !== SOURCE_ACCOUNT_KEY) {
    throw new ProductSourceConflictError('Sellpia inventory source binding is not confirmed');
  }
  if (
    input.execution.sourceOrigin !== SOURCE_ORIGIN
    || input.execution.sourceAccountKey !== SOURCE_ACCOUNT_KEY
    || input.execution.ownerAttempt !== true
  ) {
    throw new ProductSourceConflictError('Sellpia source binding does not match');
  }
  const generation = parseGeneration(input.execution.activeGeneration);
  if (
    state.activeSyncToken !== input.execution.claimToken
    || state.activeSyncOwnerUserId !== input.userId
    || state.activeGeneration !== generation
  ) {
    throw new ProductSourceConflictError('Sellpia inventory publication generation is stale');
  }
  return generation;
}

function assertRunningRun(
  run: SourceImportRun,
  input: SellpiaSnapshotPublicationInput,
): void {
  if (
    run.organizationId !== input.organizationId
    || run.sourceType !== SOURCE_TYPE
    || run.channelAccountId !== null
    || run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS
    || run.attemptToken !== input.attemptToken
  ) {
    throw new ProductSourceConflictError('Sellpia inventory run publication fence is stale');
  }
  if (!run.expiresAt || run.expiresAt.getTime() <= Date.now()) {
    throw new ProductSourceConflictError('ATTEMPT_EXPIRED');
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
  const state = await tx.sellpiaInventoryState.findUnique({ where: { organizationId } });
  if (!state) throw new ProductSourceConflictError('Sellpia inventory state is missing');
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
  const run = await tx.sourceImportRun.findFirst({ where: { id: runId, organizationId } });
  if (!run) throw new ProductSourceConflictError('Sellpia inventory run is missing');
  return run;
}

function parseGeneration(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new ProductSourceConflictError('Sellpia inventory generation is invalid');
  }
  return BigInt(value);
}
