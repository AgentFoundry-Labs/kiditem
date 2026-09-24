import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { InventorySkuSnapshotListResponseSchema } from '@kiditem/shared/inventory';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductSourceSnapshotRepositoryAdapter } from '../adapter/out/persistence/product-source-snapshot.repository.adapter';
import { ProductSourceSnapshotUseCase } from '../application/service/product-source-snapshot.usecase';

/**
 * 셀피아 재고 목록 응답은 웹이 shared `InventorySkuSnapshotListResponseSchema` 로 parse 한다. KID-275 가 서버 요약을
 * `totalProducts` 로 바꾸고 계약은 `totalSkus` 로 남아 재고 관리 · 쇼핑몰 현황 화면이 ZodError 로 비었다(KID-331).
 * 실제 PostgreSQL 위의 진짜 응답을 계약으로 고정한다.
 */
describe('product source snapshot contract (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let usecase: ProductSourceSnapshotUseCase;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    usecase = new ProductSourceSnapshotUseCase(new ProductSourceSnapshotRepositoryAdapter(prisma as unknown as PrismaService));
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  async function seed(code: string, currentStock: number, purchasePrice: number | null) {
    return prisma.masterProduct.create({ data: {
      id: randomUUID(), organizationId: TEST_ORGANIZATION_ID, code,
      sourceAccountKey: 'kiditem', sourceProductCode: code, sourceOptionCode: '',
      name: `Fixture ${code}`, currentStock, purchasePrice,
      imageUrls: [],
    } });
  }

  it('lists the snapshot in the shape the shared list-response schema accepts, summary included', async () => {
    await seed('KID00000001', 3, 1200);
    await seed('KID00000002', 0, null);

    const response = await usecase.listSnapshot(TEST_ORGANIZATION_ID, { page: 1, limit: 20 });
    const parsed = InventorySkuSnapshotListResponseSchema.parse(JSON.parse(JSON.stringify(response)));

    expect(parsed.summary).toMatchObject({
      totalSkus: 2, linkedSkus: 0, unlinkedSkus: 2, inStockSkus: 1, outOfStockSkus: 1,
      totalUnits: 3, pricedAssetValue: 3600, unpricedSkuCount: 1,
    });
    expect(parsed.items.map((item) => item.code).sort()).toEqual(['KID00000001', 'KID00000002']);
  });

  it('keeps the empty snapshot inside the same contract', async () => {
    const response = await usecase.listSnapshot(TEST_ORGANIZATION_ID, { page: 1, limit: 20 });
    const parsed = InventorySkuSnapshotListResponseSchema.parse(JSON.parse(JSON.stringify(response)));
    expect(parsed.summary).toMatchObject({ totalSkus: 0, linkedSkus: 0, unlinkedSkus: 0 });
    expect(parsed.items).toEqual([]);
  });
});
