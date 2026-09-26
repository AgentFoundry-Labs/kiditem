import { allocateKidItemCode } from '../../../../common/kid-item-code';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type SellpiaInventoryState } from '@prisma/client';
import { KiditemConflictError, KiditemInvalidValueError, KiditemPreconditionError } from '@kiditem/shared/errors';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { applySourceFacts, type MasterProduct as MasterProductDomain } from '../../../domain/master-product';
import { lockProductMapping } from '../../../transaction/product-mapping-lock';
import { advanceProductMappingGeneration } from './product-mapping-generation';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import { lockProductSource } from './transaction/product-source-lock';
import {
  PRODUCT_SOURCE_ALERT_DEDUPE_KEY,
  productSourceFailureAlert,
} from '../sellpia/product-source-failure-alert';
import type {
  ProductSourcePublicationRepositoryPort,
  SellpiaSnapshotPublicationChanges,
  SellpiaSnapshotPublicationInput,
} from '../../../application/port/out/persistence/product-source-publication.repository.port';

const SOURCE_TYPE = 'sellpia_inventory';
const SOURCE_ORIGIN = 'https://kiditem.sellpia.com';
const SOURCE_ACCOUNT_KEY = 'kiditem';
const UPSERT_BATCH_SIZE = 500;

type MappingIdentityBasis = {
  id: string;
  code: string;
  barcode: string | null;
  sourceProductCode: string;
  sourceOptionCode: string;
};

/**
 * 셀피아 재고 발행(`products.sellpia_inventory` finalize, ADR-0025). 실행 계약의 finish 트랜잭션 안에서 매핑·원천 잠금을
 * 잡고 MasterProduct를 통째로 바꾼 뒤 SellpiaInventoryState에 실행 id와 새 완료 세대를 적는다. 겹침은 실행 잠금
 * (`resource:sellpia:login`)이 막으므로 옛 attempt 토큰·임대 울타리는 없다. 완료 세대는 저장된 요청·완료 세대보다 크게
 * 정하고, 옛 생명주기 칸(요청·실행·실패 세대, 임대)은 그 완료 세대로 정리해 두 세대를 비교하던 읽기가 그대로 맞는다.
 */
@Injectable()
export class ProductSourcePublicationRepositoryAdapter
implements ProductSourcePublicationRepositoryPort {
  constructor(private readonly alerts: SourceFailureAlerts) {}

  async publishSnapshot(
    transaction: OwnerTransaction,
    input: SellpiaSnapshotPublicationInput,
  ): Promise<SellpiaSnapshotPublicationChanges> {
    const tx = ownerTransactionClient(transaction);
    await lockProductMapping(tx, input.organizationId);
    await lockProductSource(tx, input.organizationId);
    const state = await lockedState(tx, input.organizationId);
    assertConfirmedBinding(state);

    const changes = await replaceProductSources(tx, input);
    await allocatePublicationSequence(tx, input.organizationId, SOURCE_TYPE);
    const generation = nextGeneration(state);
    const now = new Date();
    const updated = await tx.sellpiaInventoryState.updateMany({
      where: { organizationId: input.organizationId, freshnessFence: state.freshnessFence },
      data: {
        lastVerifiedAt: now,
        lastCompletedOperationId: input.operationId,
        lastCompletedImportRunId: null,
        refreshReason: input.trigger ?? (state.verifiedGeneration === 0n ? 'initial_snapshot' : 'manual_request'),
        requestedGeneration: generation,
        verifiedGeneration: generation,
        activeGeneration: null,
        failedGeneration: null,
        activeSyncToken: null,
        activeSyncOwnerUserId: null,
        activeSyncStartedAt: null,
        activeSyncLeaseExpiresAt: null,
        activeSyncScope: null,
        lastAttemptAt: now,
        lastAttemptSyncScope: 'inventory',
        lastErrorCode: null,
        lastErrorMessage: null,
        freshnessFence: randomUUID(),
      },
    });
    if (updated.count !== 1) {
      // 상태 줄을 잠그고 읽었으므로 도달하지 않는 방어선이다.
      throw new KiditemConflictError('PRODUCTS_STATE_CONFLICT', { details: { reason: 'sellpia_inventory_state_fence_lost' } });
    }
    await this.alerts.resolveSourceFailure(tx, {
      organizationId: input.organizationId,
      dedupeKey: PRODUCT_SOURCE_ALERT_DEDUPE_KEY,
      attemptId: input.operationId,
    });
    return changes;
  }

  /** 재시도 없는 최종 실패: 운영자 알림 하나(원천별로 합친다). 상품·상태는 그대로다. */
  async recordFailure(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; errorCode: string; errorMessage: string | null },
  ): Promise<void> {
    await this.alerts.recordTerminalOutcome(ownerTransactionClient(transaction), productSourceFailureAlert({
      organizationId: input.organizationId,
      attemptId: input.operationId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage ?? input.errorCode,
    }));
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
      // 스냅샷 스키마가 이미 거절하는 겹침이라 도달하지 않는 방어선이다.
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'duplicate_source_identity' } });
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
    productCount: upserts.length,
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

/**
 * 새 완료 세대. 옛 요청이 아직 완료되지 않았으면(요청 > 완료 — 초기 상태의 요청 1 포함) 그 요청 세대를 완료하고,
 * 아니면 완료 세대 다음이다. 옛 attempt의 발행 경로는 없어졌으므로 남은 요청 세대를 이 실행이 채운다.
 */
function nextGeneration(state: SellpiaInventoryState): bigint {
  return state.requestedGeneration > state.verifiedGeneration
    ? state.requestedGeneration
    : state.verifiedGeneration + 1n;
}

function assertConfirmedBinding(state: SellpiaInventoryState): void {
  if (state.sourceOrigin !== SOURCE_ORIGIN || state.sourceAccountKey !== SOURCE_ACCOUNT_KEY) {
    throw new KiditemPreconditionError('PRODUCTS_SELLPIA_BINDING_REQUIRED');
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
  if (!state) throw new KiditemPreconditionError('PRODUCTS_SELLPIA_BINDING_REQUIRED');
  return state;
}
