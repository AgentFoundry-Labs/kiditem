import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { TransfersRepositoryAdapter } from '../adapter/out/persistence/transfers.repository.adapter';
import type { PrismaClient } from '@prisma/client';

describe('stock transfer mutation organization boundary (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: TransfersRepositoryAdapter;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new TransfersRepositoryAdapter(prisma as never, new ProductTransactionalReadRepositoryAdapter());
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('keeps transfer creation organization-scoped and preserves physical stock', async () => {
    const skuId = randomUUID();
    await seedSourceProduct(prisma, {
      id: skuId, organizationId: OTHER_ORGANIZATION_ID,
      code: 'TRANSFER-SKU', name: 'Transfer SKU', currentStock: 9,
    });
    const from = await prisma.warehouse.create({ data: { organizationId: OTHER_ORGANIZATION_ID, name: 'From' } });
    const to = await prisma.warehouse.create({ data: { organizationId: OTHER_ORGANIZATION_ID, name: 'To' } });
    const transfer = await repository.createStockTransfer(OTHER_ORGANIZATION_ID, {
      masterProductId: skuId, fromWarehouseId: from.id, toWarehouseId: to.id,
      quantity: 2, optionName: null,
    });
    expect(await prisma.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } }))
      .toMatchObject({ status: 'pending', organizationId: OTHER_ORGANIZATION_ID });
    expect(await prisma.masterProduct.findUniqueOrThrow({ where: { id: skuId } }))
      .toMatchObject({ currentStock: 9 });
  });

  it('keeps a transfer readable with a missing inventory identity', async () => {
    const skuId = randomUUID();
    await seedSourceProduct(prisma, {
      id: skuId, organizationId: TEST_ORGANIZATION_ID,
      code: 'DELETED-TRANSFER-SKU', name: 'Deleted transfer SKU', optionName: 'Blue',
    });
    const from = await prisma.warehouse.create({ data: { organizationId: TEST_ORGANIZATION_ID, name: 'History From' } });
    const to = await prisma.warehouse.create({ data: { organizationId: TEST_ORGANIZATION_ID, name: 'History To' } });
    const transfer = await repository.createStockTransfer(TEST_ORGANIZATION_ID, {
      masterProductId: skuId, fromWarehouseId: from.id, toWarehouseId: to.id,
      quantity: 1, optionName: 'Blue',
    });

    await prisma.masterProduct.update({
      where: { id: skuId },
      data: { currentStock: 0 },
    });
    await expect(
      repository.findProductForTransfer(skuId, TEST_ORGANIZATION_ID),
    ).resolves.toEqual({ optionName: 'Blue' });

    await prisma.masterProduct.delete({ where: { id: skuId } });

    await expect(repository.listStockTransfers(TEST_ORGANIZATION_ID)).resolves.toMatchObject([
      {
        id: transfer.id,
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: skuId,
        masterProduct: null,
        fromWarehouse: { id: from.id, name: 'History From' },
        toWarehouse: { id: to.id, name: 'History To' },
      },
    ]);
  });
});
