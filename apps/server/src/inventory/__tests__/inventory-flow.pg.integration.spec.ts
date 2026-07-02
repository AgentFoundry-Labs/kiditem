import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { InventoryService } from '../application/service/inventory.service';
import { InventoryQueryRepositoryAdapter } from '../adapter/out/repository/inventory-query.repository.adapter';
import { InventoryRepositoryAdapter } from '../adapter/out/repository/inventory.repository.adapter';
import { BundleStockAdapter } from '../adapter/out/products/bundle-stock.adapter';
import { ProductsModule } from '../../products/products.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { INVENTORY_QUERY_REPOSITORY_PORT } from '../application/port/out/repository/inventory-query.repository.port';
import { INVENTORY_REPOSITORY_PORT } from '../application/port/out/repository/inventory.repository.port';
import { BUNDLE_STOCK_PORT } from '../application/port/out/cross-domain/bundle-stock.port';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';

@Global()
@Module({
  providers: [{ provide: StorageService, useValue: {} as unknown as StorageService }],
  exports: [StorageService],
})
class StubStorageModule {}

describe('Inventory flow (PG integration)', () => {
  let prisma: PrismaClient;
  let moduleRef: TestingModule | undefined;
  let inventory: InventoryService;
  let masterId: string;

  const organizationId = TEST_ORGANIZATION_ID;
  const userId = TEST_USER_ID;

  async function seedOption(isBundle = false, initialStock = 0) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const option = await prisma.productOption.create({
      data: {
        organizationId,
        masterId,
        sku: `SKU-${unique}`,
        optionName: `${isBundle ? 'Bundle' : 'Single'}-${unique}`,
        isBundle,
        availableStock: isBundle ? 0 : null,
      },
    });
    const inv = await prisma.inventory.create({
      data: {
        organizationId,
        optionId: option.id,
        currentStock: initialStock,
      },
    });
    return { option, inventory: inv };
  }

  async function bindBundle(bundleOptionId: string, componentOptionId: string, qty: number) {
    await prisma.bundleComponent.create({
      data: { organizationId, bundleOptionId, componentOptionId, qty },
    });
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, StubStorageModule, ProductsModule],
      providers: [
        InventoryService,
        InventoryQueryRepositoryAdapter,
        InventoryRepositoryAdapter,
        BundleStockAdapter,
        { provide: INVENTORY_QUERY_REPOSITORY_PORT, useExisting: InventoryQueryRepositoryAdapter },
        { provide: INVENTORY_REPOSITORY_PORT, useExisting: InventoryRepositoryAdapter },
        { provide: BUNDLE_STOCK_PORT, useExisting: BundleStockAdapter },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    inventory = moduleRef.get(InventoryService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const master = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: `M-${Date.now()}`,
        name: 'Test Master',
        optionCounter: 0,
      },
    });
    masterId = master.id;
  });

  it('#1 Receive → bundle fan-out', async () => {
    const simple = await seedOption(false, 0);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, simple.option.id, 2);

    const result = await inventory.receive(
      simple.inventory.id,
      { quantity: 10 },
      organizationId,
      userId,
    );

    expect(result.inventory.currentStock).toBe(10);
    expect(result.recomputedBundleOptionIds).toContain(bundle.option.id);

    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(5);
  });

  it('#2 Issue → bundle fan-out decrease', async () => {
    const simple = await seedOption(false, 0);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, simple.option.id, 2);

    await inventory.receive(simple.inventory.id, { quantity: 10 }, organizationId, userId);
    const afterReceive = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(afterReceive?.availableStock).toBe(5);

    await inventory.issue(simple.inventory.id, { quantity: 4 }, organizationId, userId);

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(6);
    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(3);
  });

  it('#3 Insufficient stock → BadRequest, rollback', async () => {
    const simple = await seedOption(false, 3);
    await expect(
      inventory.issue(simple.inventory.id, { quantity: 5 }, organizationId, userId),
    ).rejects.toThrow();
    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(3);
    const ledger = await prisma.stockTransaction.findMany({ where: { optionId: simple.option.id } });
    expect(ledger).toHaveLength(0);
  });

  it('#4 Adjust negative with bundle effect', async () => {
    const simple = await seedOption(false, 0);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, simple.option.id, 2);

    await inventory.receive(simple.inventory.id, { quantity: 10 }, organizationId, userId);

    await inventory.adjust(simple.inventory.id, { delta: -4, reason: 'shrinkage' }, organizationId, userId);

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(6);
    const adjustTx = await prisma.stockTransaction.findFirst({
      where: { optionId: simple.option.id, type: 'ADJUST' },
      orderBy: { createdAt: 'desc' },
    });
    expect(adjustTx?.quantity).toBe(-4);
    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(3);
  });

  it('#5 Concurrent receive on same option → serialized', async () => {
    const simple = await seedOption(false, 0);

    await Promise.all([
      inventory.receive(simple.inventory.id, { quantity: 10 }, organizationId, userId),
      inventory.receive(simple.inventory.id, { quantity: 10 }, organizationId, userId),
    ]);

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(20);
    const ledger = await prisma.stockTransaction.findMany({ where: { optionId: simple.option.id } });
    expect(ledger).toHaveLength(2);
  });

  it('#6 Concurrent different components of same bundle', async () => {
    const a = await seedOption(false, 0);
    const b = await seedOption(false, 0);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, a.option.id, 1);
    await bindBundle(bundle.option.id, b.option.id, 1);

    await Promise.all([
      inventory.receive(a.inventory.id, { quantity: 5 }, organizationId, userId),
      inventory.receive(b.inventory.id, { quantity: 3 }, organizationId, userId),
    ]);

    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(3);
  });

  it('#7 Soft-deleted component option excluded from fan-out', async () => {
    const a = await seedOption(false, 0);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, a.option.id, 1);

    await prisma.productOption.update({
      where: { id: a.option.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    await prisma.productOption.update({
      where: { id: bundle.option.id },
      data: { availableStock: 10 },
    });

    const result = await inventory.receive(a.inventory.id, { quantity: 5 }, organizationId, userId);

    expect(result.recomputedBundleOptionIds).toEqual([]);
    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(10);
  });

  it('#8 StockTransfer / ReturnTransfer.create → inventory.currentStock unchanged', async () => {
    const simple = await seedOption(false, 10);
    const w1 = await prisma.warehouse.create({
      data: { organizationId, name: 'WH1', code: 'A', address: 'addr-1' },
    });
    const w2 = await prisma.warehouse.create({
      data: { organizationId, name: 'WH2', code: 'B', address: 'addr-2' },
    });

    await prisma.stockTransfer.create({
      data: {
        organizationId,
        optionId: simple.option.id,
        optionName: 'Single',
        fromWarehouseId: w1.id,
        toWarehouseId: w2.id,
        quantity: 4,
      },
    });

    await prisma.returnTransfer.create({
      data: {
        organizationId,
        rtNumber: `RT-${Date.now()}`,
        optionId: simple.option.id,
        optionName: 'Single',
        quantity: 2,
      },
    });

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(10);
    const ledger = await prisma.stockTransaction.findMany({ where: { optionId: simple.option.id } });
    expect(ledger).toHaveLength(0);
  });

  it('#9 Metadata update → no StockTransaction created', async () => {
    const simple = await seedOption(false, 10);
    await inventory.updateMetadata(simple.inventory.id, { safetyStock: 20 }, organizationId);
    const ledger = await prisma.stockTransaction.findMany({ where: { optionId: simple.option.id } });
    expect(ledger).toHaveLength(0);
    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(10);
    expect(inv?.safetyStock).toBe(20);
  });

  it('#10 Ledger query + summary consistency', async () => {
    const simple = await seedOption(false, 0);
    await inventory.receive(simple.inventory.id, { quantity: 10, unitCost: 100 }, organizationId, userId);
    await inventory.issue(simple.inventory.id, { quantity: 3 }, organizationId, userId);

    const list = await inventory.listTransactions({ optionId: simple.option.id }, organizationId);
    expect(list.items).toHaveLength(2);

    const summary = await inventory.getTransactionSummary({ days: 1 }, organizationId);
    expect(summary.inQty).toBe(10);
    expect(summary.outQty).toBe(3);
    expect(summary.inAmount).toBe(1000);
  });

  it('#11 createdBy recorded in StockTransaction', async () => {
    const simple = await seedOption(false, 0);
    await inventory.receive(simple.inventory.id, { quantity: 5 }, organizationId, 'specific-user');
    const tx = await prisma.stockTransaction.findFirst({ where: { optionId: simple.option.id } });
    expect(tx?.createdBy).toBe('specific-user');
  });

  it('#12 Rocket reserve is idempotent and issue consumes reservation + stock', async () => {
    const simple = await seedOption(false, 10);

    const reserved = await inventory.applyRocketInventoryEvent({
      organizationId,
      userId,
      inventoryId: simple.inventory.id,
      optionId: simple.option.id,
      eventType: 'reserve',
      quantity: 4,
      sourceActionId: 'rocket-confirm:po-1:barcode-1:1',
      sourceType: 'rocket_confirm',
      sourceRef: 'po-1/barcode-1',
    });
    const duplicate = await inventory.applyRocketInventoryEvent({
      organizationId,
      userId,
      inventoryId: simple.inventory.id,
      optionId: simple.option.id,
      eventType: 'reserve',
      quantity: 4,
      sourceActionId: 'rocket-confirm:po-1:barcode-1:1',
      sourceType: 'rocket_confirm',
      sourceRef: 'po-1/barcode-1',
    });

    expect(reserved.alreadyApplied).toBe(false);
    expect(duplicate).toEqual({ ledgerId: reserved.ledgerId, alreadyApplied: true });
    let inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(10);
    expect(inv?.reservedStock).toBe(4);
    expect(await prisma.rocketInventoryLedger.count({ where: { optionId: simple.option.id } })).toBe(1);
    expect(await prisma.stockTransaction.count({ where: { optionId: simple.option.id } })).toBe(0);

    await inventory.applyRocketInventoryEvent({
      organizationId,
      userId,
      inventoryId: simple.inventory.id,
      optionId: simple.option.id,
      eventType: 'issue',
      quantity: 3,
      sourceActionId: 'rocket-shipment:ship-1',
      sourceType: 'rocket_shipment',
      sourceRef: 'ship-1',
    });

    inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(7);
    expect(inv?.reservedStock).toBe(1);
    expect(await prisma.rocketInventoryLedger.count({ where: { optionId: simple.option.id } })).toBe(2);
    const stockTx = await prisma.stockTransaction.findFirst({
      where: { optionId: simple.option.id, type: 'ISSUE' },
    });
    expect(stockTx?.quantity).toBe(3);
    expect(stockTx?.relatedId).toBe('rocket-shipment:ship-1');
  });

  it('#13 Rocket return restock updates bundle availability', async () => {
    const simple = await seedOption(false, 0);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, simple.option.id, 1);
    await inventory.receive(simple.inventory.id, { quantity: 2 }, organizationId, userId);
    await inventory.applyRocketInventoryEvent({
      organizationId,
      userId,
      inventoryId: simple.inventory.id,
      optionId: simple.option.id,
      eventType: 'reserve',
      quantity: 1,
      sourceActionId: 'rocket-confirm:po-2:barcode-1:1',
      sourceType: 'rocket_confirm',
      sourceRef: 'po-2/barcode-1',
    });
    await inventory.applyRocketInventoryEvent({
      organizationId,
      userId,
      inventoryId: simple.inventory.id,
      optionId: simple.option.id,
      eventType: 'issue',
      quantity: 1,
      sourceActionId: 'rocket-shipment:ship-2',
      sourceType: 'rocket_shipment',
      sourceRef: 'ship-2',
    });

    let updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(1);

    await inventory.applyRocketInventoryEvent({
      organizationId,
      userId,
      inventoryId: simple.inventory.id,
      optionId: simple.option.id,
      eventType: 'return_restock',
      quantity: 1,
      sourceActionId: 'rocket-return:return-1',
      sourceType: 'rocket_return',
      sourceRef: 'return-1',
    });

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(2);
    expect(inv?.reservedStock).toBe(0);
    updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(2);
  });
});
