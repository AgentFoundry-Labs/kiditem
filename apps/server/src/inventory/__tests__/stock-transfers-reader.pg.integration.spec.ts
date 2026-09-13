import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestPrisma, OTHER_ORGANIZATION_ID, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import { seedActiveSellpiaInventorySku } from '../../test-helpers/inventory-seeds';
import { TransfersRepositoryAdapter } from '../adapter/out/repository/transfers.repository.adapter';
import { TransfersService } from '../application/service/transfers.service';

describe('stock transfer mutation organization boundary (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: TransfersRepositoryAdapter;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new TransfersRepositoryAdapter(prisma as never);
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('rejects a foreign mutation at the repository boundary and preserves physical stock', async () => {
    const skuId = randomUUID();
    await seedActiveSellpiaInventorySku(prisma, {
      id: skuId, organizationId: OTHER_ORGANIZATION_ID,
      code: 'TRANSFER-SKU', name: 'Transfer SKU', currentStock: 9,
    });
    const from = await prisma.warehouse.create({ data: { organizationId: OTHER_ORGANIZATION_ID, name: 'From' } });
    const to = await prisma.warehouse.create({ data: { organizationId: OTHER_ORGANIZATION_ID, name: 'To' } });
    const transfer = await repository.createStockTransfer(OTHER_ORGANIZATION_ID, {
      sellpiaInventorySkuId: skuId, fromWarehouseId: from.id, toWarehouseId: to.id,
      quantity: 2, optionName: null,
    });
    await expect(repository.updateStockTransferStatus(transfer.id, 'in_transit', false, TEST_ORGANIZATION_ID))
      .rejects.toMatchObject({ code: 'P2025' });
    expect(await prisma.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } }))
      .toMatchObject({ status: 'pending', organizationId: OTHER_ORGANIZATION_ID });

    const service = new TransfersService(repository);
    await expect(service.update(transfer.id, { status: 'in_transit' }, OTHER_ORGANIZATION_ID))
      .resolves.toMatchObject({ status: 'in_transit', sellpiaInventorySku: { id: skuId } });
    await expect(service.update(transfer.id, { status: 'completed' }, OTHER_ORGANIZATION_ID))
      .resolves.toMatchObject({ status: 'completed', completedAt: expect.any(Date) });
    expect(await prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: skuId } }))
      .toMatchObject({ currentStock: 9 });
  });
});
