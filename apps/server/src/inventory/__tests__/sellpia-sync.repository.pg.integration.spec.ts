import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SellpiaSyncRepositoryAdapter } from '../adapter/out/repository/sellpia-sync.repository.adapter';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaClient } from '@prisma/client';
import type {
  CreateSellpiaSnapshotInput,
  SellpiaSnapshotItemCreate,
} from '../application/port/out/repository/sellpia-sync.repository.port';
import type { PrismaService } from '../../prisma/prisma.service';

const REPRESENTATIVE_ROW_COUNT = 1_971;
const REPRESENTATIVE_CANDIDATE_COUNT = 95;

describe('SellpiaSyncRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: SellpiaSyncRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new SellpiaSyncRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('persists the representative preview and candidate links atomically', async () => {
    const input = makeSnapshotInput(
      'representative-hash',
      REPRESENTATIVE_ROW_COUNT,
      REPRESENTATIVE_CANDIDATE_COUNT,
    );
    input.items[0].diffRate = 1 / 3;

    const result = await repository.createSnapshotWithItems(input);

    const [snapshot, itemCount, candidates, firstItem] = await Promise.all([
      prisma.sellpiaStockSnapshot.findFirst({
        where: { id: result.snapshot.id, organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.sellpiaStockSnapshotItem.count({
        where: { snapshotId: result.snapshot.id, organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.sellpiaNewProductCandidate.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        select: {
          id: true,
          snapshotItemId: true,
          snapshotItem: { select: { snapshotId: true, organizationId: true } },
        },
      }),
      prisma.sellpiaStockSnapshotItem.findFirst({
        where: {
          id: result.items[0]?.id,
          snapshotId: result.snapshot.id,
          organizationId: TEST_ORGANIZATION_ID,
        },
        select: { diffRate: true },
      }),
    ]);

    expect(snapshot).toMatchObject({
      id: result.snapshot.id,
      rowCount: REPRESENTATIVE_ROW_COUNT,
      status: 'previewed',
    });
    expect(itemCount).toBe(REPRESENTATIVE_ROW_COUNT);
    expect(candidates).toHaveLength(REPRESENTATIVE_CANDIDATE_COUNT);
    expect(candidates.every((candidate) =>
      candidate.snapshotItem.snapshotId === result.snapshot.id &&
      candidate.snapshotItem.organizationId === TEST_ORGANIZATION_ID)).toBe(true);
    expect(new Set(candidates.map((candidate) => candidate.id))).toEqual(
      new Set(result.newProductCandidates.map((candidate) => candidate.id)),
    );
    expect(firstItem?.diffRate.toNumber()).toBe(0.3333);
    expect(result.items[0]?.diffRate).toBe(0.3333);
    expect(result.summary).toEqual({
      matchedCount: 0,
      reviewCount: REPRESENTATIVE_ROW_COUNT - REPRESENTATIVE_CANDIDATE_COUNT,
      rejectedCount: 0,
      newProductCandidateCount: REPRESENTATIVE_CANDIDATE_COUNT,
    });
  });

  it('rolls back the snapshot and first chunk when a later chunk fails', async () => {
    const input = makeSnapshotInput('rollback-hash', 501, 0);
    input.items[500].productOptionId = randomUUID();

    await expect(repository.createSnapshotWithItems(input)).rejects.toThrow();

    const [snapshotCount, itemCount, candidateCount] = await Promise.all([
      prisma.sellpiaStockSnapshot.count({
        where: { organizationId: TEST_ORGANIZATION_ID, fileHash: input.fileHash },
      }),
      prisma.sellpiaStockSnapshotItem.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.sellpiaNewProductCandidate.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ]);

    expect(snapshotCount).toBe(0);
    expect(itemCount).toBe(0);
    expect(candidateCount).toBe(0);
  });
});

function makeSnapshotInput(
  fileHash: string,
  rowCount: number,
  candidateCount: number,
): CreateSellpiaSnapshotInput {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    fileName: 'sellpia.xlsx',
    fileHash,
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
