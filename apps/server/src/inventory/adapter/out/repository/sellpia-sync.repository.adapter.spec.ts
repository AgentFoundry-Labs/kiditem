import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SellpiaSyncRepositoryAdapter } from './sellpia-sync.repository.adapter';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateSellpiaSnapshotInput,
  SellpiaSnapshotItemCreate,
} from '../../../application/port/out/repository/sellpia-sync.repository.port';

const REPRESENTATIVE_ROW_COUNT = 1_971;
const REPRESENTATIVE_CANDIDATE_COUNT = 95;
const MAX_IMPORT_ROW_COUNT = 20_000;

describe('SellpiaSyncRepositoryAdapter', () => {
  it('persists a representative preview with bounded batch writes in one transaction', async () => {
    const prisma = makePrismaMock();
    const repository = new SellpiaSyncRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const input = makeSnapshotInput(REPRESENTATIVE_ROW_COUNT, REPRESENTATIVE_CANDIDATE_COUNT);
    input.items[0].diffRate = 1 / 3;

    const result = await repository.createSnapshotWithItems(input);

    const itemBatches = prisma.sellpiaStockSnapshotItem.createMany.mock.calls
      .map(([args]) => args.data);
    const candidateBatches = prisma.sellpiaNewProductCandidate.createMany.mock.calls
      .map(([args]) => args.data);
    const transactionOperations = prisma.$transaction.mock.calls[0]?.[0];

    expect(prisma.sellpiaStockSnapshot.create).toHaveBeenCalledTimes(1);
    expect(prisma.sellpiaStockSnapshotItem.create).not.toHaveBeenCalled();
    expect(prisma.sellpiaNewProductCandidate.create).not.toHaveBeenCalled();
    expect(itemBatches).toHaveLength(4);
    expect(candidateBatches).toHaveLength(1);
    expect(itemBatches.every((batch) => batch.length <= 500)).toBe(true);
    expect(candidateBatches.every((batch) => batch.length <= 500)).toBe(true);
    expect(itemBatches.flat()).toHaveLength(REPRESENTATIVE_ROW_COUNT);
    expect(candidateBatches.flat()).toHaveLength(REPRESENTATIVE_CANDIDATE_COUNT);
    expect(Array.isArray(transactionOperations)).toBe(true);
    expect(transactionOperations).toHaveLength(6);

    expect(result.snapshot).toMatchObject({
      fileName: input.fileName,
      rowCount: REPRESENTATIVE_ROW_COUNT,
      status: 'previewed',
    });
    expect(result.items).toHaveLength(REPRESENTATIVE_ROW_COUNT);
    expect(result.items[0]?.diffRate).toBe(0.3333);
    expect(itemBatches[0]?.[0]?.diffRate).toBe(0.3333);
    expect(result.newProductCandidates).toHaveLength(REPRESENTATIVE_CANDIDATE_COUNT);
    expect(result.summary).toEqual({
      matchedCount: 0,
      reviewCount: REPRESENTATIVE_ROW_COUNT - REPRESENTATIVE_CANDIDATE_COUNT,
      rejectedCount: 0,
      newProductCandidateCount: REPRESENTATIVE_CANDIDATE_COUNT,
    });

    const itemIdsByCode = new Map(
      result.items.map((item) => [item.sellpiaProductCode, item.id]),
    );
    for (const candidate of result.newProductCandidates) {
      expect(candidate.snapshotItemId).toBe(itemIdsByCode.get(candidate.sellpiaProductCode));
    }
  });

  it('keeps the maximum accepted import bounded to chunk-level writes', async () => {
    const prisma = makePrismaMock();
    const repository = new SellpiaSyncRepositoryAdapter(
      prisma as unknown as PrismaService,
    );

    await repository.createSnapshotWithItems(
      makeSnapshotInput(MAX_IMPORT_ROW_COUNT, MAX_IMPORT_ROW_COUNT),
    );

    const itemBatches = prisma.sellpiaStockSnapshotItem.createMany.mock.calls
      .map(([args]) => args.data);
    const candidateBatches = prisma.sellpiaNewProductCandidate.createMany.mock.calls
      .map(([args]) => args.data);
    const transactionOperations = prisma.$transaction.mock.calls[0]?.[0];

    expect(itemBatches).toHaveLength(40);
    expect(candidateBatches).toHaveLength(40);
    expect(itemBatches.flat()).toHaveLength(MAX_IMPORT_ROW_COUNT);
    expect(candidateBatches.flat()).toHaveLength(MAX_IMPORT_ROW_COUNT);
    expect(itemBatches.every((batch) => batch.length <= 500)).toBe(true);
    expect(candidateBatches.every((batch) => batch.length <= 500)).toBe(true);
    expect(transactionOperations).toHaveLength(81);
  });
});

function makeSnapshotInput(
  rowCount: number,
  candidateCount: number,
): CreateSellpiaSnapshotInput {
  return {
    organizationId: randomUUID(),
    userId: randomUUID(),
    fileName: 'sellpia.xlsx',
    fileHash: 'representative-hash',
    effectiveExportedAt: new Date('2026-07-11T00:00:00.000Z'),
    ignoredColumns: [],
    headers: ['상품코드', '상품명', '재고'],
    items: Array.from({ length: rowCount }, (_, index) =>
      makeSnapshotItem(index, index < candidateCount)),
  };
}

function makeSnapshotItem(index: number, createCandidate: boolean): SellpiaSnapshotItemCreate {
  return {
    rowNumber: index + 2,
    sellpiaProductCode: `SP-${String(index).padStart(5, '0')}`,
    sellpiaProductName: `상품 ${index}`,
    sellpiaStock: index % 100,
    safetyStock: 0,
    ownProductCode: null,
    barcode: null,
    modelName: null,
    productOptionId: null,
    inventoryId: null,
    rocketLedgerNet: 0,
    targetCurrentStock: index % 100,
    kiditemStockBefore: 0,
    diff: index % 100,
    diffRate: 0,
    status: createCandidate ? 'new_product_candidate' : 'needs_review',
    blockingReasons: createCandidate ? ['new_product_candidate'] : [],
    warningReasons: [],
    rawJson: { index },
    createCandidate,
  };
}

function makePrismaMock() {
  const snapshotCreate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    ...args.data,
    id: String(args.data.id ?? randomUUID()),
    status: String(args.data.status ?? 'previewed'),
  }));
  const itemCreate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    ...args.data,
    id: String(args.data.id ?? randomUUID()),
    operatorTargetStock: null,
    reviewNote: null,
  }));
  const itemCreateMany = vi.fn(async (args: { data: Record<string, unknown>[] }) => ({
    count: args.data.length,
  }));
  const candidateCreate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    ...args.data,
    id: String(args.data.id ?? randomUUID()),
    status: String(args.data.status ?? 'pending'),
  }));
  const candidateCreateMany = vi.fn(async (args: { data: Record<string, unknown>[] }) => ({
    count: args.data.length,
  }));

  const prisma = {
    sellpiaStockSnapshot: { create: snapshotCreate },
    sellpiaStockSnapshotItem: {
      create: itemCreate,
      createMany: itemCreateMany,
    },
    sellpiaNewProductCandidate: {
      create: candidateCreate,
      createMany: candidateCreateMany,
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (operationOrOperations: unknown) => {
    if (typeof operationOrOperations === 'function') {
      return (operationOrOperations as (tx: typeof prisma) => Promise<unknown>)(prisma);
    }
    return Promise.all(operationOrOperations as Promise<unknown>[]);
  });
  return prisma;
}
