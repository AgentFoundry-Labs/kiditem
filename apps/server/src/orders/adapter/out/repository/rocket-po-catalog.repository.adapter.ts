import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KiditemInvalidValueError, KiditemNotFoundError, KiditemPreconditionError } from '@kiditem/shared/errors';
import type { CoupangRocketPoPlan } from '@kiditem/shared/orders-operations';
import type { RocketPoCatalogRow } from '@kiditem/shared/rocket-purchase-preview';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { RocketPoCatalogRepositoryPort } from '../../../application/port/out/repository/rocket-po-catalog.repository.port';
import { ROCKET_PO_CATALOG_RAW_SOURCE } from '../../../application/port/in/rocket-po-catalog.port';
import { lockProductMapping } from '../../../../products/transaction/product-mapping-lock';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_CATALOG_IDENTITY_PORT, type ChannelCatalogIdentityPort } from '../../../../channels/application/port/in/collection/catalog-identity.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { assertRocketPoVendor, completeRocketPoCollection } from '../../../domain/rocket-po-operation';
import { createRocketPoCatalogSnapshot } from './rocket-po-catalog-snapshot.repository';
import {
  readCurrentRocketPos,
  readRocketPoCompleteCollection,
  readRocketPoSnapshot,
  rocketPoSnapshotExists,
} from '../persistence/read/rocket-po-catalog.reader';

/**
 * 로켓 PO 원장(Orders, KID-359). 쓰기는 실행 `orders.coupang_rocket_po`의 finish 트랜잭션에서만(ADR-0025) —
 * 계정 잠금·임대·멱등은 실행 계약이 맡는다. 발행 순서는 옛 완료와 같다: 공급자 식별 확정 → Channels 관측 식별 →
 * 스냅샷. 옛 `allocatePublicationSequence`는 `source_import_runs`에만 번호를 매기므로 실행 발행에는 쓰지 않는다.
 */
@Injectable()
export class RocketPoCatalogRepositoryAdapter implements RocketPoCatalogRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort,
    @Inject(CHANNEL_CATALOG_IDENTITY_PORT) private readonly identities: ChannelCatalogIdentityPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly listings: ChannelListingQueryPort,
  ) {}

  async planOperation(input: Parameters<RocketPoCatalogRepositoryPort['planOperation']>[0]): Promise<CoupangRocketPoPlan> {
    const account = await this.prisma.$transaction((tx) => readAccount(tx, input.organizationId, input.scope.channelAccountId, this.accounts));
    if (!account) throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'rocket_account', channelAccountId: input.scope.channelAccountId } });
    return {
      ...input.scope,
      vendorExpectations: { rocketVendorId: account.vendorId, sharedCoupangVendorId: account.shared?.vendorId ?? null },
    };
  }

  async publishOperation(
    transaction: OwnerTransaction,
    input: Parameters<RocketPoCatalogRepositoryPort['publishOperation']>[1],
  ) {
    const tx = ownerTransactionClient(transaction);
    const { plan } = input;
    // 관측 식별 발행이 상품 매핑과 겹치지 않게(옛 완료와 같은 잠금). 계정 겹침은 실행 잠금이 막는다.
    await lockProductMapping(tx, input.organizationId);
    const { collection, rows } = completeRocketPoCollection({ plan, rows: input.rows, scan: input.scan, operationId: input.operationId });
    const account = await readAccount(tx, input.organizationId, plan.channelAccountId, this.accounts);
    if (!account) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'rocket_po_account_unavailable' } });
    assertRocketPoVendor({
      expectations: plan.vendorExpectations,
      account: { vendorId: account.vendorId, sharedVendorId: account.shared?.vendorId },
      collectedVendorId: collection.vendorId,
      rowCount: rows.length,
    });
    if (rows.length) {
      if (!account.vendorId) {
        await this.accounts.claimProviderIdentity(transaction, {
          organizationId: input.organizationId, accountId: plan.channelAccountId,
          channel: 'rocket', expectedVendorId: account.storedVendorId, vendorId: collection.vendorId,
        });
      }
      if (account.shared && !account.shared.vendorId) {
        await this.accounts.claimProviderIdentity(transaction, {
          organizationId: input.organizationId, accountId: account.shared.id,
          channel: 'coupang', expectedVendorId: account.shared.storedVendorId, vendorId: collection.vendorId,
        });
      }
      await this.identities.publishObservedIdentities(transaction, {
        organizationId: input.organizationId,
        channelAccountId: plan.channelAccountId,
        lastImportRunId: null,
        lastOperationId: input.operationId,
        rawSource: ROCKET_PO_CATALOG_RAW_SOURCE,
        // 발주서에는 판매가·모델번호 칸이 없다. 다른 수집이 본 값을 지우지 않는다.
        unobservedOptionFields: ['salePrice', 'modelNumber'],
        products: productsFromRows(rows),
      });
    }
    await createRocketPoCatalogSnapshot(tx, {
      organizationId: input.organizationId,
      channelAccountId: plan.channelAccountId,
      operationId: input.operationId,
      collection,
      rows,
    });
    return { purchaseOrders: new Set(rows.map((row) => row.poNumber)).size, lines: rows.length };
  }

  readComplete(input: Parameters<RocketPoCatalogRepositoryPort['readComplete']>[0]) {
    return this.prisma.$transaction(
      async (tx) => {
        const saved = await readRocketPoCompleteCollection(tx, input, this.listings);
        if (!saved) throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'ROCKET_PO_COMPLETE_NOT_FOUND' } });
        return saved;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async assertPublished(
    transaction: OwnerTransaction,
    input: Parameters<RocketPoCatalogRepositoryPort['assertPublished']>[1],
  ) {
    if (!(await rocketPoSnapshotExists(ownerTransactionClient(transaction), input))) {
      throw new KiditemPreconditionError('SUPPLY_ROCKET_COLLECTION_INCOMPLETE', { details: { reason: 'SOURCE_ARTIFACT_NOT_COMPLETE' } });
    }
  }

  listSavedPos(input: Parameters<RocketPoCatalogRepositoryPort['listSavedPos']>[0]) {
    return this.prisma.$transaction((tx) => readCurrentRocketPos(tx, input), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  loadSavedCollection(input: Parameters<RocketPoCatalogRepositoryPort['loadSavedCollection']>[0]) {
    return this.prisma.$transaction((tx) => readRocketPoSnapshot(tx, input), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }
}

function productsFromRows(rows: readonly RocketPoCatalogRow[]) {
  const byProduct = new Map<string, RocketPoCatalogRow>();
  for (const row of rows) {
    if (!byProduct.has(row.productNo)) byProduct.set(row.productNo, row);
  }
  return [...byProduct.values()].map((row) => ({
    externalProductId: row.productNo,
    registeredName: row.productName,
    displayName: row.productName,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: 'observed',
    raw: { source: ROCKET_PO_CATALOG_RAW_SOURCE, poLineId: row.poLineId },
    options: [
      {
        externalOptionId: row.productNo,
        optionName: row.productName,
        salePrice: null,
        sellerSku: row.productNo,
        barcode: row.barcode || null,
        modelNumber: null,
        skuStatus: 'observed',
        attributes: {},
        raw: { source: ROCKET_PO_CATALOG_RAW_SOURCE, poLineId: row.poLineId },
      },
    ],
  }));
}

/** 활성 로켓 계정과 대표 쿠팡(Wing) 계정의 공급자 ID. 활성 로켓 계정이 아니면 null. */
async function readAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelAccountId: string,
  accounts: ChannelAccountPort,
) {
  const [account] = await accounts.readProviderIdentities(ownerTransaction(tx), {
    organizationId, channel: 'rocket', accountIds: [channelAccountId],
  });
  if (!account || account.status !== 'active') return null;
  const shared = await accounts.resolveActiveProvider(ownerTransaction(tx), {
    organizationId, channel: 'coupang', primaryOnly: true,
  });
  return {
    storedVendorId: account.vendorId,
    vendorId: account.vendorId?.trim() || null,
    shared: shared ? { ...shared, storedVendorId: shared.vendorId, vendorId: shared.vendorId?.trim() || null } : null,
  };
}
