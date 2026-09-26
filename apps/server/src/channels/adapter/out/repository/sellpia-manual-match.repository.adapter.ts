import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
  MAX_SELLPIA_MANUAL_MATCH_TARGETS,
  type SellpiaManualMatchSnapshotStatus,
  type SellpiaManualMatchRow,
} from '@kiditem/shared/sellpia-manual-match';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import {
  readCompletedCatalogRunIds,
  publishedCatalogOptionWhere,
  publishedCatalogListingBranches,
} from './completed-catalog-run';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionContext,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import { normalizeSellpiaManualMatchAlias } from '../../../domain/listing/sellpia-manual-match-alias';
import type {
  SellpiaManualMatchAliasRecord,
  SellpiaManualMatchRepositoryPort,
} from '../../../application/port/out/repository/sellpia-manual-match.repository.port';

const CREATE_BATCH_SIZE = 5_000;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

type Transaction = Prisma.TransactionClient;
type ActiveSku = { id: string; code: string };
type ChannelListingClient = Pick<Prisma.TransactionClient, 'channelListing' | 'sourceImportRun'>;

/**
 * 셀피아 수동상품매칭 kind(KID-363)의 Channels 원장. 스냅샷은 조직마다 하나(`SellpiaManualMatchSnapshot`, 실행 열
 * 없음)이고 finish 트랜잭션이 통째로 바꾼다. 활성 SKU는 Products 거래 읽기 포트로 상품 잠금 아래에서 읽는다.
 * 실행 겹침은 실행 잠금(`resource:sellpia:login`)이 막는다.
 */
@Injectable()
export class SellpiaManualMatchRepositoryAdapter
implements SellpiaManualMatchRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly productTransactionalRead: ProductTransactionalReadPort,
  ) {}

  async getCurrentStatus(
    organizationId: string,
  ): Promise<SellpiaManualMatchSnapshotStatus | null> {
    return currentStatusIn(this.prisma, organizationId);
  }

  async findByNormalizedAliases(
    organizationId: string,
    normalizedAliases: string[],
  ): Promise<SellpiaManualMatchAliasRecord[]> {
    if (normalizedAliases.length === 0) return [];
    const rows = await this.prisma.sellpiaManualMatchAlias.findMany({
      where: {
        organizationId,
        normalizedAlias: { in: normalizedAliases },
      },
      select: {
        masterProductId: true,
        aliasTitle: true,
        normalizedAlias: true,
        itemCount: true,
        matchedType: true,
        evidenceCount: true,
      },
      orderBy: [
        { normalizedAlias: 'asc' },
        { masterProductId: 'asc' },
        { itemCount: 'asc' },
      ],
    });
    return rows.map((row) => ({
      ...row,
      masterProductId: row.masterProductId,
      matchedType: checkedMatchedType(row.matchedType),
    }));
  }

  readActiveTargetCodes(organizationId: string): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const context = { client: tx };
      const lock = await this.productTransactionalRead.lock(context, organizationId);
      const active = await listActiveSkus(this.productTransactionalRead, context, lock, organizationId);
      return normalizeTargetCodes(active.map((sku) => sku.code));
    }, TRANSACTION_OPTIONS);
  }

  async publish(
    transaction: OwnerTransaction,
    input: Parameters<SellpiaManualMatchRepositoryPort['publish']>[1],
  ): Promise<SellpiaManualMatchSnapshotStatus> {
    const tx = ownerTransactionClient(transaction);
    const context = { client: tx };
    const lock = await this.productTransactionalRead.lock(context, input.organizationId);
    const active = await listActiveSkus(this.productTransactionalRead, context, lock, input.organizationId);
    assertTargetCodesUnchanged(active, input.plan.targetCodes);
    const activeByCode = new Map(active.map((sku) => [sku.code, sku]));
    const currentChannelAliases = await listCurrentChannelAliasCandidates(tx, input.organizationId);
    const normalizedChannelAliases = [...new Set(currentChannelAliases
      .map(normalizeSellpiaManualMatchAlias)
      .filter(Boolean))].sort();
    const rows = aggregateRows(input.rows, activeByCode, new Set(normalizedChannelAliases));
    const snapshot = {
      source: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
      version: 1,
      targetCount: input.plan.targetCount,
      targetCodes: input.plan.targetCodes,
      rowCount: input.rows.length,
      rows: input.rows,
    };
    const status = {
      targetCount: input.plan.targetCount,
      matchedTargetCount: new Set(rows.map((row) => row.masterProductId)).size,
      aliasCount: rows.length,
      snapshotHash: hashJson({ snapshot, normalizedChannelAliases }),
      capturedAt: new Date().toISOString(),
    } satisfies SellpiaManualMatchSnapshotStatus;
    await replaceCurrentIn(tx, { organizationId: input.organizationId, status, rows });
    return status;
  }
}

async function replaceCurrentIn(
  tx: Transaction,
  input: {
    organizationId: string;
    status: SellpiaManualMatchSnapshotStatus;
    rows: SellpiaManualMatchAliasRecord[];
  },
): Promise<void> {
  await tx.sellpiaManualMatchSnapshot.deleteMany({
    where: { organizationId: input.organizationId },
  });
  const snapshot = await tx.sellpiaManualMatchSnapshot.create({
    data: {
      organizationId: input.organizationId,
      targetCount: input.status.targetCount,
      matchedTargetCount: input.status.matchedTargetCount,
      aliasCount: input.status.aliasCount,
      snapshotHash: input.status.snapshotHash,
      capturedAt: new Date(input.status.capturedAt),
    },
    select: { id: true },
  });
  for (let offset = 0; offset < input.rows.length; offset += CREATE_BATCH_SIZE) {
    const batch = input.rows.slice(offset, offset + CREATE_BATCH_SIZE);
    await tx.sellpiaManualMatchAlias.createMany({
      data: batch.map((row) => ({
        organizationId: input.organizationId,
        snapshotId: snapshot.id,
        masterProductId: row.masterProductId,
        aliasTitle: row.aliasTitle,
        normalizedAlias: row.normalizedAlias,
        itemCount: row.itemCount,
        matchedType: row.matchedType,
        evidenceCount: row.evidenceCount,
      })),
    });
  }
}

async function listCurrentChannelAliasCandidates(
  client: ChannelListingClient,
  organizationId: string,
): Promise<string[]> {
  const completedRunIds = await readCompletedCatalogRunIds(client, { organizationId });
  const listings = await client.channelListing.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [
        ...publishedCatalogListingBranches(completedRunIds),
        {
          options: {
            some: publishedCatalogOptionWhere(organizationId),
          },
        },
      ],
    },
    select: {
      displayName: true,
      channelName: true,
      options: {
        where: { organizationId, isActive: true },
        select: { itemName: true },
      },
    },
    orderBy: { id: 'asc' },
  });
  const candidates = new Set<string>();
  for (const listing of listings) {
    const listingNames = [...new Set([listing.channelName, listing.displayName]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean))];
    for (const listingName of listingNames) candidates.add(listingName);
    for (const option of listing.options) {
      const itemName = option.itemName?.trim() || null;
      if (itemName) {
        if (listingNames.length === 0) {
          candidates.add(itemName);
        } else {
          for (const listingName of listingNames) {
            candidates.add(`${listingName}:${itemName}`);
          }
        }
      }
    }
  }
  return [...candidates].sort();
}

async function listActiveSkus(
  products: ProductTransactionalReadPort,
  context: ProductTransactionContext<Transaction>,
  lock: Parameters<ProductTransactionalReadPort['readActiveMatchingCandidates']>[1],
  organizationId: string,
): Promise<ActiveSku[]> {
  const identities = await products.readActiveMatchingCandidates(context, lock, organizationId);
  return identities.map(({ masterProductId, code }) => ({
    id: masterProductId,
    code,
  }));
}

async function currentStatusIn(
  tx: Pick<Transaction, 'sellpiaManualMatchSnapshot'>,
  organizationId: string,
): Promise<SellpiaManualMatchSnapshotStatus | null> {
  const snapshot = await tx.sellpiaManualMatchSnapshot.findUnique({
    where: { organizationId },
    select: {
      targetCount: true,
      matchedTargetCount: true,
      aliasCount: true,
      snapshotHash: true,
      capturedAt: true,
    },
  });
  return snapshot ? toStatus(snapshot) : null;
}

function normalizeTargetCodes(values: readonly string[]): string[] {
  const targetCodes = [...new Set(values)].sort();
  if (
    targetCodes.length > MAX_SELLPIA_MANUAL_MATCH_TARGETS
    || targetCodes.some((code) => !/^\d+(?:-\d+)*$/u.test(code))
  ) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', {
      details: { reason: 'sellpia_targets_invalid', targetCount: targetCodes.length },
    });
  }
  return targetCodes;
}

function assertTargetCodesUnchanged(
  active: readonly ActiveSku[],
  targetCodes: readonly string[],
): void {
  const current = normalizeTargetCodes(active.map((sku) => sku.code));
  if (current.length !== targetCodes.length || current.some((code, index) => code !== targetCodes[index])) {
    // 수집하는 사이 활성 셀피아 재고가 바뀌었다 — 다시 수집해야 한다.
    throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', { details: { reason: 'sellpia_targets_changed' } });
  }
}

function aggregateRows(
  rows: readonly SellpiaManualMatchRow[],
  activeByCode: Map<string, ActiveSku>,
  currentChannelAliases: Set<string>,
): SellpiaManualMatchAliasRecord[] {
  const aggregated = new Map<string, SellpiaManualMatchAliasRecord>();
  for (const row of rows) {
    const sku = activeByCode.get(row.productCode);
    if (!sku) throw new Error(`Sellpia manual-match row references inactive code ${row.productCode}`);
    const normalizedAlias = normalizeSellpiaManualMatchAlias(row.aliasTitle);
    if (!normalizedAlias || !currentChannelAliases.has(normalizedAlias)) continue;
    const key = [normalizedAlias, sku.id, row.itemCount].join('\u0000');
    const previous = aggregated.get(key);
    aggregated.set(key, previous ? {
      ...previous,
      aliasTitle: previous.aliasTitle.localeCompare(row.aliasTitle, 'ko') <= 0
        ? previous.aliasTitle
        : row.aliasTitle,
      matchedType: strongerMatchedType(previous.matchedType, row.matchedType),
      evidenceCount: Math.min(
        2_147_483_647,
        previous.evidenceCount + row.evidenceCount,
      ),
    } : {
      masterProductId: sku.id,
      aliasTitle: row.aliasTitle,
      normalizedAlias,
      itemCount: row.itemCount,
      matchedType: row.matchedType,
      evidenceCount: row.evidenceCount,
    });
  }
  return [...aggregated.values()].sort((left, right) =>
    left.normalizedAlias.localeCompare(right.normalizedAlias)
      || left.masterProductId.localeCompare(right.masterProductId)
      || left.itemCount - right.itemCount);
}

function strongerMatchedType(
  left: 'M' | 'P' | 'E',
  right: 'M' | 'P' | 'E',
): 'M' | 'P' | 'E' {
  const priority = { M: 3, P: 2, E: 1 } as const;
  return priority[left] >= priority[right] ? left : right;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toStatus(value: {
  targetCount: number;
  matchedTargetCount: number;
  aliasCount: number;
  snapshotHash: string;
  capturedAt: Date;
}): SellpiaManualMatchSnapshotStatus {
  return { ...value, capturedAt: value.capturedAt.toISOString() };
}

function checkedMatchedType(value: string): 'M' | 'P' | 'E' {
  if (value === 'M' || value === 'P' || value === 'E') return value;
  throw new Error(`Unsupported Sellpia manual-match type: ${value}`);
}
