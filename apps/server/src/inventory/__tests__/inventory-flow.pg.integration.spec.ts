import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { InventoryService } from '../services/inventory.service';
import { BundleStockService } from '../../products/services/bundle-stock.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';

describe('Inventory flow (PG integration)', () => {
  let prisma: PrismaClient;
  let inventoryService: InventoryService;
  let masterId: string;

  const companyId = TEST_COMPANY_ID;
  const userId = TEST_USER_ID;

  async function seedOption(isBundle = false, initialStock = 0) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const option = await prisma.productOption.create({
      data: {
        companyId,
        masterId,
        sku: `SKU-${unique}`,
        optionName: `${isBundle ? 'Bundle' : 'Single'}-${unique}`,
        isBundle,
        availableStock: isBundle ? 0 : null,
      },
    });
    const inv = await prisma.inventory.create({
      data: {
        companyId,
        optionId: option.id,
        currentStock: initialStock,
      },
    });
    return { option, inventory: inv };
  }

  async function bindBundle(bundleOptionId: string, componentOptionId: string, qty: number) {
    await prisma.bundleComponent.create({
      data: { companyId, bundleOptionId, componentOptionId, qty },
    });
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        BundleStockService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    inventoryService = m.get(InventoryService);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const master = await prisma.masterProduct.create({
      data: {
        companyId,
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

    const result = await inventoryService.receive(
      simple.inventory.id,
      { quantity: 10 },
      companyId,
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

    await inventoryService.receive(simple.inventory.id, { quantity: 10 }, companyId, userId);
    const afterReceive = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(afterReceive?.availableStock).toBe(5);

    await inventoryService.issue(simple.inventory.id, { quantity: 4 }, companyId, userId);

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(6);
    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(3);
  });

  it('#3 Insufficient stock → BadRequest, rollback', async () => {
    const simple = await seedOption(false, 3);
    await expect(
      inventoryService.issue(simple.inventory.id, { quantity: 5 }, companyId, userId),
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

    await inventoryService.receive(simple.inventory.id, { quantity: 10 }, companyId, userId);

    await inventoryService.adjust(simple.inventory.id, { delta: -4, reason: 'shrinkage' }, companyId, userId);

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
      inventoryService.receive(simple.inventory.id, { quantity: 10 }, companyId, userId),
      inventoryService.receive(simple.inventory.id, { quantity: 10 }, companyId, userId),
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
      inventoryService.receive(a.inventory.id, { quantity: 5 }, companyId, userId),
      inventoryService.receive(b.inventory.id, { quantity: 3 }, companyId, userId),
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

    const result = await inventoryService.receive(a.inventory.id, { quantity: 5 }, companyId, userId);

    expect(result.recomputedBundleOptionIds).toEqual([]);
    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(10);
  });

  it('#8 StockTransfer / ReturnTransfer.create → inventory.currentStock unchanged', async () => {
    const simple = await seedOption(false, 10);
    const w1 = await prisma.warehouse.create({
      data: { companyId, name: 'WH1', code: 'A', address: 'addr-1' },
    });
    const w2 = await prisma.warehouse.create({
      data: { companyId, name: 'WH2', code: 'B', address: 'addr-2' },
    });

    await prisma.stockTransfer.create({
      data: {
        companyId,
        optionId: simple.option.id,
        optionName: 'Single',
        fromWarehouseId: w1.id,
        toWarehouseId: w2.id,
        quantity: 4,
      },
    });

    await prisma.returnTransfer.create({
      data: {
        companyId,
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
    await inventoryService.updateMetadata(simple.inventory.id, { safetyStock: 20 }, companyId);
    const ledger = await prisma.stockTransaction.findMany({ where: { optionId: simple.option.id } });
    expect(ledger).toHaveLength(0);
    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(10);
    expect(inv?.safetyStock).toBe(20);
  });

  it('#10 Ledger query + summary consistency', async () => {
    const simple = await seedOption(false, 0);
    await inventoryService.receive(simple.inventory.id, { quantity: 10, unitCost: 100 }, companyId, userId);
    await inventoryService.issue(simple.inventory.id, { quantity: 3 }, companyId, userId);

    const list = await inventoryService.listTransactions({ optionId: simple.option.id }, companyId);
    expect(list.items).toHaveLength(2);

    const summary = await inventoryService.getTransactionSummary({ days: 1 }, companyId);
    expect(summary.inQty).toBe(10);
    expect(summary.outQty).toBe(3);
    expect(summary.inAmount).toBe(1000);
  });

  it('#11 createdBy recorded in StockTransaction', async () => {
    const simple = await seedOption(false, 0);
    await inventoryService.receive(simple.inventory.id, { quantity: 5 }, companyId, 'specific-user');
    const tx = await prisma.stockTransaction.findFirst({ where: { optionId: simple.option.id } });
    expect(tx?.createdBy).toBe('specific-user');
  });
});
